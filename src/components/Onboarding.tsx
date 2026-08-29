"use client";

import { useState } from "react";
import { usePlayer } from "@/store/player-store";

const STEPS = [
  {
    title: "Bienvenue dans AURORA",
    text: "Un lecteur hybride pour ta musique locale et le streaming gratuit via Invidious.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M10 1.5 12.2 7l5.8.3-4.5 3.7 1.5 5.6L10 13.5l-5 3.1 1.5-5.6L2 7.3 7.8 7 10 1.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Ajoute tes dossiers",
    text: "Ajoute un dossier une seule fois, complète ta bibliothèque plus tard, puis supprime les sources que tu ne veux plus.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M2 5.5A1.5 1.5 0 0 1 3.5 4h4l2 2.5h7A1.5 1.5 0 0 1 18 8v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15V5.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Cherche en ligne",
    text: "La barre unifiée trouve des morceaux en ligne et les lit directement dans le même moteur audio.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Visuels et paroles",
    text: "Chaque morceau génère un organisme WebGL unique et AURORA récupère les paroles synchronisées quand elles existent.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M6 10c1.3-2 2.7-2 4 0s2.7 2 4 0"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Raccourcis",
    text: "Espace : lecture · Shift+←/→ : piste · 1-7 : modes visuels · F : plein écran",
    icon: (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="2" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 8h.01M8 8h.01M11 8h.01M14 8h.01M5 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Onboarding() {
  const helpOpen = usePlayer((s) => s.helpOpen);
  const setHelpOpen = usePlayer((s) => s.setHelpOpen);
  const openFolder = usePlayer((s) => s.openFolder);
  const [step, setStep] = useState(0);

  if (!helpOpen) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const close = () => {
    setHelpOpen(false);
    setStep(0);
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/70 p-5 backdrop-blur-md">
      <div className="glass-strong fade-in-up w-full max-w-md rounded-3xl p-6 text-center shadow-2xl md:p-8">
        <div
          className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl text-white"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--c1) 80%, transparent), color-mix(in srgb, var(--c3) 60%, transparent))",
          }}
        >
          {current.icon}
        </div>

        <h2 className="font-display text-2xl font-bold tracking-tight">
          {current.title}
        </h2>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-white/55">
          {current.text}
        </p>

        <div className="mt-7 flex justify-center gap-2">
          {STEPS.map((entry, index) => (
            <span
              key={entry.title}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === step ? "w-6 bg-white" : "w-1.5 bg-white/25"
              }`}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={close}
            className="text-xs uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white"
          >
            Passer
          </button>
          <button
            type="button"
            data-cursor="magnetic"
            onClick={() => {
              if (isLast) {
                close();
                void openFolder();
              } else {
                setStep(step + 1);
              }
            }}
            className="rounded-full border border-white/15 bg-white/10 px-7 py-2.5 font-display text-xs font-bold uppercase tracking-[0.2em] transition-all duration-300 hover:border-white/40 hover:bg-white/15"
          >
            {isLast ? "Ajouter un dossier" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
