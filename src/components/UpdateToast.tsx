"use client";

import { usePlayer } from "@/store/player-store";

export default function UpdateToast() {
  const updateReady = usePlayer((s) => s.updateReady);
  const refreshApp = usePlayer((s) => s.refreshApp);

  if (!updateReady) return null;

  return (
    <div className="glass-strong fade-in-up fixed inset-x-4 top-24 z-[70] flex items-center gap-4 rounded-2xl px-5 py-4 shadow-2xl md:inset-x-auto md:bottom-6 md:left-6 md:top-auto">
      <span
        className="size-2 rounded-full"
        style={{
          background: "var(--c2)",
          boxShadow: "0 0 12px var(--c2)",
        }}
      />
      <p className="text-sm text-white/80">Nouvelle version disponible</p>
      <button
        type="button"
        data-cursor="magnetic"
        onClick={refreshApp}
        className="rounded-full border border-white/20 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors hover:bg-white/10"
      >
        Recharger
      </button>
    </div>
  );
}
