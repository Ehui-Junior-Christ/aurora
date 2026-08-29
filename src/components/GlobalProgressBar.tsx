"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function GlobalProgressBar() {
  const fillRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const durRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasTracks = usePlayer((s) => s.tracks.length > 0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const duration = Number.isFinite(engine.duration) ? engine.duration : 0;
      const pct = duration > 0 ? engine.currentTime / duration : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
      if (curRef.current) curRef.current.textContent = formatTime(engine.currentTime);
      if (durRef.current) durRef.current.textContent = formatTime(duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!hasTracks) return null;

  const applyPct = (clientX: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (fillRef.current) fillRef.current.style.width = `${pct * 100}%`;
    const duration = engine.duration;
    if (Number.isFinite(duration)) {
      usePlayer.getState().seek(pct * duration);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 h-[calc(16px+env(safe-area-inset-bottom))] select-none">
      <span
        ref={curRef}
        className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[9px] tabular-nums tracking-wider text-white/45"
      >
        0:00
      </span>
      <div
        ref={wrapRef}
        data-cursor="stretch"
        aria-label="Progression du morceau"
        className="absolute inset-x-8 bottom-1.5 h-[5px]"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          applyPct(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) applyPct(event.clientX);
        }}
      >
        <div className="absolute inset-0 rounded-full bg-white/10" />
        <div
          ref={fillRef}
          className="absolute inset-y-0 left-0 w-0 rounded-full"
          style={{
            background: "linear-gradient(90deg, var(--c1), var(--c2), var(--c3))",
            boxShadow: "0 0 10px color-mix(in srgb, var(--c2) 55%, transparent)",
          }}
        />
      </div>
      <span
        ref={durRef}
        className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] tabular-nums tracking-wider text-white/45"
      >
        0:00
      </span>
    </div>
  );
}
