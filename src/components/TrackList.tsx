"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/store/player-store";
import { useDismissable } from "@/hooks/useDismissable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePresence } from "@/hooks/usePresence";
import type { Track } from "@/lib/types";
import LibraryTab from "./library/LibraryTab";
import QueueTab from "./library/QueueTab";
import AlbumsTab from "./library/AlbumsTab";
import PlaylistsTab from "./library/PlaylistsTab";
import StatsTab from "./library/StatsTab";
import TrackActions from "./library/TrackActions";
import TrackEditDialog from "./library/TrackEditDialog";

type Tab = "library" | "queue" | "albums" | "playlists" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "library", label: "Titres" },
  { id: "queue", label: "File" },
  { id: "albums", label: "Albums" },
  { id: "playlists", label: "Playlists" },
  { id: "stats", label: "Stats" },
];

/**
 * Library panel. Desktop/tablet: floating right panel (380px).
 * Mobile: bottom sheet above the dock (handle, swipe down, Esc, backdrop).
 */
export default function TrackList({ immersive }: { immersive: boolean }) {
  const queueOpen = usePlayer((s) => s.queueOpen);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // Immersive mode only hides the desktop panel: on a phone the user is
  // reading the sheet, not idling.
  const visible = queueOpen && (isDesktop === false || !immersive);
  const { mounted, visible: shown } = usePresence(visible, 520);
  const [tab, setTab] = useState<Tab>("library");
  const [actionTrack, setActionTrack] = useState<Track | null>(null);
  const [editTrack, setEditTrack] = useState<Track | null>(null);

  if (isDesktop === null) return null;

  return (
    <>
      {mounted && (
        <Panel
          mobile={!isDesktop}
          shown={shown}
          tab={tab}
          onTab={setTab}
          onMore={setActionTrack}
        />
      )}
      {typeof document !== "undefined" &&
        actionTrack &&
        createPortal(
          <TrackActions
            track={actionTrack}
            onClose={() => setActionTrack(null)}
            onEdit={(track) => {
              setActionTrack(null);
              setEditTrack(track);
            }}
          />,
          document.body
        )}
      {typeof document !== "undefined" &&
        editTrack &&
        createPortal(
          <TrackEditDialog track={editTrack} onClose={() => setEditTrack(null)} />,
          document.body
        )}
    </>
  );
}

function Panel({
  mobile,
  shown,
  tab,
  onTab,
  onMore,
}: {
  mobile: boolean;
  shown: boolean;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onMore: (track: Track) => void;
}) {
  const count = usePlayer((s) => s.tracks.length);
  const queueLength = usePlayer((s) => s.queue.length);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const panelRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const close = () => setQueueOpen(false);

  useDismissable(panelRef, close, { outside: false, manageFocus: mobile });

  const activeIndex = TABS.findIndex((t) => t.id === tab);

  // Keep the active tab visible when the tab strip scrolls (narrow panels).
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  const onTabKeys = (event: React.KeyboardEvent) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (activeIndex + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (activeIndex - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onTab(TABS[next].id);
    tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${TABS[next].id}"]`)?.focus();
  };

  const shell = mobile
    ? `glass-solid fixed inset-x-2 top-[12dvh] bottom-[calc(var(--dock-h)+var(--space-2)+var(--safe-b))] z-(--z-panel) flex flex-col overflow-hidden rounded-(--radius-panel) shadow-(--shadow-pop) ${
        drag > 0 ? "" : "transition-[transform,opacity] duration-(--dur-4) ease-out-expo"
      }`
    : `glass fixed right-(--gutter) top-24 bottom-[calc(var(--dock-h)+var(--space-4)+var(--safe-b))] z-(--z-panel) flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-(--radius-card) transition-[transform,opacity,clip-path] duration-(--dur-4) ease-out-expo ${
        shown
          ? "translate-x-0 opacity-100 [clip-path:inset(0_round_var(--radius-card))]"
          : "pointer-events-none translate-x-10 opacity-0 [clip-path:inset(0_0_0_100%_round_var(--radius-card))]"
      }`;

  return (
    <>
      {mobile && (
        <div
          aria-hidden
          onClick={close}
          className={`fixed inset-0 z-(--z-panel) bg-black/45 transition-opacity duration-(--dur-4) ${
            shown ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
      )}
      <aside
        ref={panelRef}
        id="library-panel"
        aria-label="Bibliothèque"
        data-panel
        data-lenis-prevent
        className={shell}
        style={
          mobile
            ? {
                transform: shown ? `translateY(${drag}px)` : "translateY(calc(100% + 12dvh))",
                opacity: shown ? 1 : 0.4,
              }
            : undefined
        }
      >
        <div
          className="shrink-0"
          onTouchStart={(event) => {
            if (mobile) startY.current = event.touches[0].clientY;
          }}
          onTouchMove={(event) => {
            if (startY.current === null) return;
            setDrag(Math.max(0, event.touches[0].clientY - startY.current));
          }}
          onTouchEnd={() => {
            if (startY.current === null) return;
            startY.current = null;
            if (drag > 90) close();
            setDrag(0);
          }}
        >
          {mobile && <span aria-hidden className="mx-auto mt-2 block h-1 w-9 rounded-full bg-white/25" />}
          <div className="flex items-center justify-between px-4 pb-2 pt-2 md:pt-3">
            <span className="font-mono text-micro uppercase tracking-[0.28em] text-ink-2 md:tracking-[0.36em]">
              bibliothèque · {count}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer la bibliothèque"
              className="btn-icon -mr-2 grid size-10 place-items-center rounded-full text-ink-2 hover:text-white"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="m1 1 10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="px-3 pb-2">
            <div
              ref={tabsRef}
              role="tablist"
              aria-label="Sections de la bibliothèque"
              onKeyDown={onTabKeys}
              className="relative grid grid-cols-5 rounded-(--radius-control) bg-white/[0.04] p-1"
            >
              <span
                aria-hidden
                className="absolute bottom-1 left-1 top-1 rounded-[9px] bg-white/12 transition-transform duration-(--dur-3) ease-out-expo"
                style={{
                  width: "calc((100% - 0.5rem) / 5)",
                  transform: `translateX(${activeIndex * 100}%)`,
                }}
              />
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  data-tab={entry.id}
                  id={`lib-tab-${entry.id}`}
                  aria-selected={tab === entry.id}
                  aria-controls="lib-tabpanel"
                  tabIndex={tab === entry.id ? 0 : -1}
                  onClick={() => onTab(entry.id)}
                  className={`relative min-h-10 truncate px-1 text-xs font-semibold transition-colors ${
                    tab === entry.id ? "text-white" : "text-ink-2 hover:text-white"
                  }`}
                >
                  {entry.label}
                  {entry.id === "queue" && queueLength > 0 && (
                    <span className="ml-1 font-mono text-[10px] text-[var(--c2)]">{queueLength}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          role="tabpanel"
          id="lib-tabpanel"
          aria-labelledby={`lib-tab-${tab}`}
          key={tab}
          className="tab-in flex min-h-0 flex-1 flex-col"
        >
          {tab === "library" && <LibraryTab onMore={onMore} />}
          {tab === "queue" && <QueueTab onMore={onMore} onBrowse={() => onTab("library")} />}
          {tab === "albums" && <AlbumsTab onMore={onMore} />}
          {tab === "playlists" && <PlaylistsTab onMore={onMore} />}
          {tab === "stats" && <StatsTab />}
        </div>
      </aside>
    </>
  );
}
