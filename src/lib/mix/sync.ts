import { beatPosition, beatTime } from "./tempo";
import type { TransitionPlan } from "./types";

/**
 * Beat phase lock (pure). HTMLMediaElement.play() does not start at an
 * exact AudioContext time, so the incoming track is pre-rolled muted and
 * steered like a DJ nudging a platter: its playbackRate is bent (±4 %) in
 * proportion to the phase error measured between the two media clocks,
 * and it is re-seeked when the error is large while still inaudible.
 */

export interface SyncGrid {
  plan: TransitionPlan;
  aBeats: number[];
  bBeats: number[];
}

export interface SyncState {
  ema: number;
  primed: boolean;
}

export interface SyncOutput {
  /** Incoming playbackRate multiplier (relative to the user speed). */
  rate: number;
  /** Seek target (incoming track seconds) when a hard resync is needed. */
  seek?: number;
  /** Smoothed error in incoming seconds (positive: incoming is late). */
  error: number;
}

const MAX_BEND = 0.04;
const CONVERGE_S = 0.8;
const RESYNC_S = 0.07;
const DEADBAND_S = 0.0015;

/** Where the incoming track should be when the outgoing one is at `aPos`. */
export function incomingTarget(g: SyncGrid, aPos: number): number {
  const p = g.plan;
  if (p.sync && g.aBeats.length > 1 && g.bBeats.length > 1) {
    const da = beatPosition(g.aBeats, aPos) - p.aBeat0;
    return beatTime(g.bBeats, p.bBeat0 + da / p.beatMul);
  }
  return p.inStart + (aPos - p.outStart) * p.bRate;
}

export function createSyncState(): SyncState {
  return { ema: 0, primed: false };
}

/**
 * One control step. `canSeek`: the incoming track is still inaudible.
 * `seekLatency`: measured delay of a seek (added to the target).
 */
export function syncStep(
  g: SyncGrid,
  state: SyncState,
  aPos: number,
  bPos: number,
  canSeek: boolean,
  seekLatency = 0.03
): SyncOutput {
  const base = g.plan.bRate;
  const target = incomingTarget(g, aPos);
  const err = target - bPos;
  if (canSeek && Math.abs(err) > RESYNC_S) {
    state.primed = false;
    state.ema = 0;
    return { rate: base, seek: target + seekLatency * base, error: err };
  }
  state.ema = state.primed ? 0.6 * state.ema + 0.4 * err : err;
  state.primed = true;
  const e = state.ema;
  if (Math.abs(e) < DEADBAND_S) return { rate: base, error: e };
  const bend = Math.max(-MAX_BEND, Math.min(MAX_BEND, e / (CONVERGE_S * base)));
  return { rate: base * (1 + bend), error: e };
}
