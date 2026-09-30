"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { usePlayer } from "@/store/player-store";
import { openPipPlayer, supportsPip } from "@/components/PipPlayer";
import { useDismissable } from "@/hooks/useDismissable";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

function captureCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>("#aurora-canvas canvas");
}

function safeName(value: string): string {
  return value.replace(/[^\p{L}\p{N}_-]+/gu, "_");
}

export default function Header({
  immersive,
  onOpenSearch,
  onOpenShortcuts,
  onOpenSettings,
}: {
  immersive: boolean;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
  onOpenSettings?: () => void;
}) {
  const { canInstall, promptInstall } = useInstallPrompt();
  const sources = usePlayer((s) => s.sources);
  const count = usePlayer((s) => s.tracks.length);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const openFolder = usePlayer((s) => s.openFolder);
  const setHelpOpen = usePlayer((s) => s.setHelpOpen);
  const showHome = usePlayer((s) => s.showHome);
  const setShowHome = usePlayer((s) => s.setShowHome);
  const bloom = usePlayer((s) => s.bloom);
  const toggleBloom = usePlayer((s) => s.toggleBloom);
  const track = usePlayer((s) => s.tracks[s.current]);
  const [recording, setRecording] = useState(false);
  const [pipAvailable, setPipAvailable] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
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
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 12_000_000,
      });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
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

  const recSeconds = useRecordingClock(recording);

  return (
    <header
      className={`relative z-(--z-popover) flex items-center justify-between gap-3 px-(--gutter) py-5 transition-all duration-700 md:py-7 ${
        immersive ? "pointer-events-none -translate-y-4 opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          data-beat
          className="beat-dot block size-3 shrink-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 140deg, var(--c1), var(--c2), var(--c3), var(--c1))",
            boxShadow: "0 0 18px color-mix(in srgb, var(--c2) 70%, transparent)",
          }}
        />
        <span
          translate="no"
          suppressHydrationWarning
          className={`notranslate font-display text-base font-extrabold tracking-[0.28em] md:text-lg ${
            recording ? "hidden sm:inline" : ""
          }`}
        >
          AURORA
        </span>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2.5">
        {recording && (
          <button
            type="button"
            onClick={toggleRecording}
            aria-label={`Arrêter l'enregistrement (${formatClock(recSeconds)})`}
            className="btn-icon inline-flex h-9 items-center gap-2 rounded-full border border-red-500/50 bg-red-500/10 px-3 font-mono text-micro tracking-[0.12em] text-red-300"
          >
            <span className="block size-2 animate-pulse rounded-full bg-red-400" aria-hidden />
            <span className="hidden sm:inline">REC</span>
            <span className="tabular-nums">{formatClock(recSeconds)}</span>
          </button>
        )}

        {onOpenSearch && (
          <button
            type="button"
            data-cursor="magnetic"
            onClick={onOpenSearch}
            data-scramble-host
            aria-label="Rechercher"
            aria-keyshortcuts="/ Control+K Meta+K"
            title="Rechercher ( / )"
            className={`${PILL} md:px-3.5`}
          >
            <SearchIcon />
            <span data-scramble className="hidden text-micro font-semibold uppercase tracking-[0.16em] md:inline">
              Rechercher
            </span>
            <kbd className="hidden rounded-md border border-white/15 px-1.5 font-mono text-micro leading-5 text-ink-3 lg:inline">
              /
            </kbd>
          </button>
        )}

        {count > 0 && (
          <button
            type="button"
            data-cursor="magnetic"
            onClick={() => setQueueOpen(!queueOpen)}
            data-scramble-host
            aria-label={`Bibliothèque, ${count} titres`}
            aria-expanded={queueOpen}
            aria-controls="library-panel"
            className={`${PILL} md:px-3.5 ${
              queueOpen ? "border-white/35 bg-white/12 text-white" : ""
            }`}
          >
            <LibraryIcon />
            <span data-scramble className="hidden text-micro font-semibold uppercase tracking-[0.16em] md:inline">
              Bibliothèque
            </span>
            <span
              aria-hidden
              className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 font-mono text-[10px] font-medium leading-none text-black md:static md:h-auto md:min-w-0 md:bg-transparent md:px-0 md:text-micro md:text-ink-2"
            >
              {count > 999 ? "999+" : count}
            </span>
          </button>
        )}

        <div className="relative">
          <button
            ref={menuTriggerRef}
            type="button"
            data-cursor="magnetic"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Plus d'options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="header-menu"
            className={`${PILL} ${menuOpen ? "border-white/35 bg-white/12 text-white" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <circle cx="3" cy="8" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="13" cy="8" r="1.4" />
            </svg>
          </button>
          {menuOpen && (
            <HeaderMenu
              triggerRef={menuTriggerRef}
              onClose={() => setMenuOpen(false)}
              summary={
                count > 0
                  ? `${sources.length > 0 ? `${sources.length} source${sources.length > 1 ? "s" : ""} · ` : ""}${count} titres`
                  : null
              }
              items={[
                ...(count > 0
                  ? [
                      {
                        id: "home",
                        label: showHome ? "Retour au lecteur" : "Accueil",
                        icon: <HomeIcon />,
                        onSelect: () => setShowHome(!showHome),
                      },
                    ]
                  : []),
                {
                  id: "folder",
                  label: "Ajouter un dossier",
                  icon: <FolderIcon />,
                  onSelect: () => void openFolder(),
                },
                {
                  id: "bloom",
                  label: "Bloom",
                  icon: <BloomIcon />,
                  checked: bloom,
                  onSelect: toggleBloom,
                },
                {
                  id: "png",
                  label: "Exporter en PNG",
                  icon: <CameraIcon />,
                  disabled: !track,
                  onSelect: exportPng,
                },
                {
                  id: "rec",
                  label: recording ? "Arrêter l'enregistrement" : "Enregistrer en WebM",
                  icon: (
                    <span
                      aria-hidden
                      className={`block size-2.5 rounded-full ${recording ? "bg-red-400" : "bg-current"}`}
                    />
                  ),
                  disabled: !track,
                  onSelect: toggleRecording,
                },
                {
                  id: "pip",
                  label: "Mini-lecteur",
                  icon: <PipIcon />,
                  disabled: !pipAvailable,
                  onSelect: () => void openPipPlayer(),
                },
                ...(onOpenSettings
                  ? [
                      {
                        id: "settings",
                        label: "Réglages",
                        icon: <SettingsIcon />,
                        onSelect: onOpenSettings,
                      },
                    ]
                  : []),
                ...(canInstall
                  ? [
                      {
                        id: "install",
                        label: "Installer l'application",
                        icon: <InstallIcon />,
                        onSelect: () => void promptInstall(),
                      },
                    ]
                  : []),
                ...(onOpenShortcuts
                  ? [
                      {
                        id: "keys",
                        label: "Raccourcis clavier",
                        icon: <KeyboardIcon />,
                        onSelect: onOpenShortcuts,
                      },
                    ]
                  : []),
                {
                  id: "help",
                  label: "Aide",
                  icon: <HelpIcon />,
                  onSelect: () => setHelpOpen(true),
                },
              ]}
            />
          )}
        </div>
      </div>
    </header>
  );
}

const PILL =
  "btn-icon relative inline-flex size-10 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/5 text-white/75 transition-colors duration-300 hover:border-white/30 hover:text-white md:size-auto md:h-9 md:min-w-9";

interface MenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  checked?: boolean;
}

function HeaderMenu({
  items,
  onClose,
  triggerRef,
  summary,
}: {
  items: MenuItem[];
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  summary: string | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissable(menuRef, onClose, { ignore: [triggerRef] });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role^="menuitem"]:not([disabled])'
      ) ?? []
    );
    if (entries.length === 0) return;
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % entries.length;
    else if (event.key === "ArrowUp")
      nextIndex = (index - 1 + entries.length) % entries.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = entries.length - 1;
    else if (event.key === "Tab") {
      onClose();
      return;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      entries[nextIndex].focus();
    }
  };

  return (
    <div
      ref={menuRef}
      id="header-menu"
      role="menu"
      aria-label="Options"
      data-panel
      onKeyDown={onKeyDown}
      className="glass-solid menu-in absolute right-0 top-full mt-2 w-[min(15rem,calc(100vw-2rem))] origin-top-right rounded-(--radius-card) p-1.5 shadow-(--shadow-pop)"
    >
      {summary && (
        <p className="px-3 pb-1.5 pt-2 font-mono text-micro uppercase tracking-[0.18em] text-ink-3">
          {summary}
        </p>
      )}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={item.checked}
          disabled={item.disabled}
          data-scramble-host
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-(--radius-control) px-3 text-left text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
        >
          <span className="grid size-5 shrink-0 place-items-center text-ink-2">
            {item.icon}
          </span>
          <span data-scramble className="flex-1">{item.label}</span>
          {item.checked !== undefined && (
            <span
              aria-hidden
              className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                item.checked ? "bg-[var(--c2)]" : "bg-white/15"
              }`}
            >
              <span
                className={`block size-3 rounded-full bg-white transition-transform duration-(--dur-2) ${
                  item.checked ? "translate-x-3" : ""
                }`}
              />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function useRecordingClock(recording: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!recording) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      500
    );
    return () => window.clearInterval(interval);
  }, [recording]);
  return seconds;
}

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1 3h14M1 8h9M1 13h6M12.5 7v7M12.5 7l3-2v7l-3 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1L1 7H3V14H6V10H10V14H13V7H15L8 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.5l1.5 1.5H13a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5v-9Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BloomIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
      <path
        d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15M3 3l1.6 1.6M11.4 11.4 13 13M13 3l-1.6 1.6M4.6 11.4 3 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 4.5A1.5 1.5 0 0 1 3 3h1.6l1.2-1.5h4.4L11.4 3H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="7.6" r="2.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function PipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="5.5" height="4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10.5" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5.5" cy="11.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function InstallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2v8m0 0L5 7m3 3 3-3M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 10h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.8 5.8A2.3 2.3 0 0 1 10.3 6c0 1.5-2.3 1.8-2.3 3.4M8 12.4h.01"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
