import {
  buildAutomation,
  ECHO_BEATS,
  ECHO_FEEDBACK,
  ECHO_LOWCUT_HZ,
  HPF_OFF,
  LPF_OFF,
  NEUTRAL,
  valueAt,
  type AutoEvent,
  type MixParam,
} from "./mix/automation";
import { createSyncState, incomingTarget, syncStep, type SyncGrid, type SyncState } from "./mix/sync";
import type { MixStyle, TransitionPlan } from "./mix/types";

/**
 * Per-slot chain (local tracks):
 *   <audio> → source → trim → level → low (shelf) → hpf → lpf → fader → bus
 *                                                         lpf → send → delay ⟲ (HPF, feedback) → wet → bus
 * bus = EQ (low/mid/high) → limiter → trim → analyser → master → out.
 *
 * `fader` is the crossfade gain (plain crossfade and Aurora Mix), `level`
 * the normalisation gain of the track (ReplayGain / RMS), `trim` a
 * temporary loudness match used by Aurora Mix when normalisation is off.
 */
interface Slot {
  el: HTMLAudioElement;
  gain: GainNode | null;
  trim: GainNode | null;
  level: GainNode | null;
  low: BiquadFilterNode | null;
  hpf: BiquadFilterNode | null;
  lpf: BiquadFilterNode | null;
  send: GainNode | null;
  delay: DelayNode | null;
  url: string | null;
  revokeUrl: boolean;
  /** Tempo multiplier applied on top of the user speed (mix sync / ease). */
  mixRate: number;
}

export interface AudioSource {
  url: string;
  crossOrigin?: "" | "anonymous";
  revokeUrl?: boolean;
}

export interface LoadOptions {
  /**
   * false = prepare the track paused (resume on startup). YouTube is then
   * cued instead of loaded so it does not start by itself. Default true.
   */
  autoplay?: boolean;
  /** Initial position in seconds. */
  startAt?: number;
}

