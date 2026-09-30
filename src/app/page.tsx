"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { idbGet, idbSet } from "@/lib/db";
import { mergeDirectoryHandle, type FsNode } from "@/lib/fs-scanner";
import Header from "@/components/Header";
import LibraryGate from "@/components/LibraryGate";
import TrackTitle from "@/components/TrackTitle";
import PlayerBar from "@/components/PlayerBar";
import TrackList from "@/components/TrackList";
import SearchPalette from "@/components/SearchPalette";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useLaunchAction } from "@/hooks/useLaunchAction";
import ModeSwitcher from "@/components/ModeSwitcher";
import LyricsPanel from "@/components/LyricsPanel";
import Onboarding from "@/components/Onboarding";
import UpdateToast from "@/components/UpdateToast";
import GlobalProgressBar from "@/components/GlobalProgressBar";

const Visualizer = dynamic(() => import("@/components/Visualizer"), {
  ssr: false,
});
const CustomCursor = dynamic(() => import("@/components/CustomCursor"), {
  ssr: false,
});

function MetaLine({ immersive }: { immersive: boolean }) {
  const current = usePlayer((s) => s.current);
  const total = usePlayer((s) => s.tracks.length);
  return (
    <div
      key={`meta-${current}`}
      className={`fade-in-up mb-5 font-mono text-[11px] uppercase tracking-[0.45em] text-ink-2 transition-opacity duration-700 ${
        immersive ? "opacity-0" : "opacity-100"
      }`}
    >
      {String(current + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
    </div>
  );
}

function ArtistLine({ immersive }: { immersive: boolean }) {
  const track = usePlayer((s) => s.tracks[s.current]);
  return (
    <div
      key={`artist-${track?.id ?? "none"}`}
      className={`fade-in-up mt-7 flex flex-wrap items-baseline gap-x-5 gap-y-2 transition-opacity duration-700 ${
        immersive ? "opacity-0" : "opacity-100"
      }`}
    >
      <span className="font-display text-xl font-semibold tracking-wide md:text-2xl">
        {track?.artist ?? "—"}
      </span>
      <span className="text-sm text-ink-2">{track?.album ?? ""}</span>
      {track?.bpm ? (
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-micro tracking-[0.2em] text-ink-2">
          {track.bpm} BPM
        </span>
      ) : null}
    </div>
  );
}

function SeedTag({ immersive }: { immersive: boolean }) {
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);
  return (
    <div
      className={`absolute bottom-64 right-10 hidden text-micro uppercase tracking-[0.5em] text-ink-3 transition-opacity duration-700 xl:block ${
        immersive ? "opacity-0" : "opacity-100"
      }`}
      style={{ writingMode: "vertical-rl" }}
    >
      organisme procédural — graine {seed.toString(16).padStart(8, "0")}
    </div>
  );
}

function TrackAnnouncer() {
  const title = usePlayer((s) => s.tracks[s.current]?.title ?? "");
  const artist = usePlayer((s) => s.tracks[s.current]?.artist ?? "");
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {title ? `Lecture : ${title}${artist ? `, ${artist}` : ""}` : ""}
    </div>
  );
}

