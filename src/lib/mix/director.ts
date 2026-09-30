import { engine } from "../audio-engine";
import { getCachedAnalysis, peekAnalysis, type TrackAnalysis } from "../analysis";
import type { Track } from "../types";
import { keyName } from "./key";
import { pickNext } from "./ordering";
import { planFade, planTransition, SYNC_PREROLL } from "./planner";
import type {
  HarmonicRelation,
  MixAnalysis,
  MixSettings,
  MixTransitionInfo,
  TrackMixInfo,
  TransitionPlan,
} from "./types";

/**
 * Aurora Mix director: glue between the store (what plays next), the
 * analyses (cached, one per track) and the engine (transition execution).
 * The store calls `directorTick()` from its 100 ms playback ticker.
 *
 * Flow per (current → next) pair:
 *   1. analyses of both tracks are requested (worker, IndexedDB cache);
 *   2. a TransitionPlan is computed once (planner) — or a time-based fade
 *      when an analysis is missing / a track is online;
 *   3. the next local track is preloaded in the idle slot;
 *   4. SYNC_PREROLL seconds before t0 the engine starts the transition;
 *   5. at the adopt point the engine fires onMixAdopt → the store commits
 *      next() (title switches), the outgoing tail keeps fading.
 */

export interface DirectorHost {
  settings(): MixSettings;
  current(): Track | undefined;
  /** What next(true) would play (queue first), undefined when nothing. */
  upcoming(): Track | undefined;
  playing(): boolean;
  /** Repeat-one, sleep "end of track", A-B loop… : no transition. */
  blocked(): boolean;
  /** Normalisation gain for `track` (undefined when normalisation is off). */
  normalizeLevel(track: Track, analysis: TrackAnalysis | null): number | undefined;
  onTransition(info: MixTransitionInfo | null): void;
  /** The engine switched to the incoming track: commit it in the store. */
  commit(id: string): void;
}

const MAX_CACHE = 96;
const analyses = new Map<string, TrackAnalysis>();
let host: DirectorHost | null = null;

let planKey: string | null = null;
let plan: TransitionPlan | null = null;
let planFailed = false;
let planWaitSince = 0;
let transitionFrom: Track | null = null;
let transitionTo: Track | null = null;
let lastPublish = 0;

function remember(id: string, a: TrackAnalysis): void {
  analyses.delete(id);
  analyses.set(id, a);
  while (analyses.size > MAX_CACHE) {
    const oldest = analyses.keys().next().value;
    if (oldest === undefined) break;
    analyses.delete(oldest);
  }
}

// ---- Analyses ------------------------------------------------------------------

let lowChain: Promise<unknown> = Promise.resolve();
const lowQueued = new Set<string>();

/** Analysis of a local track now (deduplicated with other consumers). */
export function ensureAnalysis(track: Track): Promise<TrackAnalysis | null> {
  if (!track.file || track.isOnline) return Promise.resolve(null);
  const known = analyses.get(track.id);
  if (known) return Promise.resolve(known);
  return getCachedAnalysis(track.id, track.file).then((a) => {
    if (a) remember(track.id, a);
    return a;
  });
}

/** Background analysis (one at a time, after the urgent ones). */
function queueAnalysis(track: Track): void {
  if (!track.file || track.isOnline || analyses.has(track.id) || lowQueued.has(track.id)) return;
  lowQueued.add(track.id);
  lowChain = lowChain
    .then(async () => {
      const cached = await peekAnalysis(track.id);
      if (cached) {
        remember(track.id, cached);
        return;
      }
      await ensureAnalysis(track);
      // Breathe between heavy decodes.
      await new Promise((r) => setTimeout(r, 800));
    })
    .catch(() => void 0)
    .finally(() => lowQueued.delete(track.id));
}

export function analysisFor(id: string | undefined): TrackAnalysis | undefined {
  return id ? analyses.get(id) : undefined;
}

/** Display info (BPM + Camelot key) of a local track, when analysed. */
export async function trackMixInfo(track: Track): Promise<TrackMixInfo | null> {
  const a = await ensureAnalysis(track);
  const m = a?.mix;
  if (!m || !(m.bpm > 0)) return null;
  return { id: track.id, bpm: m.bpm, camelot: m.camelot, keyName: keyName(m.key) };
}

