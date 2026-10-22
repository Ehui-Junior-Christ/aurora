import { BANDS, decimate, frameFeatures, percentile, type FrameFeatures } from "./dsp";
import { chromagram, estimateKey, toCamelot } from "./key";
import { detectBeatGrid, onsetEnvelope } from "./tempo";
import type { MixAnalysis } from "./types";

export const MIX_ANALYSIS_VERSION = 1;

const SILENT_POWER = 0.004 * 0.004 * 0.25;

function db(power: number): number {
  return 10 * Math.log10(power + 1e-12);
}

/** Mean of `values` over frames covering [t0, t1). */
function meanOver(values: Float32Array, feat: FrameFeatures, t0: number, t1: number): number {
  const a = Math.max(0, Math.floor((t0 - feat.winSec * 0.5) * feat.fps));
  const b = Math.min(feat.frames, Math.max(a + 1, Math.floor((t1 - feat.winSec * 0.5) * feat.fps)));
  let s = 0;
  for (let f = a; f < b; f++) s += values[f];
  return b > a ? s / (b - a) : 0;
}

function audibleBounds(feat: FrameFeatures, duration: number): { start: number; end: number } {
  let first = -1;
  let last = -1;
  for (let f = 0; f < feat.frames; f++) {
    if (feat.power[f] > SILENT_POWER) {
      if (first < 0) first = f;
      last = f;
    }
  }
  if (first < 0) return { start: 0, end: duration };
  return {
    start: Math.max(0, first / feat.fps),
    end: Math.min(duration, (last + 1) / feat.fps + feat.winSec),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Full DJ analysis of a mono signal: tempo map, downbeats, phrases,
 * per-bar energy, intro / outro, key (Camelot), loudness and energy.
 * Pure: runs in the analysis worker (or on the main thread as fallback).
 */
export function analyzeMix(
  mono: Float32Array,
  sampleRate: number,
  silence?: { start: number; end: number }
): MixAnalysis {
  const duration = mono.length / sampleRate;
  const { data, sr } = decimate(mono, sampleRate);
  const feat = frameFeatures(data, sr);
  const bounds = silence ?? audibleBounds(feat, duration);
  const grid = detectBeatGrid(feat, duration);
  const { key, confidence: keyConfidence } = estimateKey(chromagram(data, sr));
  const keyOk = keyConfidence >= 0.25;

  const base = {
    v: MIX_ANALYSIS_VERSION,
    duration,
    audibleStart: bounds.start,
    audibleEnd: bounds.end,
    key: keyOk ? key : -1,
    keyConfidence,
    camelot: keyOk ? toCamelot(key) : "",
  };

  if (!grid) {
    let s = 0;
    for (let f = 0; f < feat.frames; f++) s += feat.power[f];
    const loud = db(s / Math.max(1, feat.frames));
    return {
      ...base,
      bpm: 0,
      bpmConfidence: 0,
      gridReliable: false,
      beats: [],
      downbeat: 0,
      phraseBeat: 0,
      barDb: [],
      barLowDb: [],
      bodyDb: loud,
      introEnd: bounds.start,
      outroStart: bounds.end,
      fadeEnd: bounds.end,
      loudnessDb: loud,
      energy: 0.3,
    };
  }

  const { beats, downbeat } = grid;
  const phraseBar = Math.max(0, Math.round((grid.phraseBeat - downbeat) / 4));
  const barDb: number[] = [];
  const barLowDb: number[] = [];
  const barPow: number[] = [];
  for (let k = downbeat; k + 4 < beats.length; k += 4) {
    const p = meanOver(feat.power, feat, beats[k], beats[k + 4]);
    barPow.push(p);
    barDb.push(Math.round(db(p) * 10) / 10);
    barLowDb.push(
      Math.round(db(meanOver(feat.powerLow, feat, beats[k], beats[k + 4])) * 10) / 10
    );
  }
  const nBars = barDb.length;
  const audibleBars = barDb.filter((v) => v > db(SILENT_POWER) + 3);
  const bodyDb = percentile(audibleBars.length ? audibleBars : barDb, 0.75);
  const lowBody = percentile(barLowDb, 0.75);
  // "Fullness": per-band deficit against the typical body spectrum. Intros
  // and outros usually lack layers (bass line, pads, vocals) even when the
  // kick keeps the overall level up.
  const barBands: Float64Array[] = [];
  for (let k = downbeat; k + 4 < beats.length; k += 4) {
    const a = Math.max(0, Math.floor((beats[k] - feat.winSec * 0.5) * feat.fps));
    const b = Math.min(feat.frames, Math.floor((beats[k + 4] - feat.winSec * 0.5) * feat.fps));
    const v = new Float64Array(BANDS);
    for (let f = a; f < b; f++) {
      for (let j = 0; j < BANDS; j++) v[j] += feat.bands[f * BANDS + j];
    }
    for (let j = 0; j < BANDS; j++) v[j] = (10 * v[j]) / Math.max(1, b - a);
    barBands.push(v);
  }
  const profile = Array.from({ length: BANDS }, (_, j) =>
    percentile(barBands.map((v) => v[j]), 0.75)
  );
  const deficit = (m: number) => {
    let s = 0;
    for (let j = 0; j < BANDS; j++) s += Math.max(0, profile[j] - barBands[m][j]);
    return s / BANDS;
  };
  const deficits = barDb.map((_, m) => deficit(m));
  // Chord changes alone move the deficit by a few dB: threshold relative to
  // the typical (median) bar.
  const deficitMax = Math.max(4, Math.min(9, 2.5 * percentile(deficits, 0.5)));
  const isBody = (m: number) =>
    m >= 0 &&
    m < nBars &&
    barDb[m] >= bodyDb - 4 &&
    barLowDb[m] >= lowBody - 8 &&
    deficits[m] < deficitMax;

  const barTime = (m: number) => {
    const k = downbeat + 4 * Math.max(0, m);
    return k < beats.length ? beats[k] : beats[beats.length - 1];
  };
  const snap = (m: number) => {
    const phraseNear = phraseBar % 8 + Math.round((m - (phraseBar % 8)) / 8) * 8;
    if (Math.abs(phraseNear - m) <= 2) return Math.max(0, phraseNear);
    const four = phraseBar % 4 + Math.round((m - (phraseBar % 4)) / 4) * 4;
    return Math.max(0, four);
  };

  let introBar = 0;
  for (let m = 0; m < nBars - 1; m++) {
    if (isBody(m) && isBody(m + 1)) {
      introBar = m;
      break;
    }
  }
  let lastBody = nBars - 1;
  for (let m = nBars - 1; m > 0; m--) {
    if (isBody(m) && isBody(m - 1)) {
      lastBody = m;
      break;
    }
  }
  let introEndBar = introBar > 0 ? snap(introBar) : 0;
  let outroBar = snap(lastBody + 1);
  if (outroBar <= introEndBar) {
    introEndBar = introBar;
    outroBar = Math.max(introBar + 1, lastBody + 1);
  }
  const firstAudibleBar = Math.max(
    0,
    barDb.findIndex((v) => v > db(SILENT_POWER) + 3)
  );
  const introEnd = barTime(Math.max(introEndBar, firstAudibleBar));
  const outroStart = Math.min(barTime(Math.min(outroBar, nBars)), bounds.end);

  let fadeBar = nBars - 1;
  while (fadeBar > 0 && barDb[fadeBar] < bodyDb - 10) fadeBar--;
  const fadeEnd = Math.min(bounds.end, barTime(fadeBar + 1));

  let loudSum = 0;
  let loudCount = 0;
  for (let m = 0; m < nBars; m++) {
    if (barDb[m] >= bodyDb - 6) {
      loudSum += barPow[m];
      loudCount++;
    }
  }
  const loudnessDb = db(loudCount > 0 ? loudSum / loudCount : 0);

  // Energy: tempo, bass weight and onset density in the body.
  const env = onsetEnvelope(feat);
  let peaks = 0;
  let bodyFrames = 0;
  const fFrom = Math.floor(introEnd * feat.fps);
  const fTo = Math.min(env.length - 1, Math.floor(outroStart * feat.fps));
  for (let f = Math.max(1, fFrom); f < fTo; f++) {
    bodyFrames++;
    if (env[f] > 1.5 && env[f] >= env[f - 1] && env[f] > env[f + 1]) peaks++;
  }
  const density = bodyFrames > 0 ? peaks / (bodyFrames / feat.fps) : 0;
  const bpmNorm = clamp01((grid.bpm - 80) / 60);
  const bass = clamp01((lowBody - bodyDb + 12) / 10);
  const energy =
    Math.round((0.35 * bpmNorm + 0.35 * bass + 0.3 * clamp01(density / 6)) * 100) / 100;

  return {
    ...base,
    bpm: grid.bpm,
    bpmConfidence: Math.round(grid.confidence * 100) / 100,
    gridReliable: grid.reliable,
    beats,
    downbeat,
    phraseBeat: grid.phraseBeat,
    barDb,
    barLowDb,
    bodyDb,
    introEnd,
    outroStart,
    fadeEnd,
    loudnessDb,
    energy,
  };
}
