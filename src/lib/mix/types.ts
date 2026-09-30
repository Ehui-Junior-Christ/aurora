/**
 * Aurora Mix — shared types.
 *
 * Everything under src/lib/mix is pure (no DOM, no store) except
 * `director.ts` (orchestration), `client.ts` (worker bridge) and `clock.ts`
 * (visual beat clock). Pure modules are unit-tested with node scripts in
 * tests/mix.
 */

/** Result of the DJ analysis of a local track (cached in IndexedDB). */
export interface MixAnalysis {
  /** Format version (see MIX_ANALYSIS_VERSION). */
  v: number;
  /** Decoded duration in seconds. */
  duration: number;
  /** Native tempo in BPM (0.01 precision, range ~70-180). */
  bpm: number;
  /** 0..1 — how clearly a steady beat grid explains the onsets. */
  bpmConfidence: number;
  /** False when the grid drifts (live drummer, rubato): no beat sync then. */
  gridReliable: boolean;
  /** Beat times in seconds (tempo map: locally re-anchored every 16 beats). */
  beats: number[];
  /** Index in `beats` of the first downbeat (0..3). */
  downbeat: number;
  /** Index in `beats` of the first 8-bar phrase boundary. */
  phraseBeat: number;
  /** Per-bar loudness in dB (bars start at beats[downbeat + 4k]). */
  barDb: number[];
  /** Per-bar bass (<150 Hz) loudness in dB. */
  barLowDb: number[];
  /** Typical body loudness (75th percentile of barDb). */
  bodyDb: number;
  /** End of the intro (first body bar), seconds — a downbeat. */
  introEnd: number;
  /** Start of the outro (after the last body bar), seconds — a downbeat. */
  outroStart: number;
  /** Where the track has faded 10 dB under its body (or audible end). */
  fadeEnd: number;
  /** First / last audible instants (seconds). */
  audibleStart: number;
  audibleEnd: number;
  /** Key index 0-23: 0-11 = C..B major, 12-23 = C..B minor; -1 unknown. */
  key: number;
  /** 0..1 correlation margin of the key estimate. */
  keyConfidence: number;
  /** Camelot notation ("8A", "11B"…) or "" when unknown. */
  camelot: string;
  /** Mean power of the loud part of the track, dBFS. */
  loudnessDb: number;
  /** 0..1 perceived energy (tempo, bass weight, onset density). */
  energy: number;
}

export type MixStyle = "blend" | "filter" | "echo" | "fade" | "cut";
export type MixLength = "auto" | "short" | "long";

export interface MixSettings {
  /** "Aurora Mix" on/off. Overrides the plain crossfade when on. */
  enabled: boolean;
  length: MixLength;
  /** Allow temporary tempo matching (playbackRate, pitch preserved). */
  tempoSync: boolean;
  /** Harmonic priority: avoid long overlaps on key clashes. */
  harmonic: boolean;
  /** "Mix harmonique": reorder the upcoming shuffle for key/BPM/energy flow. */
  order: boolean;
  /** Style override ("auto" = picked per transition). */
  style: MixStyle | "auto";
}

export const DEFAULT_MIX_SETTINGS: MixSettings = {
  enabled: false,
  length: "auto",
  tempoSync: true,
  harmonic: true,
  order: false,
  style: "auto",
};

export type HarmonicRelation =
  | "same"
  | "compatible"
  | "boost"
  | "clash"
  | "unknown";

/**
 * A planned transition. All times are in seconds of the OUTGOING track
 * timeline, relative to `outStart` unless stated otherwise.
 */
export interface TransitionPlan {
  style: MixStyle;
  /** Beat-synchronised (tempo matched + phase locked). */
  sync: boolean;
  /** Outgoing track time where the transition starts (t0). */
  outStart: number;
  /** Incoming track time playing at t0. */
  inStart: number;
  /** Duration of the transition (outgoing track seconds). */
  dur: number;
  /** Bass swap instant (from t0). */
  swapAt: number;
  /** Instant the incoming track becomes "current" in the UI (from t0). */
  adoptAt: number;
  /** Outgoing beat period, seconds (native). */
  beatSec: number;
  /** Incoming track seconds per outgoing track second while mixing. */
  bRate: number;
  /** Incoming beats → outgoing beats factor (2 when B is half-time). */
  beatMul: number;
  /** Length in bars (0 for time-based fades). */
  bars: number;
  harmonic: HarmonicRelation;
  /** Outgoing beat index at t0 and incoming beat index at inStart (sync). */
  aBeat0: number;
  bBeat0: number;
}

/** Live transition state exposed in the store for UI and visuals. */
export interface MixTransitionInfo {
  fromId: string;
  toId: string;
  toTitle: string;
  toArtist: string;
  style: MixStyle;
  sync: boolean;
  bars: number;
  harmonic: HarmonicRelation;
  /** 0..1, refreshed ~10×/s in the store (use getMixProgress() per frame). */
  progress: number;
}

/** Per-track display info (key chip). */
export interface TrackMixInfo {
  id: string;
  bpm: number;
  camelot: string;
  keyName: string;
}
