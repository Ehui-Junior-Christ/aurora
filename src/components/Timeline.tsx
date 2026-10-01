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

/**
 * Seek bar. Pure view: A-B looping and silence skipping live in the store,
 * keyboard seeking in useHotkeys (arrows reach it when the slider is focused).
 */
export default function Timeline({
  variant = "full",
}: {
  /** "hairline": 2px read-only progress on the mobile dock edge. */
  variant?: "full" | "hairline";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const peaksRef = useRef<number[] | null>(null);

  const hairline = variant === "hairline";
  const track = usePlayer((s) => s.tracks[s.current]);
  const trackId = track?.id ?? null;
  const abLoop = usePlayer((s) => s.abLoop);
  const duration = usePlayer((s) => s.duration);

  useEffect(() => {
    peaksRef.current = null;
    if (hairline || !trackId || !track?.file || track.isOnline) return;
    void getCachedAnalysis(trackId, track.file).then((analysis) => {
      if (analysis) peaksRef.current = analysis.peaks;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, hairline]);

  useEffect(() => {
    if (hairline) return;
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
  }, [trackId, hairline]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const total = Number.isFinite(engine.duration) ? engine.duration : 0;
      const currentTime = engine.currentTime;
      if (!draggingRef.current) {
        const pct = total > 0 ? currentTime / total : 0;
        if (hairline) {
          if (fillRef.current) fillRef.current.style.transform = `scaleX(${pct})`;
        } else {
          if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
          if (knobRef.current) knobRef.current.style.left = `${pct * 100}%`;
          if (curRef.current) curRef.current.textContent = formatTime(currentTime);
          const wrap = wrapRef.current;
          if (wrap) {
            wrap.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
            wrap.setAttribute(
              "aria-valuetext",
              `${formatTime(currentTime)} sur ${formatTime(total)}`
            );
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hairline]);

  if (hairline) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-white/10"
      >
        <div
          ref={fillRef}
          className="h-full origin-left"
          style={{
            transform: "scaleX(0)",
            background: "linear-gradient(90deg, var(--c1), var(--c2), var(--c3))",
            boxShadow: "0 0 8px color-mix(in srgb, var(--c2) 60%, transparent)",
          }}
        />
      </div>
    );
  }

  const applyPct = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
    if (knobRef.current) knobRef.current.style.left = `${pct * 100}%`;
    const total = engine.duration;
    if (Number.isFinite(total) && total > 0) {
      usePlayer.getState().seek(pct * total);
    }
  };

  const loopA = abLoop.a;
  const loopB = abLoop.b;
  const pctOf = (t: number) => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
  const abLabel =
    loopA !== null && loopB !== null
      ? `A-B ${formatTime(loopA)} → ${formatTime(loopB)}`
      : loopA !== null
        ? `A ${formatTime(loopA)} — B ?`
        : "";

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
        tabIndex={0}
        className={styles["track-wrap"]}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          applyPct(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) applyPct(event.clientX);
          const wrap = wrapRef.current;
          const hover = hoverRef.current;
          if (!wrap || !hover || event.pointerType === "touch") return;
          const rect = wrap.getBoundingClientRect();
          const pct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
          hover.style.left = `${pct * 100}%`;
          const total = engine.duration;
          hover.textContent =
            Number.isFinite(total) && total > 0 ? formatTime(pct * total) : "";
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
          {loopA !== null && (
            <div
              aria-hidden
              className="absolute -inset-y-1 rounded-full bg-[var(--c2)]/25"
              style={{
                left: `${pctOf(loopA)}%`,
                width: loopB !== null ? `${pctOf(loopB) - pctOf(loopA)}%` : "2px",
              }}
            />
          )}
          <div ref={fillRef} className={styles.fill} />
          <div ref={knobRef} className={styles.knob} />
        </div>
        <div
          ref={hoverRef}
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md border border-white/10 bg-black/80 px-1.5 py-0.5 font-mono text-micro text-white/80 opacity-0 transition-opacity"
        />
        {abLabel && (
          <span className="pointer-events-none absolute -top-5 right-0 font-mono text-micro tracking-widest text-[var(--c2)]">
            {abLabel}
          </span>
        )}
      </div>
      <span className={styles.times}>{formatTime(duration)}</span>
    </div>
  );
}
