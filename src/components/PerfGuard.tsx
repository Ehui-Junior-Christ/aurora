"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePlayer } from "@/store/player-store";
import { AdaptiveQuality, initialQualityStep } from "@/lib/adaptive-quality";

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
    state.setDpr(Math.min(decision.dpr, window.devicePixelRatio || 1));
    if (usePlayer.getState().qualityLow !== decision.qualityLow) {
      usePlayer.getState().setQualityLow(decision.qualityLow);
    }
  });

  return null;
}
