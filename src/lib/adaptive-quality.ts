/**
 * Adaptive rendering quality (pure logic, no React / three.js).
 * Feed frame deltas; it returns decisions with hysteresis: degrade quickly
 * when FPS is low, recover slowly when FPS stays comfortably high.
 */

/** Device pixel ratios from best to cheapest. */
export const DPR_LADDER = [2, 1.5, 1.25, 1] as const;
/** From this ladder step on, expensive effects (bloom…) are disabled. */
export const LOW_QUALITY_STEP = 2;

export interface QualityDecision {
  dpr: number;
  qualityLow: boolean;
  step: number;
}

export interface AdaptiveQualityOptions {
  /** Degrade below this FPS. */
  lowFps?: number;
  /** Recover above this FPS (sustained). */
  highFps?: number;
  /** Seconds per measurement window. */
  window?: number;
  /** Windows to wait after a change before another one. */
  cooldownWindows?: number;
  /** Consecutive good windows required to step back up. */
  recoverWindows?: number;
  /** Initial ladder step (see initialQualityStep). */
  initialStep?: number;
  /** Cap: never go above this quality (e.g. reduced motion / save-data). */
  minStep?: number;
}

export interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  reducedMotion?: boolean;
  coarsePointer?: boolean;
  devicePixelRatio?: number;
}

export function readDeviceHints(): DeviceHints {
  if (typeof window === "undefined") return {};
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return {
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData === true,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches,
    devicePixelRatio: window.devicePixelRatio,
  };
}

/** Starting step so weak devices do not first render a janky frame burst. */
export function initialQualityStep(h: DeviceHints = readDeviceHints()): number {
  let step = 0;
  if ((h.deviceMemory ?? 8) <= 2 || (h.hardwareConcurrency ?? 8) <= 2) step = 3;
  else if ((h.deviceMemory ?? 8) <= 4 || (h.hardwareConcurrency ?? 8) <= 4) step = 1;
  if (h.coarsePointer && (h.devicePixelRatio ?? 1) > 2) step = Math.max(step, 1);
  if (h.saveData || h.reducedMotion) step = Math.max(step, LOW_QUALITY_STEP);
  return Math.min(step, DPR_LADDER.length - 1);
}

export class AdaptiveQuality {
  private t = 0;
  private frames = 0;
  private cooldown = 0;
  private good = 0;
  private recoverNeeded: number;
  private recovered = false;
  step: number;
  private readonly o: Required<AdaptiveQualityOptions>;

  constructor(options: AdaptiveQualityOptions = {}) {
    this.o = {
      lowFps: 45,
      highFps: 57,
      window: 2,
      cooldownWindows: 4,
      recoverWindows: 5,
      initialStep: 0,
      minStep: 0,
      ...options,
    };
    this.step = Math.max(this.o.minStep, Math.min(DPR_LADDER.length - 1, this.o.initialStep));
    this.recoverNeeded = this.o.recoverWindows;
  }

  current(): QualityDecision {
    return {
      dpr: DPR_LADDER[this.step],
      qualityLow: this.step >= LOW_QUALITY_STEP,
      step: this.step,
    };
  }

  /**
   * Adds a frame. Returns a decision only when the quality level changes.
   * Deltas above 0.5 s (tab hidden, breakpoint) are ignored.
   */
  sample(delta: number): QualityDecision | null {
    if (!(delta > 0) || delta > 0.5) return null;
    this.t += delta;
    this.frames += 1;
    if (this.t < this.o.window) return null;
    const fps = this.frames / this.t;
    this.t = 0;
    this.frames = 0;
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return null;
    }
    if (fps < this.o.lowFps && this.step < DPR_LADDER.length - 1) {
      this.step += 1;
      this.good = 0;
      this.cooldown = this.o.cooldownWindows;
      // Dropped again right after recovering: be more patient next time
      // (avoids oscillating between two levels).
      if (this.recovered) this.recoverNeeded = Math.min(60, this.recoverNeeded * 2);
      this.recovered = false;
      return this.current();
    }
    if (fps > this.o.highFps && this.step > this.o.minStep) {
      this.good += 1;
      if (this.good >= this.recoverNeeded) {
        this.step -= 1;
        this.recovered = true;
        this.good = 0;
        this.cooldown = this.o.cooldownWindows;
        return this.current();
      }
    } else {
      this.good = 0;
    }
    return null;
  }
}
