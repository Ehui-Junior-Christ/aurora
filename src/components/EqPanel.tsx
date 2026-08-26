"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/store/player-store";

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

export default function EqPanel({ onClose }: { onClose: () => void }) {
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
  const sleepAt = usePlayer((s) => s.sleepAt);
  const setSleep = usePlayer((s) => s.setSleep);
  const [now, setNow] = useState(Date.now());
  const [selectedSleep, setSelectedSleep] = useState<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (sleepAt === null) setSelectedSleep(null);
  }, [sleepAt]);

  const sleepRemainingMin =
    sleepAt !== null ? Math.max(0, Math.ceil((sleepAt - now) / 60000)) : 0;

  const pickSleep = (minutes: number) => {
    setSelectedSleep(minutes > 0 ? minutes : null);
    setSleep(minutes);
  };

  return (
    <div className="glass-strong absolute bottom-full right-0 z-40 mb-3 max-h-[70vh] w-72 max-w-[calc(100vw-5rem)] overflow-y-auto rounded-2xl p-4 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/50">
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
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                active
                  ? "border-[var(--c2)] bg-[var(--c2)]/10 text-[var(--c2)]"
                  : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {BANDS.map((band) => (
        <div key={band.key} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/45">
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
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/45">
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
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/45">
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

      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-white/45">
        Minuterie sommeil
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLEEP_OPTIONS.map((minutes) => {
          const active =
            minutes === 0
              ? sleepAt === null
              : selectedSleep === minutes && sleepAt !== null;
          return (
            <button
              key={minutes}
              type="button"
              data-cursor="magnetic"
              onClick={() => pickSleep(minutes)}
              className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                active
                  ? "border-[var(--c2)] text-[var(--c2)]"
                  : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              {minutes === 0 ? "Off" : `${minutes} min`}
            </button>
          );
        })}
      </div>
      {sleepAt !== null && sleepRemainingMin > 0 && (
        <p className="mt-2 text-[10px] text-white/40">
          Pause dans {sleepRemainingMin} min
        </p>
      )}
    </div>
  );
}
