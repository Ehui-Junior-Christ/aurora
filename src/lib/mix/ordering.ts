import { harmonicCompat } from "./key";
import { MAX_TEMPO_SHIFT, tempoMatch } from "./planner";
import type { MixAnalysis } from "./types";

/**
 * "Mix harmonique" ordering (pure): scores how well b follows a (key on
 * the Camelot wheel, tempo reachable by sync, energy flow) and picks the
 * next track greedily with a one-step lookahead.
 */

type Lite = Pick<MixAnalysis, "key" | "keyConfidence" | "bpm" | "energy" | "gridReliable">;

export function transitionScore(a: Lite, b: Lite): number {
  const keysKnown = a.key >= 0 && b.key >= 0;
  const harm = keysKnown ? harmonicCompat(a.key, b.key).score : 0.5;
  const tm = tempoMatch(a.bpm, b.bpm, true);
  const tempo = a.bpm > 0 && b.bpm > 0 ? Math.max(0, 1 - tm.shift / (MAX_TEMPO_SHIFT * 1.5)) : 0.4;
  // Energy: small rises are best, big drops are worst.
  const dE = b.energy - a.energy;
  const energy = Math.max(0, 1 - Math.abs(dE - 0.04) * (dE < 0 ? 3 : 2));
  return 0.45 * harm + 0.35 * tempo + 0.2 * energy;
}

/**
 * Best next id among `candidates` after `current` (maximises the score of
 * the next transition plus 0.6 × the best transition after it).
 */
export function pickNext<T extends { id: string; analysis: Lite }>(
  current: Lite,
  candidates: T[]
): T | null {
  if (candidates.length === 0) return null;
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const first = transitionScore(current, c.analysis);
    let ahead = 0;
    for (const d of candidates) {
      if (d === c) continue;
      ahead = Math.max(ahead, transitionScore(c.analysis, d.analysis));
    }
    const score = first + 0.6 * ahead;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Greedy full ordering (used by tests and for whole-list reorders). */
export function orderSequence<T extends { id: string; analysis: Lite }>(
  start: Lite,
  items: T[]
): T[] {
  const pool = [...items];
  const out: T[] = [];
  let cur = start;
  while (pool.length > 0) {
    const next = pickNext(cur, pool)!;
    out.push(next);
    pool.splice(pool.indexOf(next), 1);
    cur = next.analysis;
  }
  return out;
}
