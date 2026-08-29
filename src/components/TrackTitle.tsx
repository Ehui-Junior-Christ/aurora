"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { usePlayer } from "@/store/player-store";

export default function TrackTitle() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const splitRef = useRef<SplitText | null>(null);
  const track = usePlayer((s) => s.tracks[s.current]);
  const trackId = track?.id ?? null;
  const isOnline = track?.isOnline ?? false;
  const displayTitle = track?.title ?? "AURORA";

  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof window === "undefined") return;

    gsap.registerPlugin(SplitText);

    const oldChars = splitRef.current?.chars ?? null;
    splitRef.current?.revert();
    splitRef.current = null;

    const ctx = gsap.context(() => {
      if (oldChars && oldChars.length > 0) {
        gsap.to(oldChars, {
          yPercent: -120,
          opacity: 0,
          stagger: 0.016,
          duration: 0.34,
          ease: "power3.in",
          onComplete: () => {
            el.textContent = displayTitle;
            const split = new SplitText(el, { type: "chars" });
            splitRef.current = split;
            gsap.from(split.chars, {
              yPercent: 130,
              opacity: 0,
              rotateX: -55,
              stagger: 0.02,
              duration: 0.85,
              ease: "power4.out",
            });
          },
        });
      } else {
        el.textContent = displayTitle;
        const split = new SplitText(el, { type: "chars" });
        splitRef.current = split;
        gsap.from(split.chars, {
          yPercent: 130,
          opacity: 0,
          rotateX: -55,
          stagger: 0.02,
          duration: 0.85,
          ease: "power4.out",
        });
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
      className="hero-title font-display max-w-full break-words font-extrabold uppercase leading-[0.88] tracking-tight"
      style={{
        fontSize: isOnline
          ? "clamp(1.5rem, 4vw, 3rem)"
          : undefined
      }}
    >
      AURORA
    </h1>
  );
}
