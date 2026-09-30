import { BANDS, frameTime, normalizeOnset, type FrameFeatures } from "./dsp";

/**
 * Tempo, beat grid, downbeat and phrase detection from frame features.
 *
 * 1. Onset envelope = normalised full-band flux + normalised bass flux.
 * 2. Tempo candidates by autocorrelation with a harmonic comb and a
 *    log-normal prior centred on 122 BPM.
 * 3. Precise period + phase by folding the envelope modulo the period
 *    (circular histogram) over ±2 %: long tracks give ~0.02 % precision.
 * 4. Tempo map: the phase is re-measured on 16-beat blocks, the period is
 *    corrected by linear regression and residual drift is interpolated.
 * 5. Downbeat: bass attacks, beat-synchronous spectral novelty (bar-line
 *    changes) and a snare penalty (backbeat on 2/4).
 * 6. Phrases: 8-bar grid offset maximising bar novelty.
 */

export interface BeatGrid {
  bpm: number;
  confidence: number;
  reliable: boolean;
  beats: number[];
  downbeat: number;
  phraseBeat: number;
}

const MIN_BPM = 55;
const MAX_BPM = 210;
const PRIOR_CENTER = 122;
const PRIOR_OCTAVES = 0.75;
const FOLD_BINS = 64;

export function onsetEnvelope(feat: FrameFeatures): Float32Array {
  const win = Math.round(feat.fps * 0.4);
  const a = normalizeOnset(feat.onset, win);
  const b = normalizeOnset(feat.onsetLow, win);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

/** Tempo in BPM with the highest prior-weighted comb autocorrelation. */
export function estimateTempo(env: Float32Array, fps: number): number {
  const n = env.length;
  const lagMin = Math.max(2, Math.floor((fps * 60) / MAX_BPM));
  const acMin = Math.max(1, Math.floor(lagMin / 2) - 1);
  const lagMax = Math.ceil((fps * 60) / MIN_BPM);
  const maxLag = Math.min(n - 1, lagMax * 4 + 2);
  const ac = new Float64Array(maxLag + 1);
  for (let lag = acMin; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (n - lag);
  }
  const acAt = (l: number): number => {
    if (l > maxLag - 1) return 0;
    const i = Math.floor(l);
    const f = l - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };
  const score = new Float64Array(lagMax + 2);
  let best = lagMin;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    // Symmetric comb (period, double, half, triple): does not favour the
    // slower octave the way a pure multiples comb does.
    const s = acAt(lag) + 0.5 * acAt(lag * 2) + 0.5 * acAt(lag / 2) + 0.25 * acAt(lag * 3);
    const bpm = (60 * fps) / lag;
    const z = Math.log2(bpm / PRIOR_CENTER) / PRIOR_OCTAVES;
    score[lag] = s * Math.exp(-0.5 * z * z);
    if (score[lag] > score[best]) best = lag;
  }
  let lag = best;
  if (best > lagMin && best < lagMax) {
    const y0 = score[best - 1];
    const y1 = score[best];
    const y2 = score[best + 1];
    const den = y0 - 2 * y1 + y2;
    if (den < 0) lag = best + (0.5 * (y0 - y2)) / den;
  }
  return (60 * fps) / lag;
}

/** Circular histogram of `env` folded modulo `period` frames. */
function fold(
  env: Float32Array,
  period: number,
  from = 0,
  to = env.length
): Float64Array {
  const hist = new Float64Array(FOLD_BINS);
  const scale = FOLD_BINS / period;
  for (let i = Math.max(0, from); i < Math.min(env.length, to); i++) {
    const v = env[i];
    if (v === 0) continue;
    const pos = (i % period) * scale;
    const b = Math.floor(pos);
    const f = pos - b;
    hist[b % FOLD_BINS] += v * (1 - f);
    hist[(b + 1) % FOLD_BINS] += v * f;
  }
  // Light circular smoothing (1-2-1).
  const out = new Float64Array(FOLD_BINS);
  for (let b = 0; b < FOLD_BINS; b++) {
    out[b] =
      0.25 * hist[(b + FOLD_BINS - 1) % FOLD_BINS] +
      0.5 * hist[b] +
      0.25 * hist[(b + 1) % FOLD_BINS];
  }
  return out;
}

