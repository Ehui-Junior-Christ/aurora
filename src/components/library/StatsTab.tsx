"use client";

import { useMemo } from "react";
import { usePlayer } from "@/store/player-store";
import {
  dailySeries,
  hourlyProfile,
  listeningStreak,
  periodTotals,
  topArtists,
  topTracks,
} from "@/lib/stats";
import { EmptyState, formatDuration } from "./shared";

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-(--radius-card) border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="font-display text-lead font-extrabold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 text-micro uppercase tracking-[0.16em] text-ink-2">{label}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="mb-2 mt-6 font-mono text-micro uppercase tracking-[0.22em] text-ink-2">{children}</p>
  );
}

/** Minimal bar chart: one gradient hue, value on hover via title. */
function Bars({
  values,
  labels,
  height = 56,
  highlightLast = false,
}: {
  values: number[];
  labels: string[];
  height?: number;
  highlightLast?: boolean;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={labels.join(", ")}>
      {values.map((v, i) => (
        <div
          key={i}
          title={labels[i]}
          className="min-w-0 flex-1 rounded-t-[3px]"
          style={{
            height: `${Math.max(v > 0 ? 6 : 2, (v / max) * 100)}%`,
            background:
              v > 0
                ? "linear-gradient(180deg, var(--c2), var(--c1))"
                : "rgba(255,255,255,0.08)",
            opacity: highlightLast && i === values.length - 1 ? 1 : v > 0 ? 0.8 : 1,
          }}
        />
      ))}
    </div>
  );
}

export default function StatsTab() {
  const stats = usePlayer((s) => s.stats);
  const tracks = usePlayer((s) => s.tracks);
  const resetStats = usePlayer((s) => s.resetStats);

  const data = useMemo(() => {
    const now = Date.now();
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return {
      week: periodTotals(stats, 7, now),
      streak: listeningStreak(stats, now),
      days: dailySeries(stats, 30, now),
      hours: hourlyProfile(stats),
      top: topTracks(stats, 8).map((r) => {
        const t = byId.get(r.id);
        return {
          ...r,
          title: t?.title ?? r.info?.title ?? "Titre inconnu",
          artist: t?.artist ?? r.info?.artist ?? "",
        };
      }),
      artists: topArtists(stats, 5),
    };
  }, [stats, tracks]);

  if (stats.seconds < 30 && data.top.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        <EmptyState title="Pas encore de statistiques" text="Écoute quelques morceaux : ton temps d'écoute, tes artistes et tes heures préférées apparaîtront ici." />
      </div>
    );
  }

  const maxPlays = data.top[0]?.plays ?? 1;
  const maxArtist = data.artists[0]?.seconds ?? 1;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
      <div className="grid grid-cols-3 gap-2">
        <Stat value={formatDuration(stats.seconds)} label="Au total" />
        <Stat value={formatDuration(data.week.seconds)} label="7 jours" />
        <Stat value={`${data.streak} j`} label="Série" />
      </div>

      <SectionTitle>30 derniers jours</SectionTitle>
      <Bars
        values={data.days.map((d) => d.seconds)}
        labels={data.days.map((d) => `${d.day} : ${Math.round(d.seconds / 60)} min`)}
        highlightLast
      />

      <SectionTitle>Heures d’écoute</SectionTitle>
      <Bars
        height={44}
        values={data.hours}
        labels={data.hours.map((s, h) => `${h} h : ${Math.round(s / 60)} min`)}
      />
      <div className="mt-1 flex justify-between font-mono text-micro text-ink-3">
        <span>0 h</span>
        <span>6 h</span>
        <span>12 h</span>
        <span>18 h</span>
        <span>23 h</span>
      </div>

      {data.top.length > 0 && (
        <>
          <SectionTitle>Top titres</SectionTitle>
          <ol>
            {data.top.map((row, i) => (
              <li key={row.id} className="mb-2.5">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="w-5 font-mono text-micro text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">
                    {row.title}
                    {row.artist && <span className="text-ink-2"> · {row.artist}</span>}
                  </span>
                  <span className="font-mono text-micro text-ink-2">{row.plays}×</span>
                </div>
                <div className="ml-7 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(row.plays / maxPlays) * 100}%`, background: "linear-gradient(90deg, var(--c1), var(--c3))" }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {data.artists.length > 0 && (
        <>
          <SectionTitle>Top artistes</SectionTitle>
          <ul>
            {data.artists.map((a) => (
              <li key={a.artist} className="mb-2 flex items-center gap-3">
                <span className="w-28 truncate text-[13px] text-white/85">{a.artist}</span>
                <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(a.seconds / maxArtist) * 100}%`, background: "linear-gradient(90deg, var(--c2), var(--c1))" }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-micro text-ink-2">{formatDuration(a.seconds)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={() => {
          if (window.confirm("Réinitialiser toutes les statistiques d'écoute ?")) resetStats();
        }}
        className="mt-6 min-h-10 w-full rounded-(--radius-control) border border-white/10 text-micro uppercase tracking-[0.2em] text-ink-2 transition-colors hover:border-white/30 hover:text-white"
      >
        Réinitialiser
      </button>
    </div>
  );
}
