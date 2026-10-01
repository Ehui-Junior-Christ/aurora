import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";
import { fnv1a } from "./hash";
import { extractPalette, FALLBACK_PALETTES } from "./palette";
import { idbGet, idbSet } from "./db";
import { readReplayGain } from "./replaygain";
import type { PaletteColor, ReplayGainInfo, Track } from "./types";

interface RawTags {
  title?: string;
  artist?: string;
  album?: string;
  picture?: { format: string; data: number[] };
}

interface WorkerTagsResult {
  kind: "tags";
  requestId: number;
  title: string;
  artist: string;
  album: string;
  coverBlob?: Blob;
  palette: PaletteColor[];
  replayGain?: ReplayGainInfo;
  error?: string;
}

function cleanFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/^\d+\s*[-._)]?\s*/, "")
    .replace(/_/g, " ")
    .trim();
}

function readTagsMain(file: File): Promise<RawTags | null> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: (result) => resolve(result.tags ?? null),
        onError: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

// ---- Worker pool -------------------------------------------------------------

interface PoolWorker {
  worker: Worker;
  busy: number;
}

let pool: PoolWorker[] | null = null;
let workerBroken = false;
let requestSeq = 0;
const pending = new Map<
  number,
  {
    resolve: (value: WorkerTagsResult) => void;
    reject: (error: Error) => void;
    owner: PoolWorker;
  }
>();

/** Number of parallel metadata workers (bounded, leaves a core for the UI). */
export function metadataConcurrency(): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

function getPool(): PoolWorker[] | null {
  if (workerBroken || typeof window === "undefined") return null;
  if (pool) return pool;
  try {
    pool = [];
    for (let i = 0; i < metadataConcurrency(); i++) {
      const worker = new Worker(new URL("./metadata.worker.ts", import.meta.url));
      const entry: PoolWorker = { worker, busy: 0 };
      worker.onmessage = (event: MessageEvent<WorkerTagsResult>) => {
        const data = event.data;
        const request = pending.get(data.requestId);
        if (!request) return;
        pending.delete(data.requestId);
        request.owner.busy = Math.max(0, request.owner.busy - 1);
        if (data.error) request.reject(new Error(data.error));
        else request.resolve(data);
      };
      worker.onerror = () => {
        workerBroken = true;
        for (const [, request] of pending) request.reject(new Error("worker-crashed"));
        pending.clear();
      };
      pool.push(entry);
    }
  } catch {
    workerBroken = true;
    pool = null;
    return null;
  }
  return pool;
}

function tagsViaWorker(file: File): Promise<WorkerTagsResult> {
  return new Promise((resolve, reject) => {
    const workers = getPool();
    if (!workers || workers.length === 0) {
      reject(new Error("no-worker"));
      return;
    }
    // Least busy worker.
    const owner = workers.reduce((a, b) => (b.busy < a.busy ? b : a));
    const requestId = ++requestSeq;
    owner.busy++;
    pending.set(requestId, { resolve, reject, owner });
    owner.worker.postMessage({ kind: "tags", requestId, file });
    window.setTimeout(() => {
      const request = pending.get(requestId);
      if (request) {
        pending.delete(requestId);
        request.owner.busy = Math.max(0, request.owner.busy - 1);
        reject(new Error("worker-timeout"));
      }
    }, 20000);
  });
}

export function fileTrackId(file: File): string {
  return String(fnv1a(`${file.name}|${file.size}|${file.lastModified}`));
}

export interface ParsedTrack {
  track: Track;
  /** Embedded cover art (kept for the library cache). */
  coverBlob?: Blob;
}

/** Full tag parse (worker, main-thread fallback), without cache lookup. */
export async function parseTrackDetailed(file: File): Promise<ParsedTrack> {
  const id = fileTrackId(file);
  const fallbackTitle = cleanFileName(file.name) || file.name;

  let title = fallbackTitle;
  let artist = "Unknown Artist";
  let album = "Unknown Album";
  let coverBlob: Blob | undefined;
  let palette: PaletteColor[] | null = null;
  let replayGain: ReplayGainInfo | undefined;

  let workerResult: WorkerTagsResult | null = null;
  try {
    workerResult = await tagsViaWorker(file);
  } catch {
    workerResult = null;
  }

  if (workerResult) {
    title = workerResult.title;
    artist = workerResult.artist;
    album = workerResult.album;
    palette = workerResult.palette;
    replayGain = workerResult.replayGain;
    coverBlob = workerResult.coverBlob;
  } else {
    const tags = await readTagsMain(file);
    replayGain = await readReplayGain(file);
    title = tags?.title?.trim() || fallbackTitle;
    artist = tags?.artist?.trim() || "Unknown Artist";
    album = tags?.album?.trim() || "Unknown Album";
    if (tags?.picture?.data && tags.picture.data.length > 0) {
      coverBlob = new Blob([new Uint8Array(tags.picture.data)], {
        type: tags.picture.format || "image/jpeg",
      });
    }
  }
  const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : undefined;

  const cached = await idbGet<{
    palette: PaletteColor[];
    bpm: number | null;
  }>("meta", id);

  if (!palette && coverUrl) {
    try {
      palette = await extractPalette(coverUrl);
    } catch {
      palette = null;
    }
  }
  if (!palette) {
    palette = FALLBACK_PALETTES[fnv1a(title + album) % FALLBACK_PALETTES.length];
  }

  if (!cached) {
    void idbSet("meta", id, { palette, bpm: null });
  }

  return {
    track: {
      id,
      file,
      isOnline: false,
      title,
      artist,
      album,
      coverUrl,
      palette,
      seed: fnv1a(`${title}|${artist}|${album}`),
      bpm: cached?.bpm ?? undefined,
      ...(replayGain ? { replayGain } : {}),
    },
    coverBlob,
  };
}

export async function parseTrack(file: File): Promise<Track> {
  return (await parseTrackDetailed(file)).track;
}
