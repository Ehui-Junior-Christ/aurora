"use client";

import { useMemo, useState } from "react";
import { usePlayer } from "@/store/player-store";
import type { Track } from "@/lib/types";
import { BackButton, EmptyState, PillButton, PlayGlyph, ShuffleGlyph, TrackRow, ROW_HEIGHT } from "./shared";

interface Album {
  key: string;
  artist: string;
  album: string;
  cover?: string;
  tracks: Track[];
}

export default function AlbumsTab({ onMore }: { onMore: (track: Track) => void }) {
  const tracks = usePlayer((s) => s.tracks);
  const scanning = usePlayer((s) => s.scanning);
  const current = usePlayer((s) => s.tracks[s.current]?.id);
  const playing = usePlayer((s) => s.playing);
  const playCollection = usePlayer((s) => s.playCollection);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const albums = useMemo(() => {
    const map = new Map<string, Album>();
    for (const track of tracks) {
      const key = `${track.artist}||${track.album}`;
      const entry = map.get(key);
      if (entry) {
        entry.tracks.push(track);
        if (!entry.cover && track.coverUrl) entry.cover = track.coverUrl;
      } else {
        map.set(key, { key, artist: track.artist, album: track.album, cover: track.coverUrl, tracks: [track] });
      }
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
  }, [tracks]);

  const open = albums.find((a) => a.key === openKey) ?? null;

  if (open) {
    return (
      <>
        <div className="flex items-center gap-2 px-2 pb-2">
          <BackButton label="Retour aux albums" onClick={() => setOpenKey(null)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold">{open.album || "Sans album"}</p>
            <p className="truncate text-xs text-ink-2">
              {open.artist} · {open.tracks.length} titres
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-3 pb-3">
          <PillButton primary onClick={() => playCollection(open.tracks, 0)}>
            <PlayGlyph /> Lire
          </PillButton>
          <PillButton onClick={() => playCollection(open.tracks, 0, { shuffle: true })}>
            <ShuffleGlyph /> Aléatoire
          </PillButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
          {open.tracks.map((track, i) => (
            <div key={track.id} style={{ height: ROW_HEIGHT }}>
              <TrackRow
                track={track}
                label={String(i + 1).padStart(2, "0")}
                active={track.id === current}
                playing={playing}
                onPlay={() => playCollection(open.tracks, i)}
                onMore={() => onMore(track)}
              />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
      {albums.length === 0 && !scanning ? (
        <EmptyState title="Aucun album" text="Les albums apparaissent quand ta bibliothèque contient des titres." />
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-4 max-[340px]:grid-cols-1">
          {albums.map((album, i) => (
            <button
              key={album.key}
              type="button"
              data-cursor="magnetic"
              onClick={() => setOpenKey(album.key)}
              style={{ animationDelay: i < 10 ? `${i * 40}ms` : undefined }}
              className={`group rounded-(--radius-card) p-1 text-left ${i < 10 ? "stagger-in" : ""}`}
            >
              <div
                className="mb-2 aspect-square w-full overflow-hidden rounded-(--radius-card) border border-white/10"
                style={
                  album.cover
                    ? undefined
                    : {
                        background:
                          "linear-gradient(135deg, color-mix(in srgb, var(--c1) 60%, transparent), color-mix(in srgb, var(--c3) 45%, transparent))",
                      }
                }
              >
                {album.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={album.cover}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-(--dur-5) ease-out-expo group-hover:scale-105"
                  />
                )}
              </div>
              <p className="truncate text-[13px] font-semibold text-white/90">{album.album || "Sans album"}</p>
              <p className="truncate text-xs text-ink-2">
                {album.artist} · {album.tracks.length}
              </p>
            </button>
          ))}
          {scanning &&
            Array.from({ length: 4 }, (_, i) => (
              <div key={`sk-${i}`} aria-hidden className="p-1">
                <div className="skeleton mb-2 aspect-square w-full rounded-(--radius-card)" />
                <div className="skeleton mb-1.5 h-3 w-3/4 rounded" />
                <div className="skeleton h-2.5 w-1/2 rounded" />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
