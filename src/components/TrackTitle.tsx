"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { usePlayer } from "@/store/player-store";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/** Titles longer than this step down from --text-hero to --text-display. */
const LONG_TITLE = 28;

export default function TrackTitle() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const splitRef = useRef<SplitText | null>(null);
  const track = usePlayer((s) => s.tracks[s.current]);
  const trackId = track?.id ?? null;
  const displayTitle = track?.title ?? "AURORA";
  const long = displayTitle.length > LONG_TITLE;

  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof window === "undefined") return;

    // Reduced motion: a plain 0.2s crossfade, no per-character split.
    if (prefersReducedMotion()) {
      splitRef.current?.revert();
      splitRef.current = null;
      const tween = gsap.to(el, {
        opacity: 0,
        duration: 0.1,
        onComplete: () => {
          el.textContent = displayTitle;
          gsap.to(el, { opacity: 1, duration: 0.2 });
        },
      });
      return () => {
        tween.kill();
        gsap.set(el, { opacity: 1 });
      };
    }

    gsap.registerPlugin(SplitText);

    const oldChars = splitRef.current?.chars ?? null;
    splitRef.current?.revert();
    splitRef.current = null;

    const enter = () => {
      el.textContent = displayTitle;
      // "words" keeps each word unbreakable, so lines never split mid-word.
      const split = new SplitText(el, { type: "words,chars" });
      splitRef.current = split;
      gsap.from(split.chars, {
        yPercent: 130,
        opacity: 0,
        rotateX: -55,
        stagger: 0.02,
        duration: 0.85,
        ease: "power4.out",
      });
    };

    const ctx = gsap.context(() => {
      if (oldChars && oldChars.length > 0) {
        gsap.to(oldChars, {
          yPercent: -120,
          opacity: 0,
          stagger: 0.016,
          duration: 0.34,
          ease: "power3.in",
          onComplete: enter,
        });
      } else {
        enter();
      }
    }, el);

    return () => {
      ctx.revert();
      splitRef.current?.revert();
      splitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  return (
    <h1
      ref={titleRef}
      aria-label={displayTitle}
      className={`font-display max-w-full font-extrabold uppercase leading-[0.88] tracking-tight [overflow-wrap:break-word] [text-wrap:balance] ${
        long ? "hero-title-long" : "hero-title"
      }`}
    >
      AURORA
    </h1>
  );
}
