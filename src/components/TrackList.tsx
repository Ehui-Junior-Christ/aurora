"use client";

import { useMemo, useRef, useState } from "react";
import { usePlayer, type Playlist } from "@/store/player-store";

type Tab = "file" | "albums" | "playlists" | "stats";

const ROW_HEIGHT = 52;
const OVERSCAN = 8;

interface RowProps {
  track: import("@/lib/types").Track;
  index: number;
  active: boolean;
  playing: boolean;
  onPlay: (index: number) => void;
  onAdd: (trackId: string) => void;
}

function TrackRow({ track, index, active, playing, onPlay, onAdd }: RowProps) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/aurora-index", String(index));
        event.dataTransfer.effectAllowed = "move";
      }}
      className="h-full"
    >
      <button
        type="button"
        data-cursor="magnetic"
        onClick={() => onPlay(index)}
        className={`group flex h-full w-full items-center gap-3 rounded-xl px-3 text-left transition-colors duration-200 ${
          active ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
        }`}
      >
        <span
          className={`w-7 shrink-0 font-mono text-[10px] tracking-widest ${
            active ? "text-white/80" : "text-white/30"
          }`}
        >
          {active && playing ? (
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          ) : (
            String(index + 1).padStart(2, "0")
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${
              active ? "font-semibold text-white" : "text-white/75"
            } group-hover:text-white`}
          >
            {track.title}
          </span>
          <span className="block truncate text-xs text-white/40">
            {track.artist}
          </span>
        </span>
        {track.bpm ? (
          <span className="shrink-0 font-mono text-[9px] tracking-widest text-white/30">
            {track.bpm} BPM
          </span>
        ) : null}
        <span
          role="button"
          tabIndex={-1}
          data-cursor="magnetic"
          onClick={(event) => {
            event.stopPropagation();
            onAdd(track.id);
          }}
          aria-label="Ajouter à une playlist"
          className="grid size-6 shrink-0 place-items-center rounded-full text-white/30 opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover:opacity-100"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M6 1v10M1 6h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        {track.coverUrl && active && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverUrl}
            alt=""
            className="size-9 shrink-0 rounded-lg object-cover"
          />
        )}
      </button>
    </div>
  );
}

export default function TrackList({ immersive }: { immersive: boolean }) {
  const tracks = usePlayer((s) => s.tracks);
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const play = usePlayer((s) => s.play);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const reorder = usePlayer((s) => s.reorder);
  const playlists = usePlayer((s) => s.playlists);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const deletePlaylist = usePlayer((s) => s.deletePlaylist);
  const addToPlaylist = usePlayer((s) => s.addToPlaylist);
  const removeFromPlaylist = usePlayer((s) => s.removeFromPlaylist);
  const stats = usePlayer((s) => s.stats);
  const resetStats = usePlayer((s) => s.resetStats);

  const [tab, setTab] = useState<Tab>("file");
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);
  const [addMenuTrackId, setAddMenuTrackId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const dragIndex = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      tracks
        .map((track, index) => ({ track, index }))
        .filter(
          ({ track }) =>
            track.title.toLowerCase().includes(query.toLowerCase()) ||
            track.artist.toLowerCase().includes(query.toLowerCase()) ||
            track.album.toLowerCase().includes(query.toLowerCase())
        ),
    [tracks, query]
  );

  const range = useMemo(() => {
    const start = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN
    );
    const end = Math.min(
      filtered.length,
      Math.ceil((scrollTop + 460) / ROW_HEIGHT) + OVERSCAN
    );
    return { start, end };
  }, [scrollTop, filtered.length]);

  const albums = useMemo(() => {
    const map = new Map<
      string,
      { artist: string; album: string; cover?: string; indices: number[] }
    >();
    tracks.forEach((track, index) => {
      const key = `${track.artist}||${track.album}`;
      const entry = map.get(key);
      if (entry) {
        entry.indices.push(index);
        if (!entry.cover && track.coverUrl) entry.cover = track.coverUrl;
      } else {
        map.set(key, {
          artist: track.artist,
          album: track.album,
          cover: track.coverUrl,
          indices: [index],
        });
      }
    });
    return [...map.values()].sort((a, b) =>
      a.album.localeCompare(b.album)
    );
  }, [tracks]);

  const openPlaylist = playlists.find((p) => p.id === openPlaylistId) ?? null;
  const playlistTracks = useMemo(() => {
    if (!openPlaylist) return [];
    return openPlaylist.trackIds
      .map((id) => ({
        track: tracks.find((t) => t.id === id),
      }))
      .filter((x): x is { track: import("@/lib/types").Track } =>
        Boolean(x.track)
      );
  }, [openPlaylist, tracks]);

  const openAlbumData = useMemo(() => {
    if (!openAlbum) return null;
    return albums.find(
      (a) => `${a.artist}||${a.album}` === openAlbum
    );
  }, [openAlbum, albums]);

  const topPlayed = useMemo(() => {
    return Object.entries(stats.plays)
      .map(([id, count]) => ({ track: tracks.find((t) => t.id === id), count }))
      .filter((x): x is { track: import("@/lib/types").Track; count: number } =>
        Boolean(x.track)
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats, tracks]);

  const totalHours = Math.floor(stats.seconds / 3600);
  const totalMinutes = Math.floor((stats.seconds % 3600) / 60);

  const visible = filtered.slice(range.start, range.end);

  const tabs: { id: Tab; label: string }[] = [
    { id: "file", label: "File" },
    { id: "albums", label: "Albums" },
    { id: "playlists", label: "Playlists" },
    { id: "stats", label: "Stats" },
  ];

  return (
    <aside
      aria-label="File d'attente"
      className={`glass fixed right-4 top-20 bottom-44 z-20 flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] md:right-6 md:top-24 md:bottom-36 ${
        queueOpen && !immersive
          ? "translate-x-0 opacity-100"
          : "pointer-events-none translate-x-10 opacity-0"
      }`}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/45">
          bibliothèque · {tracks.length}
        </span>
        <button
          type="button"
          onClick={() => setQueueOpen(false)}
          aria-label="Fermer le panneau"
          className="text-white/40 transition-colors hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="m1 1 10 10M11 1 1 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex gap-1 px-3 pb-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id);
              setOpenPlaylistId(null);
              setOpenAlbum(null);
            }}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors ${
              tab === entry.id
                ? "bg-white/12 text-white"
                : "text-white/40 hover:text-white"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "file" && (
        <>
          <div className="px-3 pb-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher dans la bibliothèque"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none transition-colors focus:border-white/30"
            />
          </div>
          <div
            ref={listRef}
            onScroll={(event) =>
              setScrollTop((event.target as HTMLDivElement).scrollTop)
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const raw = event.dataTransfer.getData("text/aurora-index");
              if (raw === "" || dragIndex.current === null) return;
              const targetIndex = Math.min(
                filtered.length - 1,
                Math.max(
                  0,
                  range.start +
                    Math.floor(
                      (event.clientY -
                        (listRef.current?.getBoundingClientRect().top ?? 0) +
                        scrollTop) /
                        ROW_HEIGHT
                    )
                )
              );
              if (dragIndex.current !== targetIndex) {
                reorder(dragIndex.current, targetIndex);
              }
              dragIndex.current = null;
            }}
            className="flex-1 overflow-y-auto overscroll-contain px-2 pb-8"
          >
            <div
              style={{
                paddingTop: range.start * ROW_HEIGHT,
                paddingBottom: (filtered.length - range.end) * ROW_HEIGHT,
              }}
            >
              {visible.map(({ track, index }) => (
                <div
                  key={track.id}
                  style={{ height: ROW_HEIGHT }}
                  onDragStart={() => {
                    dragIndex.current = index;
                  }}
                >
                  <TrackRow
                    track={track}
                    index={index}
                    active={index === current}
                    playing={playing}
                    onPlay={play}
                    onAdd={(trackId) => setAddMenuTrackId(trackId)}
                  />
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-white/35">
                  Aucun résultat
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "albums" && !openAlbumData && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
          <div className="grid grid-cols-2 gap-3 pb-4 max-[380px]:grid-cols-1">
            {albums.map((album) => (
              <button
                key={`${album.artist}||${album.album}`}
                type="button"
                data-cursor="magnetic"
                onClick={() =>
                  setOpenAlbum(`${album.artist}||${album.album}`)
                }
                className="group text-left"
              >
                <div
                  className="mb-2 aspect-square w-full overflow-hidden rounded-xl border border-white/10"
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
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                </div>
                <p className="truncate text-xs font-semibold text-white/85">
                  {album.album}
                </p>
                <p className="truncate text-[10px] text-white/40">
                  {album.artist} · {album.indices.length} titres
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "albums" && openAlbumData && (
        <>
          <div className="flex items-center gap-2 px-3 pb-2">
            <button
              type="button"
              onClick={() => setOpenAlbum(null)}
              className="text-white/50 transition-colors hover:text-white"
              aria-label="Retour aux albums"
            >
              ←
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{openAlbumData.album}</p>
              <p className="truncate text-[10px] text-white/40">
                {openAlbumData.artist}
              </p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-8">
            {openAlbumData.indices.map((index) => {
              const track = tracks[index];
              const active = index === current;
              return (
                <button
                  key={track.id}
                  type="button"
                  data-cursor="magnetic"
                  onClick={() => play(index)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    active ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="w-6 font-mono text-[10px] text-white/30">
                    {active && playing ? (
                      <span className="eq" aria-hidden>
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80">
                    {track.title}
                  </span>
                  {track.bpm ? (
                    <span className="font-mono text-[9px] text-white/30">
                      {track.bpm}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === "playlists" && !openPlaylist && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
          <div className="mb-3 flex gap-2">
            <input
              value={newPlaylistName}
              onChange={(event) => setNewPlaylistName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newPlaylistName.trim()) {
                  void createPlaylist(newPlaylistName);
                  setNewPlaylistName("");
                }
              }}
              placeholder="Nouvelle playlist…"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30"
            />
            <button
              type="button"
              data-cursor="magnetic"
              onClick={() => {
                if (newPlaylistName.trim()) {
                  void createPlaylist(newPlaylistName);
                  setNewPlaylistName("");
                }
              }}
              className="rounded-lg border border-white/15 px-3 text-xs text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              +
            </button>
          </div>
          {playlists.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-white/35">
              Ajoute des titres avec le bouton + de la file            </p>
          )}
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="group mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
            >
              <button
                type="button"
                data-cursor="magnetic"
                onClick={() => setOpenPlaylistId(playlist.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm text-white/85">{playlist.name}</p>
                <p className="text-[10px] text-white/40">
                  {playlist.trackIds.length} titres
                </p>
              </button>
              <button
                type="button"
                onClick={() => void deletePlaylist(playlist.id)}
                aria-label={`Supprimer ${playlist.name}`}
                className="text-white/25 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path
                    d="m1 1 10 10M11 1 1 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "playlists" && openPlaylist && (
        <>
          <div className="flex items-center gap-2 px-3 pb-2">
            <button
              type="button"
              onClick={() => setOpenPlaylistId(null)}
              className="text-white/50 transition-colors hover:text-white"
              aria-label="Retour aux playlists"
            >
              ←
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {openPlaylist.name}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-8">
            {playlistTracks.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-white/35">
                Playlist vide
              </p>
            )}
            {playlistTracks.map(({ track }) => {
              const globalIndex = tracks.findIndex((t) => t.id === track.id);
              const active = globalIndex === current;
              return (
                <div
                  key={track.id}
                  className="group flex items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.05]"
                >
                  <button
                    type="button"
                    onClick={() => play(globalIndex)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p
                      className={`truncate text-xs ${
                        active ? "font-semibold text-white" : "text-white/75"
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="truncate text-[10px] text-white/40">
                      {track.artist}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void removeFromPlaylist(openPlaylist.id, track.id)
                    }
                    aria-label="Retirer de la playlist"
                    className="text-white/25 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                      <path d="M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "stats" && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
          <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center">
            <p className="font-display text-3xl font-extrabold">
              {totalHours}h
              <span className="text-white/40"> {totalMinutes}min</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-white/40">
              temps d’écoute total
            </p>
          </div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
            top titres
          </p>
          {topPlayed.length === 0 && (
            <p className="py-4 text-center text-xs text-white/35">
              Écoute quelques morceaux d’abord
            </p>
          )}
          {topPlayed.map(({ track, count }, position) => {
            const max = topPlayed[0]?.count ?? 1;
            return (
              <div key={track.id} className="mb-2">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-white/75">
                    <span className="mr-2 font-mono text-[9px] text-white/30">
                      {String(position + 1).padStart(2, "0")}
                    </span>
                    {track.title}
                  </span>
                  <span className="font-mono text-[10px] text-white/40">
                    {count}×
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(count / max) * 100}%`,
                      background:
                        "linear-gradient(90deg, var(--c1), var(--c3))",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={resetStats}
            className="mt-4 w-full rounded-lg border border-white/10 py-2 text-[10px] uppercase tracking-[0.25em] text-white/45 transition-colors hover:border-white/30 hover:text-white"
          >
            Réinitialiser
          </button>
        </div>
      )}

      {addMenuTrackId !== null && (
        <div
          className="absolute inset-0 z-10 flex items-end bg-black/50 p-3 backdrop-blur-sm"
          onClick={() => setAddMenuTrackId(null)}
        >
          <div
            className="glass-strong w-full rounded-2xl p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
              Ajouter à…
            </p>
            {playlists.length === 0 && (
              <p className="px-1 pb-2 text-xs text-white/40">
                Crée d’abord une playlist dans l’onglet Playlists
              </p>
            )}
            {playlists.map((playlist: Playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => {
                  void addToPlaylist(playlist.id, addMenuTrackId);
                  setAddMenuTrackId(null);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-white/75 transition-colors hover:bg-white/10"
              >
                {playlist.name}
                <span className="text-[10px] text-white/35">
                  {playlist.trackIds.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
