"use client";

import { useEffect, useRef } from "react";
import { engine } from "@/lib/audio-engine";

/**
 * Ambient 2px progress line, only visible in immersive mode when the dock
 * (and its full timeline) is hidden. Purely decorative: the dock owns seeking.
 */
export default function GlobalProgressBar({ immersive }: { immersive: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!immersive) return;
    let raf = 0;
    const loop = () => {
      const duration = Number.isFinite(engine.duration) ? engine.duration : 0;
      const pct = duration > 0 ? engine.currentTime / duration : 0;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${pct})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [immersive]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-(--z-dock) h-0.5 transition-opacity duration-(--dur-5) ${
        immersive ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-white/[0.06]" />
      <div
        ref={fillRef}
        className="absolute inset-0 origin-left"
        style={{
          transform: "scaleX(0)",
          background: "linear-gradient(90deg, var(--c1), var(--c2), var(--c3))",
          boxShadow: "0 0 10px color-mix(in srgb, var(--c2) 55%, transparent)",
        }}
      />
    </div>
  );
}
