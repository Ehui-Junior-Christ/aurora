interface Slot {
  el: HTMLAudioElement;
  gain: GainNode | null;
  url: string | null;
  revokeUrl: boolean;
}

export interface AudioSource {
  url: string;
  crossOrigin?: "" | "anonymous";
  revokeUrl?: boolean;
}

/** Minimal typing of the YouTube IFrame Player API surface we use. */
interface YTPlayer {
  loadVideoById(videoId: string): void;
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

/** YouTube IFrame player states. */
const YT_PLAYING = 1;
const YT_BUFFERING = 3;
/** Custom error code used when the IFrame API script itself cannot load. */
export const YT_API_UNAVAILABLE = -1;
const YT_API_TIMEOUT = 15000;

class AudioEngine {
  private slots: Record<"a" | "b", Slot> | null = null;
  private activeKey: "a" | "b" = "a";
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private eqLow: BiquadFilterNode | null = null;
  private eqMid: BiquadFilterNode | null = null;
  private eqHigh: BiquadFilterNode | null = null;
  private trackGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private desiredVolume = 0.85;
  private desiredEq = { low: 0, mid: 0, high: 0 };
  private desiredRate = 1;
  private freqData = new Uint8Array(1024);

  // YouTube IFrame Player
  private ytPlayer: YTPlayer | null = null;
  private ytReady = false;
  private ytInitStarted = false;
  private ytFailed = false;
  private ytPendingId: string | null = null;
  private ytPendingPlay = false;
  private ytState = -1;
  private ytLoadTimer: ReturnType<typeof setTimeout> | null = null;
  public ytActive = false;
  private ytDuration = 0;
  public onYtStateChange?: (state: number) => void;
  public onYtError?: (error: number) => void;

  constructor() {
    this.initYouTube();
  }

