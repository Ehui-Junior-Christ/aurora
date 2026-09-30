"use client";

import { usePlayer } from "@/store/player-store";

const TOAST_CLASS =
  "glass-strong fade-in-up fixed inset-x-4 bottom-[calc(var(--dock-h)+var(--space-4)+var(--safe-b))] z-(--z-toast) flex items-center gap-4 rounded-2xl px-5 py-4 shadow-2xl md:inset-x-auto md:left-6 md:max-w-sm";

export default function UpdateToast() {
  const updateReady = usePlayer((s) => s.updateReady);
  const refreshApp = usePlayer((s) => s.refreshApp);
  const playbackError = usePlayer((s) => s.playbackError);
  const setPlaybackError = usePlayer((s) => s.setPlaybackError);

  if (!updateReady && playbackError) {
    return (
      <div role="alert" className={TOAST_CLASS}>
        <span
          className="size-2 rounded-full"
          style={{
            background: "var(--c2)",
            boxShadow: "0 0 12px var(--c2)",
          }}
        />
        <p className="text-sm text-white/80">{playbackError}</p>
        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => setPlaybackError(null)}
          className="rounded-full border border-white/20 px-4 py-1.5 text-micro font-bold uppercase tracking-[0.2em] transition-colors hover:bg-white/10"
        >
          OK
        </button>
      </div>
    );
  }

  if (!updateReady) return null;

  return (
    <div className={TOAST_CLASS}>
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
        className="rounded-full border border-white/20 px-4 py-1.5 text-micro font-bold uppercase tracking-[0.2em] transition-colors hover:bg-white/10"
      >
        Recharger
      </button>
    </div>
  );
}