/** Peak of a circular histogram: {phase in bins (fractional), peak/mean}. */
function foldPeak(
  hist: Float64Array,
  near?: number,
  radius = FOLD_BINS
): { bin: number; ratio: number } {
  let best = -1;
  let mean = 0;
  for (let b = 0; b < FOLD_BINS; b++) {
    mean += hist[b];
    if (near !== undefined) {
      let d = Math.abs(b - near) % FOLD_BINS;
      d = Math.min(d, FOLD_BINS - d);
      if (d > radius) continue;
    }
    if (best < 0 || hist[b] > hist[best]) best = b;
  }
  mean /= FOLD_BINS;
  if (best < 0 || mean <= 0) return { bin: near ?? 0, ratio: 0 };
  const y0 = hist[(best + FOLD_BINS - 1) % FOLD_BINS];
  const y1 = hist[best];
  const y2 = hist[(best + 1) % FOLD_BINS];
  const den = y0 - 2 * y1 + y2;
  const off = den < 0 ? (0.5 * (y0 - y2)) / den : 0;
  return { bin: (best + off + FOLD_BINS) % FOLD_BINS, ratio: y1 / mean };
}

/** Best period (frames) around `period0` and its phase (frames). */
export function fitPeriod(
  env: Float32Array,
  period0: number,
  span = 0.02,
  steps = 200
): { period: number; phase: number; ratio: number } {
  let bestP = period0;
  let bestRatio = -1;
  let bestBin = 0;
  for (let s = 0; s <= steps; s++) {
    const p = period0 * (1 - span + (2 * span * s) / steps);
    const { bin, ratio } = foldPeak(fold(env, p));
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestP = p;
      bestBin = bin;
    }
  }
  return { period: bestP, phase: (bestBin / FOLD_BINS) * bestP, ratio: bestRatio };
}

/** Wraps a phase difference (frames) into (-p/2, p/2]. */
function wrap(d: number, p: number): number {
  let x = d % p;
  if (x > p / 2) x -= p;
  if (x <= -p / 2) x += p;
  return x;
}

interface Anchor {
  k: number; // beat index (centre of the block)
  delta: number; // phase offset (frames) vs the global grid, unwrapped
}

interface TrackedAnchors {
  anchors: Anchor[];
  /** Fraction of blocks with a clear local beat. */
  coverage: number;
}

/**
 * Tempo map by tracking: the local phase of each 16-beat block is searched
 * near the value predicted from the previous blocks (constant-velocity
 * model), starting from the clearest block and walking both ways. Deltas
 * are unwrapped, so gradual tempo drifts of several beats are followed.
 */
function trackAnchors(
  env: Float32Array,
  period: number,
  phase: number,
  block = 16
): TrackedAnchors {
  const nBeats = Math.floor((env.length - phase) / period);
  const nBlocks = Math.max(0, Math.floor(nBeats / block));
  if (nBlocks === 0) return { anchors: [], coverage: 0 };
  const hists: Float64Array[] = [];
  for (let i = 0; i < nBlocks; i++) {
    const k0 = i * block;
    const from = Math.floor(phase + (k0 - block / 4) * period);
    const to = Math.ceil(phase + (k0 + block * 1.25) * period);
    hists.push(fold(env, period, from, to));
  }
  const toBin = (delta: number) =>
    ((((phase + delta) / period) * FOLD_BINS) % FOLD_BINS + FOLD_BINS) % FOLD_BINS;
  // Seed: the clearest block near the global phase.
  let seed = 0;
  let seedRatio = -1;
  let seedDelta = 0;
  for (let i = 0; i < nBlocks; i++) {
    const { bin, ratio } = foldPeak(hists[i], toBin(0), FOLD_BINS * 0.3);
    if (ratio > seedRatio) {
      seedRatio = ratio;
      seed = i;
      seedDelta = wrap((bin / FOLD_BINS) * period - phase, period);
    }
  }
  const deltas: (number | null)[] = new Array(nBlocks).fill(null);
  deltas[seed] = seedRatio >= 1.35 ? seedDelta : null;
  if (deltas[seed] === null) return { anchors: [], coverage: 0 };
  let good = 1;
  const walk = (dir: 1 | -1) => {
    let last = seedDelta;
    let velocity = 0;
    for (let i = seed + dir; i >= 0 && i < nBlocks; i += dir) {
      const predicted = last + velocity;
      const { bin, ratio } = foldPeak(hists[i], toBin(predicted), FOLD_BINS * 0.2);
      if (ratio >= 1.35) {
        const measured = predicted + wrap((bin / FOLD_BINS) * period - (phase + predicted), period);
        velocity = 0.5 * velocity + 0.5 * (measured - last);
        last = measured;
        deltas[i] = measured;
        good++;
      } else {
        last = predicted;
      }
    }
  };
  walk(1);
  walk(-1);
  const anchors: Anchor[] = [];
  deltas.forEach((d, i) => {
    if (d !== null) anchors.push({ k: i * block + block / 2, delta: d });
  });
  return { anchors, coverage: good / nBlocks };
}

