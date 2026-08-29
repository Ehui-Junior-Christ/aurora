"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { usePlayer } from "@/store/player-store";
import UnifiedSearch from "@/components/UnifiedSearch";

const FORMATS = ["MP3", "WAV", "FLAC", "OGG", "M4A", "AAC"];

export default function LibraryGate() {
  const supported = usePlayer((s) => s.supported);
  const scanning = usePlayer((s) => s.scanning);
  const progress = usePlayer((s) => s.progress);
  const error = usePlayer((s) => s.error);
  const needsPermission = usePlayer((s) => s.needsPermission);
  const pendingDirName = usePlayer((s) => s.pendingDirName);
  const reconnect = usePlayer((s) => s.reconnect);
  const setSupported = usePlayer((s) => s.setSupported);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" && "showDirectoryPicker" in window
    );
  }, [setSupported]);

  useEffect(() => {
    if (scanning) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-gate]", {
        y: 44,
        opacity: 0,
        stagger: 0.09,
        duration: 0.95,
        ease: "power3.out",
      });
    });
    return () => ctx.revert();
  }, [scanning]);

  if (scanning) {
    const pct =
      progress.total > 0
        ? Math.round((progress.done / progress.total) * 100)
        : 0;
    return (
      <main className="relative z-10 flex flex-1 flex-col overflow-y-auto px-6 py-16">
        <div className="m-auto flex w-full max-w-md flex-col items-center gap-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.45em] text-white/40">
            Analyse de la bibliothèque
          </p>
          <div className="font-display text-7xl font-extrabold tabular-nums md:text-8xl">
            <span className="text-gradient">{progress.done}</span>
            <span className="text-white/25"> / {progress.total}</span>
          </div>
          <div className="h-[3px] w-64 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, var(--c1), var(--c3))",
                boxShadow:
                  "0 0 14px color-mix(in srgb, var(--c3) 60%, transparent)",
              }}
            />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/35">
            tags · pochettes · extraction de palette
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 flex flex-1 flex-col overflow-y-auto px-6 py-20">
      <div className="m-auto flex w-full max-w-3xl flex-col items-center text-center">
        {needsPermission ? (
          <>
            <p
              data-gate
              className="mb-6 font-mono text-[11px] uppercase tracking-[0.45em] text-white/40"
            >
              bibliothèque retrouvée
            </p>
            <h1
              data-gate
              className="font-display text-[clamp(2rem,6vw,4.5rem)] font-extrabold uppercase leading-[0.95] tracking-tight"
            >
              Bon retour.
            </h1>
            <p data-gate className="mt-6 max-w-md text-sm leading-relaxed text-white/50">
              Ton dossier « {pendingDirName} » est mémorisé. Une simple
              autorisation du navigateur suffit pour recharger ta bibliothèque.
            </p>
            <button
              data-gate
              data-cursor="magnetic"
              type="button"
              onClick={() => void reconnect()}
              className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/[0.07] px-9 py-4 font-display text-sm font-bold uppercase tracking-[0.22em] backdrop-blur-xl transition-all duration-300 hover:border-white/40 hover:bg-white/[0.12]"
            >
              Reconnecter le dossier
            </button>
          </>
        ) : (
          <>
            <p
              data-gate
              className="mb-6 font-mono text-[11px] uppercase tracking-[0.45em] text-white/40"
            >
              aurora // lecteur génératif hybride
            </p>
            <h1
              data-gate
              className="font-display max-w-5xl text-[clamp(2rem,8.5vw,7.5rem)] font-extrabold uppercase leading-[0.92] tracking-tight"
            >
              Chaque piste
              <br />
              <span className="text-gradient">respire différemment.</span>
            </h1>
            <p
              data-gate
              className="mt-6 max-w-md text-xs md:text-sm leading-relaxed text-white/50"
            >
              Cherche le titre ou l&apos;artiste de ton choix, et AURORA se charge du reste. Des visuels WebGL génératifs accompagnent chaque musique en temps réel.
            </p>

            <div data-gate className="mt-10 w-full">
              <UnifiedSearch />
            </div>

            {error && (
              <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-red-400/90">
                erreur · {error}
              </p>
            )}
            {!supported && (
              <p className="mt-5 max-w-sm text-xs leading-relaxed text-amber-200/80">
                L’API File System Access nécessite un navigateur Chromium
                (Chrome, Edge, Brave, Opera).
              </p>
            )}

            <ul data-gate className="mt-12 flex flex-wrap justify-center gap-2">
              {FORMATS.map((format) => (
                <li
                  key={format}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 font-mono text-[10px] tracking-[0.25em] text-white/40"
                >
                  {format}
                </li>
              ))}
            </ul>

            <div data-gate className="mt-16 flex flex-col items-center gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
                Obtenir l&apos;application
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="/download/aurora-mobile.apk"
                  download="aurora-mobile.apk"
                  className="group flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-6 py-3 font-display text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2m-5-4l-3 3m0 0l-3-3m3 3V4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Mobile (.apk)
                </a>
                <a
                  href="/download/AURORA.exe"
                  download="AURORA.exe"
                  className="group flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-6 py-3 font-display text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/10"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  PC (.exe)
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
