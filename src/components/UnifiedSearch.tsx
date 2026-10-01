"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { createPortal } from "react-dom";
import { onlineResultToTrack } from "@/lib/invidious";
import { catalogSongToTrack, formatDurationMs, type CatalogSong } from "@/lib/catalog";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import TrackActions from "@/components/library/TrackActions";
import Trends from "@/components/Trends";
import type { Track } from "@/lib/types";

const RECENT_KEY = "aurora-recent-searches";
const RECENT_MAX = 6;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((q): q is string => typeof q === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: recent searches are a convenience only */
  }
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4.2 2.6a1 1 0 0 1 1.53-.85l9 5.4a1 1 0 0 1 0 1.72l-9 5.4a1 1 0 0 1-1.53-.86V2.6Z" />
    </svg>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 px-3 pt-3 text-micro font-semibold uppercase tracking-[0.2em] text-ink-2">
      {children}
    </div>
  );
}

function Thumb({ src }: { src?: string }) {
  return (
    <div
      className="size-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]"
      style={
        src
          ? undefined
          : {
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--c1) 60%, transparent), color-mix(in srgb, var(--c3) 45%, transparent))",
            }
      }
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : null}
    </div>
  );
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div aria-hidden className="px-2 py-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="skeleton size-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3 rounded" style={{ width: `${70 - i * 7}%` }} />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** One online track (catalog, YouTube result, history, favourite). */
function OnlineRow({
  track,
  meta,
  onClose,
}: {
  track: Track;
  /** Secondary line (defaults to the artist). */
  meta?: string;
  onClose?: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const playOnlineTrack = usePlayer((s) => s.playOnlineTrack);
  const saveOnlineTrack = usePlayer((s) => s.saveOnlineTrack);
  const removeOnlineTrack = usePlayer((s) => s.removeOnlineTrack);
  const isSaved = usePlayer((s) => s.savedOnlineTracks.some((t) => t.id === track.id));
  const resolving = usePlayer((s) => s.resolvingId === track.id);

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) removeOnlineTrack(track.id);
    else saveOnlineTrack(track);
  };

  const play = () => {
    playOnlineTrack(track);
    onClose?.();
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.06]">
      <button
        type="button"
        onClick={play}
        tabIndex={-1}
        aria-hidden
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Thumb src={track.coverUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-ink-1 md:text-sm">{track.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-2">{meta ?? track.artist}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={toggleSave}
        aria-label={isSaved ? `Retirer ${track.title} des favoris` : `Ajouter ${track.title} aux favoris`}
        aria-pressed={isSaved}
        data-burst-on
        title={isSaved ? "Retirer des favoris" : "Ajouter aux favoris"}
        className={`btn-icon relative grid size-10 shrink-0 place-items-center rounded-full ${
          isSaved ? "text-pink-400" : "text-white/35 hover:bg-white/5 hover:text-white/80"
        }`}
      >
        <HeartIcon filled={isSaved} />
      </button>
      <button
        type="button"
        onClick={() => setActionsOpen(true)}
        aria-label={`Actions pour ${track.title}`}
        aria-haspopup="dialog"
        className="btn-icon grid size-10 shrink-0 place-items-center rounded-full text-white/45 hover:bg-white/5 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="13" cy="8" r="1.3" />
        </svg>
      </button>
      {actionsOpen &&
        createPortal(<TrackActions track={track} onClose={() => setActionsOpen(false)} />, document.body)}
      <button
        type="button"
        data-cursor="magnetic"
        onClick={play}
        aria-label={resolving ? `Recherche de la vidéo de ${track.title}…` : `Lire ${track.title}`}
        aria-busy={resolving}
        className="btn-icon grid size-10 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.07] text-white/80 hover:border-white/35 hover:text-white"
      >
        {resolving ? <Spinner /> : <PlayIcon />}
      </button>
    </div>
  );
}

