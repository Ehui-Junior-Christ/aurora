"use client";

import { useEffect, useRef } from "react";
import { MODE_KEYS, usePlayer } from "@/store/player-store";

export interface ShortcutInfo {
  /** Display labels for the key combination(s). */
  keys: string[];
  label: string;
  group: "Lecture" | "Navigation" | "Affichage";
}

/** Single source of truth for the help overlay. */
export const SHORTCUTS: ShortcutInfo[] = [
  { keys: ["Espace"], label: "Lecture / pause", group: "Lecture" },
  { keys: ["←", "→"], label: "Reculer / avancer de 5 s", group: "Lecture" },
  { keys: ["Maj + ←", "Maj + →"], label: "Piste précédente / suivante", group: "Lecture" },
  { keys: ["↑", "↓"], label: "Volume + / −", group: "Lecture" },
  { keys: ["M"], label: "Couper / rétablir le son", group: "Lecture" },
  { keys: ["S"], label: "Lecture aléatoire", group: "Lecture" },
  { keys: ["R"], label: "Mode répétition", group: "Lecture" },
  { keys: ["B"], label: "Boucle A-B (A, puis B, puis effacer)", group: "Lecture" },
  { keys: ["L"], label: "Paroles", group: "Navigation" },
  { keys: ["Q"], label: "File d'attente", group: "Navigation" },
  { keys: ["/", "Ctrl + K"], label: "Rechercher", group: "Navigation" },
  { keys: ["?"], label: "Aide des raccourcis", group: "Navigation" },
  { keys: ["F"], label: "Plein écran", group: "Affichage" },
  { keys: ["1 … 7"], label: "Mode visuel", group: "Affichage" },
];

export interface HotkeyCallbacks {
  onToggleLyrics?: () => void;
  /** Defaults to toggling the store's `queueOpen`. */
  onToggleQueue?: () => void;
  onSearch?: () => void;
  onHelp?: () => void;
  /** Defaults to toggling document fullscreen. */
  onFullscreen?: () => void;
  /** Disable while a modal owns the keyboard. */
  enabled?: boolean;
}

const SEEK_STEP = 5;
const VOLUME_STEP = 0.05;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    // Sliders/checkboxes don't take text: keep shortcuts active on them.
    return !["range", "checkbox", "radio", "button", "submit"].includes(type);
  }
  return target.closest("[contenteditable=''],[contenteditable='true']") !== null;
}

function toggleFullscreen(): void {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => void 0);
}

/**
 * Centralised keyboard shortcuts. Mount once (e.g. in page.tsx) and remove the
 * ad-hoc keydown listeners of page.tsx / PlayerBar / Timeline.
 */
export function useHotkeys(callbacks: HotkeyCallbacks = {}): void {
  const ref = useRef(callbacks);
  useEffect(() => {
    ref.current = callbacks;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const cb = ref.current;
      if (cb.enabled === false || event.defaultPrevented) return;
      const mod = event.ctrlKey || event.metaKey;

      // Ctrl/Cmd+K works everywhere, even while typing.
      if (mod && !event.altKey && event.key.toLowerCase() === "k") {
        if (cb.onSearch) {
          event.preventDefault();
          cb.onSearch();
        }
        return;
      }
      if (mod || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const player = usePlayer.getState();
      const key = event.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      // Toggles must not fire repeatedly while a key is held.
      const once = (fn: () => void) => {
        event.preventDefault();
        if (!event.repeat) fn();
      };

      if (key === "?") return once(() => cb.onHelp?.());
      if (key === "/") return once(() => cb.onSearch?.());

      switch (event.code === "Space" ? " " : lower) {
        case " ":
          // Let focused buttons handle their own activation.
          if (event.target instanceof HTMLButtonElement) return;
          return once(() => player.toggle());
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) {
            if (!event.repeat) player.prev();
          } else player.seekBy(-SEEK_STEP);
          return;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) {
            if (!event.repeat) player.next();
          } else player.seekBy(SEEK_STEP);
          return;
        case "ArrowUp":
          event.preventDefault();
          player.setVolume(Math.min(1, player.volume + VOLUME_STEP));
          return;
        case "ArrowDown":
          event.preventDefault();
          player.setVolume(Math.max(0, player.volume - VOLUME_STEP));
          return;
        case "m":
          return once(() => player.toggleMute());
        case "l":
          return once(() => cb.onToggleLyrics?.());
        case "q":
          return once(() =>
            cb.onToggleQueue
              ? cb.onToggleQueue()
              : player.setQueueOpen(!player.queueOpen)
          );
        case "s":
          return once(() => player.toggleShuffle());
        case "r":
          return once(() => player.cycleRepeat());
        case "b":
          return once(() => player.cycleAbLoop());
        case "f":
          return once(() => (cb.onFullscreen ?? toggleFullscreen)());
        default: {
          if (event.shiftKey) return;
          const n = Number(key);
          if (Number.isInteger(n) && n >= 1 && n <= MODE_KEYS.length) {
            once(() => player.setVisualMode(MODE_KEYS[n - 1]));
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
