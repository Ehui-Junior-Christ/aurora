"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { usePlayer, MODE_KEYS, type VisualMode } from "@/store/player-store";
import { engine } from "@/lib/audio-engine";
import { idbGet, idbSet } from "@/lib/db";
import type { FsNode } from "@/lib/fs-scanner";
import Header from "@/components/Header";
import LibraryGate from "@/components/LibraryGate";
import TrackTitle from "@/components/TrackTitle";
import PlayerBar from "@/components/PlayerBar";
import TrackList from "@/components/TrackList";
import ModeSwitcher from "@/components/ModeSwitcher";
import LyricsPanel from "@/components/LyricsPanel";
import Onboarding from "@/components/Onboarding";
import UpdateToast from "@/components/UpdateToast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
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
      className={`fade-in-up mb-5 font-mono text-[11px] uppercase tracking-[0.45em] text-white/40 transition-opacity duration-700 ${
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
      <span className="text-sm text-white/45">{track?.album ?? ""}</span>
      {track?.bpm ? (
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-white/50">
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
      className={`absolute bottom-64 right-10 hidden text-[10px] uppercase tracking-[0.5em] text-white/30 transition-opacity duration-700 xl:block ${
        immersive ? "opacity-0" : "opacity-100"
      }`}
      style={{ writingMode: "vertical-rl" }}
    >
      organisme procédural — graine {seed.toString(16).padStart(8, "0")}
    </div>
  );
}

export default function Home() {
  const hasTracks = usePlayer((s) => s.tracks.length > 0);
  const setVisualMode = usePlayer((s) => s.setVisualMode);
  const lyricsAvailable = usePlayer((s) => s.lyricsAvailable);
  const currentTrackId = usePlayer((s) => s.tracks[s.current]?.id ?? null);
  const [immersive, setImmersive] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const lyricsClosedFor = useRef<string | null>(null);

  useEffect(() => {
    if (lyricsAvailable && lyricsClosedFor.current !== currentTrackId) {
      setLyricsOpen(true);
    }
  }, [lyricsAvailable, currentTrackId]);

  const toggleLyrics = () => {
    setLyricsOpen((open) => {
      if (open) lyricsClosedFor.current = currentTrackId;
      return !open;
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      const state = usePlayer.getState();
      if (state.sleepAt !== null && Date.now() >= state.sleepAt) {
        state.setSleep(0);
        engine.pause();
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      const modeIndex = MODE_KEYS.indexOf(event.key as VisualMode);
      if (modeIndex >= 0) {
        setVisualMode(MODE_KEYS[modeIndex]);
      } else if (event.key === "f" || event.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setVisualMode]);

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
      const merged = [
        ...dirs.filter((d) => d.name !== handle.name),
        handle as unknown as FsNode,
      ];
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

  useEffect(() => {
    void import("@/lib/db").then(({ idbGet }) => {
      void idbGet<boolean>("prefs", "onboarded").then((done) => {
        if (!done) usePlayer.getState().setHelpOpen(true);
      });
    });
  }, []);

  return (
    <div className="relative min-h-dvh">
      <Visualizer />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <Header immersive={immersive} />
        {hasTracks ? (
          <>
            <main
              className={`pointer-events-none relative flex flex-1 flex-col justify-end px-5 pb-44 transition-transform duration-700 md:px-12 md:pb-52 ${
                immersive ? "translate-y-6" : ""
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
            <ModeSwitcher />
            {lyricsOpen && <LyricsPanel />}
            <GlobalProgressBar />
          </>
        ) : (
          <LibraryGate />
        )}
      </div>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[75] grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-white/30 px-12 py-10 text-center">
            <p className="font-display text-2xl font-bold">
              Dépose ton dossier musique
            </p>
            <p className="mt-2 text-xs text-white/50">
              Il sera mémorisé avec tes autres sources
            </p>
          </div>
        </div>
      )}

      <Onboarding />
      <UpdateToast />
      <CustomCursor />
    </div>
  );
}
