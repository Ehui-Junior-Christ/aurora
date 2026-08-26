"use client";

import { useState, type ReactNode } from "react";
import { usePlayer, type VisualMode } from "@/store/player-store";
import VisualTuner from "./VisualTuner";

const MODES: { id: VisualMode; label: string; icon: ReactNode }[] = [
  {
    id: "organism",
    label: "Organisme",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "tunnel",
    label: "Tunnel",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "metaballs",
    label: "Métaballs",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <circle cx="5.5" cy="6" r="3.4" />
        <circle cx="10.5" cy="10" r="2.8" />
      </svg>
    ),
  },
  {
    id: "particles",
    label: "Particules",
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <circle cx="3" cy="4" r="1.1" />
        <circle cx="12" cy="3" r="1.1" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="3.5" cy="12" r="1.1" />
        <circle cx="13" cy="12.5" r="1.1" />
      </svg>
    ),
  },
];

export default function ModeSwitcher() {
  const mode = usePlayer((s) => s.visualMode);
  const setVisualMode = usePlayer((s) => s.setVisualMode);
  const [tunerOpen, setTunerOpen] = useState(false);

  return (
    <div className="glass fixed bottom-32 left-5 z-20 hidden items-center gap-1 rounded-full p-1 md:flex">
      {MODES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-cursor="magnetic"
          onClick={() => setVisualMode(entry.id)}
          title={entry.label}
          aria-label={`Mode visuel : ${entry.label}`}
          className={`relative grid size-9 place-items-center rounded-full transition-colors duration-300 ${
            mode === entry.id
              ? "bg-white/15 text-white"
              : "text-white/45 hover:text-white"
          }`}
        >
          {entry.icon}
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => setTunerOpen(!tunerOpen)}
          title="Réglage visuel"
          aria-label="Réglage visuel"
          className={`grid size-9 place-items-center rounded-full transition-colors duration-300 ${
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
