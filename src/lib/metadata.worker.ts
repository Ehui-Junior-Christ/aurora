import {
  paletteFromPixels,
  FALLBACK_PALETTES,
  type RgbPixel,
} from "./palette";
import { fnv1a } from "./hash";
import type { PaletteColor } from "./types";

interface WorkerContext {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

const ctx = self as unknown as WorkerContext;

interface TagsPayload {
  title: string;
  artist: string;
  album: string;
  coverBlob?: Blob;
  palette: PaletteColor[];
}

interface RawTagsPayload {
  title?: string;
  artist?: string;
  album?: string;
  picture?: { format: string; data: number[] };
}

function cleanFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/^\d+\s*[-._)]?\s*/, "")
    .replace(/_/g, " ")
    .trim();
}

async function extractPaletteOffscreen(blob: Blob): Promise<PaletteColor[]> {
  const bitmap = await createImageBitmap(blob);
  const size = 72;
  const canvas = new OffscreenCanvas(size, size);
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("no-2d");
  g.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  const { data } = g.getImageData(0, 0, size, size);
  const pixels: RgbPixel[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) throw new Error("no-pixels");
  return paletteFromPixels(pixels);
}

async function readTags(
  file: File,
  fallbackTitle: string
): Promise<TagsPayload> {
  const result = await new Promise<{
    title?: string;
    artist?: string;
    album?: string;
    picture?: { format: string; data: number[] };
  } | null>((resolve) => {
    import("jsmediatags/dist/jsmediatags.min.js")
      .then((mod) => {
        const jsmediatags = (
          mod as unknown as {
            default: {
              read: (
                input: File | Blob,
                callbacks: {
                  onSuccess?: (res: { tags: RawTagsPayload | null }) => void;
                  onError?: () => void;
                }
              ) => void;
            };
          }
        ).default ?? mod;
        try {
          jsmediatags.read(file, {
            onSuccess: (res) => resolve(res.tags ?? null),
            onError: () => resolve(null),
          });
        } catch {
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });

  const title = result?.title?.trim() || fallbackTitle;
  const artist = result?.artist?.trim() || "Unknown Artist";
  const album = result?.album?.trim() || "Unknown Album";

  let coverBlob: Blob | undefined;
  let palette: PaletteColor[] | null = null;
  if (result?.picture?.data && result.picture.data.length > 0) {
    coverBlob = new Blob([new Uint8Array(result.picture.data)], {
      type: result.picture.format || "image/jpeg",
    });
    try {
      palette = await extractPaletteOffscreen(coverBlob);
    } catch {
      palette = null;
    }
  }
  if (!palette) {
    palette =
      FALLBACK_PALETTES[fnv1a(title + album) % FALLBACK_PALETTES.length];
  }
  return { title, artist, album, coverBlob, palette };
}

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as {
    kind: string;
    requestId: number;
    file: File;
  };
  if (msg.kind !== "tags") return;
  const fallbackTitle = cleanFileName(msg.file.name) || msg.file.name;
  readTags(msg.file, fallbackTitle)
    .then((payload) => {
      ctx.postMessage({ kind: "tags", requestId: msg.requestId, ...payload });
    })
    .catch((error: unknown) => {
      ctx.postMessage({
        kind: "tags",
        requestId: msg.requestId,
        error: error instanceof Error ? error.message : "worker-failed",
      });
    });
};
