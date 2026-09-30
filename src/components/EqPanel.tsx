"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { usePlayer, sleepRemainingSeconds } from "@/store/player-store";
import { useDismissable } from "@/hooks/useDismissable";

const BANDS = [
  { key: "low", label: "Graves" },
  { key: "mid", label: "Médiums" },
  { key: "high", label: "Aigus" },
] as const;

const EQ_PRESETS: { name: string; values: { low: number; mid: number; high: number } }[] = [
  { name: "Flat", values: { low: 0, mid: 0, high: 0 } },
  { name: "Rock", values: { low: 5, mid: 3, high: 4 } },
  { name: "Pop", values: { low: 3, mid: 4, high: 5 } },
  { name: "Jazz", values: { low: 4, mid: 3, high: 5 } },
  { name: "Classique", values: { low: 3, mid: 3, high: 4 } },
  { name: "Bass", values: { low: 8, mid: 2, high: 0 } },
  { name: "Vocal", values: { low: -1, mid: 5, high: 4 } },
  { name: "Électro", values: { low: 6, mid: 2, high: 5 } },
];

const SLEEP_OPTIONS = [0, 15, 30, 45, 60];

export default function EqPanel({
  onClose,
  triggerRef,
}: {
  onClose: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissable(panelRef, onClose, {
    ignore: triggerRef ? [triggerRef] : [],
  });
  const eq = usePlayer((s) => s.eq);
  const setEq = usePlayer((s) => s.setEq);
  const speed = usePlayer((s) => s.speed);
  const setSpeed = usePlayer((s) => s.setSpeed);
  const crossfade = usePlayer((s) => s.crossfade);
  const setCrossfade = usePlayer((s) => s.setCrossfade);
  const skipSilence = usePlayer((s) => s.skipSilence);
  const setSkipSilence = usePlayer((s) => s.setSkipSilence);
  const normalize = usePlayer((s) => s.normalize);
  const setNormalize = usePlayer((s) => s.setNormalize);
  const setSleep = usePlayer((s) => s.setSleep);
  const sleepMode = usePlayer((s) => s.sleepMode);
  const setSleepEndOfTrack = usePlayer((s) => s.setSleepEndOfTrack);
  const cancelSleep = usePlayer((s) => s.cancelSleep);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [selectedSleep, setSelectedSleep] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(sleepRemainingSeconds(usePlayer.getState()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (sleepMode === "off") setSelectedSleep(null);
  }, [sleepMode]);

  const pickSleep = (minutes: number) => {
    setSelectedSleep(minutes > 0 ? minutes : null);
    setSleep(minutes);
  };

  return (
    <div
      ref={panelRef}
      id="eq-panel"
      role="dialog"
      aria-label="Égaliseur et options audio"
      data-panel
      data-lenis-prevent
      className="glass-strong bg-[#050508]/95 md:bg-transparent absolute bottom-full left-0 right-0 md:left-auto md:right-0 z-(--z-popover) mb-3 max-h-[70vh] md:w-72 overflow-y-auto rounded-2xl p-4 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-micro uppercase tracking-[0.35em] text-ink-2">
          Égaliseur
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau audio"
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

      <div className="mb-4 flex flex-wrap gap-1.5">
        {EQ_PRESETS.map((preset) => {
          const active =
            eq.low === preset.values.low &&
            eq.mid === preset.values.mid &&
            eq.high === preset.values.high;
          return (
            <button
              key={preset.name}
              type="button"
              data-cursor="magnetic"
              onClick={() => setEq(preset.values)}
              aria-pressed={active}
              className={`rounded-full border px-2.5 py-1 text-micro uppercase tracking-wider transition-colors ${
                active
                  ? "border-[var(--c2)] bg-[var(--c2)]/10 text-[var(--c2)]"
                  : "border-white/10 text-ink-2 hover:border-white/30 hover:text-white"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {BANDS.map((band) => (
        <div key={band.key} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-micro uppercase tracking-[0.2em] text-ink-2">
            <span>{band.label}</span>
            <span className="tabular-nums text-white/70">
              {eq[band.key] > 0 ? "+" : ""}
              {eq[band.key]} dB
            </span>
          </div>
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={eq[band.key]}
            onChange={(event) =>
              setEq({ ...eq, [band.key]: Number(event.target.value) })
            }
            aria-label={`${band.label} — gain en décibels`}
            className="w-full"
            style={{ accentColor: "var(--c2)" }}
          />
        </div>
      ))}

      <div className="my-4 h-px bg-white/10" />

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-micro uppercase tracking-[0.2em] text-ink-2">
          <span>Vitesse</span>
          <span className="tabular-nums text-white/70">{speed.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
          aria-label="Vitesse de lecture"
          className="w-full"
          style={{ accentColor: "var(--c2)" }}
        />
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-micro uppercase tracking-[0.2em] text-ink-2">
          <span>Crossfade</span>
          <span className="tabular-nums text-white/70">{crossfade} s</span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={crossfade}
          onChange={(event) => setCrossfade(Number(event.target.value))}
          aria-label="Durée du crossfade en secondes"
          className="w-full"
          style={{ accentColor: "var(--c2)" }}
        />
      </div>

      <label className="mb-2 flex cursor-pointer items-center justify-between text-[11px] text-white/60">
        <span>Normalisation du volume</span>
        <input
          type="checkbox"
          checked={normalize}
          onChange={(event) => setNormalize(event.target.checked)}
          className="size-3.5"
          style={{ accentColor: "var(--c2)" }}
        />
      </label>

      <label className="mb-3 flex cursor-pointer items-center justify-between text-[11px] text-white/60">
        <span>Passer les silences</span>
        <input
          type="checkbox"
          checked={skipSilence}
          onChange={(event) => setSkipSilence(event.target.checked)}
          className="size-3.5"
          style={{ accentColor: "var(--c2)" }}
        />
      </label>

      <div className="mb-1.5 flex items-center justify-between text-micro uppercase tracking-[0.2em] text-ink-2">
        <span>Minuterie sommeil</span>
        {sleepMode !== "off" && (
          <span className="tabular-nums normal-case tracking-normal text-[var(--c2)]" aria-live="polite">
            {sleepMode === "track"
              ? "fin de la piste"
              : remaining !== null
                ? `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`
                : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLEEP_OPTIONS.filter((m) => m > 0).map((minutes) => {
          const active = sleepMode === "time" && selectedSleep === minutes;
          return (
            <button
              key={minutes}
              type="button"
              data-cursor="magnetic"
              onClick={() => pickSleep(minutes)}
              aria-pressed={active}
              className={`min-h-8 rounded-full border px-2.5 text-micro transition-colors ${
                active
                  ? "border-[var(--c2)] text-[var(--c2)]"
                  : "border-white/10 text-ink-2 hover:border-white/30 hover:text-white"
              }`}
            >
              {minutes} min
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setSelectedSleep(null);
            setSleepEndOfTrack();
          }}
          aria-pressed={sleepMode === "track"}
          className={`min-h-8 rounded-full border px-2.5 text-micro transition-colors ${
            sleepMode === "track"
              ? "border-[var(--c2)] text-[var(--c2)]"
              : "border-white/10 text-ink-2 hover:border-white/30 hover:text-white"
          }`}
        >
          Fin de la piste
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-micro text-ink-2">
          <input
            type="number"
            min={1}
            max={600}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && Number(custom) > 0) pickSleep(Number(custom));
            }}
            aria-label="Durée personnalisée en minutes"
            placeholder="90"
            className="h-8 w-16 rounded-lg border border-white/10 bg-white/5 px-2 text-base tabular-nums text-white outline-none focus:border-white/30 md:text-xs"
          />
          min
        </label>
        <button
          type="button"
          disabled={!(Number(custom) > 0)}
          onClick={() => pickSleep(Number(custom))}
          className="min-h-8 rounded-full border border-white/10 px-2.5 text-micro text-ink-2 transition-colors hover:border-white/30 hover:text-white disabled:opacity-35"
        >
          Régler
        </button>
        {sleepMode !== "off" && (
          <button
            type="button"
            onClick={() => {
              setSelectedSleep(null);
              cancelSleep();
            }}
            className="ml-auto min-h-8 rounded-full px-2.5 text-micro uppercase tracking-[0.14em] text-ink-2 transition-colors hover:text-red-300"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
