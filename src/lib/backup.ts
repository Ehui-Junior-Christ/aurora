import { idbGetMany, idbKeys, idbSetMany } from "./db";
import { normalizeText, trackDuration } from "./library-query";
import type { SmartPlaylist } from "./smart-playlists";
import type { ListeningStats } from "./stats";
import type { Track } from "./types";

/**
 * JSON backup / restore. Tracks are referenced by a descriptor (tags, size,
 * duration, relative path) so a backup restores on another machine where
 * file paths and modification dates — hence local ids — differ.
 */

export const BACKUP_KIND = "aurora-backup";
export const BACKUP_VERSION = 1;

/** Per-track IndexedDB "meta" entries included in backups (key prefix). */
export const TRACK_META_PREFIXES = [
  "visual:", // visual preset
  "lyricsOffset:", // lyrics sync offset
  "lyricsUser:", // user-edited / tap-synced lyrics
  "edit:", // user tag overrides (text fields only)
] as const;

export interface TrackDescriptor {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec?: number;
  fileName?: string;
  size?: number;
  relPath?: string;
  online?: boolean;
  streamUrl?: string;
  coverUrl?: string;
}

export interface BackupPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  online?: Track[];
}

export interface BackupData {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  tracks: TrackDescriptor[];
  playlists: BackupPlaylist[];
  smartPlaylists: SmartPlaylist[];
  favorites: Track[];
  history: Track[];
  stats: ListeningStats;
  prefs: Record<string, unknown>;
  /** meta key (prefix + track id) → JSON value. */
  trackMeta: Record<string, unknown>;
}

export function describeTrack(track: Track): TrackDescriptor {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    ...(trackDuration(track) ? { durationSec: trackDuration(track) } : {}),
    ...(track.file ? { fileName: track.file.name, size: track.file.size } : {}),
    ...(track.relPath ? { relPath: track.relPath } : {}),
    ...(track.isOnline
      ? { online: true, streamUrl: track.streamUrl ?? track.id }
      : {}),
    ...(track.coverUrl && /^https?:/.test(track.coverUrl)
      ? { coverUrl: track.coverUrl }
      : {}),
  };
}

/** Strips non-serialisable / session-only fields (File, blob: URLs). */
export function serializableTrack(track: Track): Track {
  const { file: _file, ...rest } = track;
  void _file;
  return {
    ...rest,
    coverUrl:
      track.coverUrl && /^https?:/.test(track.coverUrl) ? track.coverUrl : undefined,
  };
}

function jsonSafe(value: unknown): unknown {
  // Drops Blobs (cover overrides) and other non-JSON values.
  if (value instanceof Blob) return undefined;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const safe = jsonSafe(v);
      if (safe !== undefined) out[k] = safe;
    }
    return out;
  }
  return value;
}

export interface BackupSource {
  library: Track[];
  playlists: BackupPlaylist[];
  smartPlaylists: SmartPlaylist[];
  favorites: Track[];
  history: Track[];
  stats: ListeningStats;
  prefs: Record<string, unknown>;
}

export async function createBackup(source: BackupSource): Promise<BackupData> {
  const keys = (await idbKeys("meta")).filter((k) =>
    TRACK_META_PREFIXES.some((p) => k.startsWith(p))
  );
  const values = await idbGetMany<unknown>("meta", keys);
  const trackMeta: Record<string, unknown> = {};
  keys.forEach((k, i) => {
    const v = jsonSafe(values[i]);
    if (v !== undefined) trackMeta[k] = v;
  });

  // Describe every track referenced anywhere so ids can be re-matched.
  const referenced = new Set<string>([
    ...Object.keys(source.stats.plays),
    ...source.playlists.flatMap((p) => p.trackIds),
    ...Object.keys(trackMeta).map((k) => k.slice(k.indexOf(":") + 1)),
  ]);
  const tracks = source.library
    .filter((t) => referenced.has(t.id))
    .map(describeTrack);
  // Stats may reference tracks absent from this library (e.g. online).
  const known = new Set(tracks.map((t) => t.id));
  for (const [id, info] of Object.entries(source.stats.info ?? {})) {
    if (!known.has(id) && referenced.has(id)) {
      tracks.push({ id, title: info.title, artist: info.artist, album: info.album, online: info.online });
    }
  }

  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tracks,
    playlists: source.playlists.map((p) => ({
      ...p,
      ...(p.online ? { online: p.online.map(serializableTrack) } : {}),
    })),
    smartPlaylists: source.smartPlaylists.filter((p) => !p.builtin),
    favorites: source.favorites.map(serializableTrack),
    history: source.history.map(serializableTrack),
    stats: source.stats,
    prefs: source.prefs,
    trackMeta,
  };
}

