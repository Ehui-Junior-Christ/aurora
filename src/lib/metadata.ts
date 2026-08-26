import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";
import { fnv1a } from "./hash";
import { extractPalette, FALLBACK_PALETTES } from "./palette";
import { idbGet, idbSet } from "./db";
import type { PaletteColor, Track } from "./types";

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

let worker: Worker | null = null;
let workerBroken = false;
let requestSeq = 0;
const pending = new Map<
  number,
  { resolve: (value: WorkerTagsResult) => void; reject: (error: Error) => void }
>();

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./metadata.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<WorkerTagsResult>) => {
      const data = event.data;
      const entry = pending.get(data.requestId);
      if (!entry) return;
      pending.delete(data.requestId);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data);
    };
    worker.onerror = () => {
      workerBroken = true;
      for (const [, entry] of pending) entry.reject(new Error("worker-crashed"));
      pending.clear();
    };
  } catch {
    workerBroken = true;
    return null;
  }
  return worker;
}

function tagsViaWorker(
  file: File,
  requestId: number
): Promise<WorkerTagsResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      reject(new Error("no-worker"));
      return;
    }
    pending.set(requestId, { resolve, reject });
    w.postMessage({ kind: "tags", requestId, file });
    window.setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error("worker-timeout"));
      }
    }, 20000);
  });
}

export async function parseTrack(file: File): Promise<Track> {
  const id = String(fnv1a(`${file.name}|${file.size}|${file.lastModified}`));
  const fallbackTitle = cleanFileName(file.name) || file.name;

  let title = fallbackTitle;
  let artist = "Unknown Artist";
  let album = "Unknown Album";
  let coverUrl: string | undefined;
  let palette: PaletteColor[] | null = null;

  const requestSeqLocal = ++requestSeq;
  let workerResult: WorkerTagsResult | null = null;
  try {
    workerResult = await tagsViaWorker(file, requestSeqLocal);
  } catch {
    workerResult = null;
  }

  if (workerResult) {
    title = workerResult.title;
    artist = workerResult.artist;
    album = workerResult.album;
    palette = workerResult.palette;
    if (workerResult.coverBlob) {
      coverUrl = URL.createObjectURL(workerResult.coverBlob);
    }
  } else {
    const tags = await readTagsMain(file);
    title = tags?.title?.trim() || fallbackTitle;
    artist = tags?.artist?.trim() || "Unknown Artist";
    album = tags?.album?.trim() || "Unknown Album";
    if (tags?.picture?.data && tags.picture.data.length > 0) {
      coverUrl = URL.createObjectURL(
        new Blob([new Uint8Array(tags.picture.data)], {
          type: tags.picture.format || "image/jpeg",
        })
      );
    }
  }

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
    id,
    file,
    title,
    artist,
    album,
    coverUrl,
    palette,
    seed: fnv1a(`${title}|${artist}|${album}`),
    bpm: cached?.bpm ?? undefined,
  };
}