// ---- Harmonic ordering -----------------------------------------------------------

let pickCache: { curId: string; chosen: string; analysed: number } | null = null;

/**
 * "Mix harmonique": best next track among `candidates` (the head of the
 * shuffle bag) for key / tempo / energy flow. Returns null when not enough
 * candidates are analysed yet (they are analysed in the background) — the
 * caller then keeps its own order. Stable once the transition is planned.
 */
export function harmonicPick(current: Track, candidates: Track[]): string | null {
  if (!host?.settings().order) return null;
  const locals = candidates.filter((t) => !t.isOnline && t.file);
  if (pickCache && pickCache.curId === current.id && planKey?.startsWith(`${current.id}>`)) {
    if (candidates.some((t) => t.id === pickCache!.chosen)) return pickCache.chosen;
  }
  const curA = analyses.get(current.id)?.mix;
  if (!curA) {
    void ensureAnalysis(current);
    return pickCache?.curId === current.id ? pickCache.chosen : null;
  }
  const analysed: { id: string; analysis: MixAnalysis }[] = [];
  for (const t of locals) {
    const m = analyses.get(t.id)?.mix;
    if (m) analysed.push({ id: t.id, analysis: m });
    else queueAnalysis(t);
  }
  if (pickCache?.curId === current.id && pickCache.analysed >= analysed.length) {
    if (candidates.some((t) => t.id === pickCache!.chosen)) return pickCache.chosen;
  }
  if (analysed.length < Math.min(3, locals.length)) return null;
  const best = pickNext(curA, analysed);
  if (!best) return null;
  pickCache = { curId: current.id, chosen: best.id, analysed: analysed.length };
  return best.id;
}

// ---- Planning ---------------------------------------------------------------------

function stub(duration: number, start = 0, end = duration): MixAnalysis {
  return {
    v: 0,
    duration,
    bpm: 0,
    bpmConfidence: 0,
    gridReliable: false,
    beats: [],
    downbeat: 0,
    phraseBeat: 0,
    barDb: [],
    barLowDb: [],
    bodyDb: -20,
    introEnd: start,
    outroStart: end,
    fadeEnd: end,
    audibleStart: start,
    audibleEnd: end,
    key: -1,
    keyConfidence: 0,
    camelot: "",
    loudnessDb: -20,
    energy: 0.5,
  };
}

function settingsKey(s: MixSettings): string {
  return `${s.length}|${s.tempoSync}|${s.harmonic}|${s.style}`;
}

function computePlan(
  cur: Track,
  next: Track,
  time: number,
  duration: number,
  settings: MixSettings,
  force: boolean
): TransitionPlan | null {
  const curA = cur.isOnline ? undefined : analyses.get(cur.id);
  const nextA = next.isOnline ? undefined : analyses.get(next.id);
  const a = curA?.mix;
  const b = nextA?.mix;
  const bothLocal = !cur.isOnline && !next.isOnline;
  if (bothLocal && a && b) {
    return planTransition({ a, b, minStart: time + SYNC_PREROLL + 0.4, settings });
  }
  // Wait for the analyses while there is time; then fall back to a fade.
  if (!force && ((!cur.isOnline && !curA) || (!next.isOnline && !nextA))) return null;
  const aa = a ?? stub(duration, curA?.start ?? 0, curA?.end ?? duration);
  const bb = b ?? stub(nextA?.duration ?? 240, nextA?.start ?? 0, nextA?.end ?? 240);
  const minStart = time + (next.isOnline ? 8 : 1.5);
  const relation: HarmonicRelation = "unknown";
  return planFade({ a: aa, b: bb, minStart, settings }, relation, a && a.gridReliable ? a : null);
}

function publish(force = false): void {
  if (!host) return;
  const now = performance.now();
  if (!force && now - lastPublish < 100) return;
  lastPublish = now;
  const st = engine.mixState();
  if (!st || !transitionFrom || !transitionTo) {
    host.onTransition(null);
    return;
  }
  host.onTransition({
    fromId: transitionFrom.id,
    toId: transitionTo.id,
    toTitle: transitionTo.title,
    toArtist: transitionTo.artist,
    style: st.style,
    sync: st.sync,
    bars: st.bars,
    harmonic: st.plan.harmonic,
    progress: Math.round(st.progress * 100) / 100,
  });
}

