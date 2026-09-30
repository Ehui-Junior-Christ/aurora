"use client";

import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/audio-engine";
import { currentCueIndex } from "@/lib/lyrics";
import { formatLrcTime } from "@/lib/lrc-sync";
import { saveTextFile } from "@/lib/backup";
import { usePlayer } from "@/store/player-store";
import { usePresence } from "@/hooks/usePresence";
import { useLyricsSync } from "@/hooks/useLyricsSync";

/**
 * Synced lyrics panel (right panel on desktop, sheet over the hero on mobile,
 * with the track title in its header since the hero is hidden there).
 * Includes a tap-to-sync LRC editor and .lrc export.
 */
export default function LyricsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const available = usePlayer((s) => s.lyricsAvailable);
  const lyricsCount = usePlayer((s) => s.lyrics.length);
  const { mounted, visible } = usePresence(open && available && lyricsCount > 0, 480);
  if (!mounted) return null;
  return <LyricsBody visible={visible} onClose={onClose} />;
}

function LyricsBody({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const lyrics = usePlayer((s) => s.lyrics);
  const track = usePlayer((s) => s.tracks[s.current]);
  const trackId = track?.id;
  const offset = usePlayer((s) => s.lyricsOffset);
  const setOffset = usePlayer((s) => s.setLyricsOffset);
  const exportLrc = usePlayer((s) => s.exportLrc);
  const [time, setTime] = useState(0);
  const [editing, setEditing] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [saved, setSaved] = useState(false);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const sync = useLyricsSync();

  useEffect(() => {
    const interval = window.setInterval(() => setTime(engine.currentTime), 100);
    return () => window.clearInterval(interval);
  }, [trackId]);

  useEffect(() => {
    sync.cancel();
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  const activeIndex = currentCueIndex(lyrics, time - offset);

  useEffect(() => {
    if (!editing) activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, editing]);

  const session = sync.session;

  return (
    <div
      role="region"
      aria-label="Paroles synchronisées"
      data-panel
      data-lenis-prevent
      className={`glass fixed inset-x-3 top-20 bottom-[calc(var(--dock-h)+var(--space-4)+var(--safe-b))] z-(--z-panel) flex flex-col overflow-hidden rounded-(--radius-card) transition-[transform,opacity] duration-(--dur-4) ease-out-expo max-md:bg-[rgba(8,8,13,0.72)] sm:left-auto sm:right-4 sm:w-[min(380px,calc(100vw-2rem))] md:right-(--gutter) md:top-24 ${
        visible ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-10 opacity-0"
      }`}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <p className="font-mono text-micro uppercase tracking-[0.36em] text-ink-2">
            {editing ? "synchroniser" : "paroles"}
          </p>
          {/* Mobile: the hero is hidden behind the sheet, keep context here. */}
          <p className="mt-2 truncate font-display text-lead font-extrabold uppercase leading-tight md:hidden">
            {track?.title}
          </p>
          <p className="truncate text-xs text-ink-2 md:hidden">{track?.artist}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer les paroles"
          className="btn-icon -mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:text-white"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="m1 1 10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!editing ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
            {lyrics.map((cue, index) => {
              const active = index === activeIndex;
              return (
                <p
                  key={`${cue.time}-${index}`}
                  ref={active ? activeRef : null}
                  className={`py-1 text-sm leading-snug transition-colors duration-300 ${
                    active ? "font-semibold text-white" : index < activeIndex ? "text-ink-3" : "text-ink-2"
                  }`}
                >
                  {cue.text}
                </p>
              );
            })}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5">
            <div className="flex items-center rounded-full border border-white/10 bg-white/5 font-mono text-micro text-white/70">
              <button type="button" onClick={() => setOffset(offset - 0.5)} className="min-h-9 px-2.5 transition-colors hover:text-white" title="Avancer les paroles" aria-label="Avancer les paroles de 0,5 seconde">−0.5</button>
              <span className="w-12 text-center text-white/85" aria-live="polite" aria-label={`Décalage des paroles : ${offset.toFixed(1)} secondes`}>
                {offset > 0 ? `+${offset.toFixed(1)}` : offset.toFixed(1)}s
              </span>
              <button type="button" onClick={() => setOffset(offset + 0.5)} className="min-h-9 px-2.5 transition-colors hover:text-white" title="Retarder les paroles" aria-label="Retarder les paroles de 0,5 seconde">+0.5</button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  sync.start();
                  setEditing(true);
                  setSaved(false);
                }}
                className="min-h-9 rounded-full px-3 text-micro font-semibold uppercase tracking-[0.14em] text-ink-2 transition-colors hover:text-white"
              >
                Synchroniser
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = exportLrc();
                  if (r) void saveTextFile(r.fileName, r.text, "text/plain");
                }}
                className="min-h-9 rounded-full px-3 text-micro font-semibold uppercase tracking-[0.14em] text-ink-2 transition-colors hover:text-white"
              >
                .lrc
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="shrink-0 px-5 pb-2 text-xs leading-relaxed text-ink-2">
            Lance la lecture et touche <strong className="text-white">Taper</strong> au début de chaque ligne. Touche une ligne pour reprendre depuis elle.
          </p>
          {pasteOpen && (
            <div className="shrink-0 px-4 pb-2">
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                rows={5}
                placeholder="Colle les paroles, une ligne par vers…"
                aria-label="Paroles à synchroniser"
                className="w-full resize-none rounded-(--radius-control) border border-white/10 bg-white/5 p-3 text-base text-white outline-none placeholder:text-ink-3 focus:border-white/30 md:text-sm"
              />
              <button
                type="button"
                disabled={!pasteText.trim()}
                onClick={() => {
                  sync.start(pasteText);
                  setPasteOpen(false);
                }}
                className="btn-icon mt-2 min-h-9 rounded-full bg-white px-4 text-micro font-bold uppercase tracking-[0.14em] text-black disabled:opacity-35"
              >
                Utiliser ce texte
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
            {session?.lines.map((line, index) => {
              const stamp = session.times[index];
              const isCursor = index === session.cursor;
              return (
                <div
                  key={index}
                  ref={(el) => {
                    if (isCursor && el) el.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                  className={`group flex items-center gap-2 rounded-lg px-2 ${isCursor ? "bg-white/10" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => sync.goTo(index)}
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className={`w-14 shrink-0 font-mono text-micro ${stamp === null ? "text-ink-3" : "text-[var(--c2)]"}`}>
                      {stamp === null ? "--:--" : formatLrcTime(stamp)}
                    </span>
                    <span className={`truncate text-sm ${isCursor ? "font-semibold text-white" : "text-ink-2"}`}>{line}</span>
                  </button>
                  {stamp !== null && (
                    <span className="flex shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <button type="button" onClick={() => sync.nudge(index, -0.1)} aria-label={`Avancer la ligne ${index + 1} de 0,1 s`} className="grid size-8 place-items-center font-mono text-micro text-ink-2 hover:text-white">−</button>
                      <button type="button" onClick={() => sync.nudge(index, 0.1)} aria-label={`Retarder la ligne ${index + 1} de 0,1 s`} className="grid size-8 place-items-center font-mono text-micro text-ink-2 hover:text-white">+</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-white/10 p-3">
            <button
              type="button"
              onClick={sync.tap}
              disabled={!session || session.cursor >= session.lines.length}
              className="btn-icon mb-2 min-h-12 w-full rounded-(--radius-control) text-sm font-bold uppercase tracking-[0.2em] text-black disabled:opacity-40"
              style={{ background: "linear-gradient(90deg, var(--c2), color-mix(in srgb, var(--c2) 60%, white))" }}
            >
              Taper
            </button>
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="flex gap-1">
                <button type="button" onClick={sync.undo} className="min-h-9 px-2.5 text-micro uppercase tracking-[0.14em] text-ink-2 hover:text-white">Annuler</button>
                <button type="button" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen} className="min-h-9 px-2.5 text-micro uppercase tracking-[0.14em] text-ink-2 hover:text-white">Coller</button>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    sync.cancel();
                    setEditing(false);
                  }}
                  className="min-h-9 px-2.5 text-micro uppercase tracking-[0.14em] text-ink-2 hover:text-white"
                >
                  Quitter
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await sync.save();
                    if (ok) {
                      setSaved(true);
                      setEditing(false);
                    }
                  }}
                  className="btn-icon min-h-9 rounded-full bg-white px-4 text-micro font-bold uppercase tracking-[0.14em] text-black"
                >
                  Enregistrer{sync.complete ? "" : " (partiel)"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {saved && !editing && (
        <p role="status" className="sr-only">
          Paroles enregistrées
        </p>
      )}
    </div>
  );
}
