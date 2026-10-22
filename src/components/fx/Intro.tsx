"use client";

import { useEffect, useState } from "react";

export const INTRO_KEY = "aurora:intro";
const LETTERS = "AURORA".split("");
/** Must match the CSS timeline (.intro, ~1.15s) plus a small margin. */
const INTRO_MS = 1250;

/**
 * Branded reveal on the first load of a session. It is CSS-driven so it plays
 * from the very first paint (before hydration), never takes pointer events,
 * and is skipped by the inline <head> script in layout.tsx on repeat visits
 * (html[data-intro="skip"]). Reduced motion collapses it to nothing.
 */
export default function Intro() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* private mode: the intro simply plays again next time */
    }
    if (root.dataset.intro !== "play") {
      setGone(true);
      return;
    }
    const timer = window.setTimeout(() => {
      root.dataset.intro = "done";
      setGone(true);
    }, INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (gone) return null;

  return (
    <div aria-hidden className="intro">
      <div className="intro-word font-display" translate="no">
        {LETTERS.map((letter, i) => (
          <span key={i} className="intro-mask">
            <span className="intro-letter" style={{ "--i": i } as React.CSSProperties}>
              {letter}
            </span>
          </span>
        ))}
      </div>
      <span className="intro-line" />
    </div>
  );
}

/**
 * Seconds to hold back entrance animations so they land as the intro lifts
 * (0 when the intro is skipped or already finished).
 */
export function introDelay(): number {
  if (typeof document === "undefined") return 0;
  return document.documentElement.dataset.intro === "play" ? 0.85 : 0;
}
