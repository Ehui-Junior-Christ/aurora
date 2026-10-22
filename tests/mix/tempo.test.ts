import { analyzeMix } from "../../src/lib/mix/analyze";
import { beatPosition } from "../../src/lib/mix/tempo";
import { drumTrack, SR } from "./synth";

interface Row { name: string; bpmErr: number; phaseMs: number; downbeatOk: boolean; bpm: number; conf: number; reliable: boolean; ms: number }
const rows: Row[] = [];
const cases = [
  { bpm: 90, offset: 0.37, downbeat: 0 },
  { bpm: 100.5, offset: 1.11, downbeat: 1 },
  { bpm: 118, offset: 0.05, downbeat: 2 },
  { bpm: 120, offset: 0.5, downbeat: 0 },
  { bpm: 124, offset: 0.23, downbeat: 3 },
  { bpm: 128, offset: 0.8, downbeat: 1 },
  { bpm: 135.7, offset: 0.61, downbeat: 0 },
  { bpm: 140, offset: 0.19, downbeat: 2 },
  { bpm: 150, offset: 0.9, downbeat: 0 },
  { bpm: 174, offset: 0.33, downbeat: 1 },
  { bpm: 87, offset: 0.7, downbeat: 3 },
  { bpm: 76, offset: 0.2, downbeat: 0 },
];
for (const [i, c] of cases.entries()) {
  const { data, beats } = drumTrack({ bpm: c.bpm, offset: c.offset, bars: 64, seed: i + 3, downbeat: c.downbeat });
  const t0 = performance.now();
  const a = analyzeMix(data, SR);
  const ms = performance.now() - t0;
  // BPM error allowing octave (x2 / /2) mistakes to be reported separately
  const bpmErr = (a.bpm - c.bpm) / c.bpm;
  // phase: median distance from detected beats to nearest true beat
  const errs: number[] = [];
  for (const t of a.beats) {
    if (t < beats[0] || t > beats[beats.length - 1]) continue;
    const pos = beatPosition(beats, t);
    const frac = pos - Math.round(pos);
    errs.push(frac * (60 / c.bpm) * 1000);
  }
  errs.sort((x, y) => x - y);
  const phaseMs = errs[Math.floor(errs.length / 2)] ?? NaN;
  // downbeat: true downbeats are beats[c.downbeat + 4k]; detected first downbeat time
  const dbTime = a.beats[a.downbeat];
  const truePos = beatPosition(beats, dbTime);
  const downbeatOk = Math.abs(truePos - Math.round(truePos)) < 0.25 && ((Math.round(truePos) - c.downbeat) % 4 + 4) % 4 === 0;
  rows.push({ name: `${c.bpm} BPM`, bpm: a.bpm, bpmErr, phaseMs, downbeatOk, conf: a.bpmConfidence, reliable: a.gridReliable, ms: Math.round(ms) });
}
console.table(rows.map((r) => ({ ...r, bpmErr: (r.bpmErr * 100).toFixed(3) + "%", phaseMs: r.phaseMs.toFixed(1) })));
const ok = rows.filter((r) => Math.abs(r.bpmErr) < 0.002).length;
const phaseOk = rows.filter((r) => Math.abs(r.phaseMs) < 10).length;
const dOk = rows.filter((r) => r.downbeatOk).length;
console.log(`BPM exact (<0.2%): ${ok}/${rows.length} · phase <10 ms: ${phaseOk}/${rows.length} · downbeat: ${dOk}/${rows.length}`);

// Tempo drift (live band): +1.5 % per minute. The tempo map must follow it
// (phase error small) or flag the grid as unreliable (no beat sync then).
for (const drift of [0.004, 0.015, 0.04]) {
  const { data, beats } = drumTrack({ bpm: 120, offset: 0.3, bars: 80, seed: 9, drift });
  const a = analyzeMix(data, SR);
  const errs: number[] = [];
  for (const t of a.beats) {
    if (t < beats[0] || t > beats[beats.length - 1]) continue;
    const pos = beatPosition(beats, t);
    errs.push(Math.abs(pos - Math.round(pos)) * 500);
  }
  errs.sort((x, y) => x - y);
  console.log(`drift ${(drift * 100).toFixed(1)}%/min → bpm ${a.bpm}, reliable ${a.gridReliable}, median |phase| ${errs[errs.length >> 1]?.toFixed(1)} ms, p95 ${errs[Math.floor(errs.length * 0.95)]?.toFixed(1)} ms`);
}
