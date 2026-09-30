export interface TrackAnalysis {
  peaks: number[];
  rms: number;
  /** Analysis format version (2 adds silence bounds and duration). */
  v?: number;
  /** First audible instant in seconds (end of leading silence). */
  start?: number;
  /** Last audible instant in seconds (start of trailing silence). */
  end?: number;
  /** Decoded duration in seconds. */
  duration?: number;
}

const ANALYSIS_VERSION = 2;
/** ~-48 dBFS: below this a 20 ms window is considered silent. */
const SILENCE_THRESHOLD = 0.004;
const SILENCE_WINDOW_S = 0.02;

const PEAK_BINS = 400;
const TARGET_RMS = 0.16;

import { idbGet, idbSet } from "./db";

const inflight = new Map<string, Promise<TrackAnalysis | null>>();

export function getCachedAnalysis(
  id: string,
  file: File
): Promise<TrackAnalysis | null> {
  // Timeline (peaks) and the store (gain, silence) ask concurrently: decode once.
  const running = inflight.get(id);
  if (running) return running;
  const promise = loadAnalysis(id, file).finally(() => inflight.delete(id));
  inflight.set(id, promise);
  return promise;
}

async function loadAnalysis(
  id: string,
  file: File
): Promise<TrackAnalysis | null> {
  const key = `analysis:${id}`;
  const cached = await idbGet<TrackAnalysis>("meta", key);
  if (
    cached &&
    Array.isArray(cached.peaks) &&
    cached.peaks.length > 0 &&
    (cached.v ?? 1) >= ANALYSIS_VERSION
  ) {
    return cached;
  }
  try {
    const result = await analyzeTrack(file);
    void idbSet("meta", key, result);
    return result;
  } catch {
    return cached ?? null;
  }
}

export function normalizationGain(rms: number, enabled: boolean): number {
  if (!enabled || rms <= 0.0001) return 1;
  return Math.min(3, Math.max(0.4, TARGET_RMS / rms));
}

async function decode(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("no-audio-context");
  const ctx = new Ctor();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

export async function analyzeTrack(file: File): Promise<TrackAnalysis> {
  const audio = await decode(file);
  const data = audio.getChannelData(0);
  const binSize = Math.max(1, Math.floor(data.length / PEAK_BINS));
  const peaks: number[] = [];
  let sumSquares = 0;
  let samples = 0;
  for (let bin = 0; bin < PEAK_BINS; bin++) {
    const start = bin * binSize;
    const end = Math.min(data.length, start + binSize);
    let max = 0;
    for (let i = start; i < end; i += 2) {
      const v = data[i];
      const abs = v < 0 ? -v : v;
      if (abs > max) max = abs;
      sumSquares += v * v;
      samples++;
    }
    peaks.push(max);
  }
  const rms = samples > 0 ? Math.sqrt(sumSquares / samples) : 0;
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) {
    channels.push(audio.getChannelData(c));
  }
  const { start, end } = detectSilenceBounds(channels, audio.sampleRate);
  return {
    peaks,
    rms,
    v: ANALYSIS_VERSION,
    start,
    end,
    duration: audio.duration,
  };
}

/**
 * Finds the first and last windows whose peak exceeds the silence threshold.
 * Pure (exported for tests). Returns {start: 0, end: duration} when the whole
 * signal is silent so callers never skip the entire track.
 */
export function detectSilenceBounds(
  channels: ArrayLike<number>[],
  sampleRate: number,
  threshold = SILENCE_THRESHOLD
): { start: number; end: number } {
  const length = channels[0]?.length ?? 0;
  const duration = sampleRate > 0 ? length / sampleRate : 0;
  const win = Math.max(1, Math.floor(sampleRate * SILENCE_WINDOW_S));
  const loud = (from: number): boolean => {
    const to = Math.min(length, from + win);
    for (const data of channels) {
      for (let i = from; i < to; i++) {
        const v = data[i];
        if (v > threshold || v < -threshold) return true;
      }
    }
    return false;
  };
  let first = -1;
  for (let i = 0; i < length; i += win) {
    if (loud(i)) {
      first = i;
      break;
    }
  }
  if (first < 0) return { start: 0, end: duration };
  let last = first;
  for (let i = Math.floor((length - 1) / win) * win; i >= first; i -= win) {
    if (loud(i)) {
      last = Math.min(length, i + win);
      break;
    }
  }
  return { start: first / sampleRate, end: last / sampleRate };
}
