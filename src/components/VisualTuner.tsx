"use client";

import { useRef, type RefObject } from "react";
import { usePlayer } from "@/store/player-store";
import { useDismissable } from "@/hooks/useDismissable";

export default function VisualTuner({
  onClose,
  triggerRef,
  inline = false,
}: {
  onClose?: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
  /** Render as a plain block inside another popover (mobile mode sheet). */
  inline?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissable(panelRef, () => onClose?.(), {
    ignore: triggerRef ? [triggerRef] : [],
    enabled: !inline,
  });
  const preset = usePlayer((s) => s.visualPreset);
  const setVisualPreset = usePlayer((s) => s.setVisualPreset);
  const resetVisualPreset = usePlayer((s) => s.resetVisualPreset);

  const knobs = [
    { key: "freq", label: "Fréquence" },
    { key: "speed", label: "Vitesse" },
    { key: "amp", label: "Amplitude" },
  ] as const;

  return (
    <div
      ref={panelRef}
      id={inline ? undefined : "visual-tuner"}
      role={inline ? "group" : "dialog"}
      aria-label="Réglage visuel"
      data-panel
      className={
        inline
          ? "pt-1"
          : "glass-strong menu-in absolute bottom-full left-0 z-(--z-popover) mb-3 w-64 origin-bottom-left rounded-(--radius-card) p-4 shadow-(--shadow-pop)"
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-micro uppercase tracking-[0.35em] text-ink-2">
          Réglage visuel
        </span>
        {!inline && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le réglage visuel"
          className="btn-icon -m-2 grid size-9 place-items-center rounded-full text-white/50 hover:text-white"
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
        )}
      </div>
      <p className="mb-3 text-micro leading-relaxed text-ink-2">
        Multiplicateurs appliqués à l’organisme de cette piste.
      </p>
      {knobs.map((knob) => (
        <div key={knob.key} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-micro uppercase tracking-[0.2em] text-ink-2">
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
        className="mt-1 w-full rounded-lg border border-white/10 py-2 text-micro uppercase tracking-[0.25em] text-ink-2 transition-colors hover:border-white/30 hover:text-white"
      >
        Réinitialiser
      </button>
    </div>
  );
}
