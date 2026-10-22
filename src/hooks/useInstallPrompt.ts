"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// The event can fire before React mounts the button: capture it globally.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let installedFlag = false;
let captureInstalled = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function ensureCapture(): void {
  if (captureInstalled || typeof window === "undefined") return;
  captureInstalled = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // keep the mini-infobar away, we show our own button
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedFlag = true;
    notify();
  });
}

if (typeof window !== "undefined") ensureCapture();

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export interface InstallPromptState {
  /** True when the browser offers installation: show the "Installer" button. */
  canInstall: boolean;
  /** True when running as an installed app (hide the button). */
  installed: boolean;
  /** Opens the native install dialog. Resolves to the user's choice. */
  promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">;
}

export function useInstallPrompt(): InstallPromptState {
  const [, force] = useState(0);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    ensureCapture();
    setStandalone(isStandalone());
    const listener = () => force((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferred;
    if (!event) return "unavailable" as const;
    deferred = null; // a prompt event can only be used once
    notify();
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome;
    } catch {
      return "unavailable" as const;
    }
  }, []);

  return {
    canInstall: deferred !== null && !standalone && !installedFlag,
    installed: standalone || installedFlag,
    promptInstall,
  };
}
