import type { TransitionPlan } from "./types";

/**
 * Transition automation as data (pure): the engine turns these events into
 * AudioParam automation; tests simulate them to check equal-power sums and
 * that two basslines never play at once.
 *
 * Times are outgoing-track seconds from t0; the engine divides by the
 * outgoing playback rate to get AudioContext seconds.
 */

export type MixParam = "fader" | "low" | "hpf" | "lpf" | "send";
export type MixSlot = "out" | "in";

export type AutoEvent =
  | { slot: MixSlot; param: MixParam; kind: "set"; at: number; value: number }
  | { slot: MixSlot; param: MixParam; kind: "lin" | "exp"; at: number; dur: number; from: number; to: number }
  | { slot: MixSlot; param: MixParam; kind: "curve"; at: number; dur: number; values: number[] };

/** Low-shelf gain (dB) that removes a bassline. */
export const BASS_KILL_DB = -40;
/** Neutral filter frequencies. */
export const HPF_OFF = 10;
export const LPF_OFF = 22000;
/** Echo (delay) settings for echo-out / drop swap tails. */
export const ECHO_FEEDBACK = 0.5;
export const ECHO_BEATS = 0.75;
export const ECHO_LOWCUT_HZ = 350;

export const NEUTRAL: Record<MixParam, number> = {
  fader: 1,
  low: 0,
  hpf: HPF_OFF,
  lpf: LPF_OFF,
  send: 0,
};

const POINTS = 48;

export function equalPower(dir: "in" | "out", from = 0, to = 1, points = POINTS): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const x = from + ((to - from) * i) / (points - 1);
    out.push(dir === "in" ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2));
  }
  return out;
}

/** dB boost compensating an equal-power fader for x in [from, to]. */
function compensation(dir: "in" | "out", from: number, to: number): number[] {
  return equalPower(dir, from, to).map((g) => Math.min(3.02, 20 * Math.log10(1 / Math.max(0.7, g))));
}

export function buildAutomation(plan: TransitionPlan): AutoEvent[] {
  const ev: AutoEvent[] = [];
  const D = plan.dur;
  const S = Math.min(D, Math.max(0, plan.swapAt));
  const q = Math.max(0.04, Math.min(0.12, plan.beatSec / 4)); // swap ramp
  const xs = D > 0 ? S / D : 0.5;

  const bassSwap = () => {
    // Before the swap: B without bass, A bass compensated for its fader.
    ev.push({ slot: "in", param: "low", kind: "set", at: 0, value: BASS_KILL_DB });
    if (S > 0.05) {
      ev.push({ slot: "out", param: "low", kind: "curve", at: 0, dur: S, values: compensation("out", 0, xs) });
    }
    // Swap on the downbeat: A bass out, B bass in (compensated, then flat).
    ev.push({ slot: "out", param: "low", kind: "lin", at: S, dur: q, from: compensation("out", xs, xs)[0], to: BASS_KILL_DB });
    const after = compensation("in", xs, 1);
    ev.push({ slot: "in", param: "low", kind: "lin", at: S, dur: q, from: BASS_KILL_DB, to: after[0] });
    if (D - S - q > 0.05) {
      ev.push({ slot: "in", param: "low", kind: "curve", at: S + q, dur: D - S - q, values: compensation("in", Math.min(1, (S + q) / D), 1) });
    }
  };

  switch (plan.style) {
    case "blend":
      ev.push({ slot: "out", param: "fader", kind: "curve", at: 0, dur: D, values: equalPower("out") });
      ev.push({ slot: "in", param: "fader", kind: "curve", at: 0, dur: D, values: equalPower("in") });
      bassSwap();
      break;
    case "filter":
      ev.push({ slot: "out", param: "fader", kind: "curve", at: 0, dur: D, values: equalPower("out") });
      ev.push({ slot: "in", param: "fader", kind: "curve", at: 0, dur: D, values: equalPower("in") });
      ev.push({ slot: "out", param: "hpf", kind: "exp", at: 0, dur: D, from: 20, to: 1200 });
      ev.push({ slot: "in", param: "lpf", kind: "exp", at: 0, dur: D * 0.85, from: 280, to: 20000 });
      ev.push({ slot: "in", param: "lpf", kind: "set", at: D * 0.85 + 0.01, value: LPF_OFF });
      bassSwap();
      break;
    case "echo": {
      ev.push({ slot: "out", param: "send", kind: "lin", at: 0, dur: S, from: 0, to: 0.85 });
      ev.push({ slot: "out", param: "hpf", kind: "exp", at: 0, dur: S, from: 20, to: 320 });
      ev.push({ slot: "out", param: "fader", kind: "lin", at: S, dur: 0.03, from: 1, to: 0 });
      ev.push({ slot: "out", param: "send", kind: "lin", at: S, dur: 0.03, from: 0.85, to: 0 });
      ev.push({ slot: "in", param: "fader", kind: "set", at: 0, value: 0 });
      ev.push({ slot: "in", param: "fader", kind: "curve", at: S, dur: Math.max(0.05, plan.beatSec), values: equalPower("in") });
      break;
    }
    case "cut": {
      ev.push({ slot: "out", param: "hpf", kind: "exp", at: 0, dur: S, from: 20, to: 450 });
      const b = Math.max(0.05, Math.min(S, plan.beatSec));
      ev.push({ slot: "out", param: "send", kind: "lin", at: S - b, dur: b, from: 0, to: 0.55 });
      ev.push({ slot: "out", param: "fader", kind: "lin", at: S, dur: 0.015, from: 1, to: 0 });
      ev.push({ slot: "out", param: "send", kind: "lin", at: S + 0.02, dur: 0.02, from: 0.55, to: 0 });
      ev.push({ slot: "in", param: "fader", kind: "set", at: 0, value: 0 });
      ev.push({ slot: "in", param: "fader", kind: "lin", at: S, dur: 0.01, from: 0, to: 1 });
      break;
    }
    case "fade":
    default:
      ev.push({ slot: "out", param: "fader", kind: "curve", at: 0, dur: D, values: equalPower("out") });
      ev.push({ slot: "in", param: "fader", kind: "curve", at: 0, dur: D, values: equalPower("in") });
      ev.push({ slot: "out", param: "lpf", kind: "exp", at: 0, dur: D, from: 20000, to: 2500 });
      bassSwap();
      break;
  }
  return ev;
}

/**
 * Value of `param` on `slot` at time `t` (reference simulator of the
 * AudioParam semantics used by the engine; for tests and progress UI).
 */
export function valueAt(events: AutoEvent[], slot: MixSlot, param: MixParam, t: number): number {
  let v = NEUTRAL[param];
  const list = events
    .filter((e) => e.slot === slot && e.param === param)
    .sort((a, b) => a.at - b.at);
  for (const e of list) {
    if (e.at > t) break;
    if (e.kind === "set") {
      v = e.value;
    } else if (e.kind === "curve") {
      const x = Math.min(1, (t - e.at) / Math.max(1e-6, e.dur));
      const pos = x * (e.values.length - 1);
      const i = Math.min(e.values.length - 2, Math.floor(pos));
      v = e.values[i] + (e.values[i + 1] - e.values[i]) * (pos - i);
    } else {
      const x = Math.min(1, (t - e.at) / Math.max(1e-6, e.dur));
      v = e.kind === "lin" ? e.from + (e.to - e.from) * x : e.from * Math.pow(e.to / e.from, x);
    }
  }
  return v;
}
