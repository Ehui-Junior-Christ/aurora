"use client";

import type { ReactNode } from "react";
import type { Track } from "@/lib/types";

export const ROW_HEIGHT = 52;

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${m} min`;
}

/** Soft c1→c3 orb used by every empty state. */
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid place-items-center px-6 py-10 text-center">
      <div aria-hidden className="relative mb-5 size-14">
        <span
          className="absolute inset-0 rounded-full opacity-90"
          style={{
            background:
              "radial-gradient(circle at 30% 28%, color-mix(in srgb, var(--c2) 80%, white 0%), transparent 55%), linear-gradient(140deg, var(--c1), var(--c3))",
          }}
        />
        <span
          className="absolute -inset-3 rounded-full opacity-40 blur-xl"
          style={{ background: "linear-gradient(140deg, var(--c1), var(--c3))" }}
        />
      </div>
      <p className="text-sm font-semibold text-ink-1">{title}</p>
      {text && <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-ink-2">{text}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="btn-icon mt-5 inline-flex min-h-10 items-center rounded-full border border-white/15 bg-white/[0.07] px-5 text-micro font-bold uppercase tracking-[0.18em] text-white hover:border-white/35 hover:bg-white/12"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="px-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3" style={{ height: ROW_HEIGHT }}>
          <div className="skeleton h-2.5 w-5 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3 rounded" style={{ width: `${78 - (i % 4) * 12}%` }} />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EqBars() {
  return (
    <span className="eq" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

export function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="13" cy="8" r="1.3" />
    </svg>
  );
}

export function PlayGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4.2 2.6a1 1 0 0 1 1.53-.85l9 5.4a1 1 0 0 1 0 1.72l-9 5.4a1 1 0 0 1-1.53-.86V2.6Z" />
    </svg>
  );
}

export function ShuffleGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1 4h3l6 8h4M11 2.5 14.5 4 11 5.5M1 12h3l1.7-2.3M11.5 10 14 12l-2.5 1.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="btn-icon grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-white"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Pill button used for "Tout lire" / "Aléatoire" in collection headers. */
export function PillButton({
  children,
  onClick,
  primary = false,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-ripple
      className={`btn-icon relative inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-micro font-bold uppercase tracking-[0.16em] ${
        primary
          ? "bg-white text-black hover:bg-white/90"
          : "border border-white/15 bg-white/[0.06] text-white hover:border-white/35"
      }`}
    >
      {children}
    </button>
  );
}

export interface RowProps {
  track: Track;
  label: string;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
  onMore?: () => void;
  trailing?: ReactNode;
}

/** 52px row: number/eq · title/artist · meta · actions (44px hit area). */
export function TrackRow({ track, label, active, playing, onPlay, onMore, trailing }: RowProps) {
  return (
    <div
      className={`group flex h-full w-full items-center gap-2 rounded-xl pl-3 transition-colors duration-200 ${
        active ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
      }`}
    >
      <button
        type="button"
        data-cursor="play"
        onClick={onPlay}
        aria-current={active ? "true" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`w-7 shrink-0 font-mono text-micro tracking-widest ${
            active ? "text-white/85" : "text-ink-3"
          }`}
        >
          {active && playing ? <EqBars /> : label}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-body leading-tight ${
              active ? "font-semibold text-white" : "text-white/85"
            } group-hover:text-white`}
          >
            {track.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-2">{track.artist}</span>
        </span>
      </button>
      {track.isOnline && (
        <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-micro uppercase tracking-[0.14em] text-ink-3">
          web
        </span>
      )}
      {track.bpm ? (
        <span className="hidden shrink-0 font-mono text-micro tracking-wider text-ink-3 sm:block">
          {track.bpm}
        </span>
      ) : null}
      {trailing}
      {onMore && (
        <button
          type="button"
          data-cursor="magnetic"
          onClick={(event) => {
            event.stopPropagation();
            onMore();
          }}
          aria-label={`Actions pour ${track.title}`}
          aria-haspopup="dialog"
          className="btn-icon grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-white [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus-visible:opacity-100"
        >
          <MoreIcon />
        </button>
      )}
    </div>
  );
}
