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

  const queueOpen = usePlayer((s) => s.queueOpen);

  if (!available || lyrics.length === 0) return null;

  return (
    <div
      className="glass fixed inset-x-3 top-20 bottom-[calc(10.5rem+env(safe-area-inset-bottom))] z-40 overflow-y-auto rounded-2xl px-6 py-6 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:left-auto sm:right-4 sm:w-[min(380px,calc(100vw-2rem))] md:right-6 md:top-24 md:bottom-36 opacity-100 translate-x-0"
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/35">
          paroles
        </p>
        
        {isOnline && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[9px] text-white/60">
            <button onClick={() => setOffset(offset - 0.5)} className="hover:text-white transition-colors" title="Avancer les paroles">-0.5s</button>
            <span className="w-8 text-center text-white/80">{offset > 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1)}s</span>
            <button onClick={() => setOffset(offset + 0.5)} className="hover:text-white transition-colors" title="Retarder les paroles">+0.5s</button>
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
                  ? "text-white/25"
                  : "text-white/45"
            }`}
          >
            {cue.text}
          </p>
        );
      })}
    </div>
  );
}
