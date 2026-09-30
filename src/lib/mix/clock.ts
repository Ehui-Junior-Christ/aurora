import { engine } from "../audio-engine";
import { analysisFor } from "./director";
import { localPeriod } from "./planner";
import { beatPosition } from "./tempo";

/**
 * Visual sync API (read per animation frame, no React re-render):
 *
 *   import { getBeatClock, getMixProgress } from "@/lib/mix/clock";
 *   const clock = getBeatClock(trackId);   // null: no grid (online / not analysed)
 *   clock.phase      // 0..1 within the current beat (0 = on the beat)
 *   clock.barPhase   // 0..1 within the bar (0 = downbeat)
 *   clock.phrasePhase// 0..1 within the 8-bar phrase
 *   clock.beat / bar // integer counters, clock.bpm effective tempo
 *
 * Transition state for UI lives in the store: `usePlayer(s => s.mixTransition)`
 * ({ style, progress, toTitle, sync, bars, harmonic } | null, ~10 Hz);
 * getMixProgress() gives the exact progress (0..1) at frame rate.
 */

export interface BeatClock {
  /** Effective tempo (native × playback rate). */
  bpm: number;
  /** Beat counter since the first beat of the track. */
  beat: number;
  /** 0..1 position inside the current beat. */
  phase: number;
  /** Bar counter since the first downbeat. */
  bar: number;
  /** 0..1 position inside the bar. */
  barPhase: number;
  /** 0..1 position inside the 8-bar phrase. */
  phrasePhase: number;
  /** 0..1 reliability of the grid. */
  confidence: number;
}

export function getBeatClock(trackId: string | undefined): BeatClock | null {
  if (engine.ytActive) return null;
  const m = analysisFor(trackId)?.mix;
  if (!m || m.beats.length < 8) return null;
  const pos = beatPosition(m.beats, engine.currentTime);
  if (!Number.isFinite(pos)) return null;
  const beat = Math.floor(pos);
  const k = Math.max(0, Math.min(m.beats.length - 1, beat));
  const barPos = (pos - m.downbeat) / 4;
  const phrasePos = (pos - m.phraseBeat) / 32;
  const frac = (x: number) => x - Math.floor(x);
  return {
    bpm: (60 / localPeriod(m.beats, k)) * engine.rate,
    beat,
    phase: frac(pos),
    bar: Math.floor(barPos),
    barPhase: frac(barPos),
    phrasePhase: frac(phrasePos),
    confidence: m.gridReliable ? m.bpmConfidence : m.bpmConfidence * 0.5,
  };
}

/** Exact progress (0..1) of the running transition, null when none. */
export function getMixProgress(): number | null {
  return engine.mixState()?.progress ?? null;
}
