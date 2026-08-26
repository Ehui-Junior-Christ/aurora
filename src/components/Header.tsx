"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { openPipPlayer, supportsPip } from "@/components/PipPlayer";

function captureCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>("#aurora-canvas canvas");
}

function safeName(value: string): string {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "_");
}

export default function Header({ immersive }: { immersive: boolean }) {
  const sources = usePlayer((s) => s.sources);
  const count = usePlayer((s) => s.tracks.length);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const openFolder = usePlayer((s) => s.openFolder);
  const setHelpOpen = usePlayer((s) => s.setHelpOpen);
  const bloom = usePlayer((s) => s.bloom);
  const toggleBloom = usePlayer((s) => s.toggleBloom);
  const track = usePlayer((s) => s.tracks[s.current]);
  const [recording, setRecording] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setPipAvailable(supportsPip());
  }, []);

  const exportPng = () => {
    const canvas = captureCanvas();
    if (!canvas || !track) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aurora_${safeName(track.artist)}_${safeName(track.title)}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, "image/png");
  };

  const toggleRecording = () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const canvas = captureCanvas();
    if (!canvas || typeof MediaRecorder === "undefined") return;
    const mime = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const stream = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12_000_000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = track
        ? `aurora_${safeName(track.artist)}_${safeName(track.title)}.webm`
        : "aurora_visual.webm";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      recorderRef.current = null;
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
  };

  return (
    <header
      className={`relative z-20 flex items-center justify-between px-5 py-5 transition-all duration-700 md:px-12 md:py-7 ${
        immersive ? "pointer-events-none -translate-y-4 opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="block size-3 rounded-full"
          style={{
            background:
              "conic-gradient(from 140deg, var(--c1), var(--c2), var(--c3), var(--c1))",
            boxShadow: "0 0 18px color-mix(in srgb, var(--c2) 70%, transparent)",
          }}
        />
        <span
          translate="no"
          suppressHydrationWarning
          className="notranslate font-display text-lg font-extrabold tracking-[0.28em]"
        >
          AURORA
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {count > 0 && (
          <span className="hidden max-w-[220px] truncate rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-white/55 lg:block">
            {sources.length > 0 && `${sources.length} source${sources.length > 1 ? "s" : ""} · `}
            {count} titres
          </span>
        )}

        <button
          type="button"
          data-cursor="magnetic"
          onClick={toggleBloom}
          aria-label={bloom ? "Désactiver le bloom" : "Activer le bloom"}
          title={bloom ? "Bloom : activé" : "Bloom : désactivé"}
          className={`hidden size-9 place-items-center rounded-full border border-white/12 bg-white/5 transition-colors duration-300 hover:border-white/30 sm:grid ${
            bloom ? "text-white" : "text-white/35"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="2.4" fill="currentColor" />
            <path
              d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15M3 3l1.6 1.6M11.4 11.4 13 13M13 3l-1.6 1.6M4.6 11.4 3 13"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          data-cursor="magnetic"
          onClick={exportPng}
          disabled={!track}
          aria-label="Exporter le visuel en PNG"
          title="Exporter en PNG"
          className="hidden size-9 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors duration-300 hover:border-white/30 hover:text-white disabled:opacity-30 sm:grid"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M1.5 4.5A1.5 1.5 0 0 1 3 3h1.6l1.2-1.5h4.4L11.4 3H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-7Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="7.6" r="2.4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        <button
          type="button"
          data-cursor="magnetic"
          onClick={toggleRecording}
          disabled={!track}
          aria-label={recording ? "Arrêter l'enregistrement" : "Enregistrer le visuel en vidéo"}
          title={recording ? "Arrêter l'enregistrement" : "Enregistrer en WebM"}
          className={`hidden size-9 place-items-center rounded-full border transition-colors duration-300 disabled:opacity-30 sm:grid ${
            recording
              ? "border-red-500/60 bg-red-500/10 text-red-400"
              : "border-white/12 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
          }`}
        >
          <span
            className={`block size-2.5 rounded-full ${
              recording ? "animate-pulse bg-red-400" : "bg-current"
            }`}
          />
        </button>

        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => void openPipPlayer()}
          disabled={!pipAvailable}
          aria-label="Mini-lecteur flottant"
          title="Mini-lecteur flottant"
          className="hidden size-9 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors duration-300 hover:border-white/30 hover:text-white disabled:opacity-30 sm:grid"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <rect x="8" y="8" width="5.5" height="4" rx="0.8" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => setHelpOpen(true)}
          aria-label="Aide"
          title="Aide"
          className="grid size-9 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors duration-300 hover:border-white/30 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M5.8 5.8A2.3 2.3 0 0 1 10.3 6c0 1.5-2.3 1.8-2.3 3.4M8 12.4h.01"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>

        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => void openFolder()}
          className="rounded-full border border-white/12 bg-white/5 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/75 transition-colors duration-300 hover:border-white/30 hover:text-white md:px-5"
        >
          Dossier
        </button>

        {count > 0 && (
          <button
            type="button"
            data-cursor="magnetic"
            onClick={() => setQueueOpen(!queueOpen)}
            aria-label="Afficher ou masquer la file d'attente"
            className="grid size-9 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 transition-colors duration-300 hover:border-white/30 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M1 3h14M1 8h9M1 13h6M12.5 7v7M12.5 7l3-2v7l-3 2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
