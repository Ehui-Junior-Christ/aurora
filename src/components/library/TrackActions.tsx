"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePlayer } from "@/store/player-store";
import { useDismissable } from "@/hooks/useDismissable";
import type { Track } from "@/lib/types";

function Item({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 w-full items-center gap-3 rounded-(--radius-control) px-3 text-left text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35"
    >
      <span className="grid size-5 shrink-0 place-items-center text-ink-2">{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

/**
 * Per-track action sheet (bottom sheet on mobile, floating card on desktop):
 * play next, add to queue, add to playlist, edit tags.
 */
export default function TrackActions({
  track,
  onClose,
  onEdit,
}: {
  track: Track;
  onClose: () => void;
  onEdit?: (track: Track) => void;
}) {
  const playlists = usePlayer((s) => s.playlists);
  const playNext = usePlayer((s) => s.playNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const addToPlaylist = usePlayer((s) => s.addToPlaylist);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const [view, setView] = useState<"main" | "playlists">("main");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissable(panelRef, onClose, { outside: false });

  const done = (message: string) => {
    setFeedback(message);
    window.setTimeout(onClose, 650);
  };

  const inLibrary = usePlayer((s) => s.tracks.some((t) => t.id === track.id));

  return (
    <div className="fixed inset-0 z-(--z-overlay) flex items-end justify-center md:items-center" data-panel data-lenis-prevent>
      <div aria-hidden onClick={onClose} className="backdrop-in absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Actions pour ${track.title}`}
        className="glass-solid sheet-in relative m-2 mb-[calc(var(--safe-b)+0.5rem)] max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-(--radius-panel) p-2 shadow-(--shadow-pop) md:menu-in md:m-0"
      >
        <div className="flex items-center gap-3 px-3 pb-2 pt-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold">{track.title}</p>
            <p className="truncate text-xs text-ink-2">{track.artist}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="btn-icon grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:text-white"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="m1 1 10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mx-2 mb-1 h-px bg-white/10" />

        {feedback ? (
          <p role="status" className="px-3 py-6 text-center text-sm text-[var(--c2)]">
            {feedback}
          </p>
        ) : view === "main" ? (
          <>
            <Item
              icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 4h8M2 8h8M2 12h5M12 9v5M9.5 11.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              onClick={() => {
                playNext(track);
                done("Lu juste après ce titre");
              }}
            >
              Lire ensuite
            </Item>
            <Item
              icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 4h12M2 8h12M2 12h7M12 10v4M10 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              onClick={() => {
                addToQueue(track);
                done("Ajouté à la file");
              }}
            >
              Ajouter à la file
            </Item>
            <Item
              icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              onClick={() => setView("playlists")}
              disabled={!inLibrary}
            >
              Ajouter à une playlist…
            </Item>
            {onEdit && inLibrary && (
              <Item
                icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="m10.5 2.5 3 3L6 13H3v-3l7.5-7.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>}
                onClick={() => onEdit(track)}
              >
                Modifier les infos
              </Item>
            )}
          </>
        ) : (
          <>
            <div className="flex gap-2 px-2 pb-2 pt-1">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Nouvelle playlist…"
                aria-label="Nom de la nouvelle playlist"
                className="h-10 min-w-0 flex-1 rounded-(--radius-control) border border-white/10 bg-white/5 px-3 text-base text-white outline-none placeholder:text-ink-3 focus:border-white/30 md:text-sm"
              />
              <button
                type="button"
                disabled={!newName.trim()}
                onClick={() => {
                  void createPlaylist(newName).then(() => {
                    const list = usePlayer.getState().playlists;
                    const created = list[list.length - 1];
                    if (created) void addToPlaylist(created.id, track.id);
                    done(`Ajouté à « ${newName.trim()} »`);
                  });
                }}
                className="btn-icon min-h-10 rounded-(--radius-control) bg-white px-3 text-micro font-bold uppercase tracking-[0.14em] text-black disabled:opacity-35"
              >
                Créer
              </button>
            </div>
            {playlists.length === 0 && (
              <p className="px-3 pb-3 text-xs text-ink-2">Aucune playlist pour l’instant.</p>
            )}
            {playlists.map((playlist) => (
              <Item
                key={playlist.id}
                icon={<span className="block size-2 rounded-full bg-white/40" />}
                onClick={() => {
                  void addToPlaylist(playlist.id, track.id);
                  done(`Ajouté à « ${playlist.name} »`);
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{playlist.name}</span>
                  <span className="text-micro text-ink-3">{playlist.trackIds.length}</span>
                </span>
              </Item>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