function catalogMeta(song: CatalogSong): string {
  const year = song.releaseDate?.slice(0, 4);
  // "Titre - Single" / "Titre - EP" albums only repeat the title.
  const album = song.album.replace(/\s+-\s+(Single|EP)$/i, "");
  const showAlbum = album && album.toLowerCase() !== song.title.toLowerCase();
  return [song.artist, showAlbum ? album : "", year, formatDurationMs(song.durationMs)]
    .filter(Boolean)
    .join(" · ");
}

function CatalogRow({ song, onClose }: { song: CatalogSong; onClose?: () => void }) {
  const track = useMemo(() => catalogSongToTrack(song), [song]);
  return <OnlineRow track={track} meta={catalogMeta(song)} onClose={onClose} />;
}

function LocalMatches({ query, onClose }: { query: string; onClose?: () => void }) {
  const tracks = usePlayer((s) => s.tracks);
  const current = usePlayer((s) => s.current);
  const play = usePlayer((s) => s.play);
  const matches = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return [];
    const out: { track: Track; index: number }[] = [];
    for (let i = 0; i < tracks.length && out.length < 5; i++) {
      const t = tracks[i];
      if (
        t.title.toLowerCase().includes(lower) ||
        t.artist.toLowerCase().includes(lower) ||
        t.album.toLowerCase().includes(lower)
      ) {
        out.push({ track: t, index: i });
      }
    }
    return out;
  }, [tracks, query]);

  if (matches.length === 0) return null;
  return (
    <>
      <SectionLabel>Dans ta bibliothèque</SectionLabel>
      {matches.map(({ track, index }) => (
        <button
          key={track.id}
          type="button"
          onClick={() => {
            play(index);
            onClose?.();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
        >
          <Thumb src={track.coverUrl} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[13px] leading-tight md:text-sm ${index === current ? "font-semibold text-white" : "text-ink-1"}`}>
              {track.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink-2">{track.artist}</span>
          </span>
          <span className="shrink-0 pr-2 font-mono text-micro uppercase tracking-[0.16em] text-ink-3">
            {track.isOnline ? "web" : "local"}
          </span>
        </button>
      ))}
    </>
  );
}

export default function UnifiedSearch({
  variant = "inline",
  onClose,
}: {
  variant?: "inline" | "palette";
  onClose?: () => void;
}) {
  const removeSource = usePlayer((s) => s.removeSource);
  const searchOnline = usePlayer((s) => s.searchOnline);
  const onlineQuery = usePlayer((s) => s.onlineQuery);
  const onlineResults = usePlayer((s) => s.onlineResults);
  const onlineSearching = usePlayer((s) => s.onlineSearching);
  const onlineError = usePlayer((s) => s.onlineError);
  const history = usePlayer((s) => s.history);
  const savedOnlineTracks = usePlayer((s) => s.savedOnlineTracks);
  const sources = usePlayer((s) => s.sources);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const palette = variant === "palette";
  const trimmed = query.trim();
  const catalog = useCatalogSearch(query);
  // The YouTube search (100 quota units) only runs on explicit request; its
  // results stay visible while the query they belong to is still typed.
  const ytShown = trimmed.length >= 2 && onlineQuery.trim() === trimmed;
  const ytTracks = useMemo(() => onlineResults.map(onlineResultToTrack), [onlineResults]);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    if (palette) inputRef.current?.focus({ preventScroll: true });
  }, [palette]);

  const remember = (value: string) => {
    const q = value.trim();
    if (q.length < 2) return;
    setRecent((list) => {
      const next = [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  };

  const submit = () => {
    if (trimmed.length < 2) return;
    remember(trimmed);
    catalog.runNow();
  };

  const searchYouTube = () => {
    if (trimmed.length < 2) return;
    remember(trimmed);
    void searchOnline(trimmed);
  };

  const pickRecent = (value: string) => {
    setQuery(value);
    remember(value);
    inputRef.current?.focus({ preventScroll: true });
  };

  const showEmptyState = trimmed === "";
  const catalogSettled = !catalog.loading && catalog.query === trimmed;
  const catalogEmpty = catalogSettled && !catalog.error && catalog.results.length === 0;
  const hasResultsArea =
    palette ||
    !showEmptyState ||
    history.length > 0 ||
    savedOnlineTracks.length > 0 ||
    recent.length > 0;

  return (
    <section
      data-panel
      aria-label="Recherche"
      className={
        palette
          ? "flex h-full min-h-0 w-full flex-col"
          : "glass-strong w-full max-w-3xl overflow-hidden rounded-(--radius-panel)"
      }
    >
      <div className="p-3 md:p-4">
        {!palette && (
          <label
            htmlFor="unified-search-input"
            className="mb-2 block text-micro font-semibold uppercase tracking-[0.22em] text-ink-2 md:tracking-[0.28em]"
          >
            Recherche unifiée
          </label>
        )}
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              <SearchIcon />
            </span>
            <input
              ref={inputRef}
              id="unified-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => remember(query)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Artiste, titre, album..."
              aria-label="Rechercher une musique"
              enterKeyHint="search"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-9 pr-3 text-base text-white outline-none transition-colors placeholder:text-ink-3 focus:border-white/30 md:h-11 md:text-sm"
            />
          </div>

          <button
            type="button"
            data-cursor="magnetic"
            onClick={submit}
            disabled={trimmed.length < 2 || catalog.loading}
            className="btn-icon hidden h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/12 px-4 text-micro font-bold uppercase tracking-[0.12em] text-white hover:border-white/40 hover:bg-white/15 disabled:pointer-events-none disabled:opacity-35 md:inline-flex md:tracking-[0.16em]"
          >
            <SearchIcon />
            {catalog.loading ? "Recherche..." : "Chercher"}
          </button>
        </div>

        {!palette && sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((source) => (
              <span
                key={source}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] py-1 pl-3 pr-1 text-micro uppercase tracking-[0.12em] text-ink-2 md:tracking-[0.16em]"
              >
                <span className="truncate">{source}</span>
                <button
                  type="button"
                  onClick={() => void removeSource(source)}
                  aria-label={`Supprimer le dossier ${source}`}
                  className="grid size-7 place-items-center rounded-full text-ink-2 transition-colors hover:bg-red-500/15 hover:text-red-200"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="m1.5 1.5 9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {hasResultsArea && (
        <div
          data-lenis-prevent
          aria-live="polite"
          aria-busy={catalog.loading || onlineSearching}
          className={`overflow-y-auto overscroll-contain border-t border-white/10 px-2 pb-3 pt-1 text-left ${
            palette ? "min-h-0 flex-1" : "max-h-[42dvh]"
          }`}
        >
          {showEmptyState && recent.length > 0 && (
            <>
              <SectionLabel>Recherches récentes</SectionLabel>
              <div className="flex flex-wrap gap-2 px-3 pb-2 pt-1">
                {recent.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => pickRecent(q)}
                    className="btn-icon inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 text-xs text-white/80 hover:border-white/30 hover:text-white"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-ink-3">
                      <path d="M8 4v4l2.5 1.5M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <span className="truncate">{q}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    writeRecent([]);
                  }}
                  className="min-h-9 px-2 text-micro uppercase tracking-[0.16em] text-ink-3 transition-colors hover:text-white"
                >
                  Effacer
                </button>
              </div>
            </>
          )}

          {palette && showEmptyState && <Trends variant="palette" onPlayed={onClose} />}

          {showEmptyState && savedOnlineTracks.length > 0 && (
            <>
              <SectionLabel>Tes favoris en ligne</SectionLabel>
              {savedOnlineTracks.map((track) => (
                <OnlineRow key={`saved-${track.id}`} track={track} onClose={onClose} />
              ))}
            </>
          )}

          {showEmptyState && history.length > 0 && (
            <>
              <SectionLabel>Écoutés récemment</SectionLabel>
              {history.map((track) => (
                <OnlineRow key={`hist-${track.id}`} track={track} onClose={onClose} />
              ))}
            </>
          )}

          {!showEmptyState && palette && <LocalMatches query={query} onClose={onClose} />}

          {!showEmptyState && trimmed.length < 2 && (
            <p className="px-3 py-6 text-center text-sm text-ink-2">Continue à taper…</p>
          )}

          {trimmed.length >= 2 && (
            <>
              <SectionLabel>Catalogue</SectionLabel>
              {!catalogSettled && !catalog.error && <SkeletonRows />}

              {catalog.error && !catalog.loading && (
                <div
                  role="alert"
                  className="mx-2 my-3 flex items-start gap-3 rounded-(--radius-card) border border-red-400/25 bg-red-500/[0.08] p-4"
                >
                  <span aria-hidden className="mt-1 block size-2 shrink-0 rounded-full bg-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-red-100/90">{catalog.error}</p>
                    <button
                      type="button"
                      onClick={submit}
                      className="btn-icon mt-3 inline-flex min-h-9 items-center rounded-full border border-white/20 px-4 text-micro font-bold uppercase tracking-[0.18em] text-white hover:bg-white/10"
                    >
                      Réessayer
                    </button>
                  </div>
                </div>
              )}

              {catalogSettled &&
                catalog.results.map((song) => (
                  <CatalogRow key={song.itunesId} song={song} onClose={onClose} />
                ))}

              {catalogEmpty && (
                <p className="px-3 pb-1 pt-4 text-center text-sm text-ink-2">
                  Rien dans le catalogue pour « {trimmed} ».
                </p>
              )}

              {(catalogSettled || !!catalog.error) && !ytShown && !onlineSearching && (
                <div
                  className={`flex flex-col items-center gap-1 px-3 ${
                    catalogEmpty ? "pb-4 pt-2" : "pb-2 pt-4"
                  }`}
                >
                  <button
                    type="button"
                    onClick={searchYouTube}
                    className={`btn-icon inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-micro font-bold uppercase tracking-[0.16em] ${
                      catalogEmpty
                        ? "border-white/25 bg-white/12 text-white hover:border-white/45"
                        : "border-white/10 bg-white/[0.04] text-ink-1 hover:border-white/30 hover:text-white"
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <rect x="1.5" y="3.5" width="13" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M6.6 6v4l3.4-2-3.4-2Z" fill="currentColor" />
                    </svg>
                    Chercher sur YouTube
                  </button>
                  <span className="text-center text-micro text-ink-3">
                    {catalogEmpty
                      ? "Remixes, lives, titres rares…"
                      : "Pas le bon titre ? Versions live, remixes, raretés…"}
                  </span>
                </div>
              )}

              {(ytShown || onlineSearching) && <SectionLabel>Sur YouTube</SectionLabel>}
              {onlineSearching && <SkeletonRows count={3} />}

              {ytShown && onlineError && !onlineSearching && (
                <div
                  role="alert"
                  className="mx-2 my-3 flex items-start gap-3 rounded-(--radius-card) border border-red-400/25 bg-red-500/[0.08] p-4"
                >
                  <span aria-hidden className="mt-1 block size-2 shrink-0 rounded-full bg-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-red-100/90">{onlineError}</p>
                    <button
                      type="button"
                      onClick={searchYouTube}
                      className="btn-icon mt-3 inline-flex min-h-9 items-center rounded-full border border-white/20 px-4 text-micro font-bold uppercase tracking-[0.18em] text-white hover:bg-white/10"
                    >
                      Réessayer
                    </button>
                  </div>
                </div>
              )}

              {ytShown &&
                !onlineSearching &&
                ytTracks.map((track) => <OnlineRow key={track.id} track={track} onClose={onClose} />)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