export function attachDirector(h: DirectorHost): void {
  host = h;
  engine.onMixAdopt = (id) => host?.commit(id);
  engine.onMixEnd = () => {
    transitionFrom = null;
    transitionTo = null;
    plan = null;
    planKey = null;
    host?.onTransition(null);
  };
}

/** True while Aurora Mix owns the end of the current track. */
export function directorOwnsEnd(): boolean {
  return engine.mixing || (plan !== null && !planFailed);
}

/** Forget the current plan (queue edited, settings changed, track switched). */
export function resetDirector(): void {
  plan = null;
  planKey = null;
  planFailed = false;
}

export function directorTick(): void {
  if (!host) return;
  const settings = host.settings();
  if (!settings.enabled) return;
  if (engine.mixing) {
    publish();
    return;
  }
  const cur = host.current();
  if (!cur || !host.playing() || host.blocked()) return;
  const next = host.upcoming();
  if (!next || next.id === cur.id) return;

  const key = `${cur.id}>${next.id}|${settingsKey(settings)}`;
  if (key !== planKey) {
    planKey = key;
    plan = null;
    planFailed = false;
    planWaitSince = performance.now();
  }
  if (!cur.isOnline && !analyses.has(cur.id)) void ensureAnalysis(cur);
  if (!next.isOnline && !analyses.has(next.id)) void ensureAnalysis(next);

  const time = engine.currentTime;
  const duration = engine.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const remaining = duration - time;

  // Prepare the incoming source early enough.
  if (!next.isOnline && remaining < 75 && !engine.isPreloaded(next.id)) {
    if (next.file) engine.preload(next.id, next.file);
    else if (next.streamUrl && !next.streamUrl.startsWith("yt:")) {
      engine.preload(next.id, { url: next.streamUrl });
    }
  }
  if (next.isOnline && remaining < 45) engine.prepareYtMix();

  if (planFailed) return;
  if (!plan) {
    const force = remaining < 25 || performance.now() - planWaitSince > 60000;
    plan = computePlan(cur, next, time, duration, settings, force);
    if (!plan) {
      if (force) planFailed = true;
      return;
    }
  }

  const lead = plan.sync ? SYNC_PREROLL : next.isOnline ? 8 : 1.2;
  if (time < plan.outStart - lead) return;
  if (time > plan.outStart + 0.4) {
    // Seeked past the planned start: plan again from here.
    plan = null;
    return;
  }
  if (next.isOnline && !engine.ytMixReady()) {
    engine.prepareYtMix();
    if (time > plan.outStart - 1) planFailed = true;
    return;
  }
  const nextA = next.isOnline ? null : (analyses.get(next.id) ?? null);
  const curA = cur.isOnline ? null : (analyses.get(cur.id) ?? null);
  const inLevel = host.normalizeLevel(next, nextA);
  let inTrim: number | undefined;
  if (inLevel === undefined && curA?.mix && nextA?.mix) {
    // Loudness match when normalisation is off (±6 dB), glides back after.
    const db = curA.mix.loudnessDb - nextA.mix.loudnessDb;
    inTrim = Math.pow(10, Math.max(-6, Math.min(6, db)) / 20);
  }
  const bpmIn = nextA?.mix?.bpm ?? 120;
  const ok = engine.startMix({
    id: next.id,
    plan,
    incoming: next.isOnline
      ? { kind: "yt", videoId: (next.streamUrl ?? next.id).replace(/^(?:yt:|online_)+/, "") }
      : { kind: "local" },
    aBeats: curA?.mix?.beats,
    bBeats: nextA?.mix?.beats,
    inLevel: inLevel ?? 1,
    inTrim,
    // Ease the tempo back to native over ~8 bars of the incoming track.
    easeSec: (8 * 4 * 60) / Math.max(60, bpmIn),
  });
  if (ok) {
    transitionFrom = cur;
    transitionTo = next;
    publish(true);
  } else if (time > plan.outStart - 0.3) {
    planFailed = true;
  }
}
