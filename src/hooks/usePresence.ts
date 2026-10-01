"use client";

import { useEffect, useState } from "react";

/**
 * Delayed unmount so panels can play an exit transition.
 * `mounted` stays true until `duration` ms after `open` turns false;
 * `visible` flips one frame after mount so CSS transitions run on enter.
 */
export function usePresence(
  open: boolean,
  duration = 420
): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      // Two frames: guarantees the "from" styles are committed before flipping.
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(() => setMounted(false), reduce ? 0 : duration);
    return () => window.clearTimeout(timeout);
  }, [open, duration]);

  return { mounted, visible };
}
