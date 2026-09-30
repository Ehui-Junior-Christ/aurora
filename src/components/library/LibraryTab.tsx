"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { useLibraryQuery } from "@/hooks/useLibraryQuery";
import { SORT_LABELS, type LibrarySortKey, type SortDirection } from "@/lib/library-query";
import type { Track } from "@/lib/types";
import { EmptyState, ROW_HEIGHT, SkeletonList, TrackRow } from "./shared";

const OVERSCAN = 8;
const TEXT_SORTS: LibrarySortKey[] = ["default", "title", "artist"];

export default function LibraryTab({ onMore }: { onMore: (track: Track) => void }) {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const play = usePlayer((s) => s.play);
  const reorder = usePlayer((s) => s.reorder);
  const scanning = usePlayer((s) => s.scanning);
  const progress = usePlayer((s) => s.progress);
  const openFolder = usePlayer((s) => s.openFolder);
  const total = usePlayer((s) => s.tracks.length);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LibrarySortKey>("default");
  const [direction, setDirection] = useState<SortDirection | undefined>(undefined);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(480);
  const listRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);

  const { tracks, indices } = useLibraryQuery({ search, sort, direction });
  // Manual drag-reorder only makes sense on the raw library order.
  const canReorder = sort === "default" && !search.trim();
  const effectiveDirection: SortDirection =
    direction ?? (TEXT_SORTS.includes(sort) ? "asc" : "desc");

  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight || 480));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(tracks.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
    return { start, end };
  }, [scrollTop, viewport, tracks.length]);

  return (
    <>
      <div className="flex gap-2 px-3 pb-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Filtrer ${total} titres…`}
          aria-label="Filtrer la bibliothèque"
          className="h-10 min-w-0 flex-1 rounded-(--radius-control) border border-white/10 bg-white/5 px-3 text-base text-white outline-none transition-colors placeholder:text-ink-3 focus:border-white/30 md:text-sm"
        />
        <label className="relative">
          <span className="sr-only">Trier par</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as LibrarySortKey);
              setDirection(undefined);
            }}
            className="h-10 max-w-[9.5rem] appearance-none rounded-(--radius-control) border border-white/10 bg-white/5 pl-3 pr-7 text-xs text-white/85 outline-none focus:border-white/30"
          >
            {(Object.keys(SORT_LABELS) as LibrarySortKey[]).map((key) => (
              <option key={key} value={key} className="bg-[#0b0b12]">
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <svg aria-hidden width="10" height="10" viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-2">
            <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </label>
        {sort !== "default" && (
          <button
            type="button"
            onClick={() => setDirection(effectiveDirection === "asc" ? "desc" : "asc")}
            aria-label={effectiveDirection === "asc" ? "Ordre croissant" : "Ordre décroissant"}
            title={effectiveDirection === "asc" ? "Croissant" : "Décroissant"}
            className="btn-icon grid size-10 shrink-0 place-items-center rounded-(--radius-control) border border-white/10 bg-white/5 text-ink-2 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className={effectiveDirection === "asc" ? "" : "rotate-180"}>
              <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {scanning && (
        <div className="px-4 pb-1">
          <p className="font-mono text-micro uppercase tracking-[0.2em] text-ink-2">
            Analyse · {progress.done} / {progress.total || "…"}
          </p>
          <SkeletonList rows={3} />
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(event) => setScrollTop((event.target as HTMLDivElement).scrollTop)}
        onDragOver={(event) => {
          if (canReorder) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!canReorder || dragIndex.current === null || tracks.length === 0) return;
          const top = listRef.current?.getBoundingClientRect().top ?? 0;
          const row = Math.min(
            tracks.length - 1,
            Math.max(0, Math.floor((event.clientY - top + scrollTop) / ROW_HEIGHT))
          );
          const target = indices[row];
          if (typeof target === "number" && dragIndex.current !== target) {
            reorder(dragIndex.current, target);
          }
          dragIndex.current = null;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6"
      >
        {tracks.length === 0 ? (
          search.trim() ? (
            <EmptyState title="Aucun résultat" text={`Rien ne correspond à « ${search.trim()} ».`} />
          ) : (
            <EmptyState
              title="Bibliothèque vide"
              text="Ajoute un dossier de musique ou lance une recherche en ligne."
              action={{ label: "Ajouter un dossier", onClick: () => void openFolder() }}
            />
          )
        ) : (
          <div
            style={{
              paddingTop: range.start * ROW_HEIGHT,
              paddingBottom: (tracks.length - range.end) * ROW_HEIGHT,
            }}
          >
            {tracks.slice(range.start, range.end).map((track, offset) => {
              const row = range.start + offset;
              const index = indices[row];
              return (
                <div
                  key={track.id}
                  style={{
                    height: ROW_HEIGHT,
                    animationDelay: row < 10 ? `${row * 40}ms` : undefined,
                  }}
                  draggable={canReorder}
                  onDragStart={(event) => {
                    dragIndex.current = index;
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className={row < 10 && scrollTop === 0 ? "stagger-in" : undefined}
                >
                  <TrackRow
                    track={track}
                    label={String(index + 1).padStart(2, "0")}
                    active={index === current}
                    playing={playing}
                    onPlay={() => play(index)}
                    onMore={() => onMore(track)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
