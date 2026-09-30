"use client";

import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/audio-engine";
import { currentCueIndex } from "@/lib/lyrics";
import { usePlayer } from "@/store/player-store";

export default function LyricsPanel() {
  const lyrics = usePlayer((s) => s.lyrics);
  const available = usePlayer((s) => s.lyricsAvailable);
  const trackId = usePlayer((s) => s.tracks[s.current]?.id);
  const isOnline = trackId?.startsWith("yt:");
  const offset = usePlayer((s) => s.lyricsOffset);
  const setOffset = usePlayer((s) => s.setLyricsOffset);
  const [time, setTime] = useState(0);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!available) return;
    const interval = setInterval(() => {
      setTime(engine.currentTime);
    }, 100);
    return () => window.clearInterval(interval);
  }, [available, trackId]);

  const activeIndex = currentCueIndex(lyrics, time - offset);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (!available || lyrics.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Paroles synchronisées"
      data-panel
      data-lenis-prevent
      className="glass fixed inset-x-3 top-20 bottom-[calc(var(--dock-h)+var(--space-4)+var(--safe-b))] z-(--z-panel) overflow-y-auto rounded-2xl px-6 py-6 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:left-auto sm:right-4 sm:w-[min(380px,calc(100vw-2rem))] md:right-6 md:top-24 opacity-100 translate-x-0"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-micro uppercase tracking-[0.4em] text-ink-2">
          paroles
        </p>
        
        {isOnline && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-micro text-white/60">
            <button type="button" onClick={() => setOffset(offset - 0.5)} className="hover:text-white transition-colors" title="Avancer les paroles" aria-label="Avancer les paroles de 0,5 seconde">-0.5s</button>
            <span className="w-8 text-center text-white/80" aria-live="polite" aria-label={`Décalage des paroles : ${offset.toFixed(1)} secondes`}>{offset > 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1)}s</span>
            <button type="button" onClick={() => setOffset(offset + 0.5)} className="hover:text-white transition-colors" title="Retarder les paroles" aria-label="Retarder les paroles de 0,5 seconde">+0.5s</button>
          </div>
        )}
      </div>

      {lyrics.map((cue, index) => {
        const active = index === activeIndex;
        return (
          <p
            key={`${cue.time}-${index}`}
            ref={active ? activeRef : null}
            className={`py-1 text-sm leading-snug transition-all duration-300 ${
              active
                ? "font-semibold text-white"
                : index < activeIndex
                  ? "text-ink-3"
                  : "text-ink-2"
            }`}
          >
            {cue.text}
          </p>
        );
      })}
    </div>
  );
}
