"use client";

import { useEffect, useRef } from "react";

/** Actions declared as PWA shortcuts in public/manifest.webmanifest. */
export type LaunchAction = "resume" | "search" | "shuffle";

const ACTIONS: LaunchAction[] = ["resume", "search", "shuffle"];

/**
 * Reads `?action=` once on mount (PWA shortcut launch), calls the matching
 * handler and removes the parameter from the address bar.
 */
export function useLaunchAction(
  handlers: Partial<Record<LaunchAction, () => void>>
): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const action = url.searchParams.get("action") as LaunchAction | null;
    const hadSource = url.searchParams.has("source");
    if (!action && !hadSource) return;
    url.searchParams.delete("action");
    url.searchParams.delete("source");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (action && ACTIONS.includes(action)) ref.current[action]?.();
  }, []);
}
