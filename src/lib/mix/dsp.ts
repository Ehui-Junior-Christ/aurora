/**
 * Low-level DSP for the mix analysis: FFT, decimation and frame features.
 * Pure and allocation-conscious (runs in a worker on whole tracks).
 */

/** Radix-2 FFT with precomputed twiddles / bit reversal for one size. */
export class FFT {
  readonly n: number;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly rev: Uint32Array;

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error("fft-size");
    this.n = n;
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  /** In-place complex transform. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** RBJ low-pass biquad applied in place (Direct Form I). */
function lowpassInPlace(x: Float32Array, sr: number, cutoff: number): void {
  const w0 = (2 * Math.PI * cutoff) / sr;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cw = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0;
  const b1 = (1 - cw) / a0;
  const b2 = b0;
  const a1 = (-2 * cw) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
}

/**
 * Anti-aliased integer decimation to ~`target` Hz (4th-order Butterworth
 * low-pass at 0.42 × the new Nyquist… ×2). Returns the input when already
 * at or below the target.
 */
export function decimate(
  mono: Float32Array,
  sr: number,
  target = 11025
): { data: Float32Array; sr: number } {
  const factor = Math.max(1, Math.round(sr / target));
  if (factor === 1) return { data: mono, sr };
  const newSr = sr / factor;
  const tmp = new Float32Array(mono);
  const cutoff = newSr * 0.42;
  lowpassInPlace(tmp, sr, cutoff);
  lowpassInPlace(tmp, sr, cutoff);
  const out = new Float32Array(Math.floor(tmp.length / factor));
  for (let i = 0; i < out.length; i++) out[i] = tmp[i * factor];
  return { data: out, sr: newSr };
}

/** Number of log-spaced spectral bands kept per frame (for novelty). */
export const BANDS = 8;
const BAND_EDGES_HZ = [30, 80, 160, 320, 640, 1280, 2560, 4000, 5500];

export interface FrameFeatures {
  /** Frames per second. */
  fps: number;
  /** Analysis window length in seconds. */
  winSec: number;
  /** Log-spectral flux, all bins. */
  onset: Float32Array;
  /** Log-spectral flux below 160 Hz (kick / bass attacks). */
  onsetLow: Float32Array;
  /** Frame power (linear, mean square). */
  power: Float32Array;
  /** Frame power below 150 Hz. */
  powerLow: Float32Array;
  /** Log band energies, BANDS per frame. */
  bands: Float32Array;
  frames: number;
}

/** STFT features used for tempo, downbeats and structure. */
export function frameFeatures(x: Float32Array, sr: number): FrameFeatures {
  const n = sr > 16000 ? 1024 : 512;
  const hop = n / 4;
  const frames = Math.max(0, Math.floor((x.length - n) / hop) + 1);
  const fft = new FFT(n);
  const win = hann(n);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const half = n / 2;
  const prev = new Float32Array(half);
  const mags = new Float32Array(half);
  const cur = new Float32Array(half);
  const binHz = sr / n;
  const lowBin = Math.max(2, Math.round(160 / binHz));
  const powLowBin = Math.max(2, Math.round(150 / binHz));
  const bandBins: number[] = BAND_EDGES_HZ.map((f) =>
    Math.min(half, Math.max(1, Math.round(f / binHz)))
  );

  const onset = new Float32Array(frames);
  const onsetLow = new Float32Array(frames);
  const power = new Float32Array(frames);
  const powerLow = new Float32Array(frames);
  const bands = new Float32Array(frames * BANDS);
  // Amplitude of a full-scale sine ≈ n/4 in the Hann-windowed spectrum.
  const norm = 4 / n;

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const v = x[off + i];
      sq += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    power[f] = sq / n;
    fft.transform(re, im);
    let flux = 0;
    let fluxLow = 0;
    let pLow = 0;
    for (let k = 1; k < half; k++) {
      const m2 = (re[k] * re[k] + im[k] * im[k]) * norm * norm;
      mags[k] = m2;
      const lm = Math.log1p(1000 * Math.sqrt(m2));
      cur[k] = lm;
      const d = lm - prev[k];
      if (d > 0) {
        flux += d;
        if (k < lowBin) fluxLow += d;
      }
      if (k < powLowBin) pLow += m2;
    }
    for (let b = 0; b < BANDS; b++) {
      let e = 0;
      for (let k = bandBins[b]; k < bandBins[b + 1]; k++) e += mags[k];
      bands[f * BANDS + b] = Math.log10(e + 1e-9);
    }
    onset[f] = f === 0 ? 0 : flux;
    onsetLow[f] = f === 0 ? 0 : fluxLow;
    powerLow[f] = pLow / 2;
    prev.set(cur);
  }
  return {
    fps: sr / hop,
    winSec: n / sr,
    onset,
    onsetLow,
    power,
    powerLow,
    bands,
    frames,
  };
}

/**
 * Fraction of the window after which an attack produces its flux peak (the
 * Hann slope is steepest at 3/4 of the window). Calibrated on click tracks
 * in tests/mix (see ONSET_LAG_FRACTION there).
 */
export const ONSET_LAG_FRACTION = 0.66;

/** Time (s) of the onset reported by frame `f`. */
export function frameTime(f: number, feat: { fps: number; winSec: number }): number {
  return f / feat.fps + feat.winSec * ONSET_LAG_FRACTION;
}

/**
 * Removes the slow trend of an onset curve (moving average over `win`
 * frames), half-wave rectifies and scales to unit standard deviation.
 */
export function normalizeOnset(o: Float32Array, win: number): Float32Array {
  const n = o.length;
  const out = new Float32Array(n);
  const half = Math.max(1, Math.floor(win / 2));
  let sum = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n - 1, i + half);
    while (hi < b) sum += o[++hi];
    while (lo < a) sum -= o[lo++];
    const mean = sum / (hi - lo + 1);
    const v = o[i] - mean;
    out[i] = v > 0 ? v : 0;
  }
  let sq = 0;
  for (let i = 0; i < n; i++) sq += out[i] * out[i];
  const sd = Math.sqrt(sq / Math.max(1, n)) || 1;
  for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

/** Linear interpolation into a curve (0 outside). */
export function sampleAt(c: Float32Array, pos: number): number {
  if (pos < 0 || pos >= c.length - 1) return 0;
  const i = Math.floor(pos);
  const f = pos - i;
  return c[i] * (1 - f) + c[i + 1] * f;
}

/** Percentile (0..1) of a numeric array (copy-sorted). */
export function percentile(values: ArrayLike<number>, p: number): number {
  const arr = Array.from(values).filter((v) => Number.isFinite(v));
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))));
  return arr[idx];
}
