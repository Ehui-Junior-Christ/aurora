"use client";

import { useMemo, useState } from "react";
import { usePlayer } from "@/store/player-store";
import { useSmartPlaylists } from "@/hooks/useSmartPlaylists";
import { describeRule, type SmartRule } from "@/lib/smart-playlists";
import { saveTextFile } from "@/lib/backup";
import type { Track } from "@/lib/types";
import {
  BackButton,
  EmptyState,
  PillButton,
  PlayGlyph,
  ROW_HEIGHT,
  ShuffleGlyph,
  TrackRow,
} from "./shared";

type Open = { kind: "playlist"; id: string } | { kind: "smart"; id: string } | null;

type RuleKind = "bpmMin" | "bpmMax" | "neverPlayed" | "topPlayed" | "addedWithin" | "warm" | "cool" | "notPlayedSince" | "online" | "local";

const RULE_OPTIONS: { kind: RuleKind; label: string; unit?: string; def?: number }[] = [
  { kind: "bpmMin", label: "BPM minimum", unit: "BPM", def: 120 },
  { kind: "bpmMax", label: "BPM maximum", unit: "BPM", def: 95 },
  { kind: "topPlayed", label: "Les plus écoutés", unit: "titres", def: 50 },
  { kind: "addedWithin", label: "Ajoutés depuis", unit: "jours", def: 30 },
  { kind: "notPlayedSince", label: "Pas écoutés depuis", unit: "jours", def: 60 },
  { kind: "neverPlayed", label: "Jamais écoutés" },
  { kind: "warm", label: "Pochettes chaudes" },
  { kind: "cool", label: "Pochettes froides" },
  { kind: "online", label: "En ligne uniquement" },
  { kind: "local", label: "Locaux uniquement" },
];

function toRule(kind: RuleKind, value: number): SmartRule {
  switch (kind) {
    case "bpmMin":
      return { type: "bpm", min: value };
    case "bpmMax":
      return { type: "bpm", max: value };
    case "topPlayed":
      return { type: "topPlayed", limit: value };
    case "addedWithin":
      return { type: "addedWithin", days: value };
    case "notPlayedSince":
      return { type: "notPlayedSince", days: value };
    case "neverPlayed":
      return { type: "neverPlayed" };
    case "warm":
      return { type: "palette", tone: "warm" };
    case "cool":
      return { type: "palette", tone: "cool" };
    case "online":
      return { type: "online", value: true };
    case "local":
      return { type: "online", value: false };
  }
}

const FIELD =
  "h-10 min-w-0 rounded-(--radius-control) border border-white/10 bg-white/5 px-3 text-base text-white outline-none placeholder:text-ink-3 focus:border-white/30 md:text-sm";

