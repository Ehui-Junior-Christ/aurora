"use client";

import { usePlayer } from "@/store/player-store";

export default function VisualTuner({ onClose }: { onClose: () => void }) {
  const preset = usePlayer((s) => s.visualPreset);
  const setVisualPreset = usePlayer((s) => s.setVisualPreset);
  const resetVisualPreset = usePlayer((s) => s.resetVisualPreset);

  const knobs = [
    { key: "freq", label: "Fréquence" },
    { key: "speed", label: "Vitesse" },
    { key: "amp", label: "Amplitude" },
  ] as const;

  return (
    <div className="glass-strong absolute bottom-full right-0 md:left-0 md:right-auto z-40 mb-3 w-64 rounded-2xl p-4 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/50">
          Réglage visuel
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le réglage visuel"
          className="text-white/40 transition-colors hover:text-white"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
            <path
              d="m1 1 10 10M11 1 1 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-white/35">
        Multiplicateurs appliqués à l’organisme de cette piste.
      </p>
      {knobs.map((knob) => (
        <div key={knob.key} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/45">
            <span>{knob.label}</span>
            <span className="tabular-nums text-white/70">
              ×{preset[knob.key].toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={preset[knob.key]}
            onChange={(event) =>
              setVisualPreset({
                ...preset,
                [knob.key]: Number(event.target.value),
              })
            }
            aria-label={`${knob.label} du visuel`}
            className="w-full"
            style={{ accentColor: "var(--c3)" }}
          />
        </div>
      ))}
      <button
        type="button"
        data-cursor="magnetic"
        onClick={resetVisualPreset}
        className="mt-1 w-full rounded-lg border border-white/10 py-2 text-[10px] uppercase tracking-[0.25em] text-white/55 transition-colors hover:border-white/30 hover:text-white"
      >
        Réinitialiser
      </button>
    </div>
  );
}
