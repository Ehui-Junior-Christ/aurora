"use client";

import { useEffect } from "react";
import { usePlayer } from "@/store/player-store";

/**
 * Mirrors the adaptive-quality decision onto <html data-quality="low|high">
 * so CSS can drop expensive effects (backdrop blur, glows, spotlights)
 * without any React re-render of the consumers.
 */
export function useQualityAttribute(): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (low: boolean) => {
      root.dataset.quality = low ? "low" : "high";
    };
    apply(usePlayer.getState().qualityLow);
    const unsubscribe = usePlayer.subscribe((state, prev) => {
      if (state.qualityLow !== prev.qualityLow) apply(state.qualityLow);
    });
    return () => {
      unsubscribe();
      delete root.dataset.quality;
    };
  }, []);
}
