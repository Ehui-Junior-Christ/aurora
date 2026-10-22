"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publishes the player dock height as `--dock-h` on :root so every floating
 * layer (panels, toasts, mode switcher) can sit above it without magic numbers.
 * The value includes the dock's own bottom gap; callers add `--safe-b`.
 */
export function useDockHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const write = () => {
      const h = el.offsetHeight;
      if (h > 0) root.style.setProperty("--dock-h", `calc(${h}px + var(--dock-gap))`);
    };
    write();
    const observer = new ResizeObserver(write);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--dock-h");
    };
  }, [ref]);
}
