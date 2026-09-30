import { harmonicCompat } from "./key";
import type {
  HarmonicRelation,
  MixAnalysis,
  MixSettings,
  MixStyle,
  TransitionPlan,
} from "./types";

/**
 * Transition planner (pure). Picks the style, the mix-out point on a phrase
 * boundary of the outgoing track, the mix-in point on a downbeat of the
 * incoming one, the length in bars and the tempo ratio.
 *
 * Principle (what a DJ does): the incoming intro plays over the outgoing
 * outro, and the incoming body ("drop") lands exactly when the outgoing
 * track is gone — both on phrase boundaries.
 */

/** Max tempo difference for beat sync (playbackRate, pitch preserved). */
export const MAX_TEMPO_SHIFT = 0.06;
/** Seconds of the incoming track pre-rolled (muted) before t0 for phase lock. */
export const SYNC_PREROLL = 3;

export interface PlanRequest {
  a: MixAnalysis;
  b: MixAnalysis;
  /** Earliest acceptable t0 in the outgoing track (current time + margin). */
  minStart: number;
  settings: MixSettings;
}

interface TempoMatch {
  ok: boolean;
  /** B track seconds per A track second. */
  bRate: number;
  /** A beats per B beat. */
  beatMul: number;
  shift: number;
}

/** Local beat period (s) around beat index `k`. */
export function localPeriod(beats: number[], k: number, span = 16): number {
  const n = beats.length;
  if (n < 2) return 0.5;
  const a = Math.max(0, Math.min(n - 2, k - span / 2));
  const b = Math.min(n - 1, a + span);
  return (beats[b] - beats[a]) / Math.max(1, b - a);
}

/** Index of the first beat at or after `t`. */
export function beatIndexAtOrAfter(beats: number[], t: number): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < t - 1e-4) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function tempoMatch(
  bpmA: number,
  bpmB: number,
  allow: boolean
): TempoMatch {
  if (!(bpmA > 0) || !(bpmB > 0)) return { ok: false, bRate: 1, beatMul: 1, shift: 1 };
  let best: TempoMatch = { ok: false, bRate: 1, beatMul: 1, shift: Infinity };
  for (const mul of [1, 2, 0.5]) {
    const effB = bpmB * mul; // B tempo expressed in A beats
    const bRate = bpmA / effB;
    const shift = Math.abs(bRate - 1);
    if (shift < best.shift) best = { ok: false, bRate, beatMul: mul, shift };
  }
  best.ok = allow && best.shift <= MAX_TEMPO_SHIFT;
  if (!best.ok) best.bRate = 1;
  return best;
}

function barsFor(style: MixStyle, a: MixAnalysis, b: MixAnalysis, s: MixSettings, harm: number): number {
  const barSecA = localPeriod(a.beats, a.beats.length - 1) * 4;
  const introBars = Math.max(0, (b.introEnd - b.audibleStart) / Math.max(0.1, barSecA));
  const outroBars = Math.max(0, (a.fadeEnd - a.outroStart) / Math.max(0.1, barSecA));
  let bars: number;
  switch (style) {
    case "blend": {
      bars = 16;
      const room = Math.min(introBars, outroBars);
      if (room >= 30 && a.energy < 0.75 && harm >= 0.85) bars = 32;
      else if (room < 14) bars = 8;
      break;
    }
    case "filter":
      bars = harm < 0.5 ? 4 : 8;
      break;
    case "echo":
      bars = 2;
      break;
    case "cut":
      bars = 2;
      break;
    default:
      bars = 0;
  }
  if (bars > 0) {
    if (s.length === "short") bars = Math.max(style === "blend" ? 4 : 1, bars / 2);
    if (s.length === "long") bars = Math.min(32, bars * 2);
  }
  return bars;
}

/** Automatic style choice (DJ heuristics). */
export function chooseStyle(
  a: MixAnalysis,
  b: MixAnalysis,
  sync: boolean,
  harm: number,
  settings: MixSettings
): MixStyle {
  const override = settings.style;
  if (override !== "auto") {
    if (override === "blend" && !sync) return "filter";
    return override;
  }
  const bothHigh = a.energy >= 0.65 && b.energy >= 0.65;
  const barSec = (60 / Math.max(60, b.bpm || 120)) * 4;
  const shortIntro = b.introEnd - b.audibleStart < 4 * barSec;
  if (!sync) {
    // Tempos too far apart: an echo-out hides the clash on rhythmic music,
    // a smooth equal-power fade for everything else.
    return a.gridReliable && a.energy >= 0.55 ? "echo" : "fade";
  }
  if (settings.harmonic && harm < 0.5) return bothHigh ? "cut" : "filter";
  if (harm < 0.3) return "filter";
  if (bothHigh && shortIntro) return "cut";
  if (harm >= 0.75) return "blend";
  return "filter";
}

