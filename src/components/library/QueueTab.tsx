"use client";

import { useRef, useState } from "react";
import { usePlayer } from "@/store/player-store";
import type { Track } from "@/lib/types";
import { EmptyState, EqBars } from "./shared";

function Cover({ track }: { track?: Track }) {
  return (
    <div
      className="size-10 shrink-0 overflow-hidden rounded-lg border border-white/10"
      style={
        track?.coverUrl
          ? undefined
          : {
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--c1) 60%, transparent), color-mix(in srgb, var(--c3) 45%, transparent))",
            }
      }
    >
      {track?.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.coverUrl} alt="" className="size-full object-cover" />
      ) : null}
    </div>
  );
}

/** "File" tab: what plays next. Never touches the library order. */
export default function QueueTab({
  onBrowse,
  onMore,
}: {
  onBrowse: () => void;
  onMore: (track: Track) => void;
}) {
  const queue = usePlayer((s) => s.queue);
  const current = usePlayer((s) => s.tracks[s.current]);
  const playing = usePlayer((s) => s.playing);
  const reorderQueue = usePlayer((s) => s.reorderQueue);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const playFromQueue = usePlayer((s) => s.playFromQueue);
  const clearQueue = usePlayer((s) => s.clearQueue);
  const dragFrom = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
      {current && (
        <>
          <p className="px-3 pb-1 pt-1 font-mono text-micro uppercase tracking-[0.2em] text-ink-2">
            En cours
          </p>
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.07] px-3 py-2">
            <Cover track={current} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold leading-tight text-white">{current.title}</p>
              <p className="mt-0.5 truncate text-xs text-ink-2">{current.artist}</p>
            </div>
            {playing && <EqBars />}
          </div>
        </>
      )}

      <div className="flex items-center justify-between px-3 pb-1">
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-ink-2">
          À suivre · {queue.length}
        </p>
        {queue.length > 0 && (
          <button
            type="button"
            onClick={clearQueue}
            className="min-h-10 px-2 text-micro uppercase tracking-[0.16em] text-ink-2 transition-colors hover:text-white"
          >
            Vider
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="Rien à suivre"
          text="Utilise « Lire ensuite » ou « Ajouter à la file » depuis les actions d'un titre. Sinon, la bibliothèque continue dans l'ordre."
          action={{ label: "Parcourir les titres", onClick: onBrowse }}
        />
      ) : (
        <ol aria-label="File d'attente">
          {queue.map((item, index) => (
            <li
              key={item.qid}
              draggable
              onDragStart={(event) => {
                dragFrom.current = index;
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(index);
              }}
              onDragLeave={() => setOver((o) => (o === index ? null : o))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom.current !== null && dragFrom.current !== index) {
                  reorderQueue(dragFrom.current, index);
                }
                dragFrom.current = null;
                setOver(null);
              }}
              style={{ animationDelay: index < 10 ? `${index * 40}ms` : undefined }}
              className={`group flex items-center gap-1 rounded-xl pl-3 transition-colors ${
                index < 10 ? "stagger-in" : ""
              } ${over === index ? "bg-white/[0.1]" : "hover:bg-white/[0.05]"}`}
            >
              <span aria-hidden className="hidden cursor-grab text-ink-3 md:block">
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                  <circle cx="3" cy="3" r="1.1" /><circle cx="7" cy="3" r="1.1" />
                  <circle cx="3" cy="7" r="1.1" /><circle cx="7" cy="7" r="1.1" />
                  <circle cx="3" cy="11" r="1.1" /><circle cx="7" cy="11" r="1.1" />
                </svg>
              </span>
              <button
                type="button"
                onClick={() => playFromQueue(item.qid)}
                className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-1.5 pl-1 text-left"
                aria-label={`Lire maintenant ${item.track.title}`}
              >
                <Cover track={item.track} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body leading-tight text-white/85">
                    {item.track.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-2">{item.track.artist}</span>
                </span>
              </button>
              <div className="flex shrink-0 items-center md:hidden">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => reorderQueue(index, index - 1)}
                  aria-label={`Monter ${item.track.title}`}
                  className="btn-icon grid size-11 place-items-center rounded-full text-ink-2 disabled:opacity-25"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="m2.5 7.5 3.5-3.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => onMore(item.track)}
                aria-label={`Actions pour ${item.track.title}`}
                className="btn-icon hidden size-10 place-items-center rounded-full text-ink-2 hover:bg-white/10 hover:text-white md:grid md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => removeFromQueue(item.qid)}
                aria-label={`Retirer ${item.track.title} de la file`}
                className="btn-icon grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:text-red-300"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                  <path d="m1.5 1.5 9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