export default function PlaylistsTab({ onMore }: { onMore: (track: Track) => void }) {
  const tracks = usePlayer((s) => s.tracks);
  const playlists = usePlayer((s) => s.playlists);
  const current = usePlayer((s) => s.tracks[s.current]?.id);
  const playing = usePlayer((s) => s.playing);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const deletePlaylist = usePlayer((s) => s.deletePlaylist);
  const removeFromPlaylist = usePlayer((s) => s.removeFromPlaylist);
  const playPlaylist = usePlayer((s) => s.playPlaylist);
  const playCollection = usePlayer((s) => s.playCollection);
  const playSmartPlaylist = usePlayer((s) => s.playSmartPlaylist);
  const createSmartPlaylist = usePlayer((s) => s.createSmartPlaylist);
  const deleteSmartPlaylist = usePlayer((s) => s.deleteSmartPlaylist);
  const exportPlaylistM3u = usePlayer((s) => s.exportPlaylistM3u);
  const smart = useSmartPlaylists(false);

  const [open, setOpen] = useState<Open>(null);
  const [name, setName] = useState("");
  const [smartFormOpen, setSmartFormOpen] = useState(false);
  const [smartName, setSmartName] = useState("");
  const [ruleKind, setRuleKind] = useState<RuleKind>("bpmMin");
  const [ruleValue, setRuleValue] = useState(120);

  const openPlaylist = open?.kind === "playlist" ? playlists.find((p) => p.id === open.id) : undefined;
  const openSmart = open?.kind === "smart" ? smart.find((s) => s.playlist.id === open.id) : undefined;
  const playlistTracks = useMemo(() => {
    if (!openPlaylist) return [];
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return openPlaylist.trackIds.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));
  }, [openPlaylist, tracks]);

  const create = () => {
    if (!name.trim()) return;
    void createPlaylist(name);
    setName("");
  };

  const ruleOption = RULE_OPTIONS.find((o) => o.kind === ruleKind)!;

  if (openPlaylist || openSmart) {
    const list = openPlaylist ? playlistTracks : openSmart!.tracks;
    const title = openPlaylist ? openPlaylist.name : openSmart!.playlist.name;
    const subtitle = openSmart
      ? openSmart.playlist.rules.map(describeRule).join(" · ")
      : `${list.length} titres`;
    return (
      <>
        <div className="flex items-center gap-2 px-2 pb-2">
          <BackButton label="Retour aux playlists" onClick={() => setOpen(null)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold">{title}</p>
            <p className="truncate text-xs text-ink-2">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          <PillButton
            primary
            onClick={() =>
              openPlaylist ? playPlaylist(openPlaylist.id) : playSmartPlaylist(openSmart!.playlist.id)
            }
          >
            <PlayGlyph /> Lire
          </PillButton>
          <PillButton
            onClick={() =>
              openPlaylist
                ? playPlaylist(openPlaylist.id, { shuffle: true })
                : playSmartPlaylist(openSmart!.playlist.id, { shuffle: true })
            }
          >
            <ShuffleGlyph /> Aléatoire
          </PillButton>
          {openPlaylist && (
            <PillButton
              label={`Exporter ${openPlaylist.name} en M3U`}
              onClick={() => {
                const text = exportPlaylistM3u(openPlaylist.id);
                if (text) void saveTextFile(`${openPlaylist.name}.m3u8`, text, "audio/x-mpegurl");
              }}
            >
              M3U
            </PillButton>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
          {list.length === 0 && <EmptyState title="Playlist vide" text="Ajoute des titres depuis leurs actions (⋯)." />}
          {list.map((track, i) => (
            <div key={track.id} style={{ height: ROW_HEIGHT }}>
              <TrackRow
                track={track}
                label={String(i + 1).padStart(2, "0")}
                active={track.id === current}
                playing={playing}
                onPlay={() => playCollection(list, i)}
                onMore={() => onMore(track)}
                trailing={
                  openPlaylist ? (
                    <button
                      type="button"
                      onClick={() => void removeFromPlaylist(openPlaylist.id, track.id)}
                      aria-label={`Retirer ${track.title} de la playlist`}
                      className="btn-icon grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:text-red-300"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                        <path d="M1.5 6h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : null
                }
              />
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
      <div className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create();
          }}
          placeholder="Nouvelle playlist…"
          aria-label="Nom de la nouvelle playlist"
          className={`${FIELD} flex-1`}
        />
        <button
          type="button"
          onClick={create}
          disabled={!name.trim()}
          aria-label="Créer la playlist"
          className="btn-icon grid size-10 shrink-0 place-items-center rounded-(--radius-control) border border-white/15 text-white/80 hover:border-white/40 hover:text-white disabled:opacity-35"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState title="Aucune playlist" text="Crée-en une ci-dessus, puis ajoute des titres depuis leurs actions (⋯)." />
      ) : (
        playlists.map((playlist) => (
          <div key={playlist.id} className="group mb-1 flex items-center gap-1 rounded-xl pl-3 transition-colors hover:bg-white/[0.05]">
            <button
              type="button"
              data-cursor="magnetic"
              onClick={() => setOpen({ kind: "playlist", id: playlist.id })}
              className="min-h-12 min-w-0 flex-1 py-2 text-left"
            >
              <p className="truncate text-body text-white/90">{playlist.name}</p>
              <p className="text-xs text-ink-2">{playlist.trackIds.length} titres</p>
            </button>
            <button
              type="button"
              onClick={() => playPlaylist(playlist.id)}
              disabled={playlist.trackIds.length === 0}
              aria-label={`Lire ${playlist.name}`}
              className="btn-icon grid size-10 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.06] text-white/85 hover:border-white/35 disabled:opacity-30"
            >
              <PlayGlyph />
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Supprimer la playlist « ${playlist.name} » ?`)) void deletePlaylist(playlist.id);
              }}
              aria-label={`Supprimer ${playlist.name}`}
              className="btn-icon grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:text-red-300 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus-visible:opacity-100"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                <path d="m1.5 1.5 9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))
      )}

      <div className="mb-2 mt-6 flex items-center justify-between px-1">
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-ink-2">Intelligentes</p>
        <button
          type="button"
          onClick={() => setSmartFormOpen((v) => !v)}
          aria-expanded={smartFormOpen}
          className="min-h-10 px-2 text-micro uppercase tracking-[0.16em] text-ink-2 transition-colors hover:text-white"
        >
          {smartFormOpen ? "Annuler" : "+ Créer"}
        </button>
      </div>

      {smartFormOpen && (
        <form
          className="menu-in mb-3 space-y-2 rounded-(--radius-card) border border-white/10 bg-white/[0.04] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const created = createSmartPlaylist(smartName || ruleOption.label, [toRule(ruleKind, ruleValue)]);
            if (created) {
              setSmartName("");
              setSmartFormOpen(false);
            }
          }}
        >
          <input
            value={smartName}
            onChange={(event) => setSmartName(event.target.value)}
            placeholder="Nom (optionnel)"
            aria-label="Nom de la playlist intelligente"
            className={`${FIELD} w-full`}
          />
          <div className="flex gap-2">
            <select
              value={ruleKind}
              onChange={(event) => {
                const kind = event.target.value as RuleKind;
                setRuleKind(kind);
                const def = RULE_OPTIONS.find((o) => o.kind === kind)?.def;
                if (def) setRuleValue(def);
              }}
              aria-label="Règle"
              className={`${FIELD} flex-1 text-xs`}
            >
              {RULE_OPTIONS.map((o) => (
                <option key={o.kind} value={o.kind} className="bg-[#0b0b12]">
                  {o.label}
                </option>
              ))}
            </select>
            {ruleOption.unit && (
              <label className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={ruleValue}
                  onChange={(event) => setRuleValue(Math.max(1, Number(event.target.value) || 1))}
                  aria-label={`Valeur (${ruleOption.unit})`}
                  className={`${FIELD} w-20 tabular-nums`}
                />
                <span className="text-micro text-ink-3">{ruleOption.unit}</span>
              </label>
            )}
          </div>
          <button
            type="submit"
            className="btn-icon w-full rounded-(--radius-control) bg-white py-2.5 text-micro font-bold uppercase tracking-[0.18em] text-black hover:bg-white/90"
          >
            Créer
          </button>
        </form>
      )}

      {smart.map(({ playlist, tracks: list }) => (
        <div
          key={playlist.id}
          className={`group mb-1 flex items-center gap-1 rounded-xl pl-3 transition-colors hover:bg-white/[0.05] ${
            list.length === 0 ? "opacity-55" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen({ kind: "smart", id: playlist.id })}
            className="min-h-12 min-w-0 flex-1 py-2 text-left"
          >
            <p className="flex items-center gap-2 truncate text-body text-white/90">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: "linear-gradient(135deg, var(--c1), var(--c3))" }}
              />
              {playlist.name}
            </p>
            <p className="truncate text-xs text-ink-2">
              {list.length} titres · {playlist.rules.map(describeRule).join(" · ")}
            </p>
          </button>
          <button
            type="button"
            onClick={() => playSmartPlaylist(playlist.id)}
            disabled={list.length === 0}
            aria-label={`Lire ${playlist.name}`}
            className="btn-icon grid size-10 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.06] text-white/85 hover:border-white/35 disabled:opacity-30"
          >
            <PlayGlyph />
          </button>
          {!playlist.builtin ? (
            <button
              type="button"
              onClick={() => deleteSmartPlaylist(playlist.id)}
              aria-label={`Supprimer ${playlist.name}`}
              className="btn-icon grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:text-red-300"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                <path d="m1.5 1.5 9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <span aria-hidden className="size-10 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
