"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { engine, YT_STAGE_ID } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * Keeps the YouTube player visible while it plays (YouTube API terms forbid
 * hidden players). The iframes stay in the engine's fixed "stage" (moving an
 * iframe in the DOM reloads it): every frame the stage is laid over the best
 * visible slot:
 *   1. a docked slot, e.g. the artwork of the mobile "En lecture" sheet
 *      ([data-video-slot], at least MIN_SIDE x MIN_SIDE px on screen);
 *   2. otherwise the floating mini-player rendered here (200 px tall at
 *      least, draggable to any corner). It cannot be closed while a YouTube
 *      track is loaded: "Agrandir" opens the sheet (mobile) or enlarges the
 *      card (desktop); pausing or playing something else hides it.
 */

const MIN_SIDE = 200;
const CORNER_KEY = "aurora-video-corner";

type Corner = "tl" | "tr" | "bl" | "br";

function readCorner(fallback: Corner): Corner {
  try {
    const v = window.localStorage.getItem(CORNER_KEY);
    if (v === "tl" || v === "tr" || v === "bl" || v === "br") return v;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

function isYouTubeTrack(id?: string, streamUrl?: string): boolean {
  return (streamUrl ?? id ?? "").startsWith("yt:");
}

function slotUsable(el: HTMLElement): DOMRect | null {
  const rect = el.getBoundingClientRect();
  if (rect.width < MIN_SIDE - 1 || rect.height < MIN_SIDE - 1) return null;
  if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
  if (rect.right <= 0 || rect.left >= window.innerWidth) return null;
  const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  if (check && !check.call(el, { opacityProperty: true, visibilityProperty: true })) return null;
  return rect;
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      {expanded ? (
        <path d="M6.5 2.5v4h-4M9.5 13.5v-4h4M6.5 6.5 2 2M9.5 9.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M10 2.5h3.5V6M6 13.5H2.5V10M13.5 2.5 9 7M2.5 13.5 7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function FloatingCard({ desktop }: { desktop: boolean }) {
  const title = usePlayer((s) => s.tracks[s.current]?.title ?? "");
  const artist = usePlayer((s) => s.tracks[s.current]?.artist ?? "");
  const [corner, setCorner] = useState<Corner>(desktop ? "tl" : "tr");
  const [large, setLarge] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCorner(readCorner(desktop ? "tl" : "tr"));
  }, [desktop]);

  const width = desktop ? (large ? 640 : 356) : MIN_SIDE;
  const height = desktop ? (large ? 360 : MIN_SIDE) : MIN_SIDE;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    start.current = { px: event.clientX, py: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = event.clientX - s.px;
    const dy = event.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) < 6) return;
    s.moved = true;
    setDrag({ x: dx, y: dy });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s?.moved) {
      setDrag(null);
      return;
    }
    // Snap to the nearest corner (by the card centre).
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const next: Corner = `${cy < window.innerHeight / 2 ? "t" : "b"}${cx < window.innerWidth / 2 ? "l" : "r"}` as Corner;
      setCorner(next);
      try {
        window.localStorage.setItem(CORNER_KEY, next);
      } catch {
        /* storage unavailable */
      }
    }
    setDrag(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const vertical =
    corner[0] === "t"
      ? { top: desktop ? "6rem" : "calc(env(safe-area-inset-top) + 4.25rem)" }
      : { bottom: "calc(var(--dock-h) + var(--safe-b) + 0.75rem)" };
  const horizontal = corner[1] === "l" ? { left: "var(--gutter)" } : { right: "var(--gutter)" };

  return (
    <div
      ref={cardRef}
      data-panel
      role="region"
      aria-label={`Vidéo YouTube : ${title}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`glass-solid fixed z-[64] touch-none select-none rounded-(--radius-card) p-1.5 shadow-(--shadow-pop) ${
        drag ? "cursor-grabbing" : "cursor-grab transition-[top,bottom,left,right,transform] duration-(--dur-4) ease-out-expo"
      }`}
      style={{
        ...vertical,
        ...horizontal,
        transform: drag ? `translate3d(${drag.x}px, ${drag.y}px, 0)` : undefined,
      }}
    >
      <div
        data-video-slot="float"
        className="rounded-[11px] bg-black"
        style={{ width, height, transition: "width 0.4s var(--ease-out-expo), height 0.4s var(--ease-out-expo)" }}
      />
      <div className="flex items-center gap-2 pl-1.5 pt-1.5" style={{ width }}>
        <span aria-hidden className="grid h-6 w-3 shrink-0 place-items-center text-ink-3">
          <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor">
            <circle cx="1.5" cy="2" r="1" /><circle cx="4.5" cy="2" r="1" />
            <circle cx="1.5" cy="6" r="1" /><circle cx="4.5" cy="6" r="1" />
            <circle cx="1.5" cy="10" r="1" /><circle cx="4.5" cy="10" r="1" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-semibold text-ink-1">{title}</span>
          {desktop && <span className="block truncate text-micro text-ink-3">{artist}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            if (desktop) setLarge((v) => !v);
            else window.dispatchEvent(new Event("aurora:open-now-playing"));
          }}
          aria-label={desktop ? (large ? "Réduire la vidéo" : "Agrandir la vidéo") : "Ouvrir le lecteur"}
          title={desktop ? (large ? "Réduire" : "Agrandir") : "Ouvrir le lecteur"}
          className="btn-icon grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-white"
        >
          <ExpandIcon expanded={desktop && large} />
        </button>
      </div>
    </div>
  );
}

export default function VideoStage() {
  const ytTrack = usePlayer((s) => {
    const t = s.tracks[s.current];
    return !!t && isYouTubeTrack(t.id, t.streamUrl);
  });
  const desktop = useMediaQuery("(min-width: 768px)") === true;
  const [floating, setFloating] = useState(false);
  const ytTrackRef = useRef(ytTrack);
  const floatingRef = useRef(false);

  useEffect(() => {
    ytTrackRef.current = ytTrack;
  }, [ytTrack]);

  useEffect(() => {
    let raf = 0;
    let idle = 0;
    let radiusFor: HTMLElement | null = null;
    let lastKey = "";

    const setFloat = (value: boolean) => {
      if (floatingRef.current === value) return;
      floatingRef.current = value;
      setFloating(value);
    };

    const tick = () => {
      raf = 0;
      const stage = document.getElementById(YT_STAGE_ID);
      const visual = engine.ytVisual();
      const show = !!stage && visual.show && ytTrackRef.current;
      if (!stage || !show) {
        if (stage && stage.style.visibility !== "hidden") {
          stage.style.visibility = "hidden";
          stage.style.transform = "translate3d(-200vw, 0, 0)";
          lastKey = "";
        }
        setFloat(false);
        idle = window.setTimeout(schedule, 250);
        return;
      }

      let target: HTMLElement | null = null;
      let rect: DOMRect | null = null;
      let floatSlot: HTMLElement | null = null;
      for (const el of document.querySelectorAll<HTMLElement>("[data-video-slot]")) {
        if (el.dataset.videoSlot === "float") {
          floatSlot = el;
          continue;
        }
        const r = slotUsable(el);
        if (r) {
          target = el;
          rect = r;
          break;
        }
      }
      setFloat(!target);
      if (!target && floatSlot) {
        target = floatSlot;
        rect = floatSlot.getBoundingClientRect();
      }

      if (target && rect) {
        if (radiusFor !== target) {
          radiusFor = target;
          stage.style.borderRadius = getComputedStyle(target).borderRadius || "16px";
          stage.style.zIndex = target.dataset.videoSlot === "float" ? "65" : "81";
        }
        const key = `${rect.left.toFixed(1)}|${rect.top.toFixed(1)}|${rect.width.toFixed(1)}|${rect.height.toFixed(1)}`;
        if (key !== lastKey) {
          lastKey = key;
          stage.style.width = `${rect.width}px`;
          stage.style.height = `${rect.height}px`;
          stage.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
        }
        stage.style.visibility = "visible";
      }

      const layers = stage.querySelectorAll<HTMLElement>("[data-yt-layer]");
      layers.forEach((layer, i) => {
        const opacity = String(Math.round((visual.layers[i] ?? 0) * 100) / 100);
        if (layer.style.opacity !== opacity) layer.style.opacity = opacity;
        const z = i === visual.front ? "2" : "1";
        if (layer.style.zIndex !== z) layer.style.zIndex = z;
      });
      schedule();
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    schedule();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
    };
  }, []);

  return floating ? <FloatingCard desktop={desktop} /> : null;
}
