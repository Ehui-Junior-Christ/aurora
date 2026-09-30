"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePlayer } from "@/store/player-store";
import { saveTextFile } from "@/lib/backup";
import { useDismissable } from "@/hooks/useDismissable";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 py-5 first:border-t-0 first:pt-0">
      <h3 className="mb-3 font-mono text-micro uppercase tracking-[0.3em] text-ink-2">{title}</h3>
      {children}
    </section>
  );
}

const BTN =
  "btn-icon inline-flex min-h-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] px-4 text-micro font-bold uppercase tracking-[0.16em] text-white hover:border-white/35 disabled:opacity-40";

/** Réglages: backup/restore, M3U import, YouTube API key. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const exportBackup = usePlayer((s) => s.exportBackup);
  const importBackup = usePlayer((s) => s.importBackup);
  const importM3u = usePlayer((s) => s.importM3u);
  const youtubeApiKey = usePlayer((s) => s.youtubeApiKey);
  const setYoutubeApiKey = usePlayer((s) => s.setYoutubeApiKey);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const m3uInput = useRef<HTMLInputElement>(null);
  useDismissable(panelRef, onClose, { outside: false });

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ tone: "ok", text: await task() });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error && error.message ? error.message : "Opération impossible.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-(--z-overlay) grid place-items-center overflow-y-auto p-3" data-panel data-lenis-prevent>
      <div aria-hidden onClick={onClose} className="backdrop-in absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="glass-solid menu-in relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-(--radius-panel) p-5 shadow-(--shadow-pop) md:p-7"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="settings-title" className="font-display text-title font-extrabold uppercase tracking-tight">
            Réglages
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les réglages"
            className="btn-icon grid size-10 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="m1 1 10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Section title="Sauvegarde">
          <p className="mb-3 text-xs leading-relaxed text-ink-2">
            Playlists, favoris, statistiques, préférences et infos modifiées, dans un fichier JSON. La clé API n’y est jamais incluse.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              className={BTN}
              onClick={() =>
                void run(async () => {
                  await saveTextFile("aurora-backup.json", await exportBackup());
                  return "Sauvegarde exportée.";
                })
              }
            >
              Exporter
            </button>
            <button type="button" disabled={busy} className={BTN} onClick={() => backupInput.current?.click()}>
              Importer…
            </button>
            <div role="radiogroup" aria-label="Mode d'import" className="flex rounded-full border border-white/10 p-0.5">
              {(["merge", "replace"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`min-h-9 rounded-full px-3 text-micro transition-colors ${
                    mode === m ? "bg-white/15 text-white" : "text-ink-2 hover:text-white"
                  }`}
                >
                  {m === "merge" ? "Fusionner" : "Remplacer"}
                </button>
              ))}
            </div>
          </div>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run(async () => {
                const report = await importBackup(await file.text(), mode);
                return `Import terminé : ${report.playlists} playlist${report.playlists > 1 ? "s" : ""}, ${report.tracksMatched}/${report.tracksTotal} titres retrouvés, ${report.metaEntries} éléments de métadonnées.`;
              });
            }}
          />
        </Section>

        <Section title="Playlists M3U">
          <p className="mb-3 text-xs leading-relaxed text-ink-2">
            Importe une playlist .m3u / .m3u8 : les titres sont retrouvés dans ta bibliothèque. L’export se fait depuis chaque playlist.
          </p>
          <button type="button" disabled={busy} className={BTN} onClick={() => m3uInput.current?.click()}>
            Importer une playlist…
          </button>
          <input
            ref={m3uInput}
            type="file"
            accept=".m3u,.m3u8,audio/x-mpegurl,audio/mpegurl"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run(async () => {
                const name = file.name.replace(/\.m3u8?$/i, "");
                const result = await importM3u(await file.text(), name);
                return `« ${name} » créée : ${result.matched}/${result.total} titres retrouvés.`;
              });
            }}
          />
        </Section>

        <Section title="Recherche en ligne">
          <p className="mb-3 text-xs leading-relaxed text-ink-2">
            Clé API YouTube Data v3 personnelle (facultative). {youtubeApiKey ? "Une clé est configurée." : "Aucune clé configurée."}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setYoutubeApiKey(apiKey);
              setApiKey("");
              setMessage({ tone: "ok", text: apiKey.trim() ? "Clé enregistrée." : "Clé par défaut rétablie." });
            }}
          >
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Nouvelle clé (vide = par défaut)"
              aria-label="Clé API YouTube"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-(--radius-control) border border-white/10 bg-white/5 px-3 text-base text-white outline-none placeholder:text-ink-3 focus:border-white/30 md:text-sm"
            />
            <button type="submit" className={BTN}>
              Enregistrer
            </button>
          </form>
        </Section>

        {message && (
          <p
            role="status"
            className={`mt-2 rounded-(--radius-control) px-3 py-2.5 text-sm ${
              message.tone === "ok" ? "bg-white/[0.06] text-ink-1" : "bg-red-500/10 text-red-100"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
