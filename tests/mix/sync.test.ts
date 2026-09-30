import { createSyncState, incomingTarget, syncStep, type SyncGrid } from "../../src/lib/mix/sync";
import { rng } from "./synth";
import type { TransitionPlan } from "../../src/lib/mix/types";

// Two ideal grids: A at 124 BPM, B at 126 BPM whose estimate is off by
// `bpmErr`. The incoming element starts `startLatency` late, seeks take
// 40 ms, currentTime readings jitter ±3 ms, and the control loop runs at
// 50 ms (setInterval) with ±15 ms timer jitter.
function run(noiseMs: number, startLatency: number, seed: number) {
  const r = rng(seed);
  const pa = 60 / 124, pbTrue = 60 / 126;
  const gauss = () => (r() + r() + r() - 1.5) * 2 * noiseMs / 1000;
  const aBeats = Array.from({ length: 400 }, (_, k) => 0.2 + k * pa + gauss());
  const bBeats = Array.from({ length: 400 }, (_, k) => 0.4 + k * pbTrue + gauss());
  const plan: TransitionPlan = {
    style: "blend", sync: true, outStart: aBeats[200], inStart: bBeats[8], dur: 64 * pa, swapAt: 32 * pa,
    adoptAt: 32 * pa, beatSec: pa, bRate: pbTrue / pa, beatMul: 1, bars: 16, harmonic: "same", aBeat0: 200, bBeat0: 8,
  };
  const g: SyncGrid = { plan, aBeats, bBeats };
  const st = createSyncState();
  // Real B beat k is at 0.4 + k*pbTrue: true B time for "estimated" time tb
  const trueBeatPos = (tb: number) => (tb - 0.4) / pbTrue;
  const preroll = 3;
  let t = plan.outStart - preroll; // A time (rate 1)
  let bPos = incomingTarget(g, t);
  let bRate = plan.bRate;
  let bStartAt = t + startLatency; // B not moving until then
  const dt = 0.001;
  let nextTick = t + 0.05;
  const errs: { t: number; ms: number }[] = [];
  let lockedAt = NaN;
  while (t < plan.outStart + plan.dur) {
    t += dt;
    if (t >= bStartAt) bPos += dt * bRate;
    if (t >= nextTick) {
      nextTick = t + 0.05 + (r() - 0.5) * 0.03;
      const jitter = () => (r() - 0.5) * 0.006;
      const canSeek = t < plan.outStart - 0.3;
      const out = syncStep(g, st, t + jitter(), bPos + jitter(), canSeek, 0.04);
      if (out.seek !== undefined) { bPos = out.seek; bStartAt = t + 0.04; }
      bRate = out.rate;
    }
    // real phase error in A beats (ms): A beat pos vs B true beat pos
    const aBeat = (t - 0.2) / pa - 200;
    const bBeat = trueBeatPos(bPos) - 8;
    const ms = (aBeat - bBeat) * pa * 1000;
    if (t >= plan.outStart) errs.push({ t: t - plan.outStart, ms });
    if (t > bStartAt && Math.abs(ms) >= 5) lockedAt = NaN;
    else if (t > bStartAt && isNaN(lockedAt)) lockedAt = t - (plan.outStart - preroll);
  }
  const abs = errs.map((e) => Math.abs(e.ms)).sort((a, b) => a - b);
  return { lockedAt, median: abs[abs.length >> 1], p99: abs[Math.floor(abs.length * 0.99)], max: abs[abs.length - 1], atT0: Math.abs(errs[0].ms) };
}
const rows = [];
for (const [noise, lat] of [[0, 0.12], [1, 0.12], [2, 0.25], [2, 0.05], [5, 0.3]] as const) {
  const res = run(noise, lat, 7);
  rows.push({ "grid noise σ": `${noise} ms`, "start latency": `${lat * 1000} ms`, "lock (<5ms) after": `${res.lockedAt.toFixed(2)} s`, "error at t0": `${res.atT0.toFixed(1)} ms`, "median": `${res.median.toFixed(1)} ms`, "p99": `${res.p99.toFixed(1)} ms`, "max": `${res.max.toFixed(1)} ms` });
}
console.table(rows);
