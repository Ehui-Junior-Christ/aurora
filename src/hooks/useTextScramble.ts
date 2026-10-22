"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+/=";
const LOWER = "abcdefghijklmnopqrstuvwxyz0123456789#%&*+/=";
const FRAME_MS = 38;

/**
 * Decode effect on hover for `[data-scramble]` labels (fine pointers only).
 * The element must hold a single text node: its `nodeValue` is edited in
 * place so React keeps owning the node, and the original text is restored
 * unless React changed it meanwhile. The element's width is locked while it
 * runs, so nothing around it moves.
 */
export function useTextScramble(): void {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const running = new WeakSet<HTMLElement>();

    const scramble = (el: HTMLElement) => {
      const node = el.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE || el.childNodes.length !== 1) return;
      const original = node.nodeValue ?? "";
      if (original.trim().length < 2) return;
      running.add(el);

      const rect = el.getBoundingClientRect();
      const locked = {
        width: el.style.width,
        display: el.style.display,
        overflow: el.style.overflow,
        whiteSpace: el.style.whiteSpace,
      };
      if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
      el.style.width = `${rect.width}px`;
      el.style.overflow = "hidden";
      el.style.whiteSpace = "nowrap";

      const duration = Math.min(520, 160 + original.length * 26);
      const start = performance.now();
      let lastFrame = 0;
      let lastWritten = original;

      const finish = () => {
        if (node.nodeValue === lastWritten) node.nodeValue = original;
        el.style.width = locked.width;
        el.style.display = locked.display;
        el.style.overflow = locked.overflow;
        el.style.whiteSpace = locked.whiteSpace;
        running.delete(el);
      };

      const step = (now: number) => {
        if (!el.isConnected || node.nodeValue !== lastWritten) {
          finish();
          return;
        }
        const progress = (now - start) / duration;
        if (progress >= 1) {
          finish();
          return;
        }
        if (now - lastFrame >= FRAME_MS) {
          lastFrame = now;
          let out = "";
          for (let i = 0; i < original.length; i++) {
            const ch = original[i];
            if (ch === " " || i / original.length < progress) {
              out += ch;
            } else {
              const set = ch === ch.toLowerCase() && ch !== ch.toUpperCase() ? LOWER : UPPER;
              out += set[(Math.random() * set.length) | 0];
            }
          }
          node.nodeValue = out;
          lastWritten = out;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !fine.matches || prefersReducedMotion()) return;
      const host = (event.target as Element | null)?.closest<HTMLElement>("[data-scramble-host], [data-scramble]");
      if (!host) return;
      // Only when the pointer enters the host, not while moving inside it.
      const from = event.relatedTarget as Node | null;
      if (from && host.contains(from)) return;
      const label = host.matches("[data-scramble]")
        ? host
        : host.querySelector<HTMLElement>("[data-scramble]");
      if (!label || running.has(label) || label.offsetParent === null) return;
      scramble(label);
    };

    document.addEventListener("pointerover", onOver, { passive: true });
    return () => document.removeEventListener("pointerover", onOver);
  }, []);
}
