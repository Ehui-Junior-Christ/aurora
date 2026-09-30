"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { usePlayer, MODE_KEYS, type VisualMode } from "@/store/player-store";
import { useDismissable } from "@/hooks/useDismissable";
import VisualTuner from "./VisualTuner";

const ICONS: Record<string, ReactNode> = {
  organism: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  ),
  tunnel: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="3.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  metaballs: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="5.5" cy="6" r="3.4" />
      <circle cx="10.5" cy="10" r="2.8" />
    </svg>
  ),
  particles: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="4" r="1.1" />
      <circle cx="12" cy="3" r="1.1" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="3.5" cy="12" r="1.1" />
      <circle cx="13" cy="12.5" r="1.1" />
    </svg>
  ),
  galaxy: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 8c0-3 2.5-4.5 5-3.5M8 8c0 3-2.5 4.5-5 3.5M8 8c3 0 4.5 2.5 3.5 5M8 8c-3 0-4.5-2.5-3.5-5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  ),
  nebula: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 10.5a3 3 0 0 1 .6-5.9 3.6 3.6 0 0 1 6.9.9A2.6 2.6 0 0 1 11 10.5H4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  waves: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
};

const LABELS: Record<string, string> = {
  organism: "Organisme",
  tunnel: "Tunnel",
  metaballs: "Métaballs",
  particles: "Particules",
  galaxy: "Galaxie",
  nebula: "Nébuleuse",
  waves: "Ondes",
};

function TunerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Arrow-key navigation shared by both radiogroups. */
function onRadioKeys(
  event: ReactKeyboardEvent<HTMLElement>,
  current: VisualMode,
  select: (mode: VisualMode) => void
) {
  const index = MODE_KEYS.indexOf(current);
  let next: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    next = (index + 1) % MODE_KEYS.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    next = (index - 1 + MODE_KEYS.length) % MODE_KEYS.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = MODE_KEYS.length - 1;
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  select(MODE_KEYS[next]);
  const group = event.currentTarget;
  requestAnimationFrame(() => {
    group
      .querySelector<HTMLElement>(`[data-mode="${MODE_KEYS[next]}"]`)
      ?.focus();
  });
}

export default function ModeSwitcher({
  lyricsOpen,
  immersive = false,
}: {
  lyricsOpen?: boolean;
  immersive?: boolean;
}) {
  const hidden = immersive;
  return (
    <>
      <DesktopModeBar hidden={hidden} />
      <MobileModePill hidden={hidden || !!lyricsOpen} />
    </>
  );
}