function phraseCandidates(a: MixAnalysis, stepBars: number): number[] {
  const out: number[] = [];
  const step = stepBars * 4;
  const first = a.phraseBeat % step;
  const start = first < a.downbeat ? first + step : first;
  for (let k = start; k < a.beats.length; k += step) out.push(k);
  return out;
}

/**
 * Plans a transition from `a` to `b`. Returns null when no reasonable
 * transition fits (caller falls back to a time-based fade).
 */
export function planTransition(req: PlanRequest): TransitionPlan | null {
  const { a, b, settings } = req;
  const { score: harm, relation } = harmonicCompat(a.key, b.key);
  const gridOk = a.gridReliable && b.gridReliable && a.beats.length > 32 && b.beats.length > 32;
  const tm = tempoMatch(a.bpm, b.bpm, settings.tempoSync && gridOk);
  const sync = tm.ok;
  const style = chooseStyle(a, b, sync, harm, settings);
  if (style === "fade" || a.beats.length < 32) {
    return planFade(req, relation, gridOk ? a : null);
  }

  let bars = barsFor(style, a, b, settings, harm);
  const minT = Math.max(req.minStart, a.duration * 0.35);
  const endLimit = Math.min(a.fadeEnd + 2, a.audibleEnd);

  while (bars >= 1) {
    const beatsLen = bars * 4;
    const cands = [
      ...phraseCandidates(a, 8),
      ...phraseCandidates(a, 4),
      ...(bars <= 2 ? phraseCandidates(a, 1) : []),
    ];
    let best: { k: number; cost: number } | null = null;
    for (const k of cands) {
      // echo / cut: the "event" (cut) is on the boundary, the build before it.
      const lead = style === "echo" ? 4 : style === "cut" ? 8 : 0;
      const k0 = k - lead;
      if (k0 < 0 || k + beatsLen - lead >= a.beats.length) continue;
      const t0 = a.beats[k0];
      const tEnd = style === "echo" || style === "cut" ? a.beats[k] + 2 : a.beats[k0 + beatsLen];
      if (t0 < minT || tEnd > endLimit) continue;
      const phraseBonus = (k - a.phraseBeat) % 32 === 0 ? 0 : 2;
      // Target: blend/filter start at the outro, echo/cut hit the outro start.
      const target = style === "echo" || style === "cut" ? a.outroStart : a.outroStart;
      const at = style === "echo" || style === "cut" ? a.beats[k] : t0;
      const cost = Math.abs(at - target) / (localPeriod(a.beats, k) * 4) + phraseBonus;
      if (!best || cost < best.cost) best = { k: k0, cost };
    }
    if (best) return build(req, style, bars, best.k, tm, relation);
    bars = bars > 4 ? bars / 2 : bars - 1;
  }
  return planFade(req, relation, gridOk ? a : null);
}

