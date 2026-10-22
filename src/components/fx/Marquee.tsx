"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Single-line text that scrolls (kinetic marquee) only when it does not fit,
 * instead of an ellipsis. Pauses at the start of every loop; edges fade with
 * a mask. Reduced motion: static, edge-faded.
 */
export default function Marquee({
  children,
  className = "",
  text,
}: {
  children: ReactNode;
  className?: string;
  /** Plain-text version of the content: re-measures when it changes. */
  text: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [duration, setDuration] = useState(12);

  useEffect(() => {
    const box = boxRef.current;
    const item = itemRef.current;
    if (!box || !item) return;
    const measure = () => {
      const textWidth = item.scrollWidth;
      const fits = textWidth <= box.clientWidth + 1;
      setOverflow(!fits);
      // ~45px/s reading speed, plus the hold at the start of each loop.
      setDuration(Math.max(8, (textWidth + 40) / 45 + 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div
      ref={boxRef}
      className={`marquee ${className}`}
      data-overflow={overflow ? "true" : undefined}
      style={{ "--marquee-dur": `${duration}s` } as React.CSSProperties}
    >
      <span className="marquee-track">
        <span ref={itemRef} className="marquee-item">
          {children}
        </span>
        {overflow && (
          <span aria-hidden className="marquee-item">
            {children}
          </span>
        )}
      </span>
    </div>
  );
}
