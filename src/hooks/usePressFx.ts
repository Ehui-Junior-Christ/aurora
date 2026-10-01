"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Press feedback shared by the app:
 *  - ripple on `[data-ripple]` (mouse, pen and touch): a transient span that
 *    removes itself when its CSS animation ends;
 *  - 3D tilt + glare on `[data-tilt]` cards (fine pointers only), driven by
 *    --tilt-x/--tilt-y/--glare-x/--glare-y written once per frame.
 */
export function usePressFx(): void {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || prefersReducedMotion()) return;
      const host = (event.target as Element | null)?.closest<HTMLElement>("[data-ripple]");
      if (!host || (host as HTMLButtonElement).disabled) return;
      const rect = host.getBoundingClientRect();
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      const size = Math.hypot(rect.width, rect.height) * 1.15;
      const layer = document.createElement("span");
      layer.className = "ripple-layer";
      layer.setAttribute("aria-hidden", "true");
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${event.clientX - rect.left}px`;
      dot.style.top = `${event.clientY - rect.top}px`;
      layer.appendChild(dot);
      host.appendChild(layer);
      const cleanup = () => layer.remove();
      dot.addEventListener("animationend", cleanup, { once: true });
      window.setTimeout(cleanup, 1000);
    };

    // Toggle feedback: [aria-pressed] icon buttons pop on user clicks only
    // (never on mount); [data-burst-on] bursts instead when switching on.
    const onClick = (event: MouseEvent) => {
      if (prefersReducedMotion()) return;
      const button = (event.target as Element | null)?.closest<HTMLElement>(
        "button.btn-icon[aria-pressed], [data-burst-on]"
      );
      if (!button) return;
      const turningOn = button.getAttribute("aria-pressed") === "false";
      const attr = button.hasAttribute("data-burst-on") && turningOn ? "data-burst" : "data-pop";
      button.removeAttribute(attr);
      void button.offsetWidth; // restart the CSS animation
      button.setAttribute(attr, "");
      window.setTimeout(() => button.removeAttribute(attr), 700);
    };

    let tiltEl: HTMLElement | null = null;
    let pending: PointerEvent | null = null;
    let raf = 0;

    const resetTilt = () => {
      if (!tiltEl) return;
      tiltEl.removeAttribute("data-tilting");
      tiltEl.style.setProperty("--tilt-x", "0deg");
      tiltEl.style.setProperty("--tilt-y", "0deg");
      tiltEl.style.setProperty("--tilt-o", "0");
      tiltEl = null;
    };

    const flushTilt = () => {
      raf = 0;
      const event = pending;
      pending = null;
      if (!event) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-tilt]") ?? null;
      if (target !== tiltEl) resetTilt();
      if (!target) return;
      tiltEl = target;
      const rect = target.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      target.setAttribute("data-tilting", "");
      target.style.setProperty("--tilt-x", `${(-py * 10).toFixed(2)}deg`);
      target.style.setProperty("--tilt-y", `${(px * 12).toFixed(2)}deg`);
      target.style.setProperty("--glare-x", `${Math.round((px + 0.5) * 100)}%`);
      target.style.setProperty("--glare-y", `${Math.round((py + 0.5) * 100)}%`);
      target.style.setProperty("--tilt-o", "1");
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !fine.matches) return;
      if (prefersReducedMotion() || document.documentElement.dataset.quality === "low") {
        resetTilt();
        return;
      }
      if (!tiltEl && !(event.target as Element | null)?.closest("[data-tilt]")) return;
      pending = event;
      if (!raf) raf = requestAnimationFrame(flushTilt);
    };

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("click", onClick, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", resetTilt);
    return () => {
      cancelAnimationFrame(raf);
      resetTilt();
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", resetTilt);
    };
  }, []);
}
