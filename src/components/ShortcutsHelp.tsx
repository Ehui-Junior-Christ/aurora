"use client";

import { useRef } from "react";
import { SHORTCUTS, type ShortcutInfo } from "@/hooks/useHotkeys";
import { useDismissable } from "@/hooks/useDismissable";

const GROUPS: ShortcutInfo["group"][] = ["Lecture", "Navigation", "Affichage"];

/** Keyboard shortcuts overlay ("?"), fed by the SHORTCUTS source of truth. */
export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDismissable(dialogRef, onClose, { outside: false });

  return (
    <div
      className="fixed inset-0 z-(--z-overlay) grid place-items-center overflow-y-auto p-4"
      data-panel
      data-lenis-prevent
    >
      <div
        aria-hidden
        onClick={onClose}
        className="backdrop-in absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="glass-solid menu-in relative w-full max-w-2xl rounded-(--radius-panel) p-6 shadow-(--shadow-pop) md:p-8"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2
            id="shortcuts-title"
            className="font-display text-title font-extrabold uppercase tracking-tight"
          >
            Raccourcis
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les raccourcis"
            className="btn-icon grid size-10 place-items-center rounded-full border border-white/12 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="m1 1 10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-2 font-mono text-micro uppercase tracking-[0.3em] text-ink-3">
                {group}
              </h3>
              <dl className="divide-y divide-white/[0.06]">
                {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-sm text-ink-1">{shortcut.label}</dt>
                    <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="min-w-7 rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-0.5 text-center font-mono text-micro text-ink-2"
                        >
                          {key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