function DesktopModeBar({ hidden }: { hidden: boolean }) {
  const mode = usePlayer((s) => s.visualMode);
  const setVisualMode = usePlayer((s) => s.setVisualMode);
  const autoMode = usePlayer((s) => s.autoMode);
  const setAutoMode = usePlayer((s) => s.setAutoMode);
  const [tunerOpen, setTunerOpen] = useState(false);
  const tunerTriggerRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placedRef = useRef(false);

  const select = (entry: VisualMode) => setVisualMode(entry);

  // Sliding active pill: follows the current mode with an expo ease.
  useLayoutEffect(() => {
    const group = groupRef.current;
    const indicator = indicatorRef.current;
    if (!group || !indicator) return;
    const target = group.querySelector<HTMLElement>(`[data-mode="${mode}"]`);
    if (!target) return;
    const x = target.offsetLeft;
    const width = target.offsetWidth;
    if (!placedRef.current || prefersReducedMotion()) {
      gsap.set(indicator, { x, width });
      placedRef.current = true;
      return;
    }
    gsap.to(indicator, { x, width, duration: 0.38, ease: "expo.out", overwrite: true });
  }, [mode]);

  // Re-place without animation when the bar becomes visible (breakpoint change).
  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const indicator = indicatorRef.current;
      const target = group.querySelector<HTMLElement>(
        `[data-mode="${usePlayer.getState().visualMode}"]`
      );
      if (indicator && target && target.offsetWidth > 0) {
        gsap.set(indicator, { x: target.offsetLeft, width: target.offsetWidth });
        placedRef.current = true;
      }
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`glass fixed bottom-[calc(var(--dock-h)+var(--space-3)+var(--safe-b))] left-(--gutter) z-(--z-dock) hidden items-center gap-1 rounded-full p-1 transition-all duration-(--dur-4) md:flex ${
        hidden ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100"
      }`}
    >
      <button
        type="button"
        data-cursor="magnetic"
        onClick={() => setAutoMode(!autoMode)}
        aria-pressed={autoMode}
        aria-label="Mode automatique — un visuel par morceau"
        className={`btn-icon group relative grid h-9 place-items-center rounded-full px-2.5 text-micro font-extrabold tracking-wider ${
          autoMode ? "bg-[var(--c3)]/25 text-[var(--c3)]" : "text-ink-2 hover:text-white"
        }`}
      >
        AUTO
        <Tooltip label="Un visuel par morceau" />
      </button>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Mode visuel"
        onKeyDown={(event) => onRadioKeys(event, mode, select)}
        className="relative flex items-center gap-1"
      >
        <span
          ref={indicatorRef}
          aria-hidden
          className={`absolute left-0 top-0 h-9 rounded-full transition-opacity duration-(--dur-3) ${
            autoMode ? "bg-white/[0.07] opacity-70" : "bg-white/15 opacity-100"
          }`}
          style={{ width: 36 }}
        />
        {MODE_KEYS.map((entry, index) => {
          const active = mode === entry;
          return (
            <button
              key={entry}
              type="button"
              role="radio"
              data-mode={entry}
              data-cursor="magnetic"
              aria-checked={!autoMode && active}
              aria-label={`${LABELS[entry]} (touche ${index + 1})`}
              aria-keyshortcuts={String(index + 1)}
              tabIndex={active ? 0 : -1}
              onClick={() => select(entry)}
              className={`btn-icon group relative grid size-9 place-items-center rounded-full ${
                active && !autoMode
                  ? "text-white"
                  : autoMode
                    ? active
                      ? "text-white/80"
                      : "text-white/35 hover:text-white"
                    : "text-white/50 hover:text-white"
              }`}
            >
              {ICONS[entry]}
              <Tooltip label={LABELS[entry]} shortcut={String(index + 1)} />
            </button>
          );
        })}
      </div>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
      <div className="relative">
        <button
          ref={tunerTriggerRef}
          type="button"
          data-cursor="magnetic"
          onClick={() => setTunerOpen(!tunerOpen)}
          aria-expanded={tunerOpen}
          aria-controls="visual-tuner"
          aria-label="Réglage visuel"
          className={`btn-icon group relative grid size-9 place-items-center rounded-full ${
            tunerOpen ? "text-white" : "text-ink-2 hover:text-white"
          }`}
        >
          <TunerIcon />
          {!tunerOpen && <Tooltip label="Réglage visuel" />}
        </button>
        {tunerOpen && (
          <VisualTuner onClose={() => setTunerOpen(false)} triggerRef={tunerTriggerRef} />
        )}
      </div>
    </div>
  );
}

function Tooltip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 flex -translate-x-1/2 translate-y-1 items-center gap-2 whitespace-nowrap rounded-lg border border-white/10 bg-[rgba(9,9,15,0.92)] px-2.5 py-1.5 text-micro font-medium normal-case tracking-normal text-ink-1 opacity-0 shadow-(--shadow-pop) transition-all duration-(--dur-2) group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
    >
      {label}
      {shortcut && (
        <kbd className="rounded border border-white/15 px-1 font-mono text-micro leading-4 text-ink-2">
          {shortcut}
        </kbd>
      )}
    </span>
  );
}

