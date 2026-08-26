export interface TrackAnalysis {
  peaks: number[];
  rms: number;
}

const PEAK_BINS = 400;
const TARGET_RMS = 0.16;

import { idbGet, idbSet } from "./db";

export async function getCachedAnalysis(
  id: string,
  file: File
): Promise<TrackAnalysis | null> {
  const key = `analysis:${id}`;
  const cached = await idbGet<TrackAnalysis>("meta", key);
  if (cached && Array.isArray(cached.peaks) && cached.peaks.length > 0) {
    return cached;
  }
  try {
    const result = await analyzeTrack(file);
    void idbSet("meta", key, result);
    return result;
  } catch {
    return null;
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
  return { peaks, rms };
}
