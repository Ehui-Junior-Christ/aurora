"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/audio-engine";
import { getCachedAnalysis } from "@/lib/analysis";
import { usePlayer } from "@/store/player-store";
import styles from "./PlayerBar.module.css";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Timeline() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const abRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const peaksRef = useRef<number[] | null>(null);
  const loopRef = useRef<{ a: number | null; b: number | null }>({
    a: null,
    b: null,
  });
  const silenceRef = useRef<number | null>(null);

  const track = usePlayer((s) => s.tracks[s.current]);
  const trackId = track?.id ?? null;

  useEffect(() => {
    peaksRef.current = null;
    if (!trackId || !track?.file || track.isOnline) return;
    void getCachedAnalysis(trackId, track.file).then((analysis) => {
      if (analysis) peaksRef.current = analysis.peaks;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = 22;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const peaks = peaksRef.current;
      if (!peaks || peaks.length === 0) return;
      const style = getComputedStyle(document.documentElement);
      const c1 = style.getPropertyValue("--c1").trim() || "#6d4dff";
      const c3 = style.getPropertyValue("--c3").trim() || "#ff4ecd";
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, c1);
      gradient.addColorStop(1, c3);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.32;
      const barW = canvas.width / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const barH = Math.max(2 * dpr, peaks[i] * canvas.height * 0.92);
        ctx.fillRect(i * barW, (canvas.height - barH) / 2, Math.max(1, barW - dpr), barH);
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (wrapRef.current) observer.observe(wrapRef.current);
    const interval = window.setInterval(draw, 1500);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [trackId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      if (event.key !== "b" && event.key !== "B") return;
      const loop = loopRef.current;
      const now = engine.currentTime;
      if (loop.a === null) {
        loop.a = now;
        loop.b = null;
      } else if (loop.b === null) {
        if (now > loop.a) loop.b = now;
        else loop.a = now;
      } else {
        loop.a = null;
        loop.b = null;
      }
      if (abRef.current) {
        abRef.current.textContent =
          loop.a !== null && loop.b !== null
            ? `A-B ${formatTime(loop.a)} → ${formatTime(loop.b)}`
            : loop.a !== null
              ? `A ${formatTime(loop.a)} — (B ?)`
              : "";
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = engine.el;
      const duration = Number.isFinite(engine.duration) ? engine.duration : 0;
      const currentTime = engine.currentTime;
      const state = usePlayer.getState();
      const loopAB = loopRef.current;
      if (!draggingRef.current) {
        const pct = duration > 0 ? currentTime / duration : 0;
        if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
        if (knobRef.current) knobRef.current.style.left = `${pct * 100}%`;
        if (curRef.current)
          curRef.current.textContent = formatTime(currentTime);
        wrapRef.current?.setAttribute(
          "aria-valuenow",
          String(Math.round(pct * 100))
        );
      }
      if (
        loopAB.a !== null &&
        loopAB.b !== null &&
        currentTime >= loopAB.b
      ) {
        engine.seek(loopAB.a);
      }
      if (state.skipSilence && state.playing) {
        const b = engine.bands();
        const energy = b.bass + b.mid + b.treble;
        const now = performance.now();
        if (energy < 0.02) {
          if (silenceRef.current === null) silenceRef.current = now;
          else if (now - silenceRef.current > 2600 && duration > 0) {
            engine.seek(Math.min(currentTime + 6, duration - 0.5));
            silenceRef.current = null;
          }
        } else {
          silenceRef.current = null;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const applyPct = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
    if (knobRef.current) knobRef.current.style.left = `${pct * 100}%`;
    const duration = engine.el.duration;
    if (Number.isFinite(duration)) {
      usePlayer.getState().seek(pct * duration);
    }
  };

  return (
    <div className={styles.timeline} data-cursor="stretch">
      <span ref={curRef} className={styles.times}>
        0:00
      </span>
      <div
        ref={wrapRef}
        role="slider"
        aria-label="Position de lecture"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        tabIndex={-1}
        className={styles.trackWrap}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          applyPct(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) applyPct(event.clientX);
          const wrap = wrapRef.current;
          const hover = hoverRef.current;
          if (!wrap || !hover) return;
          const rect = wrap.getBoundingClientRect();
          const pct = Math.min(
            1,
            Math.max(0, (event.clientX - rect.left) / rect.width)
          );
          hover.style.left = `${pct * 100}%`;
          const duration = engine.el.duration;
          hover.textContent =
            Number.isFinite(duration) ? formatTime(pct * duration) : "";
          hover.style.opacity = "1";
        }}
        onPointerLeave={() => {
          if (hoverRef.current) hoverRef.current.style.opacity = "0";
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2" />
        <div className={styles.rail}>
          <div ref={fillRef} className={styles.fill} />
          <div ref={knobRef} className={styles.knob} />
        </div>
        <div
          ref={hoverRef}
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border border-white/10 bg-black/80 px-1.5 py-0.5 font-mono text-[9px] text-white/80 opacity-0 transition-opacity"
        />
        <span
          ref={abRef}
          className="pointer-events-none absolute -top-5 right-0 font-mono text-[9px] tracking-widest text-[var(--c2)]"
        />
      </div>
      <DurationLabel />
    </div>
  );
}

function DurationLabel() {
  const duration = usePlayer((s) => s.duration);
  return <span className={styles.times}>{formatTime(duration)}</span>;
}