  private initYouTube() {
    if (typeof window === "undefined" || this.ytInitStarted) return;
    this.ytInitStarted = true;
    this.ytFailed = false;

    let host = document.getElementById("aurora-yt-player");
    if (!host) {
      host = document.createElement("div");
      host.id = "aurora-yt-player";
      host.style.position = "absolute";
      host.style.left = "-9999px";
      host.style.top = "-9999px";
      host.style.width = "300px";
      host.style.height = "300px";
      host.style.opacity = "0.01";
      host.style.pointerEvents = "none";
      document.body.appendChild(host);
    }

    const create = () => {
      if (this.ytPlayer || !window.YT?.Player) return;
      if (this.ytLoadTimer) {
        clearTimeout(this.ytLoadTimer);
        this.ytLoadTimer = null;
      }
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
      this.ytPlayer = new window.YT.Player("aurora-yt-player", {
        height: "300",
        width: "300",
        playerVars,
        events: {
          onReady: () => {
            this.ytReady = true;
            this.ytPlayer?.setVolume(this.desiredVolume * 100);
            this.ytPlayer?.setPlaybackRate(this.desiredRate);
            this.flushPendingYt();
          },
          onStateChange: (event) => {
            this.ytState = event.data;
            if (event.data === YT_PLAYING || event.data === YT_BUFFERING) {
              const d = this.ytPlayer?.getDuration() ?? 0;
              if (d > 0) this.ytDuration = d;
            }
            // Ignore late events from the hidden player once a local track
            // took over (stopVideo() emits state changes too).
            if (!this.ytActive) return;
            this.onYtStateChange?.(event.data);
          },
          onError: (event) => {
            if (!this.ytActive) return;
            this.onYtError?.(event.data);
          },
        },
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
      if (this.ytPlayer) return;
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

  private flushPendingYt(): void {
    if (!this.ytReady || !this.ytPlayer || !this.ytActive) return;
    const id = this.ytPendingId;
    if (id) {
      this.ytPendingId = null;
      this.ytPlayer.loadVideoById(id);
      if (!this.ytPendingPlay) this.ytPlayer.pauseVideo();
    } else if (this.ytPendingPlay) {
      this.ytPlayer.playVideo();
    }
    this.ytPendingPlay = false;
  }

  private stopYt(): void {
    this.ytActive = false;
    this.ytPendingId = null;
    this.ytPendingPlay = false;
    this.ytDuration = 0;
    if (this.ytReady && this.ytPlayer) this.ytPlayer.stopVideo();
  }

  /** True when nothing is currently playing (local element or YouTube). */
  get paused(): boolean {
    if (this.ytActive) {
      if (this.ytPendingId) return !this.ytPendingPlay;
      return this.ytState !== YT_PLAYING && this.ytState !== YT_BUFFERING;
    }
    return this.el.paused;
  }

  private ensureSlots(): Record<"a" | "b", Slot> {
    if (!this.slots) {
      const make = (): Slot => {
        const el = new Audio();
        el.preload = "auto";
        return { el, gain: null, url: null, revokeUrl: false };
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

  init(): void {
    if (typeof window === "undefined") return;
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
      this.eqLow = this.context.createBiquadFilter();
      this.eqLow.type = "lowshelf";
      this.eqLow.frequency.value = 200;
      this.eqMid = this.context.createBiquadFilter();
      this.eqMid.type = "peaking";
      this.eqMid.frequency.value = 1000;
      this.eqMid.Q.value = 1;
      this.eqHigh = this.context.createBiquadFilter();
      this.eqHigh.type = "highshelf";
      this.eqHigh.frequency.value = 4000;
      this.trackGain = this.context.createGain();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.desiredVolume;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;

      this.eqLow.connect(this.eqMid);
      this.eqMid.connect(this.eqHigh);
      this.eqHigh.connect(this.trackGain);
      this.trackGain.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

      const slots = this.ensureSlots();
      for (const key of ["a", "b"] as const) {
        const slot = slots[key];
        const source = this.context.createMediaElementSource(slot.el);
        slot.gain = this.context.createGain();
        source.connect(slot.gain);
        slot.gain.connect(this.eqLow);
        slot.el.playbackRate = this.desiredRate;
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

  load(file: File, crossfadeMs = 0): void {
    this.stopYt();
    this.loadSource({ url: URL.createObjectURL(file), revokeUrl: true }, crossfadeMs);
  }

  loadSource(source: AudioSource, crossfadeMs = 0): void {
    if (source.url.startsWith("yt:")) {
      // Strip every legacy prefix (`yt:yt:<id>` was stored by older builds).
      const videoId = source.url.replace(/^(?:yt:|online_)+/, "");
      this.ytActive = true;
      this.ytDuration = 0;
      this.ytState = -1;
      const slots = this.ensureSlots();
      for (const slot of [slots.a, slots.b]) {
        slot.el.pause();
        slot.gain?.gain.cancelScheduledValues(this.context?.currentTime ?? 0);
        if (slot.gain) slot.gain.gain.value = 1;
      }

      if (this.ytReady && this.ytPlayer) {
        this.ytPendingId = null;
        this.ytPlayer.loadVideoById(videoId);
      } else {
        // Queue it: flushed from onReady (no polling interval that could
        // fire later and hijack a local track).
        this.ytPendingId = videoId;
        this.ytPendingPlay = true;
        if (this.ytFailed || !this.ytInitStarted) this.initYouTube();
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
      current.gain?.gain.cancelScheduledValues(this.context?.currentTime ?? 0);
      if (current.gain) current.gain.gain.value = 1;
      if (next.gain) next.gain.gain.value = 1;
      if (current.url && current.revokeUrl) URL.revokeObjectURL(current.url);
      current.url = source.url;
      current.revokeUrl = source.revokeUrl ?? false;
      current.el.crossOrigin = source.crossOrigin ?? "";
      current.el.src = source.url;
      current.el.playbackRate = this.desiredRate;
      return;
    }

    if (next.url && next.revokeUrl) URL.revokeObjectURL(next.url);
    next.url = source.url;
    next.revokeUrl = source.revokeUrl ?? false;
    next.el.crossOrigin = source.crossOrigin ?? "";
    next.el.src = source.url;
    next.el.playbackRate = this.desiredRate;

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

  get volume(): number {
    return this.desiredVolume;
  }

  set volume(value: number) {
    this.desiredVolume = value;
    if (this.masterGain) this.masterGain.gain.value = value;
    if (this.ytReady && this.ytPlayer) {
      this.ytPlayer.setVolume(value * 100);
    }
  }

  setRate(rate: number): void {
    this.desiredRate = rate;
    const slots = this.ensureSlots();
    for (const key of ["a", "b"] as const) {
      slots[key].el.playbackRate = rate;
    }
    if (this.ytReady && this.ytPlayer) {
      this.ytPlayer.setPlaybackRate(rate);
    }
  }

  setTrackGain(multiplier: number): void {
    if (this.trackGain) {
      this.trackGain.gain.value = Math.min(3, Math.max(0.4, multiplier));
    }
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

  getSpectrum(target: Uint8Array): void {
    if (this.ytActive) {
      // Fake spectrum for YouTube playback
      const isPlaying = this.ytState === YT_PLAYING;
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
      const isPlaying = this.ytState === YT_PLAYING;
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
