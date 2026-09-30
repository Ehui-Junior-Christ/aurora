"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePlayer } from "@/store/player-store";
import Timeline from "./Timeline";
import EqPanel from "./EqPanel";
import styles from "./PlayerBar.module.css";
import { useDockHeight } from "@/hooks/useDockHeight";
import { useDismissable } from "@/hooks/useDismissable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePresence } from "@/hooks/usePresence";
import Marquee from "@/components/fx/Marquee";

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

/* Play <-> pause morph: two quads whose vertices slide between a split
   triangle and two bars (CSS `d` transition; browsers without it snap). */
const PLAY_A = "M5 2.6 L9.6 5.3 L9.6 10.7 L5 13.4 Z";
const PLAY_B = "M9.6 5.3 L14 8 L14 8 L9.6 10.7 Z";
const PAUSE_A = "M3.2 2.2 L6.8 2.2 L6.8 13.8 L3.2 13.8 Z";
const PAUSE_B = "M9.2 2.2 L12.8 2.2 L12.8 13.8 L9.2 13.8 Z";

function PlayPauseGlyph({ playing, size }: { playing: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
      aria-hidden
      className="pp-glyph"
    >
      <path d={playing ? PAUSE_A : PLAY_A} />
      <path d={playing ? PAUSE_B : PLAY_B} />
    </svg>
  );
}

function PrevIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8.7 8 14 4.5v7L8.7 8ZM7.3 4.5v7L2 8l5.3-3.5Z" />
    </svg>
  );
}

function NextIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M7.3 8 2 4.5v7L7.3 8Zm1.4-3.5v7L14 8 8.7 4.5Z" />
    </svg>
  );
}

function LyricsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 3.5h8M2 6.5h12M2 9.5h9M2 12.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
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
  );
}

function RepeatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 8a6 6 0 0 1 10.4-4.1M14 8A6 6 0 0 1 3.6 12.1M12.5 1v3h-3M3.5 15v-3h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EqIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 2v5m0 3v4m5-12v8m0 3v1m5-12v2m0 3v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="3" cy="8.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="11.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13" cy="5.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function VisualIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M7 15V5.8a1 1 0 0 1 .76-.97l6-1.5A1 1 0 0 1 15 4.3v8.2M7 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10-2.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8.5l8-2"
        stroke="rgba(255,255,255,.9)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared pieces                                                      */
/* ------------------------------------------------------------------ */

function CoverLayer({ url, iconless, className = "" }: { url?: string; iconless: boolean; className?: string }) {
  if (url) {
    // YouTube hq/mq/sd thumbnails are 4:3 with baked-in letterbox bars:
    // zoom them so a square crop shows only the 16:9 picture.
    const letterboxed = /ytimg\.com\/vi\/[^/]+\/(hq|mq|sd)default/.test(url);
    return (
      <div className={`absolute inset-0 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className={`size-full object-cover ${letterboxed ? "scale-[1.34]" : ""}`}
        />
      </div>
    );
  }
  return (
    <div
      className={`absolute inset-0 grid place-items-center ${className}`}
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--c1) 70%, transparent), color-mix(in srgb, var(--c3) 55%, transparent))",
      }}
    >
      {!iconless && <NoteIcon />}
    </div>
  );
}

/**
 * Track cover. On track change the outgoing art stays underneath while the
 * new one wipes in (clip-path + settle scale), see .cover-in in globals.css.
 */
function Cover({ className, iconless = false }: { className: string; iconless?: boolean }) {
  const coverUrl = usePlayer((s) => s.tracks[s.current]?.coverUrl);
  const [shown, setShown] = useState(coverUrl);
  // null: idle; string ("" = placeholder): the layer being replaced.
  const [outgoing, setOutgoing] = useState<string | null>(null);
  if (shown !== coverUrl) {
    setOutgoing(shown ?? "");
    setShown(coverUrl);
  }
  useEffect(() => {
    if (outgoing === null) return;
    const timer = window.setTimeout(() => setOutgoing(null), 760);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`}>
      {outgoing !== null && (
        <CoverLayer url={outgoing || undefined} iconless={iconless} className="cover-out" />
      )}
      <CoverLayer
        key={coverUrl ?? "none"}
        url={coverUrl}
        iconless={iconless}
        className={outgoing !== null ? "cover-in" : ""}
      />
    </div>
  );
}

function PlayPauseButton({
  className,
  iconScale = 1,
}: {
  className: string;
  iconScale?: number;
}) {
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  return (
    <button
      type="button"
      data-cursor="magnetic"
      data-magnetic
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      aria-label={playing ? "Pause" : "Lecture"}
      data-beat
      data-ripple
      className={`btn-icon relative grid shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md hover:bg-white/15 ${className}`}
      style={{ boxShadow: "0 0 24px color-mix(in srgb, var(--c2) 35%, transparent)" }}
    >
      <span aria-hidden className="beat-halo" />
      <PlayPauseGlyph playing={playing} size={Math.round(16 * iconScale)} />
    </button>
  );
}

function repeatLabel(repeat: string): string {
  return `Répétition : ${repeat === "off" ? "désactivée" : repeat === "all" ? "file" : "piste"}`;
}

function ToggleButton({
  label,
  active,
  onClick,
  disabled,
  children,
  className = "size-9",
  pressed = true,
  badge,
  buttonRef,
  controls,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  /** Expose aria-pressed (toggle) or aria-expanded (popover trigger). */
  pressed?: boolean;
  badge?: ReactNode;
  buttonRef?: React.Ref<HTMLButtonElement>;
  controls?: string;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-cursor="magnetic"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed ? active : undefined}
      aria-expanded={pressed ? undefined : active}
      aria-controls={controls}
      className={`btn-icon relative grid place-items-center rounded-full disabled:opacity-25 ${className} ${
        active ? "text-[var(--c2)]" : "text-white/55 hover:text-white"
      }`}
    >
      {children}
      {badge}
    </button>
  );
}

