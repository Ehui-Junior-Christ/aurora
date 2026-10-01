import { analyzeMix } from "../../src/lib/mix/analyze";
import { planTransition } from "../../src/lib/mix/planner";
import { DEFAULT_MIX_SETTINGS } from "../../src/lib/mix/types";
import { drumTrack, SR } from "./synth";
const mk = (bpm: number, root: number, db: number) => analyzeMix(drumTrack({ bpm, offset: 0.3, bars: 16, downbeat: db, seed: root, chord: (bar) => [[0, 5, 7, 0][bar % 4] + root].flatMap((r) => [r, r + 3, r + 7]), layers: (bar) => { const b = bar >= 4 && bar < 12; return { kick: true, hat: true, snare: b, bass: b, pad: b }; } }).data, SR);
const a = mk(124, 9, 0), b = mk(125, 4, 0);
console.log("A dur", a.duration.toFixed(1), "intro", a.introEnd.toFixed(2), "outro", a.outroStart.toFixed(2), "fadeEnd", a.fadeEnd.toFixed(2), "phraseBeat", a.phraseBeat, "reliable", a.gridReliable, "energy", a.energy);
for (const length of ["short", "auto", "long"] as const) {
  const p = planTransition({ a, b, minStart: 4, settings: { ...DEFAULT_MIX_SETTINGS, enabled: true, length } });
  console.log(length, p && { style: p.style, bars: p.bars, out: p.outStart.toFixed(2), dur: p.dur.toFixed(2), in: p.inStart.toFixed(2) });
}
const p = planTransition({ a, b, minStart: 4, settings: { ...DEFAULT_MIX_SETTINGS, enabled: true } });
const ok = !!p && Math.abs(p.outStart - a.outroStart) < 0.01;
console.log(`${ok ? "PASS" : "FAIL"} short 4-bar outro: mix starts exactly at the outro`);
