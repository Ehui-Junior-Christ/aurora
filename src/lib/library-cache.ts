import { idbGetMany, idbSet, idbSetMany } from "./db";
import { fnv1a } from "./hash";
import { fileTrackId, metadataConcurrency, parseTrackDetailed } from "./metadata";
import type { PaletteColor, ReplayGainInfo, Track } from "./types";

/**
 * Incremental library cache. Parsed tags are stored in IndexedDB under
 * `tags:<id>`, where id = hash(name, size, lastModified): a rescan only
 * parses new or modified files, in parallel (bounded) worker jobs.
 */

export const TAGS_CACHE_VERSION = 1;

export interface CachedTags {
  v: number;
  title: string;
  artist: string;
  album: string;
  palette: PaletteColor[];
  coverBlob?: Blob;
  replayGain?: ReplayGainInfo;
  addedAt: number;
  durationSec?: number;
}

interface MetaEntry {
  palette?: PaletteColor[];
  bpm?: number | null;
}

export function tagsKey(id: string): string {
  return `tags:${id}`;
}

function isValid(entry: unknown): entry is CachedTags {
  const e = entry as CachedTags | undefined;
  return (
    !!e &&
    e.v === TAGS_CACHE_VERSION &&
    typeof e.title === "string" &&
    typeof e.artist === "string" &&
    Array.isArray(e.palette)
  );
}

function trackFromCache(file: File, id: string, cached: CachedTags, meta?: MetaEntry): Track {
  return {
    id,
    file,
    isOnline: false,
    title: cached.title,
    artist: cached.artist,
    album: cached.album,
    coverUrl: cached.coverBlob ? URL.createObjectURL(cached.coverBlob) : undefined,
    palette: cached.palette,
    seed: fnv1a(`${cached.title}|${cached.artist}|${cached.album}`),
    bpm: meta?.bpm ?? undefined,
    addedAt: cached.addedAt,
    ...(cached.durationSec ? { durationSec: cached.durationSec } : {}),
    ...(cached.replayGain ? { replayGain: cached.replayGain } : {}),
  };
}

export interface ScanStats {
  cached: number;
  parsed: number;
}

/**
 * Builds tracks for `files`, reusing cached tags and parsing the rest with
 * bounded concurrency. `onProgress(done, total)` is called as files complete.
 * Order of the returned array matches `files`.
 */
export async function buildTracks(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<{ tracks: Track[]; stats: ScanStats }> {
  const ids = files.map(fileTrackId);
  const [cachedTags, metas] = await Promise.all([
    idbGetMany<CachedTags>("meta", ids.map(tagsKey)),
    idbGetMany<MetaEntry>("meta", ids),
  ]);
  // First scan with this cache (fresh install or upgrade): use the file date
  // as "date added" so the library does not all look added today.
  const firstRun = !cachedTags.some(isValid);
  const now = Date.now();

  const tracks: (Track | undefined)[] = new Array(files.length);
  const toParse: number[] = [];
  let done = 0;
  files.forEach((file, i) => {
    const cached = cachedTags[i];
    if (isValid(cached)) {
      tracks[i] = trackFromCache(file, ids[i], cached, metas[i]);
      done++;
    } else {
      toParse.push(i);
    }
  });
  onProgress?.(done, files.length);

  const pendingWrites: [string, unknown][] = [];
  const flushWrites = () => {
    if (pendingWrites.length === 0) return;
    void idbSetMany("meta", pendingWrites.splice(0));
  };

  let cursor = 0;
  const concurrency = Math.max(1, metadataConcurrency() * 2);
  const runOne = async (): Promise<void> => {
    while (cursor < toParse.length) {
      const i = toParse[cursor++];
      const file = files[i];
      try {
        const { track, coverBlob } = await parseTrackDetailed(file);
        const addedAt =
          firstRun && file.lastModified > 0 && file.lastModified <= now
            ? file.lastModified
            : now;
        track.addedAt = addedAt;
        tracks[i] = track;
        const entry: CachedTags = {
          v: TAGS_CACHE_VERSION,
          title: track.title,
          artist: track.artist,
          album: track.album,
          palette: track.palette,
          addedAt,
          ...(coverBlob ? { coverBlob } : {}),
          ...(track.replayGain ? { replayGain: track.replayGain } : {}),
        };
        pendingWrites.push([tagsKey(track.id), entry]);
        if (pendingWrites.length >= 25) flushWrites();
      } catch {
        tracks[i] = undefined;
      }
      done++;
      onProgress?.(done, files.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, toParse.length) }, runOne)
  );
  flushWrites();

  return {
    tracks: tracks.filter((t): t is Track => !!t),
    stats: { cached: files.length - toParse.length, parsed: toParse.length },
  };
}

/** Merges fields into a cached entry (duration learnt during playback…). */
export async function patchCachedTags(
  id: string,
  patch: Partial<Omit<CachedTags, "v">>
): Promise<void> {
  const [current] = await idbGetMany<CachedTags>("meta", [tagsKey(id)]);
  if (!isValid(current)) return;
  await idbSet("meta", tagsKey(id), { ...current, ...patch });
}
