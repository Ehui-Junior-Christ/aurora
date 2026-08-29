"use client";

import { useState, type ReactNode } from "react";
import { usePlayer, MODE_KEYS } from "@/store/player-store";
import VisualTuner from "./VisualTuner";

const ICONS: Record<string, ReactNode> = {
  organism: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  ),
  tunnel: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  metaballs: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="5.5" cy="6" r="3.4" />
      <circle cx="10.5" cy="10" r="2.8" />
    </svg>
  ),
  particles: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="4" r="1.1" />
      <circle cx="12" cy="3" r="1.1" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="3.5" cy="12" r="1.1" />
      <circle cx="13" cy="12.5" r="1.1" />
    </svg>
  ),
  galaxy: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 8c0-3 2.5-4.5 5-3.5M8 8c0 3-2.5 4.5-5 3.5M8 8c3 0 4.5 2.5 3.5 5M8 8c-3 0-4.5-2.5-3.5-5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  ),
  nebula: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 10.5a3 3 0 0 1 .6-5.9 3.6 3.6 0 0 1 6.9.9A2.6 2.6 0 0 1 11 10.5H4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  waves: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
};

const LABELS: Record<string, string> = {
  organism: "Organisme",
  tunnel: "Tunnel",
  metaballs: "Métaballs",
  particles: "Particules",
  galaxy: "Galaxie",
  nebula: "Nébuleuse",
  waves: "Ondes",
};

export default function ModeSwitcher({ lyricsOpen }: { lyricsOpen?: boolean }) {
  const mode = usePlayer((s) => s.visualMode);
  const setVisualMode = usePlayer((s) => s.setVisualMode);
  const autoMode = usePlayer((s) => s.autoMode);
  const setAutoMode = usePlayer((s) => s.setAutoMode);
  const [tunerOpen, setTunerOpen] = useState(false);

  return (
    <div className={`glass fixed bottom-[calc(11.5rem+env(safe-area-inset-bottom))] left-2 z-[45] flex items-center gap-0.5 rounded-full p-1 md:bottom-32 md:left-5 md:gap-1 transition-opacity duration-300 ${lyricsOpen ? 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto' : 'opacity-100'}`}>
      <button
        type="button"
        data-cursor="magnetic"
        onClick={() => setAutoMode(!autoMode)}
        title="Mode automatique — un visuel par morceau"
        aria-label="Mode automatique"
        className={`relative grid size-8 place-items-center rounded-full text-[9px] font-extrabold tracking-wider transition-colors duration-300 md:size-9 ${
          autoMode
            ? "bg-[var(--c3)]/25 text-[var(--c3)]"
            : "text-white/40 hover:text-white"
        }`}
      >
        AUTO
      </button>
      <span className="mx-0.5 h-4 w-px bg-white/15" />
      {MODE_KEYS.map((entry) => (
        <button
          key={entry}
          type="button"
          data-cursor="magnetic"
          onClick={() => setVisualMode(entry)}
          title={LABELS[entry]}
          aria-label={`Mode visuel : ${LABELS[entry]}`}
          className={`relative grid size-8 place-items-center rounded-full transition-colors duration-300 md:size-9 ${
            !autoMode && mode === entry
              ? "bg-white/15 text-white"
              : autoMode
                ? "text-white/30 hover:text-white"
                : "text-white/45 hover:text-white"
          }`}
        >
          {ICONS[entry]}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-white/15" />
      <div className="relative">
        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => setTunerOpen(!tunerOpen)}
          title="Réglage visuel"
          aria-label="Réglage visuel"
          className={`grid size-8 place-items-center rounded-full transition-colors duration-300 md:size-9 ${
            tunerOpen ? "text-white" : "text-white/40 hover:text-white"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {tunerOpen && <VisualTuner onClose={() => setTunerOpen(false)} />}
      </div>
    </div>
  );
}
