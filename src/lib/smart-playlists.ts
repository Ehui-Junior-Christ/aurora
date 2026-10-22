import type { ListeningStats } from "./stats";
import type { PaletteColor, Track } from "./types";
import { trackAddedAt } from "./library-query";

/**
 * Smart playlists: rule sets resolved dynamically against the current
 * library + stats (never a frozen list of ids).
 */

export type SmartRule =
  | { type: "bpm"; min?: number; max?: number }
  | { type: "neverPlayed" }
  | { type: "topPlayed"; limit: number }
  /** Added during the current calendar month. */
  | { type: "addedThisMonth" }
  | { type: "addedWithin"; days: number }
  | { type: "palette"; tone: "warm" | "cool" }
  | { type: "notPlayedSince"; days: number }
  | { type: "online"; value: boolean };

export interface SmartPlaylist {
  id: string;
  name: string;
  rules: SmartRule[];
  /** "all" = AND (default), "any" = OR. */
  match?: "all" | "any";
  limit?: number;
  /** Built-in presets cannot be deleted. */
  builtin?: boolean;
}

export interface SmartContext {
  stats: ListeningStats;
  now?: number;
}

/** Warmth in [-1, 1]: red/orange/yellow > 0, blue/cyan < 0. */
export function paletteWarmth(palette: PaletteColor[]): number {
  const colors = palette.slice(0, 3);
  if (colors.length === 0) return 0;
  let total = 0;
  let weight = 0;
  colors.forEach((c, i) => {
    const [r, , b] = c.rgb;
    const max = Math.max(...c.rgb);
    const min = Math.min(...c.rgb);
    const chroma = (max - min) / 255;
    const w = (3 - i) * (0.2 + chroma); // dominant + saturated colours count more
    total += ((r - b) / 255) * w;
    weight += w;
  });
  return weight > 0 ? total / weight : 0;
}

const WARM_THRESHOLD = 0.08;

function startOfMonth(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function ruleMatcher(
  rule: SmartRule,
  tracks: readonly Track[],
  ctx: Required<SmartContext>
): (track: Track) => boolean {
  const plays = ctx.stats.plays;
  switch (rule.type) {
    case "bpm":
      return (t) =>
        !!t.bpm &&
        (rule.min === undefined || t.bpm >= rule.min) &&
        (rule.max === undefined || t.bpm <= rule.max);
    case "neverPlayed":
      return (t) => !plays[t.id];
    case "topPlayed": {
      const top = new Set(
        tracks
          .filter((t) => (plays[t.id] ?? 0) > 0)
          .sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0))
          .slice(0, Math.max(1, rule.limit))
          .map((t) => t.id)
      );
      return (t) => top.has(t.id);
    }
    case "addedThisMonth": {
      const from = startOfMonth(ctx.now);
      return (t) => (trackAddedAt(t) ?? 0) >= from;
    }
    case "addedWithin": {
      const from = ctx.now - rule.days * 86400000;
      return (t) => (trackAddedAt(t) ?? 0) >= from;
    }
    case "palette":
      return (t) => {
        const w = paletteWarmth(t.palette);
        return rule.tone === "warm" ? w > WARM_THRESHOLD : w < -WARM_THRESHOLD;
      };
    case "notPlayedSince": {
      const from = ctx.now - rule.days * 86400000;
      return (t) => (ctx.stats.lastPlayed?.[t.id] ?? 0) < from;
    }
    case "online":
      return (t) => t.isOnline === rule.value;
  }
}

export function resolveSmartPlaylist(
  playlist: SmartPlaylist,
  tracks: readonly Track[],
  context: SmartContext
): Track[] {
  const ctx = { stats: context.stats, now: context.now ?? Date.now() };
  const matchers = playlist.rules.map((r) => ruleMatcher(r, tracks, ctx));
  const any = playlist.match === "any";
  let result = tracks.filter((t) =>
    matchers.length === 0
      ? true
      : any
        ? matchers.some((m) => m(t))
        : matchers.every((m) => m(t))
  );
  // "Top N" lists read best in play-count order.
  if (playlist.rules.some((r) => r.type === "topPlayed")) {
    const plays = ctx.stats.plays;
    result = [...result].sort((a, b) => (plays[b.id] ?? 0) - (plays[a.id] ?? 0));
  } else if (playlist.rules.some((r) => r.type === "addedThisMonth" || r.type === "addedWithin")) {
    result = [...result].sort((a, b) => (trackAddedAt(b) ?? 0) - (trackAddedAt(a) ?? 0));
  }
  return playlist.limit ? result.slice(0, playlist.limit) : result;
}

export function describeRule(rule: SmartRule): string {
  switch (rule.type) {
    case "bpm":
      return rule.min !== undefined && rule.max !== undefined
        ? `${rule.min}–${rule.max} BPM`
        : rule.min !== undefined
          ? `≥ ${rule.min} BPM`
          : `≤ ${rule.max} BPM`;
    case "neverPlayed":
      return "Jamais écoutés";
    case "topPlayed":
      return `Top ${rule.limit}`;
    case "addedThisMonth":
      return "Ajoutés ce mois-ci";
    case "addedWithin":
      return `Ajoutés depuis ${rule.days} j`;
    case "palette":
      return rule.tone === "warm" ? "Pochettes chaudes" : "Pochettes froides";
    case "notPlayedSince":
      return `Pas écoutés depuis ${rule.days} j`;
    case "online":
      return rule.value ? "En ligne" : "Locaux";
  }
}

/** Presets shown by default (not persisted, cannot be deleted). */
export const BUILTIN_SMART_PLAYLISTS: SmartPlaylist[] = [
  { id: "smart:top25", name: "Top 25", rules: [{ type: "topPlayed", limit: 25 }], builtin: true },
  { id: "smart:never", name: "Jamais écoutés", rules: [{ type: "neverPlayed" }], builtin: true },
  { id: "smart:month", name: "Ajoutés ce mois-ci", rules: [{ type: "addedThisMonth" }], builtin: true },
  { id: "smart:energy", name: "Énergie (120+ BPM)", rules: [{ type: "bpm", min: 120 }], builtin: true },
  { id: "smart:chill", name: "Calme (< 95 BPM)", rules: [{ type: "bpm", max: 95 }], builtin: true },
  { id: "smart:warm", name: "Couleurs chaudes", rules: [{ type: "palette", tone: "warm" }], builtin: true },
  { id: "smart:cool", name: "Couleurs froides", rules: [{ type: "palette", tone: "cool" }], builtin: true },
];

/** Validates persisted/imported data. */
export function sanitizeSmartPlaylists(raw: unknown): SmartPlaylist[] {
  if (!Array.isArray(raw)) return [];
  const types = new Set([
    "bpm", "neverPlayed", "topPlayed", "addedThisMonth", "addedWithin",
    "palette", "notPlayedSince", "online",
  ]);
  return raw.filter(
    (p): p is SmartPlaylist =>
      !!p &&
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      Array.isArray(p.rules) &&
      p.rules.every((r: { type?: string }) => r && types.has(r.type ?? ""))
  ).map((p) => ({ ...p, builtin: false }));
}
