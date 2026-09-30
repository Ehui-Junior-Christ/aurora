"use client";

import { useEffect } from "react";
import { engine } from "@/lib/audio-engine";
import { BeatDetector } from "@/lib/beat";
import { getBeatClock, usePlayer } from "@/store/player-store";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Drives `--beat` (0..1, decays after each detected beat) on every
 * `[data-beat]` element. One rAF loop while playing, no React state: the
 * value is written as an inline custom property only on the opted-in
 * elements (so only they restyle), and only when it moved noticeably.
 *
 * Sources, in order:
 *  - local files with an Aurora Mix beat grid: the analysed beat clock
 *    (phase-exact, accented downbeats);
 *  - other local files: bass-band onset detection on the analyser (lib/beat.ts);
 *  - streamed tracks with a known BPM: a tempo clock on the playback time;
 *  - streamed tracks without BPM (no analyser access): a slow breath, so the
 *    accents never fake a rhythm they cannot hear.
 */
export function useBeatPulse(): void {
  useEffect(() => {
    const detector = new BeatDetector();
    let targets: HTMLElement[] = [];
    let lastScan = -Infinity;
    let lastFrame = performance.now();
    let written = -1;
    let value = 0;
    let raf = 0;
    let running = false;
    // Streamed time only updates a few times per second: extrapolate.
    let anchorTime = -1;
    let anchorAt = 0;

    const write = (next: number) => {
      const rounded = Math.round(next * 100) / 100;
      if (rounded === written) return;
      written = rounded;
      const str = String(rounded);
      for (const el of targets) el.style.setProperty("--beat", str);
    };

    const sample = (now: number, dt: number): number => {
      const state = usePlayer.getState();
      if (!state.playing || prefersReducedMotion()) return Math.max(0, value - dt * 3);
      if (!engine.ytActive) {
        const clock = getBeatClock(state.tracks[state.current]?.id);
        if (clock && clock.confidence > 0.3) {
          // Beat grid: exact phase, downbeats slightly stronger.
          const accent = clock.barPhase < 0.25 ? 1 : 0.8;
          return accent * Math.exp(-clock.phase * 6);
        }
        const bands = engine.bands();
        detector.update(bands.bass, now / 1000, dt);
        return detector.value;
      }
      const bpm = state.tracks[state.current]?.bpm;
      if (bpm && bpm > 40 && bpm < 220) {
        const t = engine.currentTime;
        if (t !== anchorTime) {
          anchorTime = t;
          anchorAt = now;
        }
        const time = anchorTime + (now - anchorAt) / 1000;
        const period = 60 / bpm;
        const phase = (time % period) / period;
        return Math.exp(-phase * 6);
      }
      return 0.12 + 0.12 * Math.sin((now / 1000) * Math.PI * 0.5);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (now - lastScan > 600) {
        targets = Array.from(document.querySelectorAll<HTMLElement>("[data-beat]"));
        lastScan = now;
        written = -1;
      }
      value = sample(now, dt);
      write(value);
      if (!usePlayer.getState().playing && value <= 0) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    };

    if (usePlayer.getState().playing) start();
    const unsubscribe = usePlayer.subscribe((state, prev) => {
      if (state.playing && !prev.playing) start();
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      for (const el of targets) el.style.removeProperty("--beat");
    };
  }, []);
}