function linearFit(xs: number[], ys: number[]): { slope: number; icpt: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, icpt: ys[0] ?? 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  return { slope, icpt: my - slope * mx };
}

/** Mean of `values[k]` for indices k ≡ d (mod m), k ≥ minK. */
function residueMean(values: number[], d: number, m: number, minK = 0): number {
  let s = 0;
  let c = 0;
  for (let k = d; k < values.length; k += m) {
    if (k < minK) continue;
    s += values[k];
    c++;
  }
  return c > 0 ? s / c : 0;
}

function zscore(values: number[]): number[] {
  const n = values.length || 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return values.map((v) => (v - mean) / sd);
}

function bandVector(feat: FrameFeatures, from: number, to: number): Float64Array {
  const v = new Float64Array(BANDS);
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(feat.frames, Math.max(a + 1, Math.floor(to)));
  for (let f = a; f < b; f++) {
    for (let j = 0; j < BANDS; j++) v[j] += feat.bands[f * BANDS + j];
  }
  for (let j = 0; j < BANDS; j++) v[j] /= Math.max(1, b - a);
  return v;
}

function dist(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j] - b[j]) ** 2;
  return Math.sqrt(s);
}

export function detectBeatGrid(feat: FrameFeatures, duration: number): BeatGrid | null {
  const env = onsetEnvelope(feat);
  if (env.length < feat.fps * 8) return null;
  const bpm0 = estimateTempo(env, feat.fps);
  if (!Number.isFinite(bpm0)) return null;
  let fit = fitPeriod(env, (60 * feat.fps) / bpm0);
  // Octave check: kicks (bass attacks) on every half period mean the beat
  // is twice as fast (four-on-the-floor at 150 read as 75, etc.).
  if ((120 * feat.fps) / fit.period <= MAX_BPM - 10) {
    const low = normalizeOnset(feat.onsetLow, Math.round(feat.fps * 0.4));
    const hist = fold(low, fit.period);
    const main = foldPeak(hist, (fit.phase / fit.period) * FOLD_BINS, 3);
    const halfBin = ((fit.phase / fit.period) * FOLD_BINS + FOLD_BINS / 2) % FOLD_BINS;
    const half = foldPeak(hist, halfBin, 3);
    const at = (b: number) => hist[Math.round(b) % FOLD_BINS];
    if (at(main.bin) > 0 && at(half.bin) / at(main.bin) >= 0.55) {
      fit = fitPeriod(env, fit.period / 2, 0.004, 40);
    }
  }
  let period = fit.period;
  let phase = fit.phase;

  // Tempo map: track block phases, correct the period by regression and
  // keep the residual (drift) as an interpolated per-beat offset.
  let tracked = trackAnchors(env, period, phase);
  if (tracked.anchors.length >= 3) {
    const { slope, icpt } = linearFit(
      tracked.anchors.map((a) => a.k),
      tracked.anchors.map((a) => a.delta)
    );
    if (Math.abs(slope) < period * 0.05) {
      period += slope;
      phase += icpt;
      tracked = trackAnchors(env, period, phase);
    }
  }
  const anchors = tracked.anchors;
  // Smoothness: second differences of the tempo map (beats). A steady or
  // gradually drifting tempo is smooth; a loose live groove is not.
  let maxCurve = 0;
  for (let i = 2; i < anchors.length; i++) {
    const d1 = (anchors[i].delta - anchors[i - 1].delta) / period;
    const d0 = (anchors[i - 1].delta - anchors[i - 2].delta) / period;
    maxCurve = Math.max(maxCurve, Math.abs(d1 - d0));
  }
  const confidence = Math.max(0, Math.min(1, (fit.ratio - 1.2) / 1.8));
  const reliable = confidence > 0.25 && tracked.coverage >= 0.6 && maxCurve < 0.12;

  const deltaAt = (k: number): number => {
    if (anchors.length === 0) return 0;
    if (k <= anchors[0].k) return anchors[0].delta;
    const last = anchors[anchors.length - 1];
    if (k >= last.k) return last.delta;
    let i = 0;
    while (anchors[i + 1].k < k) i++;
    const a = anchors[i];
    const b = anchors[i + 1];
    return a.delta + ((b.delta - a.delta) * (k - a.k)) / (b.k - a.k);
  };

  const beats: number[] = [];
  const kStart = -Math.floor(phase / period);
  for (let k = kStart; ; k++) {
    const frame = phase + k * period + deltaAt(k);
    const t = frameTime(frame, feat);
    if (t > duration) break;
    if (t >= 0) beats.push(Math.round(t * 10000) / 10000);
  }
  if (beats.length < 16) return null;

  // ---- Downbeat -------------------------------------------------------------
  const toFrame = (t: number) => (t - feat.winSec * 0.75) * feat.fps;
  const lowAt: number[] = [];
  const highAt: number[] = [];
  const nov: number[] = [];
  let prevVec: Float64Array | null = null;
  for (let k = 0; k < beats.length; k++) {
    const f = Math.round(toFrame(beats[k]));
    let lo = 0;
    let all = 0;
    for (let j = f - 2; j <= f + 2; j++) {
      if (j < 0 || j >= feat.frames) continue;
      lo = Math.max(lo, feat.onsetLow[j]);
      all = Math.max(all, feat.onset[j]);
    }
    lowAt.push(lo);
    highAt.push(Math.max(0, all - lo));
    const next = k + 1 < beats.length ? beats[k + 1] : beats[k] + period / feat.fps;
    const vec = bandVector(feat, toFrame(beats[k]) + 2, toFrame(next) - 1);
    nov.push(prevVec ? dist(vec, prevVec) : 0);
    prevVec = vec;
  }
  const zl = zscore(lowAt);
  const zh = zscore(highAt);
  const zn = zscore(nov);
  const beatScore = zl.map((v, k) => v - 0.5 * zh[k] + zn[k]);
  let downbeat = 0;
  let bestDb = -Infinity;
  for (let d = 0; d < 4; d++) {
    const s = residueMean(beatScore, d, 4, 1);
    if (s > bestDb) {
      bestDb = s;
      downbeat = d;
    }
  }

  // ---- Phrases (8 bars) -----------------------------------------------------
  const barNov: number[] = [];
  let prevBar: Float64Array | null = null;
  for (let k = downbeat; k + 4 < beats.length; k += 4) {
    const vec = bandVector(feat, toFrame(beats[k]) + 2, toFrame(beats[k + 4]) - 1);
    barNov.push(prevBar ? dist(vec, prevBar) : 0);
    prevBar = vec;
  }
  // Structural changes (layers in/out) are the strongest bar novelties;
  // in-phrase chord changes are ignored by only counting the excess over
  // the 80th percentile.
  let phraseBar = 0;
  if (barNov.length >= 16) {
    const sorted = [...barNov].sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    const strong = barNov.map((v) => Math.max(0, v - p80) ** 2);
    const scores = Array.from({ length: 8 }, (_, o) => residueMean(strong, o, 8, 1));
    let best = 0;
    for (let o = 1; o < 8; o++) if (scores[o] > scores[best] * 1.05) best = o;
    const total = scores.reduce((a, b) => a + b, 0);
    if (total > 0 && scores[best] / total > 0.3) phraseBar = best;
  }

  const bpm = (60 * feat.fps) / period;
  return {
    bpm: Math.round(bpm * 100) / 100,
    confidence,
    reliable,
    beats,
    downbeat,
    phraseBeat: downbeat + phraseBar * 4,
  };
}

/** Fractional beat position of time `t` in a beat list (extrapolated). */
export function beatPosition(beats: ArrayLike<number>, t: number): number {
  const n = beats.length;
  if (n === 0) return 0;
  if (n === 1) return t - beats[0];
  if (t <= beats[0]) return (t - beats[0]) / (beats[1] - beats[0]);
  if (t >= beats[n - 1]) return n - 1 + (t - beats[n - 1]) / (beats[n - 1] - beats[n - 2]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - beats[lo]) / (beats[hi] - beats[lo]);
}

/** Time of fractional beat position `pos` (inverse of beatPosition). */
export function beatTime(beats: ArrayLike<number>, pos: number): number {
  const n = beats.length;
  if (n === 0) return 0;
  if (n === 1) return beats[0] + pos;
  if (pos <= 0) return beats[0] + pos * (beats[1] - beats[0]);
  if (pos >= n - 1) return beats[n - 1] + (pos - (n - 1)) * (beats[n - 1] - beats[n - 2]);
  const i = Math.floor(pos);
  return beats[i] + (pos - i) * (beats[i + 1] - beats[i]);
}