export function parseBackup(text: string): BackupData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Fichier de sauvegarde illisible (JSON invalide).");
  }
  const d = data as Partial<BackupData>;
  if (!d || d.kind !== BACKUP_KIND || typeof d.version !== "number") {
    throw new Error("Ce fichier n'est pas une sauvegarde AURORA.");
  }
  if (d.version > BACKUP_VERSION) {
    throw new Error("Sauvegarde créée par une version plus récente d'AURORA.");
  }
  return {
    kind: BACKUP_KIND,
    version: d.version,
    exportedAt: String(d.exportedAt ?? ""),
    tracks: Array.isArray(d.tracks) ? d.tracks : [],
    playlists: Array.isArray(d.playlists) ? d.playlists : [],
    smartPlaylists: Array.isArray(d.smartPlaylists) ? d.smartPlaylists : [],
    favorites: Array.isArray(d.favorites) ? d.favorites : [],
    history: Array.isArray(d.history) ? d.history : [],
    stats: (d.stats ?? { plays: {}, seconds: 0 }) as ListeningStats,
    prefs: d.prefs && typeof d.prefs === "object" ? d.prefs : {},
    trackMeta: d.trackMeta && typeof d.trackMeta === "object" ? d.trackMeta : {},
  };
}

/**
 * Maps backup track ids to current library ids. Priority: same id → same
 * file name + size → same artist/title (+album, ±3 s duration) → same
 * relative path. Online ids (yt:…) are stable and map to themselves.
 */
export function matchTrackIds(
  descriptors: readonly TrackDescriptor[],
  library: readonly Track[]
): Map<string, string> {
  const map = new Map<string, string>();
  const ids = new Set(library.map((t) => t.id));
  const byFile = new Map<string, Track>();
  const byMeta = new Map<string, Track[]>();
  const byPath = new Map<string, Track>();
  for (const t of library) {
    if (t.file) byFile.set(`${t.file.name}|${t.file.size}`, t);
    if (t.relPath) byPath.set(t.relPath.toLowerCase(), t);
    const key = `${normalizeText(t.artist)}|${normalizeText(t.title)}`;
    byMeta.set(key, [...(byMeta.get(key) ?? []), t]);
  }
  for (const d of descriptors) {
    if (ids.has(d.id) || d.online || d.id.startsWith("yt:")) {
      map.set(d.id, d.id);
      continue;
    }
    let found =
      d.fileName && d.size !== undefined ? byFile.get(`${d.fileName}|${d.size}`) : undefined;
    if (!found) {
      const candidates = byMeta.get(`${normalizeText(d.artist)}|${normalizeText(d.title)}`) ?? [];
      found =
        candidates.find(
          (t) =>
            normalizeText(t.album) === normalizeText(d.album) &&
            (d.durationSec === undefined ||
              trackDuration(t) === undefined ||
              Math.abs((trackDuration(t) ?? 0) - d.durationSec) <= 3)
        ) ?? (candidates.length === 1 ? candidates[0] : undefined);
    }
    if (!found && d.relPath) found = byPath.get(d.relPath.toLowerCase());
    if (found) map.set(d.id, found.id);
  }
  return map;
}

/** Rewrites and writes per-track meta entries with remapped ids. */
export async function restoreTrackMeta(
  trackMeta: Record<string, unknown>,
  mapId: (id: string) => string
): Promise<number> {
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(trackMeta)) {
    const prefix = TRACK_META_PREFIXES.find((p) => key.startsWith(p));
    if (!prefix) continue;
    entries.push([prefix + mapId(key.slice(prefix.length)), value]);
  }
  await idbSetMany("meta", entries);
  return entries.length;
}

/** Triggers a download (web/Electron) or the share sheet (mobile). */
export async function saveTextFile(
  fileName: string,
  text: string,
  mime = "application/json"
): Promise<void> {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (isTouch && typeof File !== "undefined" && nav.canShare) {
    const file = new File([blob], fileName, { type: mime });
    if (nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
