"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Text whose numbers count up (from 0 on mount, from the previous value on
 * change), e.g. "3 h 05" or "12 j". Edits the text node in place, so React
 * keeps owning it; zero-padded parts keep their width.
 */
export default function TickValue({
  value,
  className,
  duration = 900,
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const node = ref.current?.firstChild;
    const from = previous.current;
    previous.current = value;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    // A cancelled run may have left an intermediate frame behind.
    node.nodeValue = value;
    if (prefersReducedMotion()) return;

    const parts = value.split(/(\d+)/);
    const fromParts = from?.split(/(\d+)/);
    const sameShape = !!fromParts && fromParts.length === parts.length;
    const numeric = parts.map((part, i) => {
      if (i % 2 === 0) return null;
      const start = sameShape && fromParts ? Number(fromParts[i]) : 0;
      return { from: start, to: Number(part), pad: part.startsWith("0") ? part.length : 0 };
    });
    if (numeric.every((n) => n === null || n.from === n.to)) return;

    const began = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      node.nodeValue = parts
        .map((part, i) => {
          const n = numeric[i];
          if (!n) return part;
          const current = String(Math.round(n.from + (n.to - n.from) * eased));
          return n.pad ? current.padStart(n.pad, "0") : current;
        })
        .join("");
      if (t < 1) raf = requestAnimationFrame(step);
    };
    step(began); // first frame now: no flash of the final value
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
