"use client";

import { useBeatPulse } from "@/hooks/useBeatPulse";
import { useQualityAttribute } from "@/hooks/useQualityAttribute";

/**
 * Single mount point for the app-wide UI effects. Everything here works
 * through delegated listeners, refs and CSS custom properties: no per-frame
 * React state.
 */
export default function FxRoot() {
  useQualityAttribute();
  useBeatPulse();
  return null;
}
