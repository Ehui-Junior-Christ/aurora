"use client";

import { useEffect } from "react";
import { usePlayer } from "@/store/player-store";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              usePlayer.getState().setUpdateReady(true);
            }
          });
        });
      } catch {
        void 0;
      }
    };
    if (document.readyState === "complete") void register();
    else
      window.addEventListener("load", () => void register(), { once: true });
  }, []);

  return null;
}
