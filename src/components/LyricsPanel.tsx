"use client";

import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/audio-engine";
import { currentCueIndex } from "@/lib/lyrics";
import { usePlayer } from "@/store/player-store";

export default function LyricsPanel() {
  const lyrics = usePlayer((s) => s.lyrics);
  const available = usePlayer((s) => s.lyricsAvailable);
  const trackId = usePlayer((s) => s.tracks[s.current]?.id);
  const [time, setTime] = useState(0);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!available) return;
    const interval = window.setInterval(() => {
      setTime(engine.el.currentTime);
    }, 200);
    return () => window.clearInterval(interval);
  }, [available, trackId]);

  const activeIndex = currentCueIndex(lyrics, time);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (!available || lyrics.length === 0) return null;

  return (
    <div className="glass fade-in-up fixed bottom-32 left-5 z-30 max-h-[42vh] w-[min(400px,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl px-5 py-4 md:bottom-36">
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-white/35">
        paroles
      </p>
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