/** Minimal typing of the YouTube IFrame Player API surface we use. */
interface YTPlayer {
  loadVideoById(
    videoId: string | { videoId: string; startSeconds?: number }
  ): void;
  cueVideoById(videoId: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
}

interface YTEvent {
  data: number;
}

interface YTNamespace {
  Player: new (
    element: string | HTMLElement,
    options: {
      height?: string;
      width?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: YTEvent) => void;
        onError?: (event: YTEvent) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** One YouTube IFrame player. Aurora Mix alternates between two of them. */
interface YtHandle {
  hostId: string;
  player: YTPlayer | null;
  ready: boolean;
  state: number;
  duration: number;
  /** Mix fade factor (0..1) applied on top of the volume. */
  fade: number;
  requested: boolean;
}

/** YouTube IFrame player states. */
const YT_PLAYING = 1;
const YT_BUFFERING = 3;
/** Custom error code used when the IFrame API script itself cannot load. */
export const YT_API_UNAVAILABLE = -1;
const YT_API_TIMEOUT = 15000;
/** Fixed container holding both YouTube players (see ensureYtStage). */
export const YT_STAGE_ID = "aurora-yt-stage";

/** Public, read-only view of a running Aurora Mix transition. */
export interface MixRuntimeState {
  id: string;
  style: MixStyle;
  sync: boolean;
  bars: number;
  /** 0..1 */
  progress: number;
  adopted: boolean;
  plan: TransitionPlan;
}

export interface MixStartRequest {
  /** Id of the incoming track. */
  id: string;
  plan: TransitionPlan;
  /** Local incoming tracks must have been preload()ed. */
  incoming: { kind: "local" } | { kind: "yt"; videoId: string };
  /** Beat grids for phase lock (sync plans). */
  aBeats?: number[];
  bBeats?: number[];
  /** Normalisation gain of the incoming track. */
  inLevel?: number;
  /** Temporary loudness match of the incoming track (glides back to 1). */
  inTrim?: number;
  /** Seconds (wall) to ease the incoming tempo back to native after. */
  easeSec?: number;
}

interface ActiveMix {
  req: MixStartRequest;
  plan: TransitionPlan;
  events: AutoEvent[];
  outKind: "local" | "yt";
  inKind: "local" | "yt";
  outKey: "a" | "b";
  inKey: "a" | "b";
  outYt: number;
  inYt: number;
  /** AudioContext time of t0 once the local automation is scheduled. */
  scheduled: boolean;
  bStarted: boolean;
  /** YouTube incoming: paused at 0 and ready to start. */
  ytArmed: boolean;
  ytStartWall: number;
  ytStartRequested: number;
  adopted: boolean;
  grid: SyncGrid;
  sync: SyncState;
  timer: ReturnType<typeof setInterval>;
  startedWall: number;
  progress: number;
}

const MIX_TICK_MS = 40;

class AudioEngine {
  private slots: Record<"a" | "b", Slot> | null = null;
  private activeKey: "a" | "b" = "a";
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private eqLow: BiquadFilterNode | null = null;
  private eqMid: BiquadFilterNode | null = null;
  private eqHigh: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private desiredVolume = 0.85;
  private desiredEq = { low: 0, mid: 0, high: 0 };
  private desiredRate = 1;
  private freqData = new Uint8Array(1024);
  /** Id of the track preloaded in the inactive slot (gapless playback). */
  private preloadedId: string | null = null;

  // YouTube IFrame players (index 1 is only created for Aurora Mix).
  private yt: YtHandle[] = [
    { hostId: "aurora-yt-player", player: null, ready: false, state: -1, duration: 0, fade: 1, requested: true },
    { hostId: "aurora-yt-player-2", player: null, ready: false, state: -1, duration: 0, fade: 1, requested: false },
  ];
  private ytIdx = 0;
  private ytInitStarted = false;
  private ytFailed = false;
  private ytPendingId: string | null = null;
  private ytPendingPlay = false;
  private ytPendingStart = 0;
  private ytLoadTimer: ReturnType<typeof setTimeout> | null = null;
  public ytActive = false;
  private ytDuration = 0;
  public onYtStateChange?: (state: number) => void;
  public onYtError?: (error: number) => void;

  // Aurora Mix
  private mix: ActiveMix | null = null;
  private easeTimer: ReturnType<typeof setInterval> | null = null;
  /** Fired when the incoming track takes over (store commits next). */
  public onMixAdopt?: (id: string) => void;
  /** Fired when a transition completes or is aborted. */
  public onMixEnd?: (completed: boolean) => void;

  constructor() {
    this.initYouTube();
  }

  // ---- YouTube ---------------------------------------------------------------

  private get ytH(): YtHandle {
    return this.yt[this.ytIdx];
  }

  private get ytPlayer(): YTPlayer | null {
    return this.ytH.player;
  }

  private get ytReady(): boolean {
    return this.ytH.ready;
  }

  private ytVolumeFor(h: YtHandle): number {
    return Math.round(this.desiredVolume * 100 * h.fade);
  }

  /**
   * The players live in one fixed-position "stage" that is never re-parented
   * (moving an iframe in the DOM reloads it): the VideoStage component only
   * moves/resizes the stage over the visible slot (now-playing artwork or the
   * floating mini-player), so the video is always shown while it plays
   * (YouTube API terms: no hidden players).
   */
  private ensureYtStage(): HTMLElement {
    let stage = document.getElementById(YT_STAGE_ID);
    if (stage) return stage;
    stage = document.createElement("div");
    stage.id = YT_STAGE_ID;
    stage.setAttribute("aria-hidden", "true");
    Object.assign(stage.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "320px",
      height: "180px",
      transform: "translate3d(-200vw, 0, 0)",
      visibility: "hidden",
      overflow: "hidden",
      pointerEvents: "none",
      background: "#000",
      zIndex: "65",
      contain: "layout paint",
    });
    for (let i = 0; i < 2; i++) {
      const layer = document.createElement("div");
      layer.dataset.ytLayer = String(i);
      Object.assign(layer.style, { position: "absolute", inset: "0", opacity: i === 0 ? "1" : "0" });
      stage.appendChild(layer);
    }
    document.body.appendChild(stage);
    return stage;
  }

  private ensureYtHost(h: YtHandle): void {
    if (document.getElementById(h.hostId)) return;
    const stage = this.ensureYtStage();
    const host = document.createElement("div");
    host.id = h.hostId;
    const index = this.yt.indexOf(h);
    stage.querySelector(`[data-yt-layer="${index}"]`)?.appendChild(host);
  }

  /**
   * What the video stage should show: `show` while a YouTube video is the
   * current source or part of a running transition; `layers[i]` is the
   * opacity of player i (the incoming video fades in over the outgoing one).
   */
  ytVisual(): { show: boolean; layers: [number, number]; front: number } {
    const m = this.mix;
    if (m && (m.inKind === "yt" || m.outKind === "yt")) {
      const layers: [number, number] = [0, 0];
      if (m.outKind === "yt" && m.outYt >= 0) {
        layers[m.outYt] = m.inKind === "yt" ? 1 : this.yt[m.outYt].fade;
      }
      if (m.inKind === "yt" && m.inYt >= 0) layers[m.inYt] = this.yt[m.inYt].fade;
      const front = m.inKind === "yt" ? m.inYt : m.outYt;
      return { show: true, layers, front };
    }
    const layers: [number, number] = [0, 0];
    layers[this.ytIdx] = 1;
    return { show: this.ytActive, layers, front: this.ytIdx };
  }

  private createYtPlayer(i: number): void {
    const h = this.yt[i];
    if (h.player || !window.YT?.Player) return;
    this.ensureYtHost(h);
    const playerVars: Record<string, string | number> = {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      playsinline: 1,
      rel: 0,
      enablejsapi: 1,
    };
    // `origin` lets the embed validate postMessage traffic; only valid for
    // real http(s) origins (not app:// in Electron or file://).
    if (/^https?:$/.test(window.location.protocol)) {
      playerVars.origin = window.location.origin;
    } else if (window.location.protocol === "app:") {
      // Electron: main.js sends this origin as Referer for YouTube requests,
      // otherwise the embed fails with error 152/153.
      playerVars.origin = "https://aurora-theta-rust.vercel.app";
    }
    h.player = new window.YT.Player(h.hostId, {
      height: "100%",
      width: "100%",
      playerVars,
      events: {
        onReady: () => {
          h.ready = true;
          h.player?.setVolume(this.ytVolumeFor(h));
          h.player?.setPlaybackRate(this.desiredRate);
          if (i === this.ytIdx) this.flushPendingYt();
        },
        onStateChange: (event) => {
          h.state = event.data;
          if (event.data === YT_PLAYING || event.data === YT_BUFFERING) {
            const d = h.player?.getDuration() ?? 0;
            if (d > 0) h.duration = d;
            if (i === this.ytIdx && d > 0) this.ytDuration = d;
          }
          this.onMixYtState(i, event.data);
          // Ignore late events from a hidden player that is not the current
          // source (stopVideo() emits state changes too).
          if (!this.ytActive || i !== this.ytIdx) return;
          this.onYtStateChange?.(event.data);
        },
        onError: (event) => {
          if (this.mix && (this.mix.inYt === i || this.mix.outYt === i) && !(this.ytActive && i === this.ytIdx)) {
            this.abortMix();
            return;
          }
          if (!this.ytActive || i !== this.ytIdx) return;
          this.onYtError?.(event.data);
        },
      },
    });
  }

  private initYouTube() {
    if (typeof window === "undefined" || this.ytInitStarted) return;
    this.ytInitStarted = true;
    this.ytFailed = false;
    this.ensureYtHost(this.yt[0]);

    const create = () => {
      if (this.ytLoadTimer) {
        clearTimeout(this.ytLoadTimer);
        this.ytLoadTimer = null;
      }
      this.yt.forEach((h, i) => {
        if (h.requested) this.createYtPlayer(i);
      });
    };

    if (window.YT?.Player) {
      create();
      return;
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      create();
    };

    const fail = () => {
      if (this.yt[0].player) return;
      if (this.ytLoadTimer) {
        clearTimeout(this.ytLoadTimer);
        this.ytLoadTimer = null;
      }
      this.ytFailed = true;
      this.ytInitStarted = false; // allow a retry on the next online track
      document.getElementById("yt-api-script")?.remove();
      if (this.ytActive && this.ytPendingId) {
        this.ytPendingId = null;
        this.ytPendingPlay = false;
        this.onYtError?.(YT_API_UNAVAILABLE);
      }
    };

    if (!document.getElementById("yt-api-script")) {
      const tag = document.createElement("script");
      tag.id = "yt-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = fail;
      document.head.appendChild(tag);
    }
    this.ytLoadTimer = setTimeout(fail, YT_API_TIMEOUT);
  }

  /**
   * Aurora Mix: makes sure the second YouTube player exists (created ahead
   * of a YouTube → YouTube transition). Returns true when it is ready.
   */
  prepareYtMix(): boolean {
    if (typeof window === "undefined") return false;
    const other = this.yt[1 - this.ytIdx];
    other.requested = true;
    if (!other.player) {
      if (window.YT?.Player) this.createYtPlayer(1 - this.ytIdx);
      else this.initYouTube();
    }
    // The first player may not exist either (no online track played yet).
    const current = this.yt[this.ytIdx];
    if (!current.player && window.YT?.Player) this.createYtPlayer(this.ytIdx);
    return other.ready;
  }

  /** True when a YouTube player is ready to carry an incoming mix track. */
  ytMixReady(): boolean {
    const h = this.ytActive ? this.yt[1 - this.ytIdx] : this.yt[this.ytIdx];
    return h.ready;
  }

  private flushPendingYt(): void {
    if (!this.ytReady || !this.ytPlayer || !this.ytActive) return;
    const id = this.ytPendingId;
    if (id) {
      this.ytPendingId = null;
      const startSeconds = this.ytPendingStart;
      this.ytPendingStart = 0;
      if (this.ytPendingPlay) {
        this.ytPlayer.loadVideoById({ videoId: id, startSeconds });
      } else {
        this.ytPlayer.cueVideoById({ videoId: id, startSeconds });
      }
    } else if (this.ytPendingPlay) {
      this.ytPlayer.playVideo();
    }
    this.ytPendingPlay = false;
  }

  private stopYt(): void {
    this.ytActive = false;
    this.ytPendingId = null;
    this.ytPendingPlay = false;
    this.ytPendingStart = 0;
    this.ytDuration = 0;
    for (const h of this.yt) {
      if (h.ready && h.player && h.state !== -1 && h.state !== 5) h.player.stopVideo();
      h.fade = 1;
    }
  }

  /** True when nothing is currently playing (local element or YouTube). */
  get paused(): boolean {
    if (this.ytActive) {
      if (this.ytPendingId) return !this.ytPendingPlay;
      return this.ytH.state !== YT_PLAYING && this.ytH.state !== YT_BUFFERING;
    }
    return this.el.paused;
  }

  // ---- Slots -----------------------------------------------------------------

  private ensureSlots(): Record<"a" | "b", Slot> {
    if (!this.slots) {
      const make = (): Slot => {
        const el = new Audio();
        el.preload = "auto";
        return {
          el,
          gain: null,
          trim: null,
          level: null,
          low: null,
          hpf: null,
          lpf: null,
          send: null,
          delay: null,
          url: null,
          revokeUrl: false,
          mixRate: 1,
        };
      };
      this.slots = { a: make(), b: make() };
    }
    return this.slots;
  }

  get el(): HTMLAudioElement {
    return this.ensureSlots()[this.activeKey].el;
  }

  getElements(): HTMLAudioElement[] {
    const slots = this.ensureSlots();
    return [slots.a.el, slots.b.el];
  }

  private slot(key: "a" | "b"): Slot {
    return this.ensureSlots()[key];
  }

  private otherKey(): "a" | "b" {
    return this.activeKey === "a" ? "b" : "a";
  }

  private applyRate(slot: Slot): void {
    slot.el.playbackRate = this.desiredRate * slot.mixRate;
  }

  private param(slot: Slot, name: MixParam): AudioParam | null {
    switch (name) {
      case "fader":
        return slot.gain?.gain ?? null;
      case "low":
        return slot.low?.gain ?? null;
      case "hpf":
        return slot.hpf?.frequency ?? null;
      case "lpf":
        return slot.lpf?.frequency ?? null;
      case "send":
        return slot.send?.gain ?? null;
    }
  }

  /** Cancels automation and puts every mix parameter back to neutral. */
  private resetSlot(slot: Slot, fader = 1): void {
    const now = this.context?.currentTime ?? 0;
    for (const name of Object.keys(NEUTRAL) as MixParam[]) {
      const p = this.param(slot, name);
      if (!p) continue;
      p.cancelScheduledValues(now);
      p.setValueAtTime(name === "fader" ? fader : NEUTRAL[name], now);
    }
    if (slot.trim) {
      slot.trim.gain.cancelScheduledValues(now);
      slot.trim.gain.setValueAtTime(1, now);
    }
  }

  init(): void {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.context = ctx;
      this.eqLow = ctx.createBiquadFilter();
      this.eqLow.type = "lowshelf";
      this.eqLow.frequency.value = 200;
      this.eqMid = ctx.createBiquadFilter();
      this.eqMid.type = "peaking";
      this.eqMid.frequency.value = 1000;
      this.eqMid.Q.value = 1;
      this.eqHigh = ctx.createBiquadFilter();
      this.eqHigh.type = "highshelf";
      this.eqHigh.frequency.value = 4000;
      // Brick-wall-ish limiter: overlapping tracks and EQ boosts never clip.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 1;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      // The spec'd compressor adds make-up gain ((1/g)^0.6 of the 0 dBFS
      // gain): compensate so the limiter is transparent below threshold.
      const fullRangeDb = -1 + 1 / 20; // gain at 0 dBFS input
      const makeupDb = -0.6 * fullRangeDb;
      const limiterTrim = ctx.createGain();
      limiterTrim.gain.value = Math.pow(10, -makeupDb / 20);
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.desiredVolume;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;

      this.eqLow.connect(this.eqMid);
      this.eqMid.connect(this.eqHigh);
      this.eqHigh.connect(limiter);
      limiter.connect(limiterTrim);
      limiterTrim.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

      const slots = this.ensureSlots();
      for (const key of ["a", "b"] as const) {
        const slot = slots[key];
        const source = ctx.createMediaElementSource(slot.el);
        slot.trim = ctx.createGain();
        slot.level = ctx.createGain();
        slot.low = ctx.createBiquadFilter();
        slot.low.type = "lowshelf";
        slot.low.frequency.value = 180;
        slot.hpf = ctx.createBiquadFilter();
        slot.hpf.type = "highpass";
        slot.hpf.frequency.value = HPF_OFF;
        slot.hpf.Q.value = 0.9;
        slot.lpf = ctx.createBiquadFilter();
        slot.lpf.type = "lowpass";
        slot.lpf.frequency.value = LPF_OFF;
        slot.lpf.Q.value = 0.9;
        slot.gain = ctx.createGain();
        slot.send = ctx.createGain();
        slot.send.gain.value = 0;
        slot.delay = ctx.createDelay(2);
        slot.delay.delayTime.value = 0.375;
        const fbFilter = ctx.createBiquadFilter();
        fbFilter.type = "highpass";
        fbFilter.frequency.value = ECHO_LOWCUT_HZ;
        const feedback = ctx.createGain();
        feedback.gain.value = ECHO_FEEDBACK;

        source.connect(slot.trim);
        slot.trim.connect(slot.level);
        slot.level.connect(slot.low);
        slot.low.connect(slot.hpf);
        slot.hpf.connect(slot.lpf);
        slot.lpf.connect(slot.gain);
        slot.gain.connect(this.eqLow);
        slot.lpf.connect(slot.send);
        slot.send.connect(slot.delay);
        slot.delay.connect(fbFilter);
        fbFilter.connect(feedback);
        feedback.connect(slot.delay);
        fbFilter.connect(this.eqLow);

        this.applyRate(slot);
        if ("preservesPitch" in slot.el) {
          (
            slot.el as HTMLAudioElement & { preservesPitch: boolean }
          ).preservesPitch = true;
        }
      }
      this.applyEq();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  load(file: File, crossfadeMs = 0, options: LoadOptions = {}): void {
    this.abortMix();
    this.stopYt();
    this.loadSource(
      { url: URL.createObjectURL(file), revokeUrl: true },
      crossfadeMs,
      options
    );
  }

  /** Seeks the active element once its metadata is known. */
  private seekWhenReady(el: HTMLAudioElement, time: number): void {
    if (!(time > 0)) return;
    if (el.readyState >= 1) {
      el.currentTime = time;
      return;
    }
    const src = el.src;
    el.addEventListener(
      "loadedmetadata",
      () => {
        if (el.src === src) el.currentTime = time;
      },
      { once: true }
    );
  }

  /**
   * Gapless / Aurora Mix: loads the next local track into the inactive slot
   * so it can start instantly. Never used for YouTube.
   */
  preload(id: string, source: File | AudioSource): void {
    if (this.preloadedId === id) return;
    if (this.mix) return; // the inactive slot is busy
    this.clearPreload();
    const slot = this.slot(this.otherKey());
    const url = source instanceof File ? URL.createObjectURL(source) : source.url;
    if (url.startsWith("yt:")) return;
    slot.el.pause();
    slot.url = url;
    slot.revokeUrl = source instanceof File ? true : (source.revokeUrl ?? false);
    slot.el.crossOrigin = source instanceof File ? "" : (source.crossOrigin ?? "");
    slot.el.preload = "auto";
    slot.el.src = url;
    slot.mixRate = 1;
    this.applyRate(slot);
    this.resetSlot(slot);
    this.preloadedId = id;
  }

  hasPreloaded(id: string): boolean {
    return this.preloadedId === id && !this.ytActive;
  }

  /** Preloaded regardless of the current source (Aurora Mix from YouTube). */
  isPreloaded(id: string): boolean {
    return this.preloadedId === id;
  }

  /** Drops the preloaded track (plan changed). */
  clearPreload(): void {
    if (!this.preloadedId) return;
    this.preloadedId = null;
    const slot = this.slot(this.otherKey());
    slot.el.pause();
    if (slot.url && slot.revokeUrl) URL.revokeObjectURL(slot.url);
    slot.url = null;
    slot.revokeUrl = false;
    slot.el.removeAttribute("src");
    slot.el.load();
  }

  /**
   * Swaps to the preloaded slot and starts it immediately. Returns false when
   * `id` is not the preloaded track (caller then loads normally).
   */
  startPreloaded(id: string): boolean {
    if (!this.hasPreloaded(id) || this.mix) return false;
    this.preloadedId = null;
    const previous = this.slot(this.activeKey);
    this.activeKey = this.otherKey();
    const next = this.slot(this.activeKey);
    previous.el.pause();
    if (previous.url && previous.revokeUrl) URL.revokeObjectURL(previous.url);
    previous.url = null;
    previous.revokeUrl = false;
    if (next.el.currentTime > 0) next.el.currentTime = 0;
    next.mixRate = 1;
    this.applyRate(next);
    this.resetSlot(next);
    void this.play();
    return true;
  }

  loadSource(
    source: AudioSource,
    crossfadeMs = 0,
    options: LoadOptions = {}
  ): void {
    this.abortMix();
    this.stopEase();
    const autoplay = options.autoplay ?? true;
    const startAt = Math.max(0, options.startAt ?? 0);
    this.clearPreload();
    if (source.url.startsWith("yt:")) {
      // Strip every legacy prefix (`yt:yt:<id>` was stored by older builds).
      const videoId = source.url.replace(/^(?:yt:|online_)+/, "");
      this.ytActive = true;
      this.ytDuration = 0;
      this.ytH.state = -1;
      this.ytH.fade = 1;
      if (this.ytReady && this.ytPlayer) this.ytPlayer.setVolume(this.ytVolumeFor(this.ytH));
      // Another YouTube player may still be fading out: silence it.
      const other = this.yt[1 - this.ytIdx];
      if (other.ready && other.player && other.state !== -1 && other.state !== 5) {
        other.player.stopVideo();
      }
      other.fade = 1;
      const slots = this.ensureSlots();
      for (const slot of [slots.a, slots.b]) {
        slot.el.pause();
        this.resetSlot(slot);
      }

      if (this.ytReady && this.ytPlayer) {
        this.ytPendingId = null;
        if (autoplay) {
          this.ytPlayer.loadVideoById({ videoId, startSeconds: startAt });
        } else {
          this.ytPlayer.cueVideoById({ videoId, startSeconds: startAt });
        }
      } else {
        // Queue it: flushed from onReady (no polling interval that could
        // fire later and hijack a local track).
        this.ytPendingId = videoId;
        this.ytPendingPlay = autoplay;
        this.ytPendingStart = startAt;
        if (this.ytFailed || !this.ytInitStarted) this.initYouTube();
        else if (!this.ytH.player && window.YT?.Player) this.createYtPlayer(this.ytIdx);
      }
      return;
    }

    this.stopYt();

    const slots = this.ensureSlots();
    const current = slots[this.activeKey];
    const next = slots[this.otherKey()];

    const crossfadeActive =
      crossfadeMs >= 500 &&
      this.context !== null &&
      !current.el.paused &&
      current.el.readyState >= 2;

    if (!crossfadeActive) {
      next.el.pause();
      this.resetSlot(current);
      this.resetSlot(next);
      if (current.url && current.revokeUrl) URL.revokeObjectURL(current.url);
      current.url = source.url;
      current.revokeUrl = source.revokeUrl ?? false;
      current.el.crossOrigin = source.crossOrigin ?? "";
      current.el.src = source.url;
      current.mixRate = 1;
      this.applyRate(current);
      this.seekWhenReady(current.el, startAt);
      return;
    }

    if (next.url && next.revokeUrl) URL.revokeObjectURL(next.url);
    next.url = source.url;
    next.revokeUrl = source.revokeUrl ?? false;
    next.el.crossOrigin = source.crossOrigin ?? "";
    next.el.src = source.url;
    next.mixRate = 1;
    this.applyRate(next);
    this.resetSlot(next, 0.0001);
    this.seekWhenReady(next.el, startAt);

    const ctx = this.context!;
    const now = ctx.currentTime;
    const dur = crossfadeMs / 1000;
    next.gain!.gain.cancelScheduledValues(now);
    next.gain!.gain.setValueAtTime(0.0001, now);
    next.gain!.gain.exponentialRampToValueAtTime(1, now + dur);
    current.gain!.gain.cancelScheduledValues(now);
    current.gain!.gain.setValueAtTime(
      Math.max(0.0001, current.gain!.gain.value),
      now
    );
    current.gain!.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    void next.el.play().catch(() => void 0);
    const previousSlot = current;
    this.activeKey = this.otherKey();
    window.setTimeout(() => {
      previousSlot.el.pause();
      if (previousSlot.url && previousSlot.revokeUrl) {
        URL.revokeObjectURL(previousSlot.url);
        previousSlot.url = null;
        previousSlot.revokeUrl = false;
      }
    }, crossfadeMs + 200);
  }

  async play(): Promise<void> {
    this.init();
    if (this.ytActive) {
      if (this.ytReady && this.ytPlayer && !this.ytPendingId) {
        this.ytPlayer.playVideo();
      } else {
        this.ytPendingPlay = true;
      }
      return;
    }
    try {
      await this.el.play();
    } catch {
      void 0;
    }
  }

  pause(): void {
    // A transition cannot be paused half-way: keep the current track only.
    this.abortMix();
    if (this.ytActive) {
      this.ytPendingPlay = false;
      if (this.ytReady && this.ytPlayer) this.ytPlayer.pauseVideo();
      return;
    }
    const slots = this.ensureSlots();
    slots.a.el.pause();
    slots.b.el.pause();
  }

  seek(time: number): void {
    this.abortMix();
    if (this.ytActive) {
      if (this.ytReady && this.ytPlayer && Number.isFinite(time)) {
        this.ytPlayer.seekTo(Math.max(0, time), true);
      }
      return;
    }
    if (Number.isFinite(time)) {
      this.el.currentTime = Math.max(0, time);
    }
  }

  get currentTime(): number {
    if (this.ytActive) {
      if (!this.ytReady || !this.ytPlayer || this.ytPendingId) return 0;
      const t = this.ytPlayer.getCurrentTime?.();
      return typeof t === "number" && Number.isFinite(t) ? t : 0;
    }
    return this.el.currentTime;
  }

  get duration(): number {
    if (this.ytActive) {
      if (this.ytDuration <= 0 && this.ytReady && this.ytPlayer && !this.ytPendingId) {
        const d = this.ytPlayer.getDuration?.();
        if (typeof d === "number" && d > 0) this.ytDuration = d;
      }
      return this.ytDuration;
    }
    return this.el.duration;
  }

  /** Effective playback rate of the current source (user speed × mix). */
  get rate(): number {
    if (this.ytActive) return this.desiredRate;
    return this.desiredRate * this.slot(this.activeKey).mixRate;
  }

  get volume(): number {
    return this.desiredVolume;
  }

  set volume(value: number) {
    this.desiredVolume = value;
    if (this.masterGain) this.masterGain.gain.value = value;
    for (const h of this.yt) {
      if (h.ready && h.player) h.player.setVolume(this.ytVolumeFor(h));
    }
  }

  setRate(rate: number): void {
    this.abortMix();
    this.desiredRate = rate;
    const slots = this.ensureSlots();
    for (const key of ["a", "b"] as const) this.applyRate(slots[key]);
    for (const h of this.yt) {
      if (h.ready && h.player) h.player.setPlaybackRate(rate);
    }
  }

  /** Normalisation gain of the current track (smoothed, no click). */
  setTrackGain(multiplier: number): void {
    const slot = this.slot(this.activeKey);
    if (!slot.level || !this.context) return;
    // Wide bounds: ReplayGain on loud masters is often below -8 dB.
    const v = Math.min(4, Math.max(0.1, multiplier));
    const now = this.context.currentTime;
    slot.level.gain.cancelScheduledValues(now);
    slot.level.gain.setTargetAtTime(v, now, 0.04);
  }

  setEq(eq: { low: number; mid: number; high: number }): void {
    this.desiredEq = { ...eq };
    this.applyEq();
  }

  private applyEq(): void {
    if (!this.eqLow || !this.eqMid || !this.eqHigh) return;
    this.eqLow.gain.value = this.desiredEq.low;
    this.eqMid.gain.value = this.desiredEq.mid;
    this.eqHigh.gain.value = this.desiredEq.high;
  }

  // ---- Aurora Mix ------------------------------------------------------------

  get mixing(): boolean {
    return this.mix !== null;
  }

  /** Live transition state (progress computed now). */
  mixState(): MixRuntimeState | null {
    const m = this.mix;
    if (!m) return null;
    return {
      id: m.req.id,
      style: m.plan.style,
      sync: m.plan.sync,
      bars: m.plan.bars,
      progress: this.mixProgressNow(m),
      adopted: m.adopted,
      plan: m.plan,
    };
  }

  /** Outgoing position (outgoing track seconds). */
  private outPos(m: ActiveMix): number {
    if (m.outKind === "yt") {
      const h = this.yt[m.outYt];
      const t = h.ready && h.player ? h.player.getCurrentTime?.() : 0;
      return typeof t === "number" && Number.isFinite(t) ? t : 0;
    }
    return this.slot(m.outKey).el.currentTime;
  }

  /** Transition clock: outgoing seconds since t0 (YouTube in: since it plays). */
  private mixClock(m: ActiveMix): number {
    if (m.inKind === "yt") {
      if (!m.ytStartWall) return this.outPos(m) - m.plan.outStart - 10;
      return ((performance.now() - m.ytStartWall) / 1000) * this.desiredRate;
    }
    return this.outPos(m) - m.plan.outStart;
  }

  private mixProgressNow(m: ActiveMix): number {
    const t = this.mixClock(m);
    return Math.max(0, Math.min(1, t / Math.max(0.001, m.plan.dur)));
  }

  /**
   * Starts a planned transition (the director calls this a few seconds
   * before t0). Returns false when the engine cannot carry it.
   */
  startMix(req: MixStartRequest): boolean {
    if (this.mix || typeof window === "undefined") return false;
    this.init();
    if (!this.context) return false;
    const outKind: "local" | "yt" = this.ytActive ? "yt" : "local";
    const inKind = req.incoming.kind;
    if (outKind === "local" && this.el.paused) return false;
    if (inKind === "local" && !this.isPreloaded(req.id)) return false;
    const plan = req.plan;
    const withBassSwap = outKind === "local" && inKind === "local";
    // A bass swap needs both basslines under WebAudio control.
    const events = buildAutomation(plan).filter((e) => withBassSwap || e.param !== "low");
    const inYt = inKind === "yt" ? (outKind === "yt" ? 1 - this.ytIdx : this.ytIdx) : -1;
    if (inKind === "yt") {
      const h = this.yt[inYt];
      if (!h.ready || !h.player) {
        this.prepareYtMix();
        return false;
      }
    }
    this.stopEase();
    const m: ActiveMix = {
      req,
      plan,
      events,
      outKind,
      inKind,
      outKey: this.activeKey,
      inKey: this.otherKey(),
      outYt: outKind === "yt" ? this.ytIdx : -1,
      inYt,
      scheduled: false,
      bStarted: false,
      ytArmed: false,
      ytStartWall: 0,
      ytStartRequested: 0,
      adopted: false,
      grid: { plan, aBeats: req.aBeats ?? [], bBeats: req.bBeats ?? [] },
      sync: createSyncState(),
      timer: setInterval(() => this.mixTick(), MIX_TICK_MS),
      startedWall: performance.now(),
      progress: 0,
    };
    this.mix = m;
    if (inKind === "local") {
      this.preloadedId = null; // the preloaded slot now belongs to the mix
      const b = this.slot(m.inKey);
      const now = this.context.currentTime;
      this.resetSlot(b, 0);
      b.gain!.gain.setValueAtTime(0, now);
      b.level!.gain.cancelScheduledValues(now);
      b.level!.gain.setValueAtTime(Math.min(4, Math.max(0.1, req.inLevel ?? 1)), now);
      b.trim!.gain.setValueAtTime(Math.min(2, Math.max(0.5, req.inTrim ?? 1)), now);
      b.mixRate = (outKind === "local" ? this.slot(m.outKey).mixRate : 1) * plan.bRate;
      this.applyRate(b);
    } else {
      const h = this.yt[inYt];
      h.fade = 0;
      h.player!.setVolume(0);
      h.player!.setPlaybackRate(this.desiredRate);
      h.player!.loadVideoById({ videoId: req.incoming.videoId, startSeconds: 0 });
    }
    if (outKind === "local") {
      const a = this.slot(m.outKey);
      if (a.delay && plan.beatSec > 0) {
        a.delay.delayTime.value = Math.min(
          1.9,
          (plan.beatSec * ECHO_BEATS) / (this.desiredRate * a.mixRate)
        );
      }
      if (inKind === "local") this.scheduleLocal(m);
    }
    this.mixTick();
    return true;
  }

  /** Schedules the WebAudio automation of local slots relative to t0. */
  private scheduleLocal(m: ActiveMix, t0Override?: number): void {
    const ctx = this.context;
    if (!ctx || m.scheduled) return;
    m.scheduled = true;
    let t0: number;
    let wallRate: number;
    if (t0Override !== undefined) {
      t0 = t0Override;
      wallRate = this.desiredRate;
    } else {
      const a = this.slot(m.outKey);
      wallRate = this.desiredRate * a.mixRate;
      t0 = ctx.currentTime + (m.plan.outStart - a.el.currentTime) / wallRate;
    }
    const now = ctx.currentTime;
    const byParam = new Map<string, AutoEvent[]>();
    for (const e of m.events) {
      if ((e.slot === "out" && m.outKind !== "local") || (e.slot === "in" && m.inKind !== "local")) continue;
      const k = `${e.slot}:${e.param}`;
      const list = byParam.get(k) ?? [];
      list.push(e);
      byParam.set(k, list);
    }
    for (const [k, list] of byParam) {
      const [slotName, name] = k.split(":") as ["out" | "in", MixParam];
      const slot = this.slot(slotName === "out" ? m.outKey : m.inKey);
      const p = this.param(slot, name);
      if (!p) continue;
      list.sort((x, y) => x.at - y.at);
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      let busyUntil = now;
      for (const e of list) {
        const at = Math.max(busyUntil + 0.0005, t0 + e.at / wallRate);
        try {
          if (e.kind === "set") {
            p.setValueAtTime(e.value, at);
            busyUntil = at;
          } else if (e.kind === "curve") {
            const dur = Math.max(0.005, e.dur / wallRate);
            p.setValueCurveAtTime(Float32Array.from(e.values), at, dur);
            busyUntil = at + dur;
          } else {
            const dur = Math.max(0.005, e.dur / wallRate);
            p.setValueAtTime(e.from, at);
            if (e.kind === "exp" && e.from > 0 && e.to > 0) p.exponentialRampToValueAtTime(e.to, at + dur);
            else p.linearRampToValueAtTime(e.to, at + dur);
            busyUntil = at + dur;
          }
        } catch {
          // Overlapping automation (should not happen): jump to the end value.
          const end = e.kind === "set" ? e.value : e.kind === "curve" ? e.values[e.values.length - 1] : e.to;
          p.setValueAtTime(end, Math.max(busyUntil + 0.001, at));
        }
      }
    }
  }

  private onMixYtState(i: number, state: number): void {
    const m = this.mix;
    if (!m || m.inYt !== i) return;
    if (state === YT_PLAYING) {
      if (!m.ytArmed) {
        // Armed: paused at 0 so it can start instantly on the downbeat.
        m.ytArmed = true;
        const h = this.yt[i];
        h.player?.pauseVideo();
        h.player?.seekTo(0, true);
      } else if (m.ytStartRequested && !m.ytStartWall) {
        m.ytStartWall = performance.now();
        if (m.outKind === "local" && this.context) this.scheduleLocal(m, this.context.currentTime);
      }
    }
  }

  private mixTick(): void {
    const m = this.mix;
    if (!m || !this.context) return;
    const aPos = this.outPos(m);
    const tOut = aPos - m.plan.outStart; // outgoing seconds since t0

    // ---- Incoming start / phase lock ----------------------------------------
    if (m.inKind === "local") {
      const b = this.slot(m.inKey);
      const target = incomingTarget(m.grid, aPos);
      if (!m.bStarted) {
        if (m.outKind === "yt") {
          // YouTube out: start B on t0 and schedule its fade from now.
          if (tOut >= -0.02) {
            b.el.currentTime = Math.max(0, m.plan.inStart + Math.max(0, tOut));
            void b.el.play().catch(() => void 0);
            m.bStarted = true;
            this.scheduleLocal(m, this.context.currentTime);
          }
        } else if (target >= -0.03) {
          if (b.el.readyState >= 1) {
            b.el.currentTime = Math.max(0, target + 0.03 * m.plan.bRate);
            void b.el.play().catch(() => void 0);
            m.bStarted = true;
          }
        }
      } else if (m.outKind === "local" && !b.el.paused) {
        const inaudible = valueAt(m.events, "in", "fader", tOut) < 0.02 || tOut < 0;
        if (m.plan.sync || inaudible) {
          const out = syncStep(m.grid, m.sync, aPos, b.el.currentTime, inaudible && tOut < -0.25);
          const aRate = this.slot(m.outKey).mixRate;
          if (out.seek !== undefined) b.el.currentTime = Math.max(0, out.seek);
          const next = aRate * out.rate;
          if (Math.abs(next - b.mixRate) > 0.0004) {
            b.mixRate = next;
            this.applyRate(b);
          }
        } else if (Math.abs(b.mixRate - this.slot(m.outKey).mixRate * m.plan.bRate) > 0.0004) {
          b.mixRate = this.slot(m.outKey).mixRate * m.plan.bRate;
          this.applyRate(b);
        }
      }
      // Give up when the incoming element fails, or has not started 0.3 s
      // after it should have (echo: B enters after t0, on the cut).
      const late = m.outKind === "yt" ? tOut > 0.3 : target > 0.3;
      if ((m.bStarted && b.el.error) || (!m.bStarted && late)) {
        this.abortMix();
        return;
      }
    } else {
      // YouTube incoming: start it on t0 once armed; give up if it stalls.
      const h = this.yt[m.inYt];
      if (m.ytArmed && !m.ytStartRequested && tOut >= -0.05) {
        m.ytStartRequested = performance.now();
        h.player?.playVideo();
      }
      const waited = m.ytStartRequested ? performance.now() - m.ytStartRequested : 0;
      if ((!m.ytStartWall && waited > 4000) || (!m.ytArmed && tOut > 1.5)) {
        this.abortMix();
        return;
      }
    }

    const clock = this.mixClock(m);
    // ---- YouTube volume ramps (no WebAudio access) ---------------------------
    if (m.outKind === "yt") {
      const h = this.yt[m.outYt];
      const f = clock <= 0 ? 1 : valueAt(m.events, "out", "fader", clock);
      if (Math.abs(f - h.fade) > 0.004) {
        h.fade = f;
        h.player?.setVolume(this.ytVolumeFor(h));
      }
    }
    if (m.inKind === "yt" && m.ytStartWall) {
      const h = this.yt[m.inYt];
      const f = valueAt(m.events, "in", "fader", clock);
      if (Math.abs(f - h.fade) > 0.004) {
        h.fade = f;
        h.player?.setVolume(this.ytVolumeFor(h));
      }
    }

    m.progress = this.mixProgressNow(m);
    if (!m.adopted && clock >= m.plan.adoptAt) this.adoptInternal(m);
    if (clock >= m.plan.dur) this.finishMix(true);
  }

  /** The incoming track becomes the engine's current source. */
  private adoptInternal(m: ActiveMix): void {
    if (m.adopted) return;
    if (m.inKind === "local" && !m.bStarted) return;
    if (m.inKind === "yt" && !m.ytStartWall) return;
    m.adopted = true;
    if (m.inKind === "local") {
      this.activeKey = m.inKey;
      this.ytActive = false;
      this.ytPendingId = null;
    } else {
      this.ytIdx = m.inYt;
      this.ytActive = true;
      this.ytPendingId = null;
      this.ytDuration = this.yt[m.inYt].duration;
    }
    this.onMixAdopt?.(m.req.id);
  }

  /**
   * Called by the store when it switches to `id` (play()): true when the
   * running transition already carries that track (nothing to load).
   */
  adoptMix(id: string): boolean {
    const m = this.mix;
    if (!m || m.req.id !== id) return false;
    if (!m.adopted) this.adoptInternal(m);
    return m.adopted;
  }

  private finishMix(completed: boolean): void {
    const m = this.mix;
    if (!m) return;
    if (completed && !m.adopted) this.adoptInternal(m);
    clearInterval(m.timer);
    this.mix = null;
    const now = this.context?.currentTime ?? 0;
    const keepIn = m.adopted;
    // Outgoing side (or incoming when the transition is dropped).
    const dropLocal = keepIn ? (m.outKind === "local" ? m.outKey : null) : m.inKind === "local" ? m.inKey : null;
    const dropYt = keepIn ? (m.outKind === "yt" ? m.outYt : -1) : m.inKind === "yt" ? m.inYt : -1;
    const keepLocal = keepIn ? (m.inKind === "local" ? m.inKey : null) : m.outKind === "local" ? m.outKey : null;
    const keepYt = keepIn ? (m.inKind === "yt" ? m.inYt : -1) : m.outKind === "yt" ? m.outYt : -1;
    if (dropLocal) {
      const s = this.slot(dropLocal);
      s.el.pause();
      this.resetSlot(s);
      s.mixRate = 1;
      this.applyRate(s);
      if (s.url && s.revokeUrl) URL.revokeObjectURL(s.url);
      s.url = null;
      s.revokeUrl = false;
    }
    if (dropYt >= 0) {
      const h = this.yt[dropYt];
      if (h.ready && h.player) {
        h.player.stopVideo();
        h.fade = 1;
        h.player.setVolume(this.ytVolumeFor(h));
      }
    }
    if (keepLocal) {
      const s = this.slot(keepLocal);
      const trim = s.trim?.gain.value ?? 1;
      const level = s.level?.gain.value ?? 1;
      this.resetSlot(s, 1);
      if (s.level) {
        s.level.gain.cancelScheduledValues(now);
        s.level.gain.setValueAtTime(level, now);
      }
      if (s.trim && Math.abs(trim - 1) > 0.01) {
        // Loudness match glides back to the natural level (imperceptible).
        s.trim.gain.cancelScheduledValues(now);
        s.trim.gain.setValueAtTime(trim, now);
        s.trim.gain.setTargetAtTime(1, now + 2, 6);
      }
      // Tempo matched for the mix: glide back to the native tempo.
      if (keepIn && Math.abs(s.mixRate - 1) > 0.0005) {
        this.easeTempo(s, completed ? (m.req.easeSec ?? 12) : 3);
      }
    }
    if (keepYt >= 0) {
      const h = this.yt[keepYt];
      h.fade = 1;
      if (h.ready && h.player) h.player.setVolume(this.ytVolumeFor(h));
    }
    this.onMixEnd?.(completed);
  }

  /** Drops a running transition, keeping the current (displayed) track. */
  abortMix(): void {
    if (!this.mix) return;
    this.finishMix(false);
  }

  /** Eases a slot's tempo back to native over `seconds` (smoothstep). */
  private easeTempo(slot: Slot, seconds: number): void {
    this.stopEase();
    const from = slot.mixRate;
    const start = performance.now();
    this.easeTimer = setInterval(() => {
      const x = Math.min(1, (performance.now() - start) / (seconds * 1000));
      const s = x * x * (3 - 2 * x);
      slot.mixRate = from + (1 - from) * s;
      this.applyRate(slot);
      if (x >= 1) this.stopEase();
    }, 120);
  }

  private stopEase(): void {
    if (!this.easeTimer) return;
    clearInterval(this.easeTimer);
    this.easeTimer = null;
    for (const key of ["a", "b"] as const) {
      const s = this.slot(key);
      if (s.mixRate !== 1 && !this.mix) {
        s.mixRate = 1;
        this.applyRate(s);
      }
    }
  }

  // ---- Visual feeds ------------------------------------------------------------

  getSpectrum(target: Uint8Array): void {
    if (this.ytActive) {
      // Fake spectrum for YouTube playback
      const isPlaying = this.ytH.state === YT_PLAYING;
      const bins = target.length;
      for (let i = 0; i < bins; i++) {
        const falloff = i / bins;
        const rand = isPlaying ? Math.random() : 0;
        target[i] = (rand * 255) * (1 - falloff);
      }
      return;
    }

    if (!this.analyser || !this.context) {
      target.fill(0);
      return;
    }
    this.analyser.getByteFrequencyData(this.freqData);
    const bins = target.length;
    const srcBins = this.freqData.length;
    for (let i = 0; i < bins; i++) {
      const frac = i / bins;
      const idx = Math.min(
        srcBins - 1,
        Math.floor(Math.pow(frac, 1.5) * srcBins * 0.75)
      );
      target[i] = this.freqData[idx];
    }
  }

  bands(): { bass: number; mid: number; treble: number } {
    if (this.ytActive) {
      const isPlaying = this.ytH.state === YT_PLAYING;
      const amount = isPlaying ? 0.3 + Math.random() * 0.4 : 0;
      return { bass: amount, mid: amount * 0.8, treble: amount * 0.5 };
    }

    if (!this.analyser || !this.context) return { bass: 0, mid: 0, treble: 0 };
    this.analyser.getByteFrequencyData(this.freqData);
    const nyquist = this.context.sampleRate / 2;
    const hzPerBin = nyquist / this.freqData.length;
    const range = (from: number, to: number) => {
      const start = Math.max(1, Math.floor(from / hzPerBin));
      const end = Math.min(this.freqData.length, Math.ceil(to / hzPerBin));
      let sum = 0;
      let count = 0;
      for (let i = start; i < end; i++) {
        sum += this.freqData[i];
        count++;
      }
      return count > 0 ? sum / count / 255 : 0;
    };
    return {
      bass: range(20, 150),
      mid: range(200, 2200),
      treble: range(2400, 9500),
    };
  }
}

export const engine = new AudioEngine();
