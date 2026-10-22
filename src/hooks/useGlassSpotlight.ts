"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const GLASS = ".glass, .glass-strong, .glass-solid";

/**
 * Pointer-following light inside glass surfaces (desktop only). Writes
 * --spot-x/--spot-y (px, local to the surface) and --spot-o (0|1, eased by a
 * CSS transition) on the hovered surface; the gradient lives in globals.css.
 * One rect read + two property writes per animation frame, at most.
 */
export function useGlassSpotlight(): void {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let active: HTMLElement | null = null;
    let pending: PointerEvent | null = null;
    let raf = 0;

    const release = () => {
      active?.style.setProperty("--spot-o", "0");
      active = null;
    };

    const flush = () => {
      raf = 0;
      const event = pending;
      pending = null;
      if (!event) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(GLASS) ?? null;
      if (target !== active) {
        release();
        if (!target) return;
        active = target;
        target.style.setProperty("--spot-o", "1");
      }
      if (!active) return;
      const rect = active.getBoundingClientRect();
      active.style.setProperty("--spot-x", `${Math.round(event.clientX - rect.left)}px`);
      active.style.setProperty("--spot-y", `${Math.round(event.clientY - rect.top)}px`);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !fine.matches) return;
      if (prefersReducedMotion() || document.documentElement.dataset.quality === "low") {
        if (active) release();
        return;
      }
      pending = event;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", release);
    return () => {
      cancelAnimationFrame(raf);
      release();
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", release);
    };
  }, []);
}
