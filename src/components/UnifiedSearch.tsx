"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { onlineResultToTrack, type OnlineMusicResult } from "@/lib/invidious";

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.8 4.3A1.3 1.3 0 0 1 3.1 3h3.1l1.6 1.8h5.1a1.3 1.3 0 0 1 1.3 1.3v5.6a1.3 1.3 0 0 1-1.3 1.3H3.1a1.3 1.3 0 0 1-1.3-1.3V4.3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
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

function OnlineResultRow({ result, onClose }: { result: OnlineMusicResult; onClose?: () => void }) {
  const playOnlineResult = usePlayer((s) => s.playOnlineResult);
  const saveOnlineTrack = usePlayer((s) => s.saveOnlineTrack);
  const removeOnlineTrack = usePlayer((s) => s.removeOnlineTrack);
  const savedOnlineTracks = usePlayer((s) => s.savedOnlineTracks);
  
  // result.id in our system for online is often just the id or prefixed.
  // onlineResultToTrack generates an ID like `yt:${result.id}`
  const trackId = `yt:${result.id}`;
  const isSaved = savedOnlineTracks.some(t => t.id === trackId);

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) {
      removeOnlineTrack(trackId);
    } else {
      saveOnlineTrack(onlineResultToTrack(result));
    }
  };

  return (
    <div className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
      <div className="size-8 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.06]">
        {result.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.thumbnail} alt="" className="size-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold text-white/85">{result.title}</p>
        <p className="truncate text-[9px] text-white/42">
          {result.artist}
          {result.durationText ? ` · ${result.durationText}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={toggleSave}
        aria-label={isSaved ? "Retirer des favoris" : "Ajouter aux favoris"}
        title={isSaved ? "Retirer des favoris" : "Ajouter aux favoris"}
        className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors ${
          isSaved ? "text-pink-400" : "text-white/20 hover:bg-white/5 hover:text-white/70"
        }`}
      >
        <HeartIcon filled={isSaved} />
      </button>
      <button
        type="button"
        data-cursor="magnetic"
        onClick={() => {
          void playOnlineResult(result);
          onClose?.();
        }}
        aria-label={`Lire ${result.title}`}
        className="grid size-9 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.07] text-white/75 transition-all hover:border-white/35 hover:text-white active:scale-95"
      >
        <PlayIcon />
      </button>
    </div>
  );
}

export default function UnifiedSearch({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const openFolder = usePlayer((s) => s.openFolder);
  const removeSource = usePlayer((s) => s.removeSource);
  const searchOnline = usePlayer((s) => s.searchOnline);
  const onlineResults = usePlayer((s) => s.onlineResults);
  const onlineSearching = usePlayer((s) => s.onlineSearching);
  const onlineError = usePlayer((s) => s.onlineError);
  const history = usePlayer((s) => s.history);
  const savedOnlineTracks = usePlayer((s) => s.savedOnlineTracks);
  const sources = usePlayer((s) => s.sources);
  const error = usePlayer((s) => s.error);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (query.trim().length >= 3) void searchOnline(query);
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [query, searchOnline]);

  const submit = () => {
    void searchOnline(query);
  };

  return (
    <section
      data-panel
      className={`glass-strong w-full overflow-hidden rounded-2xl ${
        compact ? "max-w-[430px]" : "max-w-3xl"
      }`}
    >
      <div className="p-3 md:p-4">
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40 md:tracking-[0.28em]">
          Recherche unifiée
        </label>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Artiste, titre, album..."
              aria-label="Rechercher une musique"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/30"
            />
          </div>

          <button
            type="button"
            data-cursor="magnetic"
            onClick={submit}
            disabled={query.trim().length < 2 || onlineSearching}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/12 px-4 text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:border-white/40 hover:bg-white/15 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35 md:tracking-[0.16em]"
          >
            <SearchIcon />
            {onlineSearching ? "Recherche..." : "En ligne"}
          </button>
        </div>

        {sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((source) => (
              <span
                key={source}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] py-1 pl-3 pr-1 text-[10px] uppercase tracking-[0.12em] text-white/50 md:tracking-[0.16em]"
              >
                <span className="truncate">{source}</span>
                <button
                  type="button"
                  onClick={() => void removeSource(source)}
                  aria-label={`Supprimer le dossier ${source}`}
                  className="grid size-6 place-items-center rounded-full text-white/45 transition-colors hover:bg-red-500/15 hover:text-red-200"
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

      {(onlineSearching || onlineError || onlineResults.length > 0 || error || (query.trim() === "" && (history.length > 0 || savedOnlineTracks.length > 0))) && (
        <div className="max-h-[42dvh] overflow-y-auto border-t border-white/10 px-2 py-2">
          {query.trim() === "" && savedOnlineTracks.length > 0 && !onlineSearching && !error && (
            <>
              <div className="mb-2 px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                Vos Favoris (En ligne)
              </div>
              {savedOnlineTracks.map((track) => (
                <OnlineResultRow
                  key={`saved-${track.id}`}
                  result={{
                    id: track.id.replace(/^(yt:|online_)/, ""),
                    title: track.title,
                    artist: track.artist,
                    thumbnail: track.coverUrl,
                    durationText: track.durationText,
                    isOnline: true,
                  }}
                  onClose={onClose}
                />
              ))}
              <div className="my-2 border-t border-white/[0.04]"></div>
            </>
          )}

          {query.trim() === "" && history.length > 0 && !onlineSearching && !error && (
            <div className="mb-2 px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              Écoutés récemment
            </div>
          )}
          {query.trim() === "" && history.length > 0 && !onlineSearching &&
            history.map((track) => (
              <OnlineResultRow
                key={`hist-${track.id}`}
                result={{
                  id: track.id.replace(/^(yt:|online_)/, ""),
                  title: track.title,
                  artist: track.artist,
                  thumbnail: track.coverUrl,
                  durationText: track.durationText,
                  isOnline: true,
                }}
                onClose={onClose}
              />
            ))}
          
          {query.trim() !== "" && onlineSearching && (
            <p className="px-3 py-4 text-sm text-white/45">Recherche dans le catalogue en ligne...</p>
          )}
          {onlineError && (
            <p className="px-3 py-4 text-sm text-red-200/85">{onlineError}</p>
          )}
          {error && !onlineError && (
            <p className="px-3 py-4 text-sm text-red-200/85">{error}</p>
          )}
          {!onlineSearching &&
            onlineResults.map((result) => (
              <OnlineResultRow key={result.id} result={result} onClose={onClose} />
            ))}
        </div>
      )}
    </section>
  );
}
