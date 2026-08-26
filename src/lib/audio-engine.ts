interface Slot {
  el: HTMLAudioElement;
  gain: GainNode | null;
  url: string | null;
}

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

  private ensureSlots(): Record<"a" | "b", Slot> {
    if (!this.slots) {
      const make = (): Slot => {
        const el = new Audio();
        el.preload = "auto";
        return { el, gain: null, url: null };
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
    const slots = this.ensureSlots();
    const current = slots[this.activeKey];
    const next = slots[this.otherKey()];
    const url = URL.createObjectURL(file);

    const crossfadeActive =
      crossfadeMs >= 500 &&
      this.context !== null &&
      !current.el.paused &&
      current.el.readyState >= 2;

    if (!crossfadeActive) {
      next.el.pause();
      if (current.url) URL.revokeObjectURL(current.url);
      current.url = url;
      current.el.src = url;
      current.el.playbackRate = this.desiredRate;
      return;
    }

    if (next.url) URL.revokeObjectURL(next.url);
    next.url = url;
    next.el.src = url;
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
    }, crossfadeMs + 200);
  }

  async play(): Promise<void> {
    this.init();
    try {
      await this.el.play();
    } catch {
      void 0;
    }
  }

  pause(): void {
    const slots = this.ensureSlots();
    slots.a.el.pause();
    slots.b.el.pause();
  }

  seek(time: number): void {
    if (Number.isFinite(time)) {
      this.el.currentTime = Math.max(0, time);
    }
  }

  get volume(): number {
    return this.desiredVolume;
  }

  set volume(value: number) {
    this.desiredVolume = value;
    if (this.masterGain) this.masterGain.gain.value = value;
  }

  setRate(rate: number): void {
    this.desiredRate = rate;
    const slots = this.ensureSlots();
    for (const key of ["a", "b"] as const) {
      slots[key].el.playbackRate = rate;
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

  bands(): { bass: number; mid: number; treble: number } {
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
