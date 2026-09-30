"use client";

import { useBeatPulse } from "@/hooks/useBeatPulse";
import { useQualityAttribute } from "@/hooks/useQualityAttribute";
import { useTextScramble } from "@/hooks/useTextScramble";

/**
 * Single mount point for the app-wide UI effects. Everything here works
 * through delegated listeners, refs and CSS custom properties: no per-frame
 * React state.
 */
export default function FxRoot() {
  useQualityAttribute();
  useBeatPulse();
  useTextScramble();
  return null;
}
