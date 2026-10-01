"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { useDismissable } from "@/hooks/useDismissable";
import type { Track } from "@/lib/types";

const FIELD =
  "h-11 w-full rounded-(--radius-control) border border-white/10 bg-white/5 px-3 text-base text-white outline-none placeholder:text-ink-3 focus:border-white/30 md:text-sm";

/** "Modifier les infos": tag overrides stored locally, the file is untouched. */
export default function TrackEditDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const editTrack = usePlayer((s) => s.editTrack);
  const resetTrackEdit = usePlayer((s) => s.resetTrackEdit);
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [cover, setCover] = useState<Blob | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | undefined>(track.coverUrl);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useDismissable(panelRef, onClose, { outside: false });

  useEffect(() => {
    if (!(cover instanceof Blob)) return;
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  return (
    <div className="fixed inset-0 z-(--z-overlay) grid place-items-center overflow-y-auto p-3" data-panel data-lenis-prevent>
      <div aria-hidden onClick={onClose} className="backdrop-in absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          await editTrack(track.id, { title: title.trim(), artist: artist.trim(), album: album.trim(), cover });
          setBusy(false);
          onClose();
        }}
        className="glass-solid menu-in relative w-full max-w-md rounded-(--radius-panel) p-5 shadow-(--shadow-pop) md:p-6"
      >
        <h2 id="edit-title" className="font-display text-title font-extrabold uppercase tracking-tight">
          Modifier les infos
        </h2>
        <p className="mt-1 text-xs text-ink-2">Enregistré dans AURORA uniquement : le fichier n’est pas modifié.</p>

        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Choisir une pochette"
            className="group relative size-24 shrink-0 overflow-hidden rounded-(--radius-card) border border-white/15"
            style={
              preview && cover !== null
                ? undefined
                : { background: "linear-gradient(135deg, color-mix(in srgb, var(--c1) 70%, transparent), color-mix(in srgb, var(--c3) 55%, transparent))" }
            }
          >
            {preview && cover !== null && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-full object-cover" />
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-micro font-bold uppercase tracking-[0.14em] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              Changer
            </span>
          </button>
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-icon min-h-10 rounded-full border border-white/15 px-4 text-micro font-bold uppercase tracking-[0.16em] hover:border-white/35"
            >
              Choisir une image
            </button>
            <button
              type="button"
              onClick={() => {
                setCover(null);
                setPreview(undefined);
              }}
              className="min-h-9 px-1 text-micro uppercase tracking-[0.14em] text-ink-2 hover:text-white"
            >
              Retirer la pochette perso
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setCover(file);
            }}
          />
        </div>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-micro uppercase tracking-[0.16em] text-ink-2">Titre</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1 block text-micro uppercase tracking-[0.16em] text-ink-2">Artiste</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1 block text-micro uppercase tracking-[0.16em] text-ink-2">Album</span>
            <input value={album} onChange={(e) => setAlbum(e.target.value)} className={FIELD} />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              await resetTrackEdit(track.id);
              setBusy(false);
              onClose();
            }}
            className="min-h-10 px-1 text-micro uppercase tracking-[0.16em] text-ink-2 hover:text-white"
          >
            Réinitialiser
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-icon min-h-11 rounded-full border border-white/15 px-5 text-micro font-bold uppercase tracking-[0.16em] hover:border-white/35"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="btn-icon min-h-11 rounded-full bg-white px-6 text-micro font-bold uppercase tracking-[0.16em] text-black hover:bg-white/90 disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
