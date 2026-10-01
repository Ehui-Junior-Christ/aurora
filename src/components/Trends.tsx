"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { catalogCountry, catalogSongToTrack, type CatalogSong } from "@/lib/catalog";
import { loadTrends, TREND_COUNTRIES, type TrendCountry, type TrendsData } from "@/lib/trends";

const LABELS: Record<TrendCountry, { short: string; long: string }> = {
  fr: { short: "France", long: "Tendances en France" },
  us: { short: "États-Unis", long: "Tendances aux États-Unis" },
  gb: { short: "Royaume-Uni", long: "Tendances au Royaume-Uni" },
};

const COUNTRY_KEY = "aurora-trends-country";

function initialCountry(): TrendCountry {
  try {
    const saved = window.localStorage.getItem(COUNTRY_KEY);
    if (saved === "fr" || saved === "us" || saved === "gb") return saved;
  } catch {
    /* storage unavailable */
  }
  const cc = catalogCountry().toLowerCase();
  if (cc === "us" || cc === "ca") return "us";
  if (cc === "gb" || cc === "ie") return "gb";
  return "fr";
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4.2 2.6a1 1 0 0 1 1.53-.85l9 5.4a1 1 0 0 1 0 1.72l-9 5.4a1 1 0 0 1-1.53-.86V2.6Z" />
    </svg>
  );
}

function TrendCard({
  song,
  rank,
  active,
  onPlay,
}: {
  song: CatalogSong;
  rank: number;
  active: boolean;
  onPlay: () => void;
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Lire ${song.title} de ${song.artist} (n° ${rank})`}
        className="group block w-full min-w-0 rounded-(--radius-card) p-1.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06]"
      >
        <span className="relative block aspect-square overflow-hidden rounded-(--radius-control) border border-white/10 bg-white/[0.05]">
          {song.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.artwork.replace("600x600bb", "300x300bb")}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-(--dur-4) ease-out-expo group-hover:scale-[1.04]"
            />
          ) : (
            <span
              aria-hidden
              className="block size-full"
              style={{ background: "linear-gradient(135deg, var(--c1), var(--c3))" }}
            />
          )}
          <span
            aria-hidden
            className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 font-mono text-micro tabular-nums text-white/85 backdrop-blur-sm"
          >
            {rank}
          </span>
          <span
            aria-hidden
            className={`absolute bottom-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-white text-black shadow-lg transition-all duration-(--dur-3) ${
              active
                ? "scale-100 opacity-100"
                : "scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:opacity-100"
            }`}
          >
            <PlayGlyph />
          </span>
        </span>
        <span className="mt-1.5 block truncate text-[13px] font-semibold leading-tight text-ink-1">
          {song.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-2">{song.artist}</span>
      </button>
    </li>
  );
}

/**
 * "Tendances": Apple Music charts (France / États-Unis / Royaume-Uni) from
 * the bundled public/trends.json. One tap plays a song, "Tout lire" plays the
 * chart through the queue. Bundled video ids → zero YouTube quota.
 */
export default function Trends({
  variant = "inline",
  onPlayed,
}: {
  variant?: "inline" | "palette";
  onPlayed?: () => void;
}) {
  const [data, setData] = useState<TrendsData | null | undefined>(undefined);
  const [country, setCountry] = useState<TrendCountry>("fr");
  const [expanded, setExpanded] = useState(false);
  const playOnlineTrack = usePlayer((s) => s.playOnlineTrack);
  const playCollection = usePlayer((s) => s.playCollection);
  const currentId = usePlayer((s) => s.tracks[s.current]?.id);
  const palette = variant === "palette";

  useEffect(() => {
    setCountry(initialCountry());
    let alive = true;
    void loadTrends().then((loaded) => {
      if (alive) setData(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const chart = useMemo(() => data?.charts[country] ?? [], [data, country]);
  const limit = palette ? (expanded ? 50 : 12) : expanded ? 50 : 15;
  const shown = chart.slice(0, limit);

  const pick = (cc: TrendCountry) => {
    setCountry(cc);
    setExpanded(false);
    try {
      window.localStorage.setItem(COUNTRY_KEY, cc);
    } catch {
      /* storage unavailable */
    }
  };

  if (data === null) return null; // no bundled charts (offline first visit)

  return (
    <section aria-label="Tendances" className={
        palette
          ? "px-1 pb-2"
          : "glass-strong w-full rounded-(--radius-panel) p-3 text-left md:p-5"
      }>
      <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-2 ${palette ? "px-2 pt-3" : "px-1.5 pt-1"}`}>
        <div className="min-w-0">
          <h2
            className={
              palette
                ? "text-micro font-semibold uppercase tracking-[0.2em] text-ink-2"
                : "font-display text-title font-extrabold uppercase tracking-tight"
            }
          >
            Tendances
          </h2>
          {!palette && data?.generatedAt ? (
            <p className="mt-1 text-xs text-ink-3">
              Les titres les plus écoutés · mis à jour le {formatUpdated(data.generatedAt)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={chart.length === 0}
          onClick={() => {
            const tracks = chart.map(catalogSongToTrack);
            if (tracks.length === 0) return;
            usePlayer.setState({ showHome: false });
            playCollection(tracks, 0);
            onPlayed?.();
          }}
          className="btn-icon inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-4 text-micro font-bold uppercase tracking-[0.16em] text-white hover:border-white/35 hover:bg-white/12 disabled:opacity-35"
        >
          <PlayGlyph />
          Tout lire
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Pays du classement"
        className={`mt-3 flex gap-1.5 overflow-hidden ${palette ? "px-2" : "px-1.5"}`}
      >
        {TREND_COUNTRIES.map((cc) => {
          const selected = cc === country;
          return (
            <button
              key={cc}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`trends-panel-${variant}`}
              onClick={() => pick(cc)}
              className={`min-h-9 min-w-0 shrink truncate rounded-full border px-3.5 text-xs transition-colors ${
                selected
                  ? "border-white/30 bg-white/12 font-semibold text-white"
                  : "border-white/10 bg-white/[0.03] text-ink-2 hover:border-white/25 hover:text-white"
              }`}
            >
              {LABELS[cc].short}
            </button>
          );
        })}
      </div>

      <div id={`trends-panel-${variant}`} role="tabpanel" aria-label={LABELS[country].long} className="mt-2">
        {data === undefined ? (
          <ul aria-hidden className={`grid gap-1 ${palette ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"}`}>
            {Array.from({ length: palette ? 6 : 10 }, (_, i) => (
              <li key={i} className="p-1.5">
                <div className="skeleton aspect-square rounded-(--radius-control)" />
                <div className="skeleton mt-2 h-3 w-4/5 rounded" />
                <div className="skeleton mt-1.5 h-2.5 w-1/2 rounded" />
              </li>
            ))}
          </ul>
        ) : chart.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ink-2">Classement indisponible pour le moment.</p>
        ) : (
          <ul
            key={country}
            className={`tab-in grid gap-1 ${palette ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"}`}
          >
            {shown.map((song, i) => (
              <TrendCard
                key={song.itunesId}
                song={song}
                rank={i + 1}
                active={currentId === `cat:${song.itunesId}`}
                onPlay={() => {
                  playOnlineTrack(catalogSongToTrack(song));
                  onPlayed?.();
                }}
              />
            ))}
          </ul>
        )}
        {chart.length > limit || expanded ? (
          <div className="mt-1 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="min-h-9 px-3 text-micro uppercase tracking-[0.16em] text-ink-2 transition-colors hover:text-white"
            >
              {expanded ? "Réduire" : `Voir le top ${Math.min(50, chart.length)}`}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