export default function Home() {
  const hasTracks = usePlayer((s) => s.tracks.length > 0);
  const showHome = usePlayer((s) => s.showHome);
  const currentTrackId = usePlayer((s) => s.tracks[s.current]?.id ?? null);
  const [immersive, setImmersive] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const playerView = hasTracks && !showHome;

  const queueOpen = usePlayer((s) => s.queueOpen);

  useEffect(() => {
    setLyricsOpen(false);
  }, [currentTrackId]);

  useEffect(() => {
    if (queueOpen) setLyricsOpen(false);
  }, [queueOpen]);

  const toggleLyrics = () => {
    setLyricsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        usePlayer.getState().setQueueOpen(false);
      }
      return nextOpen;
    });
  };

  useEffect(() => {
    void usePlayer.getState().restore();
    if (window.innerWidth < 768) {
      usePlayer.getState().setQueueOpen(false);
    }
  }, []);

  useEffect(() => {
    void import("@/lib/db").then(({ idbGet }) => {
      void idbGet<boolean>("prefs", "onboarded").then((done) => {
        if (!done) usePlayer.getState().setHelpOpen(true);
      });
    });
  }, []);

  useEffect(() => {
    if (!hasTracks) {
      setImmersive(false);
      return;
    }
    let idleTimer = 0;
    let ambientTimer = 0;
    const reset = () => {
      setImmersive(false);
      usePlayer.getState().setAmbient(false);
      window.clearTimeout(idleTimer);
      window.clearTimeout(ambientTimer);
      idleTimer = window.setTimeout(() => {
        if (usePlayer.getState().playing) setImmersive(true);
      }, 4500);
      ambientTimer = window.setTimeout(() => {
        if (!usePlayer.getState().playing) usePlayer.getState().setAmbient(true);
      }, 180000);
    };
    window.addEventListener("pointermove", reset, { passive: true });
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    reset();
    return () => {
      window.removeEventListener("pointermove", reset);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.clearTimeout(idleTimer);
      window.clearTimeout(ambientTimer);
    };
  }, [hasTracks]);

  const helpOpen = usePlayer((s) => s.helpOpen);
  useHotkeys({
    onToggleLyrics: () => {
      if (usePlayer.getState().lyricsAvailable) toggleLyrics();
    },
    onSearch: () => setSearchOpen((open) => !open),
    onHelp: () => setShortcutsOpen(true),
    enabled: !helpOpen && !shortcutsOpen,
  });

  useLaunchAction({
    resume: () => {
      const state = usePlayer.getState();
      if (state.current >= 0 && state.tracks.length > 0 && !state.playing) state.toggle();
    },
    search: () => setSearchOpen(true),
    shuffle: () => usePlayer.getState().playShuffledLibrary(),
  });

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest("aside, button, input, [data-panel]")) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    };
    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = event.changedTouches[0].clientX - startX;
      const dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
        if (dx < 0) {
          usePlayer.getState().next();
        } else {
          usePlayer.getState().prev();
        }
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDragOver(false);
    };
    const onDrop = async (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const item = event.dataTransfer?.items?.[0];
      if (!item) return;
      const getter = (
        item as DataTransferItem & {
          getAsFileSystemHandle?: () => Promise<
            { kind: string; name: string } | null
          >;
        }
      ).getAsFileSystemHandle;
      if (!getter) return;
      const handle = await getter.call(item);
      if (!handle || handle.kind !== "directory") return;
      const dirs = (await idbGet<FsNode[]>("handles", "musicDirs")) ?? [];
      const merged = await mergeDirectoryHandle(
        dirs,
        handle as unknown as FsNode
      );
      void idbSet("handles", "musicDirs", merged);
      await usePlayer.getState().loadAllSources(merged);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    const onDropNative = (event: DragEvent) => {
      void onDrop(event);
    };
    window.addEventListener("drop", onDropNative);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDropNative);
    };
  }, []);

  return (
    <div suppressHydrationWarning className="relative min-h-dvh">
      <Visualizer />

      <div className="relative flex min-h-dvh flex-col">
        <Header
          immersive={immersive}
          onOpenSearch={playerView ? () => setSearchOpen(true) : undefined}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        {hasTracks && !showHome ? (
          <>
            <main
              className={`pointer-events-none relative z-(--z-content) flex flex-1 flex-col justify-end px-5 transition-all duration-700 md:px-12 ${
                immersive ? "translate-y-6" : ""
              } ${
                lyricsOpen 
                  ? "opacity-0 md:opacity-100 pb-[55vh] md:pb-[calc(var(--dock-h)+5.5rem)] md:pr-[420px]" 
                  : "opacity-100 pb-[calc(var(--dock-h)+var(--safe-b)+4.5rem)] md:pb-[calc(var(--dock-h)+5.5rem)]"
              } ${
                queueOpen && !immersive && !lyricsOpen
                  ? "md:pr-[calc(min(380px,100vw-2rem)+var(--gutter)+1rem)]"
                  : ""
              }`}
            >
              <MetaLine immersive={immersive} />
              <h2 className="sr-only">Lecture en cours</h2>
              <TrackTitle />
              <ArtistLine immersive={immersive} />
              <SeedTag immersive={immersive} />
            </main>
            <PlayerBar
              immersive={immersive}
              lyricsOpen={lyricsOpen}
              onToggleLyrics={toggleLyrics}
            />
            <TrackList immersive={immersive} />
            <ModeSwitcher lyricsOpen={lyricsOpen} immersive={immersive} />
            {lyricsOpen && <LyricsPanel />}
            <GlobalProgressBar immersive={immersive} />
          </>
        ) : (
          <LibraryGate />
        )}
      </div>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-(--z-overlay) grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-white/30 px-12 py-10 text-center">
            <p className="font-display text-2xl font-bold">
              Dépose ton dossier musique
            </p>
            <p className="mt-2 text-xs text-ink-2">
              Il sera mémorisé avec tes autres sources
            </p>
          </div>
        </div>
      )}

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      <TrackAnnouncer />
      <Onboarding />
      <UpdateToast />
      <CustomCursor />
    </div>
  );
}