function MobileModePill({ hidden }: { hidden: boolean }) {
  const mode = usePlayer((s) => s.visualMode);
  const setVisualMode = usePlayer((s) => s.setVisualMode);
  const autoMode = usePlayer((s) => s.autoMode);
  const setAutoMode = usePlayer((s) => s.setAutoMode);
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useDismissable(sheetRef, () => setOpen(false), {
    enabled: open,
    ignore: [pillRef],
    manageFocus: false,
  });

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  // The "En lecture" sheet can ask for the mode picker.
  useEffect(() => {
    const onOpenModes = () => setOpen(true);
    window.addEventListener("aurora:open-modes", onOpenModes);
    return () => window.removeEventListener("aurora:open-modes", onOpenModes);
  }, []);

  // Bring the active mode into view when the sheet opens.
  useEffect(() => {
    if (!open) return;
    const active = rowRef.current?.querySelector<HTMLElement>(`[data-mode="${mode}"]`);
    active?.scrollIntoView({ inline: "center", block: "nearest" });
    active?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const select = (entry: VisualMode) => setVisualMode(entry);

  return (
    <div className="md:hidden">
      <button
        ref={pillRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mode-sheet"
        aria-label={`Visuel : ${LABELS[mode]}${autoMode ? ", automatique" : ""}`}
        className={`glass btn-icon fixed bottom-[calc(var(--dock-h)+var(--space-3)+var(--safe-b))] left-(--gutter) z-(--z-dock) inline-flex h-11 items-center gap-2 rounded-full pl-3.5 pr-3 text-xs font-semibold text-ink-1 transition-all duration-(--dur-4) ${
          hidden ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100"
        } ${open ? "border-white/30 bg-white/10" : ""}`}
      >
        <span className="text-white">{ICONS[mode]}</span>
        <span>{LABELS[mode]}</span>
        {autoMode && (
          <span className="rounded-full bg-[var(--c3)]/25 px-1.5 py-0.5 text-[10px] font-extrabold leading-none tracking-wider text-[var(--c3)]">
            AUTO
          </span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          aria-hidden
          className={`text-ink-2 transition-transform duration-(--dur-3) ${open ? "rotate-180" : ""}`}
        >
          <path d="m2 7.5 4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={sheetRef}
          id="mode-sheet"
          role="dialog"
          aria-label="Choisir le visuel"
          data-panel
          data-lenis-prevent
          className="glass-solid sheet-in fixed inset-x-(--gutter) bottom-[calc(var(--dock-h)+var(--space-3)+var(--safe-b)+3.25rem)] z-(--z-popover) max-h-[60dvh] overflow-y-auto rounded-(--radius-panel) p-3 shadow-(--shadow-pop)"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="font-mono text-micro uppercase tracking-[0.3em] text-ink-2">
              Visuel
            </span>
            <button
              type="button"
              onClick={() => setAutoMode(!autoMode)}
              aria-pressed={autoMode}
              className={`btn-icon inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-micro font-extrabold uppercase tracking-wider ${
                autoMode ? "bg-[var(--c3)]/20 text-[var(--c3)]" : "text-ink-2"
              }`}
            >
              Auto
              <span
                aria-hidden
                className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                  autoMode ? "bg-[var(--c3)]" : "bg-white/15"
                }`}
              >
                <span
                  className={`block size-3 rounded-full bg-white transition-transform duration-(--dur-2) ${
                    autoMode ? "translate-x-3" : ""
                  }`}
                />
              </span>
            </button>
          </div>
          <div
            ref={rowRef}
            role="radiogroup"
            aria-label="Mode visuel"
            onKeyDown={(event) => onRadioKeys(event, mode, select)}
            className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]"
          >
            {MODE_KEYS.map((entry) => {
              const active = mode === entry;
              return (
                <button
                  key={entry}
                  type="button"
                  role="radio"
                  data-mode={entry}
                  aria-checked={!autoMode && active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => select(entry)}
                  className={`btn-icon flex min-h-16 w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-(--radius-card) border text-micro ${
                    active
                      ? autoMode
                        ? "border-white/20 bg-white/[0.07] text-white"
                        : "border-white/30 bg-white/15 text-white"
                      : "border-white/[0.06] text-ink-2"
                  }`}
                >
                  {ICONS[entry]}
                  <span>{LABELS[entry]}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-white/10 px-1 pt-3">
            <VisualTuner inline />
          </div>
        </div>
      )}
    </div>
  );
}
