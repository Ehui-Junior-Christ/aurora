import type { ReplayGainInfo } from "./types";

/**
 * ReplayGain tag reader working on raw bytes (usable in the metadata worker).
 * jsmediatags drops Vorbis comments it does not know (FLAC/OGG) and MP4
 * freeform atoms, so we locate the tag regions per container and scan them
 * for REPLAYGAIN_* keys. Handles ID3v2 TXXX (latin1/UTF-8/UTF-16), Vorbis
 * comments, APEv2 (end of MP3) and iTunes "----" atoms.
 */

const MAX_REGION = 8 * 1024 * 1024;
const TAIL = 64 * 1024;

const KEY_RE =
  /replaygain_(track|album)_(gain|peak)[^0-9+\-.]{0,32}?([+-]?\d{1,3}(?:[.,]\d+)?)/gi;

/** Parses REPLAYGAIN_* values from decoded tag text. */
export function parseReplayGainText(text: string): ReplayGainInfo | undefined {
  const info: ReplayGainInfo = {};
  KEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_RE.exec(text)) !== null) {
    const value = Number(m[3].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    const scope = m[1].toLowerCase();
    const kind = m[2].toLowerCase();
    if (kind === "gain" && value >= -30 && value <= 30) {
      if (scope === "track") info.trackGain ??= value;
      else info.albumGain ??= value;
    } else if (kind === "peak" && value > 0 && value <= 10) {
      if (scope === "track") info.trackPeak ??= value;
      else info.albumPeak ??= value;
    }
  }
  return info.trackGain !== undefined || info.albumGain !== undefined
    ? info
    : undefined;
}

function latin1(bytes: Uint8Array): string {
  // Drop NULs so UTF-16 ASCII reads like ASCII; chunked to avoid arg limits.
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
    const filtered: number[] = [];
    for (let j = 0; j < part.length; j++) if (part[j] !== 0) filtered.push(part[j]);
    out += String.fromCharCode(...filtered);
  }
  return out;
}

async function read(file: Blob, start: number, end: number): Promise<Uint8Array> {
  const s = Math.max(0, start);
  const e = Math.min(file.size, end);
  if (e <= s) return new Uint8Array(0);
  return new Uint8Array(await file.slice(s, e).arrayBuffer());
}

async function flacRegions(file: Blob): Promise<Uint8Array[]> {
  const regions: Uint8Array[] = [];
  let offset = 4;
  for (let guard = 0; guard < 64 && offset + 4 <= file.size; guard++) {
    const header = await read(file, offset, offset + 4);
    if (header.length < 4) break;
    const last = (header[0] & 0x80) !== 0;
    const type = header[0] & 0x7f;
    const length = (header[1] << 16) | (header[2] << 8) | header[3];
    if (type === 4) {
      regions.push(await read(file, offset + 4, offset + 4 + Math.min(length, MAX_REGION)));
      break;
    }
    offset += 4 + length;
    if (last) break;
  }
  return regions;
}

/** Reads ReplayGain values from an audio file (undefined when absent). */
export async function readReplayGain(file: Blob): Promise<ReplayGainInfo | undefined> {
  try {
    const head = await read(file, 0, 16);
    const magic = String.fromCharCode(...head.subarray(0, 4));
    const regions: Uint8Array[] = [];
    if (magic === "fLaC") {
      regions.push(...(await flacRegions(file)));
    } else if (magic.startsWith("ID3")) {
      const size =
        ((head[6] & 0x7f) << 21) |
        ((head[7] & 0x7f) << 14) |
        ((head[8] & 0x7f) << 7) |
        (head[9] & 0x7f);
      regions.push(await read(file, 0, 10 + Math.min(size, MAX_REGION)));
      regions.push(await read(file, file.size - TAIL, file.size)); // APEv2
    } else if (magic === "OggS") {
      regions.push(await read(file, 0, 256 * 1024));
    } else if (String.fromCharCode(...head.subarray(4, 8)) === "ftyp") {
      // "moov" (with the ilst atoms) is either at the start or at the end.
      regions.push(await read(file, 0, 1024 * 1024));
      regions.push(await read(file, file.size - 1024 * 1024, file.size));
    } else {
      regions.push(await read(file, 0, 256 * 1024));
      regions.push(await read(file, file.size - TAIL, file.size));
    }
    for (const region of regions) {
      const info = parseReplayGainText(latin1(region));
      if (info) return info;
    }
  } catch {
    // unreadable file: no ReplayGain
  }
  return undefined;
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Linear gain for a track: track gain (album gain as fallback), limited by
 * the peak so the result does not clip. Undefined when no tag is present.
 */
export function replayGainMultiplier(
  info: ReplayGainInfo | undefined,
  preferAlbum = false
): number | undefined {
  if (!info) return undefined;
  const db = preferAlbum
    ? (info.albumGain ?? info.trackGain)
    : (info.trackGain ?? info.albumGain);
  if (db === undefined) return undefined;
  let gain = dbToGain(db);
  const peak = preferAlbum
    ? (info.albumPeak ?? info.trackPeak)
    : (info.trackPeak ?? info.albumPeak);
  if (peak && peak > 0) gain = Math.min(gain, 1 / peak);
  return gain;
}
