import type { Track } from "./types";

/**
 * Pure library sorting / filtering / accent- and typo-tolerant search.
 * No store access: pass play counts in `context`.
 */

export type LibrarySortKey =
  | "default"
  | "added"
  | "plays"
  | "bpm"
  | "duration"
  | "title"
  | "artist";

export type SortDirection = "asc" | "desc";

export interface LibraryFilter {
  /** true = online only, false = local only, undefined = both. */
  online?: boolean;
  minBpm?: number;
  maxBpm?: number;
  /** Exact (normalized) artist match. */
  artist?: string;
  /** Exact (normalized) album match. */
  album?: string;
}

export interface LibraryQuery {
  search?: string;
  sort?: LibrarySortKey;
  /** Defaults: desc for added/plays/bpm/duration, asc for text keys. */
  direction?: SortDirection;
  filter?: LibraryFilter;
}

export interface LibraryContext {
  plays?: Record<string, number>;
}

export const SORT_LABELS: Record<LibrarySortKey, string> = {
  default: "Par défaut",
  added: "Date d'ajout",
  plays: "Les plus écoutés",
  bpm: "BPM",
  duration: "Durée",
  title: "Titre",
  artist: "Artiste",
};

/** Lowercase, strip accents (NFD), collapse punctuation/whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[œ]/g, "oe")
    .replace(/[æ]/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Optimal string alignment distance, bounded (returns max+1 when above). */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length];
}

interface Haystack {
  full: string;
  words: string[];
  title: string;
  artist: string;
}

const haystacks = new WeakMap<Track, Haystack>();

function haystack(track: Track): Haystack {
  let h = haystacks.get(track);
  if (!h) {
    const title = normalizeText(track.title);
    const artist = normalizeText(track.artist);
    const album = normalizeText(track.album);
    const full = `${title} ${artist} ${album}`;
    h = { full, words: full.split(" ").filter(Boolean), title, artist };
    haystacks.set(track, h);
  }
  return h;
}

function tokenScore(token: string, h: Haystack): number {
  if (h.words.some((w) => w.startsWith(token))) return 3;
  if (h.full.includes(token)) return 2;
  if (token.length < 3) return 0;
  const budget = token.length >= 8 ? 2 : 1;
  for (const word of h.words) {
    // Compare against the word and its same-length prefix (typing in progress).
    const d = Math.min(
      editDistance(token, word, budget),
      word.length > token.length
        ? editDistance(token, word.slice(0, token.length), budget)
        : budget + 1
    );
    if (d <= budget) return d === 1 ? 1.5 : 1;
  }
  return 0;
}

/**
 * Relevance of `track` for `query` (0 = no match). Every query word must match
 * (prefix, substring or within 1–2 typos); title/artist hits rank higher.
 */
export function searchScore(track: Track, query: string): number {
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return 1;
  const h = haystack(track);
  let score = 0;
  for (const token of tokens) {
    const s = tokenScore(token, h);
    if (s === 0) return 0;
    score += s;
  }
  const q = tokens.join(" ");
  if (h.title === q || h.artist === q) score += 5;
  else if (h.title.startsWith(q)) score += 3;
  else if (h.artist.startsWith(q)) score += 2;
  return score;
}

export function matchesFilter(track: Track, filter: LibraryFilter): boolean {
  if (filter.online !== undefined && track.isOnline !== filter.online) {
    return false;
  }
  if (filter.minBpm !== undefined || filter.maxBpm !== undefined) {
    if (!track.bpm) return false;
    if (filter.minBpm !== undefined && track.bpm < filter.minBpm) return false;
    if (filter.maxBpm !== undefined && track.bpm > filter.maxBpm) return false;
  }
  if (filter.artist && normalizeText(track.artist) !== normalizeText(filter.artist)) {
    return false;
  }
  if (filter.album && normalizeText(track.album) !== normalizeText(filter.album)) {
    return false;
  }
  return true;
}

/** "3:45" / "1:02:03" → seconds. */
export function parseDurationText(text?: string): number | undefined {
  if (!text) return undefined;
  const parts = text.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function trackDuration(track: Track): number | undefined {
  return track.durationSec ?? parseDurationText(track.durationText);
}

export function trackAddedAt(track: Track): number | undefined {
  return track.addedAt ?? track.file?.lastModified;
}

const collator =
  typeof Intl !== "undefined"
    ? new Intl.Collator("fr", { sensitivity: "base", numeric: true })
    : null;

function compareText(a: string, b: string): number {
  return collator ? collator.compare(a, b) : a.localeCompare(b);
}

function defaultDirection(key: LibrarySortKey): SortDirection {
  return key === "title" || key === "artist" || key === "default" ? "asc" : "desc";
}

/**
 * Filters, searches and sorts without mutating `tracks`. Unknown values
 * (no BPM / duration) always go last. Search results are ranked by relevance
 * when sort is "default".
 */
export function queryLibrary(
  tracks: readonly Track[],
  query: LibraryQuery = {},
  context: LibraryContext = {}
): Track[] {
  const sort = query.sort ?? "default";
  const dir = (query.direction ?? defaultDirection(sort)) === "asc" ? 1 : -1;
  const search = query.search?.trim() ?? "";
  const plays = context.plays ?? {};

  const rows: { track: Track; index: number; score: number }[] = [];
  tracks.forEach((track, index) => {
    if (query.filter && !matchesFilter(track, query.filter)) return;
    const score = search ? searchScore(track, search) : 1;
    if (score > 0) rows.push({ track, index, score });
  });

  const numeric = (
    get: (t: Track) => number | null | undefined
  ): ((a: (typeof rows)[number], b: (typeof rows)[number]) => number) => {
    return (a, b) => {
      const va = get(a.track);
      const vb = get(b.track);
      const na = va === undefined || va === null || !Number.isFinite(va);
      const nb = vb === undefined || vb === null || !Number.isFinite(vb);
      if (na || nb) return na === nb ? a.index - b.index : na ? 1 : -1;
      return ((va as number) - (vb as number)) * dir || a.index - b.index;
    };
  };

  let comparator: (a: (typeof rows)[number], b: (typeof rows)[number]) => number;
  switch (sort) {
    case "added":
      comparator = numeric(trackAddedAt);
      break;
    case "plays":
      comparator = (a, b) =>
        ((plays[a.track.id] ?? 0) - (plays[b.track.id] ?? 0)) * dir ||
        a.index - b.index;
      break;
    case "bpm":
      comparator = numeric((t) => t.bpm);
      break;
    case "duration":
      comparator = numeric(trackDuration);
      break;
    case "title":
      comparator = (a, b) =>
        compareText(a.track.title, b.track.title) * dir || a.index - b.index;
      break;
    case "artist":
      comparator = (a, b) =>
        (compareText(a.track.artist, b.track.artist) ||
          compareText(a.track.album, b.track.album) ||
          compareText(a.track.title, b.track.title)) * dir ||
        a.index - b.index;
      break;
    default:
      comparator = search
        ? (a, b) => b.score - a.score || a.index - b.index
        : (a, b) => (a.index - b.index) * dir;
  }
  rows.sort(comparator);
  return rows.map((r) => r.track);
}
