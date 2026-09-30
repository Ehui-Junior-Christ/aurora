import { analyzeMix } from "../../src/lib/mix/analyze";
import { planTransition } from "../../src/lib/mix/planner";
import { buildAutomation, valueAt, BASS_KILL_DB } from "../../src/lib/mix/automation";
import { orderSequence, transitionScore } from "../../src/lib/mix/ordering";
import { DEFAULT_MIX_SETTINGS, type MixAnalysis, type MixStyle } from "../../src/lib/mix/types";
import { drumTrack, SR } from "./synth";

function track(bpm: number, intro: number, body: number, outro: number, chordRoot: number, minor: boolean, db = 0, seed = 1): MixAnalysis {
  const third = minor ? 3 : 4;
  const { data } = drumTrack({
    bpm, offset: 0.35, bars: intro + body + outro, downbeat: db, seed,
    chord: (bar) => [[0, 5, 7, 0][bar % 4] + chordRoot].flatMap((r) => [r, r + third, r + 7]),
    layers: (bar) => {
      const b = bar >= intro && bar < intro + body;
      return { kick: true, hat: true, snare: b, bass: b, pad: b };
    },
  });
  return analyzeMix(data, SR);
}

const A = track(124, 16, 48, 16, 9, true, 0, 1); // A minor-ish
const B = track(126, 16, 48, 16, 4, true, 2, 2); // E minor-ish (neighbour)
const C = track(96, 8, 40, 8, 1, false, 1, 3); // tempo too far
console.log("A", A.bpm, A.camelot, "intro", A.introEnd.toFixed(2), "outro", A.outroStart.toFixed(2), "fadeEnd", A.fadeEnd.toFixed(2), "energy", A.energy);
console.log("B", B.bpm, B.camelot, "intro", B.introEnd.toFixed(2), "outro", B.outroStart.toFixed(2));
console.log("C", C.bpm, C.camelot);

let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${info}`);
  if (!ok) failures++;
};

for (const style of ["auto", "blend", "filter", "echo", "cut", "fade"] as (MixStyle | "auto")[]) {
  const p = planTransition({ a: A, b: B, minStart: 30, settings: { ...DEFAULT_MIX_SETTINGS, enabled: true, style } });
  if (!p) { check(`plan ${style}`, false, "null"); continue; }
  const k = A.beats.findIndex((t) => Math.abs(t - p.outStart) < 1e-3);
  const onBar = k >= 0 && (k - A.downbeat) % 4 === 0;
  const endT = p.outStart + p.dur;
  let info = `style=${p.style} sync=${p.sync} bars=${p.bars} out=${p.outStart.toFixed(2)} in=${p.inStart.toFixed(2)} dur=${p.dur.toFixed(2)} bRate=${p.bRate.toFixed(4)} harm=${p.harmonic}`;
  if (p.style === "blend" || p.style === "filter") {
    // B's body must arrive when A is gone: B position at A's end ≈ B intro end
    const bAtEnd = p.inStart + p.dur * p.bRate;
    info += ` B@end=${bAtEnd.toFixed(2)} (introEnd ${B.introEnd.toFixed(2)})`;
    check(`${style}: drop lands at end of mix`, Math.abs(bAtEnd - B.introEnd) < 0.05, info);
  } else check(`${style}: planned`, true, info);
  check(`${style}: mix-out on a bar line`, p.style === "fade" ? true : onBar);
  const kb = B.beats.findIndex((t) => Math.abs(t - p.inStart) < 1e-3);
  if (p.sync && p.style !== "echo") check(`${style}: mix-in on a B downbeat`, kb >= 0 && (kb - B.downbeat) % 4 === 0);
  check(`${style}: ends by the end of A (<= 1 beat after its last sound)`, endT <= A.audibleEnd + 60 / A.bpm + 0.01);

  // Automation invariants
  const ev = buildAutomation(p);
  let maxPow = 0, minPow = 9, doubleBass = 0;
  for (let t = 0; t <= p.dur; t += 0.01) {
    const fo = valueAt(ev, "out", "fader", t), fi = valueAt(ev, "in", "fader", t);
    const lo = valueAt(ev, "out", "low", t), li = valueAt(ev, "in", "low", t);
    const hpfOut = valueAt(ev, "out", "hpf", t);
    const pow = fo * fo + fi * fi;
    maxPow = Math.max(maxPow, pow); minPow = Math.min(minPow, pow);
    const bassOut = lo > BASS_KILL_DB + 10 && hpfOut < 120 ? fo : 0;
    const bassIn = li > BASS_KILL_DB + 10 ? fi : 0;
    if (bassOut > 0.3 && bassIn > 0.3) doubleBass += 0.01;
  }
  if (p.style === "blend" || p.style === "filter" || p.style === "fade") {
    check(`${style}: equal-power sum`, maxPow < 1.02 && minPow > 0.98, `power ∈ [${minPow.toFixed(3)}, ${maxPow.toFixed(3)}]`);
  }
  check(`${style}: never two basslines`, doubleBass <= 0.13, `overlap ${doubleBass.toFixed(2)} s`);
}

const pc = planTransition({ a: A, b: C, minStart: 30, settings: { ...DEFAULT_MIX_SETTINGS, enabled: true } });
check("124→96 BPM: no tempo sync, echo/fade", !!pc && !pc.sync && (pc.style === "echo" || pc.style === "fade"), `style=${pc?.style}`);
const pNoSync = planTransition({ a: A, b: B, minStart: 30, settings: { ...DEFAULT_MIX_SETTINGS, enabled: true, tempoSync: false } });
check("tempo sync disabled → not synced", !!pNoSync && !pNoSync.sync, `style=${pNoSync?.style}`);
const pLate = planTransition({ a: A, b: B, minStart: A.outroStart + 5, settings: { ...DEFAULT_MIX_SETTINGS, enabled: true } });
check("late start (after seek) still plans before the end", !!pLate && pLate.outStart >= A.outroStart + 5 && pLate.outStart + pLate.dur <= A.audibleEnd + 60 / A.bpm + 0.01, `style=${pLate?.style} out=${pLate?.outStart.toFixed(2)} bars=${pLate?.bars}`);

// Harmonic ordering on fake analyses: expect a smooth Camelot walk.
const lib = [
  { id: "8A-124", key: 21, bpm: 124, energy: 0.6 },
  { id: "3B-90", key: 1, bpm: 90, energy: 0.3 },
  { id: "9A-125", key: 16, bpm: 125, energy: 0.65 },
  { id: "10A-126", key: 23, bpm: 126, energy: 0.7 },
  { id: "8B-123", key: 0, bpm: 123, energy: 0.6 },
  { id: "2A-170", key: 22 - 12 + 12, bpm: 170, energy: 0.9 },
  { id: "7A-122", key: 14, bpm: 122, energy: 0.55 },
].map((x) => ({ id: x.id, analysis: { key: x.key, keyConfidence: 1, bpm: x.bpm, energy: x.energy, gridReliable: true } }));
const start = { key: 21, keyConfidence: 1, bpm: 124, energy: 0.58, gridReliable: true };
const seq = orderSequence(start, lib);
let total = 0; let cur = start;
for (const s of seq) { total += transitionScore(cur, s.analysis); cur = s.analysis; }
let rnd = 0; cur = start;
for (const s of lib) { rnd += transitionScore(cur, s.analysis); cur = s.analysis; }
console.log("Harmonic order:", seq.map((s) => s.id).join(" → "), `score ${total.toFixed(2)} vs library order ${rnd.toFixed(2)}`);
check("harmonic ordering beats input order", total > rnd);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`);
