"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/store/player-store";
import Timeline from "./Timeline";
import EqPanel from "./EqPanel";
import styles from "./PlayerBar.module.css";

function PlayIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4.2 2.6a1 1 0 0 1 1.53-.85l9 5.4a1 1 0 0 1 0 1.72l-9 5.4a1 1 0 0 1-1.53-.86V2.6Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2.5" y="1.5" width="4" height="13" rx="1.2" />
      <rect x="9.5" y="1.5" width="4" height="13" rx="1.2" />
    </svg>
  );
}

export default function PlayerBar({
  immersive,
  lyricsOpen,
  onToggleLyrics,
}: {
  immersive: boolean;
  lyricsOpen: boolean;
  onToggleLyrics: () => void;
}) {
  const track = usePlayer((s) => s.tracks[s.current]);
  const playing = usePlayer((s) => s.playing);
  const volume = usePlayer((s) => s.volume);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const lyricsAvailable = usePlayer((s) => s.lyricsAvailable);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const [eqOpen, setEqOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowRight" && event.shiftKey) {
        next();
      } else if (event.code === "ArrowLeft" && event.shiftKey) {
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, next, prev]);

  return (
    <div
      className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 transition-all duration-700 md:inset-x-auto md:left-1/2 md:bottom-6 md:w-[min(1120px,calc(100vw-6rem))] md:-translate-x-1/2 ${
        immersive ? "pointer-events-none translate-y-6 opacity-0" : "opacity-100"
      }`}
    >
      <div className="glass-strong rounded-[26px] px-4 py-3.5 shadow-[0_28px_90px_-24px_rgba(0,0,0,0.95)] md:px-6 md:py-4">
        <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,250px)_1fr_minmax(0,240px)] md:items-center md:gap-4">
          {/* Cover & Title */}
          <div className="flex items-center gap-3 min-w-0">
            {track?.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.coverUrl}
                alt=""
                className="size-10 md:size-14 shrink-0 rounded-lg md:rounded-xl object-cover"
              />
            ) : (
              <div
                className="grid size-10 md:size-14 shrink-0 place-items-center rounded-lg md:rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--c1) 70%, transparent), color-mix(in srgb, var(--c3) 55%, transparent))",
                }}
              >
                <svg className="hidden md:block" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M7 15V5.8a1 1 0 0 1 .76-.97l6-1.5A1 1 0 0 1 15 4.3v8.2M7 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10-2.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.5l8-2"
                    stroke="rgba(255,255,255,.9)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs md:text-sm font-semibold">{track?.title ?? "—"}</p>
              <p className="truncate text-[10px] md:text-xs text-white/45">{track?.artist}</p>
            </div>
            
            {/* Mobile-only Play/Pause */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                data-cursor="magnetic"
                onClick={toggle}
                aria-label={playing ? "Pause" : "Lecture"}
                className="relative grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md"
              >
                <span className={`transition-opacity duration-200 ml-0.5 ${playing ? "opacity-0" : "opacity-100"}`}>
                  <PlayIcon />
                </span>
                <span className={`absolute transition-opacity duration-200 ${playing ? "opacity-100" : "opacity-0"}`}>
                  <PauseIcon />
                </span>
              </button>
              <button
                type="button"
                onClick={() => next()}
                className="grid size-9 place-items-center rounded-full text-white/65 hover:text-white"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M7.3 8 2 4.5v7L7.3 8Zm1.4-3.5v7L14 8 8.7 4.5Z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Main Controls (Desktop & Mobile 2nd row) */}
          <div className="flex items-center justify-between md:justify-center gap-1 md:gap-2.5">
            <button
              type="button"
              data-cursor="magnetic"
              onClick={prev}
              aria-label="Piste précédente"
              className="hidden md:grid size-9 place-items-center rounded-full text-white/65 transition-colors hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8.7 8 14 4.5v7L8.7 8ZM7.3 4.5v7L2 8l5.3-3.5Z" />
              </svg>
            </button>

            <button
              type="button"
              data-cursor="magnetic"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Lecture"}
              className="hidden md:grid relative size-12 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md transition-transform duration-300 hover:scale-105 active:scale-95"
              style={{
                boxShadow:
                  "0 0 24px color-mix(in srgb, var(--c2) 35%, transparent)",
              }}
            >
              <span
                className={`transition-opacity duration-200 ml-0.5 ${
                  playing ? "opacity-0" : "opacity-100"
                }`}
              >
                <PlayIcon />
              </span>
              <span
                className={`absolute transition-opacity duration-200 ${
                  playing ? "opacity-100" : "opacity-0"
                }`}
              >
                <PauseIcon />
              </span>
            </button>

            <button
              type="button"
              data-cursor="magnetic"
              onClick={() => next()}
              aria-label="Piste suivante"
              className="hidden md:grid size-9 place-items-center rounded-full text-white/65 transition-colors hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M7.3 8 2 4.5v7L7.3 8Zm1.4-3.5v7L14 8 8.7 4.5Z" />
              </svg>
            </button>

            <div className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />

            <button
              type="button"
              data-cursor="magnetic"
              onClick={onToggleLyrics}
              disabled={!lyricsAvailable}
              aria-label="Paroles"
              title="Paroles"
              className={`grid size-9 place-items-center rounded-full transition-colors disabled:opacity-25 ${
                lyricsOpen ? "text-[var(--c2)]" : "text-white/45 hover:text-white"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2 3.5h8M2 6.5h12M2 9.5h9M2 12.5h6"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <button
              type="button"
              data-cursor="magnetic"
              onClick={toggleShuffle}
              aria-label="Lecture aléatoire"
              title="Lecture aléatoire"
              className={`grid size-9 place-items-center rounded-full transition-colors ${
                shuffle ? "text-[var(--c2)]" : "text-white/45 hover:text-white"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M1 4h3l3 4 3 4h4M11 2.5 14.5 4 11 5.5M1 12h3l1.7-2.3M11.5 9.5 14 12l-3 1.7M14.5 4 11 2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M14 12l-3.5 1.5L14 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 4h1.2M14 12h1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              data-cursor="magnetic"
              onClick={cycleRepeat}
              aria-label={`Répétition : ${
                repeat === "off" ? "désactivée" : repeat === "all" ? "file" : "piste"
              }`}
              title={`Répétition : ${
                repeat === "off" ? "désactivée" : repeat === "all" ? "file" : "piste"
              }`}
              className={`relative grid size-9 place-items-center rounded-full transition-colors ${
                repeat !== "off"
                  ? "text-[var(--c2)]"
                  : "text-white/45 hover:text-white"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2 8a6 6 0 0 1 10.4-4.1M14 8A6 6 0 0 1 3.6 12.1M12.5 1v3h-3M3.5 15v-3h3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {repeat === "one" && (
                <span className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-[var(--c2)] text-[8px] font-bold text-black">
                  1
                </span>
              )}
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 order-3 w-full md:w-auto">
            <div className="flex-1 md:w-auto">
              <Timeline />
            </div>
            <div className="relative">
              <button
                type="button"
                data-cursor="magnetic"
                onClick={() => setEqOpen(!eqOpen)}
                aria-label="Égaliseur et options audio"
                title="Égaliseur et options"
                className={`grid size-8 place-items-center rounded-full transition-colors ${
                  eqOpen ? "text-white" : "text-white/50 hover:text-white"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M3 2v5m0 3v4m5-12v8m0 3v1m5-12v2m0 3v7"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <circle cx="3" cy="8.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="8" cy="11.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="13" cy="5.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </button>
              {eqOpen && <EqPanel onClose={() => setEqOpen(false)} />}
            </div>
            <div className={`${styles.volume} hidden items-center gap-2 md:flex`}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 2.2 4.8 5H2v6h2.8L8 13.8V2.2Zm2.5 2.05a.6.6 0 0 1 .85 0 5.3 5.3 0 0 1 0 7.5.6.6 0 1 1-.85-.85 4.1 4.1 0 0 0 0-5.8.6.6 0 0 1 0-.85Zm1.9-1.9a.6.6 0 0 1 .85 0 8 8 0 0 1 0 11.3.6.6 0 1 1-.85-.85 6.8 6.8 0 0 0 0-9.6.6.6 0 0 1 0-.85Z" />
              </svg>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="Volume"
                className={styles.slider}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
