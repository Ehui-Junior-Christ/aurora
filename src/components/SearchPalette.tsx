"use client";

import { useRef } from "react";
import UnifiedSearch from "@/components/UnifiedSearch";
import { useDismissable } from "@/hooks/useDismissable";

/**
 * Single search entry point ("/", Ctrl/Cmd+K, header button).
 * Desktop: centered command palette. Mobile: fullscreen sheet.
 */
export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  // UnifiedSearch focuses its own input; keep focus return to the opener.
  useDismissable(panelRef, onClose, { outside: false });

  return (
    <div
      className="fixed inset-0 z-(--z-overlay) flex justify-center md:items-start md:px-4 md:pt-[12vh]"
      data-panel
      data-lenis-prevent
    >
      <div
        aria-hidden
        onClick={onClose}
        className="backdrop-in absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        className="glass-solid sheet-in relative flex h-dvh w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-(--safe-b) md:menu-in md:h-auto md:max-h-[72vh] md:w-[640px] md:rounded-(--radius-panel) md:pb-0 md:pt-0 md:shadow-(--shadow-pop)"
      >
        <div className="flex items-center justify-between px-4 pt-3 md:hidden">
          <span className="font-mono text-micro uppercase tracking-[0.3em] text-ink-2">
            Rechercher
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon min-h-11 rounded-full px-3 text-sm text-ink-1 hover:text-white"
          >
            Fermer
          </button>
        </div>
        <UnifiedSearch variant="palette" onClose={onClose} />
        <div className="hidden items-center gap-4 border-t border-white/10 px-4 py-2.5 font-mono text-micro text-ink-3 md:flex">
          <span>
            <kbd className="rounded border border-white/15 px-1">Entrée</kbd> chercher en ligne
          </span>
          <span>
            <kbd className="rounded border border-white/15 px-1">Échap</kbd> fermer
          </span>
        </div>
      </div>
    </div>
  );
}