function build(
  req: PlanRequest,
  style: MixStyle,
  bars: number,
  k0: number,
  tm: TempoMatch,
  harmonic: HarmonicRelation
): TransitionPlan {
  const { a, b } = req;
  const beatSec = localPeriod(a.beats, k0);
  const nBeats = bars * 4;
  const outStart = a.beats[k0];
  const aEnd = a.beats[Math.min(a.beats.length - 1, k0 + nBeats)];
  const dur = aEnd - outStart;
  const sync = tm.ok;

  // Incoming mix-in point, in B beats.
  const bFirst = firstAudibleDownbeat(b);
  const bBar = 4; // beats per bar in B
  let bBeat0: number;
  if (style === "cut") {
    // Drop swap: B's body (intro end) lands on the cut, 8 A-beats after t0.
    const introK = beatIndexAtOrAfter(b.beats, b.introEnd);
    const preBeatsB = 8 / tm.beatMul;
    bBeat0 = introK - preBeatsB >= 0 && introK > bFirst ? introK - preBeatsB : bFirst;
  } else if (style === "echo") {
    // B starts from its beginning on the cut (4 A-beats after t0).
    const preBeatsB = 4 / tm.beatMul;
    bBeat0 = bFirst - preBeatsB;
  } else {
    // Blend / filter: B's intro end arrives when A is gone.
    const introK = beatIndexAtOrAfter(b.beats, b.introEnd);
    const lenB = nBeats / tm.beatMul;
    bBeat0 = introK - lenB;
    // Keep B phrase-aligned (bar lines) and never before its first downbeat.
    bBeat0 = bFirst + Math.max(0, Math.round((bBeat0 - bFirst) / bBar) * bBar);
  }
  let inStart: number;
  if (bBeat0 >= 0) inStart = b.beats[Math.min(b.beats.length - 1, Math.round(bBeat0))];
  else {
    // Before B's first beat (echo pre-roll): extrapolate with its period.
    const p = localPeriod(b.beats, 0);
    inStart = b.beats[0] + bBeat0 * p;
  }

  const beat = (n: number) => a.beats[Math.min(a.beats.length - 1, k0 + n)] - outStart;
  let swapAt: number;
  let adoptAt: number;
  let total = dur;
  switch (style) {
    case "blend":
    case "filter":
      swapAt = beat(Math.round(nBeats / 2 / 4) * 4);
      adoptAt = swapAt;
      break;
    case "echo":
      swapAt = beat(4);
      adoptAt = swapAt;
      total = swapAt + beatSec * 8; // echo tail
      break;
    case "cut":
    default:
      swapAt = beat(8);
      adoptAt = swapAt;
      total = swapAt + beatSec * 4;
      break;
  }
  return {
    style,
    sync,
    outStart,
    inStart,
    dur: total,
    swapAt,
    adoptAt,
    beatSec,
    bRate: sync ? tm.bRate : 1,
    beatMul: tm.beatMul,
    bars,
    harmonic,
    aBeat0: k0,
    bBeat0,
  };
}

function firstAudibleDownbeat(m: MixAnalysis): number {
  let k = m.downbeat;
  while (k + 4 < m.beats.length && m.beats[k] < m.audibleStart - 0.05) k += 4;
  return k;
}

/** Fade seconds per length setting. */
export function fadeSeconds(length: MixSettings["length"]): number {
  return length === "short" ? 4 : length === "long" ? 12 : 8;
}

/**
 * Time-based equal-power fade (incompatible tracks or no grid). When the
 * outgoing grid is known the fade starts on a phrase / bar boundary.
 */
export function planFade(
  req: PlanRequest,
  harmonic: HarmonicRelation,
  grid: MixAnalysis | null
): TransitionPlan | null {
  const { a, b } = req;
  const D = Math.min(fadeSeconds(req.settings.length), Math.max(2, a.duration / 4));
  const endLimit = Math.min(a.fadeEnd + 1.5, a.audibleEnd);
  let outStart = endLimit - D;
  if (grid && grid.beats.length > 8) {
    // Latest bar boundary (phrase first) keeping the fade inside the track.
    const cands = [...phraseCandidates(grid, 8), ...phraseCandidates(grid, 1)]
      .map((k) => grid.beats[k])
      .filter((t) => t + D <= endLimit && t >= req.minStart);
    const phrase = phraseCandidates(grid, 8)
      .map((k) => grid.beats[k])
      .filter((t) => t + D <= endLimit && t >= req.minStart && endLimit - t - D < 20);
    if (phrase.length) outStart = Math.max(...phrase);
    else if (cands.length) outStart = Math.max(...cands);
  }
  if (outStart < req.minStart) {
    outStart = req.minStart;
    if (outStart + 2 > a.duration) return null;
  }
  const dur = Math.min(D, Math.max(2, a.duration - outStart));
  return {
    style: "fade",
    sync: false,
    outStart,
    inStart: Math.max(0, b.audibleStart - 0.02),
    dur,
    swapAt: dur / 2,
    adoptAt: dur / 2,
    beatSec: grid ? localPeriod(grid.beats, grid.beats.length - 1) : 0.5,
    bRate: 1,
    beatMul: 1,
    bars: 0,
    harmonic,
    aBeat0: 0,
    bBeat0: 0,
  };
}
