"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePlayer } from "@/store/player-store";
import {
  AdaptiveQuality,
  DPR_LADDER,
  LOW_QUALITY_STEP,
  initialQualityStep,
} from "@/lib/adaptive-quality";

export default function PerfGuard() {
  const guard = useRef<AdaptiveQuality | null>(null);
  const setDpr = useThree((state) => state.setDpr);

  useEffect(() => {
    const aq = new AdaptiveQuality({ initialStep: initialQualityStep() });
    guard.current = aq;
    const start = aq.current();
    setDpr(Math.min(start.dpr, window.devicePixelRatio || 1));
    if (start.qualityLow) usePlayer.getState().setQualityLow(true);
  }, [setDpr]);

  useFrame((state, delta) => {
    const decision = guard.current?.sample(delta);
    if (!decision) return;
    // Low quality is latched for the session: switching bloom, glass blur and
    // scene geometry back on made weaker GPUs oscillate (drop → recover → drop),
    // which flashed the whole screen at every switch. Once latched, the DPR is
    // also capped so the canvas is not resized back and forth.
    if (decision.qualityLow && !usePlayer.getState().qualityLow) {
      usePlayer.getState().setQualityLow(true);
    }
    const cap = usePlayer.getState().qualityLow
      ? DPR_LADDER[LOW_QUALITY_STEP]
      : Infinity;
    state.setDpr(Math.min(decision.dpr, cap, window.devicePixelRatio || 1));
  });

  return null;
}