function RepeatOneBadge() {
  return (
    <span className="badge-pop absolute right-0 top-0 grid size-3.5 place-items-center rounded-full bg-[var(--c2)] text-[8px] font-bold text-black">
      1
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Player                                                             */
/* ------------------------------------------------------------------ */

export default function PlayerBar({
  immersive,
  lyricsOpen,
  onToggleLyrics,
}: {
  immersive: boolean;
  lyricsOpen: boolean;
  onToggleLyrics: () => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const dockRef = useRef<HTMLDivElement>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  useDockHeight(dockRef);

  useEffect(() => {
    if (isDesktop) setNowPlayingOpen(false);
  }, [isDesktop]);


  return (
    <>
      <div
        ref={dockRef}
        data-dock
        data-panel
        className={`fixed inset-x-3 bottom-[calc(var(--dock-gap)+var(--safe-b))] z-(--z-dock) transition-all duration-700 md:inset-x-auto md:left-1/2 md:w-[min(1120px,calc(100vw-6rem))] md:-translate-x-1/2 ${
          immersive ? "pointer-events-none translate-y-6 opacity-0" : "opacity-100"
        }`}
      >
        {isDesktop === true && (
          <DesktopDock lyricsOpen={lyricsOpen} onToggleLyrics={onToggleLyrics} />
        )}
        {isDesktop === false && (
          <MobileDock
            sheetOpen={nowPlayingOpen}
            onOpen={() => setNowPlayingOpen(true)}
          />
        )}
      </div>
      {isDesktop === false && (
        <NowPlayingSheet
          open={nowPlayingOpen}
          onClose={() => setNowPlayingOpen(false)}
          lyricsOpen={lyricsOpen}
          onToggleLyrics={onToggleLyrics}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop dock (unchanged layout)                                    */
/* ------------------------------------------------------------------ */

/**
 * Artist line, Aurora Mix aware: "MIX → next title" (with a hairline
 * progress) during a transition, BPM · Camelot key chip otherwise.
 */
function MixMeta({ artist }: { artist?: string }) {
  const transition = usePlayer((s) => s.mixTransition);
  const info = usePlayer((s) =>
    s.mix.enabled && s.trackMix && s.trackMix.id === s.tracks[s.current]?.id ? s.trackMix : null
  );
  if (transition) {
    return (
      <span aria-live="polite" title={`Aurora Mix — ${transition.toTitle}`}>
        <span className="font-mono text-micro uppercase tracking-[0.2em] text-[var(--c2)]">Mix →</span>{" "}
        <span className="text-white/80">{transition.toTitle}</span>
        <span aria-hidden className="ml-2 inline-block h-px w-8 align-middle bg-white/15">
          <span
            className="block h-px bg-[var(--c2)]"
            style={{ width: `${Math.round(transition.progress * 100)}%` }}
          />
        </span>
      </span>
    );
  }
  return (
    <>
      {artist}
      {info && (
        <span
          className="ml-2 font-mono text-micro tabular-nums tracking-wider text-white/45"
          title={`${info.bpm.toFixed(1)} BPM · ${info.keyName}`}
        >
          {Math.round(info.bpm)} BPM{info.camelot ? ` · ${info.camelot}` : ""}
        </span>
      )}
    </>
  );
}

function DesktopDock({
  lyricsOpen,
  onToggleLyrics,
}: {
  lyricsOpen: boolean;
  onToggleLyrics: () => void;
}) {
  const track = usePlayer((s) => s.tracks[s.current]);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const lyricsAvailable = usePlayer((s) => s.lyricsAvailable);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const [eqOpen, setEqOpen] = useState(false);
  const eqTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <div className="glass-strong rounded-[26px] px-6 py-4 shadow-(--shadow-dock)">
        {/* md/lg: timeline gets its own row; xl: single row, timeline takes the slack. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2.5 [grid-template-areas:'meta_ctrl_side''time_time_time'] xl:grid-cols-[minmax(0,250px)_auto_minmax(0,1fr)_auto] xl:gap-x-6 xl:[grid-template-areas:'meta_ctrl_time_side']">
          <div className="flex min-w-0 items-center gap-3 [grid-area:meta]">
            <Cover className="size-14 rounded-xl" />
            <div key={track?.id ?? "none"} className="meta-swap min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{track?.title ?? "—"}</p>
              <p className="truncate text-xs text-ink-2">
                <MixMeta artist={track?.artist} />
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2.5 [grid-area:ctrl]">
            <button
              type="button"
              data-cursor="magnetic"
              onClick={() => prev()}
              aria-label="Piste précédente"
              className="btn-icon grid size-9 place-items-center rounded-full text-white/65 hover:text-white"
            >
              <PrevIcon />
            </button>
            <PlayPauseButton className="size-12" />
            <button
              type="button"
              data-cursor="magnetic"
              onClick={() => next()}
              aria-label="Piste suivante"
              className="btn-icon grid size-9 place-items-center rounded-full text-white/65 hover:text-white"
            >
              <NextIcon />
            </button>

            <div aria-hidden className="mx-1 h-5 w-px bg-white/10" />

            <ToggleButton
              label="Paroles"
              active={lyricsOpen}
              onClick={onToggleLyrics}
              disabled={!lyricsAvailable}
            >
              <LyricsIcon />
            </ToggleButton>
            <ToggleButton label="Lecture aléatoire" active={shuffle} onClick={toggleShuffle}>
              <ShuffleIcon />
            </ToggleButton>
            <ToggleButton
              label={repeatLabel(repeat)}
              active={repeat !== "off"}
              onClick={cycleRepeat}
              badge={repeat === "one" ? <RepeatOneBadge /> : null}
            >
              <RepeatIcon />
            </ToggleButton>
          </div>

          <div className="min-w-0 [grid-area:time]">
            <Timeline />
          </div>

          <div className="flex items-center justify-end gap-4 [grid-area:side]">
            <ToggleButton
              label="Égaliseur et options audio"
              active={eqOpen}
              onClick={() => setEqOpen(!eqOpen)}
              pressed={false}
              buttonRef={eqTriggerRef}
              controls="eq-panel"
              className="size-8"
            >
              <EqIcon />
            </ToggleButton>
            <div className={`${styles.volume} flex items-center gap-1`}>
              <button
                type="button"
                data-cursor="magnetic"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? "Rétablir le son" : "Couper le son"}
                title={muted ? "Rétablir le son (M)" : "Couper le son (M)"}
                className={`btn-icon grid size-8 place-items-center rounded-full ${
                  muted ? "text-[var(--c3)]" : "hover:text-white"
                }`}
              >
                {muted ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 2.2 4.8 5H2v6h2.8L8 13.8V2.2Z" fill="currentColor" />
                    <path d="m10.5 6 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 2.2 4.8 5H2v6h2.8L8 13.8V2.2Zm2.5 2.05a.6.6 0 0 1 .85 0 5.3 5.3 0 0 1 0 7.5.6.6 0 1 1-.85-.85 4.1 4.1 0 0 0 0-5.8.6.6 0 0 1 0-.85Zm1.9-1.9a.6.6 0 0 1 .85 0 8 8 0 0 1 0 11.3.6.6 0 1 1-.85-.85 6.8 6.8 0 0 0 0-9.6.6.6 0 0 1 0-.85Z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="Volume"
                className={styles.slider}
              />
            </div>
          </div>
        </div>
      </div>
      {eqOpen && <EqPanel onClose={() => setEqOpen(false)} triggerRef={eqTriggerRef} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile dock: one row, hairline progress, tap to expand             */
/* ------------------------------------------------------------------ */

function MobileDock({ sheetOpen, onOpen }: { sheetOpen: boolean; onOpen: () => void }) {
  const track = usePlayer((s) => s.tracks[s.current]);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="glass-strong relative overflow-hidden rounded-[22px] shadow-(--shadow-dock)"
      onTouchStart={(event) => {
        touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (dy < -36 && Math.abs(dx) < 50) onOpen();
        else if (Math.abs(dx) > 64 && Math.abs(dy) < 40) {
          if (dx < 0) next();
          else prev();
        }
      }}
    >
      <Timeline variant="hairline" />
      <span aria-hidden data-beat className="beat-line" />
      <div className="flex h-16 items-center gap-1 pl-2 pr-1.5">
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-label={`Ouvrir le lecteur${track ? ` : ${track.title}` : ""}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pr-1 text-left"
        >
          <Cover className="size-11 rounded-lg" iconless />
          <span key={track?.id ?? "none"} className="meta-swap min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">
              {track?.title ?? "—"}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink-2">
              <MixMeta artist={track?.artist} />
            </span>
          </span>
        </button>
        <PlayPauseButton className="size-12" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            next();
          }}
          aria-label="Piste suivante"
          data-ripple
            className="btn-icon grid size-11 shrink-0 place-items-center rounded-full text-white/75 hover:text-white"
        >
          <NextIcon size={17} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile "En lecture" fullscreen sheet                               */
/* ------------------------------------------------------------------ */

function NowPlayingSheet({
  open,
  onClose,
  lyricsOpen,
  onToggleLyrics,
}: {
  open: boolean;
  onClose: () => void;
  lyricsOpen: boolean;
  onToggleLyrics: () => void;
}) {
  const { mounted, visible } = usePresence(open, 480);
  if (!mounted) return null;
  return (
    <NowPlayingSheetBody
      visible={visible}
      onClose={onClose}
      lyricsOpen={lyricsOpen}
      onToggleLyrics={onToggleLyrics}
    />
  );
}

function NowPlayingSheetBody({
  visible,
  onClose,
  lyricsOpen,
  onToggleLyrics,
}: {
  visible: boolean;
  onClose: () => void;
  lyricsOpen: boolean;
  onToggleLyrics: () => void;
}) {
  const track = usePlayer((s) => s.tracks[s.current]);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const lyricsAvailable = usePlayer((s) => s.lyricsAvailable);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const [eqOpen, setEqOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const eqTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  const eqOpenRef = useRef(eqOpen);
  useEffect(() => {
    eqOpenRef.current = eqOpen;
  }, [eqOpen]);
  // Escape closes the EQ popover first (it handles its own key), then the sheet.
  useDismissable(
    panelRef,
    () => {
      if (!eqOpenRef.current) onClose();
    },
    { outside: false }
  );

  const canDrag = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest('[role="slider"], input, #eq-panel')) return false;
    return (panelRef.current?.scrollTop ?? 0) <= 0;
  };

  return (
    <div className="fixed inset-0 z-(--z-overlay) md:hidden" data-panel data-lenis-prevent>
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-(--dur-4) ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="En lecture"
        onTouchStart={(event) => {
          startY.current = canDrag(event.target) ? event.touches[0].clientY : null;
        }}
        onTouchMove={(event) => {
          if (startY.current === null) return;
          const dy = event.touches[0].clientY - startY.current;
          setDrag(Math.max(0, dy));
        }}
        onTouchEnd={() => {
          if (startY.current === null) return;
          startY.current = null;
          if (drag > 110) onClose();
          setDrag(0);
        }}
        className={`glass-solid absolute inset-0 flex flex-col overflow-y-auto overscroll-contain border-0 px-(--gutter) pb-[calc(var(--safe-b)+1.25rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)] ${
          drag > 0 ? "" : "transition-transform duration-(--dur-4) ease-out-expo"
        }`}
        style={{
          transform: visible ? `translateY(${drag}px)` : "translateY(100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[60%]"
          style={{
            background:
              "radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, var(--c1) 30%, transparent), transparent 70%)",
          }}
        />

        <div className="relative flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Réduire le lecteur"
            className="btn-icon grid size-11 place-items-center rounded-full text-white/80 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="m3.5 6 4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex flex-col items-center gap-1.5">
            <span aria-hidden className="block h-1 w-9 rounded-full bg-white/25" />
            <span className="font-mono text-micro uppercase tracking-[0.3em] text-ink-2">
              En lecture
            </span>
          </div>
          <span aria-hidden className="size-11" />
        </div>

        <div className="relative grid min-h-0 flex-1 place-items-center py-5">
          <Cover className="aspect-square w-[min(100%,42dvh)] rounded-(--radius-panel) shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]" />
        </div>

        <div className="relative">
          <p className="font-display line-clamp-2 text-[clamp(1.5rem,7vw,2rem)] font-extrabold uppercase leading-[0.95] tracking-tight">
            {track?.title ?? "—"}
          </p>
          <Marquee
            key={track?.id ?? "none"}
            text={`${track?.artist ?? ""}${track?.album ? ` · ${track.album}` : ""}`}
            className="mt-2 text-body text-ink-2"
          >
            {track?.artist}
            {track?.album ? <span className="text-ink-3"> · {track.album}</span> : null}
          </Marquee>
        </div>

        <div className="relative mt-5">
          <Timeline />
        </div>

        <div className="relative mt-4 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => prev()}
            aria-label="Piste précédente"
            data-ripple
            className="btn-icon grid size-14 place-items-center rounded-full text-white/80 hover:text-white"
          >
            <PrevIcon size={22} />
          </button>
          <PlayPauseButton className="size-16" iconScale={1.35} />
          <button
            type="button"
            onClick={() => next()}
            aria-label="Piste suivante"
            data-ripple
            className="btn-icon grid size-14 place-items-center rounded-full text-white/80 hover:text-white"
          >
            <NextIcon size={22} />
          </button>
        </div>

        <div className="relative mt-5 flex items-center justify-between px-1">
          <ToggleButton
            label="Paroles"
            active={lyricsOpen}
            disabled={!lyricsAvailable}
            className="size-11"
            onClick={() => {
              onToggleLyrics();
              if (!lyricsOpen) onClose();
            }}
          >
            <LyricsIcon />
          </ToggleButton>
          <ToggleButton label="Lecture aléatoire" active={shuffle} onClick={toggleShuffle} className="size-11">
            <ShuffleIcon />
          </ToggleButton>
          <ToggleButton
            label={repeatLabel(repeat)}
            active={repeat !== "off"}
            onClick={cycleRepeat}
            className="size-11"
            badge={repeat === "one" ? <RepeatOneBadge /> : null}
          >
            <RepeatIcon />
          </ToggleButton>
          <ToggleButton
            label="Égaliseur et options audio"
            active={eqOpen}
            onClick={() => setEqOpen(!eqOpen)}
            pressed={false}
            buttonRef={eqTriggerRef}
            controls="eq-panel"
            className="size-11"
          >
            <EqIcon />
          </ToggleButton>
          <ToggleButton
            label="Choisir le visuel"
            active={false}
            pressed={false}
            className="size-11"
            onClick={() => {
              onClose();
              window.dispatchEvent(new Event("aurora:open-modes"));
            }}
          >
            <VisualIcon />
          </ToggleButton>
          {eqOpen && (
            <EqPanel onClose={() => setEqOpen(false)} triggerRef={eqTriggerRef} />
          )}
        </div>
      </div>
    </div>
  );
}
