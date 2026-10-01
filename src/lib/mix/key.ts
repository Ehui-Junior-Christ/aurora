import { FFT, hann } from "./dsp";
import type { HarmonicRelation } from "./types";

/**
 * Musical key detection (Krumhansl-Schmuckler on a tuning-corrected,
 * peak-picked chromagram) and Camelot wheel helpers.
 */

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const MIN_HZ = 65;
const MAX_HZ = 2100;

/**
 * Global 12-bin chroma of a mono signal. Spectral peaks only (harmonic
 * partials, not noise), log-compressed, with the reference pitch corrected
 * by the median deviation of the strongest peaks (432 Hz masters, detuned
 * vinyl rips…).
 */
export function chromagram(x: Float32Array, sr: number): Float64Array {
  const n = sr > 16000 ? 8192 : 4096;
  const hop = n / 2;
  const fft = new FFT(n);
  const win = hann(n);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const half = n / 2;
  const mag = new Float32Array(half);
  const binHz = sr / n;
  const k0 = Math.max(2, Math.floor(MIN_HZ / binHz));
  const k1 = Math.min(half - 2, Math.ceil(MAX_HZ / binHz));
  const peaks: { midi: number; w: number }[] = [];
  const frames = Math.max(0, Math.floor((x.length - n) / hop) + 1);
  // Cap the work on very long files (DJ sets): ~600 evenly spaced frames.
  const stride = Math.max(1, Math.floor(frames / 600));
  for (let f = 0; f < frames; f += stride) {
    const off = f * hop;
    for (let i = 0; i < n; i++) {
      re[i] = x[off + i] * win[i];
      im[i] = 0;
    }
    fft.transform(re, im);
    let frameMax = 0;
    for (let k = k0 - 1; k <= k1 + 1; k++) {
      mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      if (mag[k] > frameMax) frameMax = mag[k];
    }
    if (frameMax <= 1e-6) continue;
    const floor = frameMax * 0.02;
    for (let k = k0; k <= k1; k++) {
      const m = mag[k];
      if (m < floor || m <= mag[k - 1] || m < mag[k + 1]) continue;
      // Parabolic interpolation on log magnitude for the true frequency.
      const a = Math.log(mag[k - 1] + 1e-12);
      const b = Math.log(m + 1e-12);
      const c = Math.log(mag[k + 1] + 1e-12);
      const den = a - 2 * b + c;
      const off2 = den < 0 ? (0.5 * (a - c)) / den : 0;
      const hz = (k + off2) * binHz;
      if (hz < MIN_HZ || hz > MAX_HZ) continue;
      const midi = 69 + 12 * Math.log2(hz / 440);
      peaks.push({ midi, w: Math.log1p((100 * m) / frameMax) });
    }
  }
  const chroma = new Float64Array(12);
  if (peaks.length === 0) return chroma;
  // Tuning: weighted circular mean of the deviation from the semitone grid.
  let sx = 0;
  let sy = 0;
  for (const p of peaks) {
    const ang = 2 * Math.PI * (p.midi - Math.round(p.midi));
    sx += p.w * Math.cos(ang);
    sy += p.w * Math.sin(ang);
  }
  const tuning = Math.atan2(sy, sx) / (2 * Math.PI); // semitones, (-0.5, 0.5]
  for (const p of peaks) {
    const m = p.midi - tuning;
    const nearest = Math.round(m);
    const dev = Math.abs(m - nearest);
    const w = p.w * Math.cos(Math.PI * dev) ** 2;
    chroma[((nearest % 12) + 12) % 12] += w;
  }
  return chroma;
}

function correlate(a: ArrayLike<number>, b: ArrayLike<number>, shift: number): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < 12; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= 12;
  mb /= 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[(i + shift) % 12] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Key index (0-11 major, 12-23 minor) and confidence (margin, 0..1). */
export function estimateKey(chroma: ArrayLike<number>): { key: number; confidence: number } {
  let total = 0;
  for (let i = 0; i < 12; i++) total += chroma[i];
  if (!(total > 0)) return { key: -1, confidence: 0 };
  const scores: number[] = [];
  for (let t = 0; t < 12; t++) scores.push(correlate(chroma, MAJOR, t));
  for (let t = 0; t < 12; t++) scores.push(correlate(chroma, MINOR, t));
  let best = 0;
  for (let i = 1; i < 24; i++) if (scores[i] > scores[best]) best = i;
  let second = -Infinity;
  for (let i = 0; i < 24; i++) if (i !== best && scores[i] > second) second = scores[i];
  const margin = scores[best] - second;
  const confidence = Math.max(0, Math.min(1, scores[best] * 0.6 + margin * 4));
  return { key: best, confidence };
}

export function keyName(key: number): string {
  if (key < 0 || key > 23) return "";
  return key < 12 ? `${NAMES[key]} maj` : `${NAMES[key - 12]} min`;
}

/** Camelot number 1-12 and letter (A = minor, B = major). */
export function camelotOf(key: number): { num: number; letter: "A" | "B" } | null {
  if (key < 0 || key > 23) return null;
  if (key < 12) return { num: ((key * 7 + 7) % 12) + 1, letter: "B" };
  const relMajor = (key - 12 + 3) % 12;
  return { num: ((relMajor * 7 + 7) % 12) + 1, letter: "A" };
}

export function toCamelot(key: number): string {
  const c = camelotOf(key);
  return c ? `${c.num}${c.letter}` : "";
}

/**
 * Harmonic compatibility of a transition a → b on the Camelot wheel.
 * score: same 1 · ±1 / relative 0.85-0.9 · +2 "energy boost" 0.55 ·
 * diagonal 0.5 · +7 (semitone up) 0.45 · otherwise clash 0.1.
 */
export function harmonicCompat(
  a: number,
  b: number
): { score: number; relation: HarmonicRelation } {
  const ca = camelotOf(a);
  const cb = camelotOf(b);
  if (!ca || !cb) return { score: 0.6, relation: "unknown" };
  const d = (cb.num - ca.num + 12) % 12; // clockwise steps
  const step = Math.min(d, 12 - d);
  const sameLetter = ca.letter === cb.letter;
  if (step === 0 && sameLetter) return { score: 1, relation: "same" };
  if (step === 1 && sameLetter) return { score: 0.9, relation: "compatible" };
  if (step === 0) return { score: 0.85, relation: "compatible" };
  if (d === 2 && sameLetter) return { score: 0.55, relation: "boost" };
  if (d === 7 && sameLetter) return { score: 0.45, relation: "boost" };
  if (step === 1) return { score: 0.5, relation: "compatible" };
  return { score: 0.1, relation: "clash" };
}
