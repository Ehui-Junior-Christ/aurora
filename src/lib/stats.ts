import type { Track } from "./types";

/**
 * Listening statistics. v1 (`{plays, seconds}`) is a strict subset of v2, so
 * old builds keep reading `plays`/`seconds` and nothing is ever lost.
 * All functions are pure and return new objects.
 */

export interface TrackStatInfo {
  title: string;
  artist: string;
  album: string;
  online: boolean;
  /** Only http(s) covers are kept (blob: URLs die with the session). */
  coverUrl?: string;
}

export interface DayStats {
  seconds: number;
  plays: number;
}

export interface ArtistStats {
  seconds: number;
  plays: number;
}

export interface ListeningStats {
  /** All-time plays per track id (v1 field). */
  plays: Record<string, number>;
  /** All-time listened seconds (v1 field). */
  seconds: number;
  version?: number;
  /** Per local day, key "YYYY-MM-DD". */
  days?: Record<string, DayStats>;
  /** 24 buckets of listened seconds per local hour of day. */
  hours?: number[];
  /** Per artist display name. */
  artists?: Record<string, ArtistStats>;
  /** Listened seconds per track id. */
  trackSeconds?: Record<string, number>;
  /** Last play timestamp per track id. */
  lastPlayed?: Record<string, number>;
  /** Metadata snapshot so online / removed tracks can still be displayed. */
  info?: Record<string, TrackStatInfo>;
  /** When dated tracking started (ms epoch). */
  since?: number;
}

export const STATS_VERSION = 2;

export function emptyStats(now = Date.now()): ListeningStats {
  return {
    plays: {},
    seconds: 0,
    version: STATS_VERSION,
    days: {},
    hours: new Array(24).fill(0),
    artists: {},
    trackSeconds: {},
    lastPlayed: {},
    info: {},
    since: now,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Accepts any persisted shape (v1, v2, garbage) and returns a valid v2. */
export function migrateStats(raw: unknown, now = Date.now()): ListeningStats {
  const base = emptyStats(now);
  if (!isRecord(raw)) return base;
  const hours = Array.isArray(raw.hours)
    ? base.hours!.map((_, i) => {
        const v = (raw.hours as unknown[])[i];
        return typeof v === "number" && Number.isFinite(v) ? v : 0;
      })
    : base.hours!;
  const days: Record<string, DayStats> = {};
  if (isRecord(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) {
      if (isRecord(v)) {
        days[k] = {
          seconds: typeof v.seconds === "number" ? v.seconds : 0,
          plays: typeof v.plays === "number" ? v.plays : 0,
        };
      }
    }
  }
  const artists: Record<string, ArtistStats> = {};
  if (isRecord(raw.artists)) {
    for (const [k, v] of Object.entries(raw.artists)) {
      if (isRecord(v)) {
        artists[k] = {
          seconds: typeof v.seconds === "number" ? v.seconds : 0,
          plays: typeof v.plays === "number" ? v.plays : 0,
        };
      }
    }
  }
  const info: Record<string, TrackStatInfo> = {};
  if (isRecord(raw.info)) {
    for (const [k, v] of Object.entries(raw.info)) {
      if (isRecord(v) && typeof v.title === "string") {
        info[k] = {
          title: v.title,
          artist: typeof v.artist === "string" ? v.artist : "",
          album: typeof v.album === "string" ? v.album : "",
          online: v.online === true,
          ...(typeof v.coverUrl === "string" ? { coverUrl: v.coverUrl } : {}),
        };
      }
    }
  }
  return {
    plays: numberRecord(raw.plays),
    seconds:
      typeof raw.seconds === "number" && Number.isFinite(raw.seconds)
        ? raw.seconds
        : 0,
    version: STATS_VERSION,
    days,
    hours,
    artists,
    trackSeconds: numberRecord(raw.trackSeconds),
    lastPlayed: numberRecord(raw.lastPlayed),
    info,
    since: typeof raw.since === "number" ? raw.since : now,
  };
}

export function dayKey(time: number): string {
  const d = new Date(time);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function snapshot(track: Track): TrackStatInfo {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album,
    online: track.isOnline,
    ...(track.coverUrl && /^https?:/.test(track.coverUrl)
      ? { coverUrl: track.coverUrl }
      : {}),
  };
}

/** Counts one play (call when a track starts). */
export function recordPlay(
  stats: ListeningStats,
  track: Track,
  now = Date.now()
): ListeningStats {
  const s = migrateIfNeeded(stats, now);
  const key = dayKey(now);
  const day = s.days![key] ?? { seconds: 0, plays: 0 };
  const artist = s.artists![track.artist] ?? { seconds: 0, plays: 0 };
  return {
    ...s,
    plays: { ...s.plays, [track.id]: (s.plays[track.id] ?? 0) + 1 },
    days: { ...s.days, [key]: { ...day, plays: day.plays + 1 } },
    artists: {
      ...s.artists,
      [track.artist]: { ...artist, plays: artist.plays + 1 },
    },
    lastPlayed: { ...s.lastPlayed, [track.id]: now },
    info: { ...s.info, [track.id]: snapshot(track) },
  };
}

/** Adds actually-listened seconds (call periodically while playing). */
export function recordListen(
  stats: ListeningStats,
  track: Track,
  seconds: number,
  now = Date.now()
): ListeningStats {
  if (!(seconds > 0)) return stats;
  const s = migrateIfNeeded(stats, now);
  const key = dayKey(now);
  const day = s.days![key] ?? { seconds: 0, plays: 0 };
  const artist = s.artists![track.artist] ?? { seconds: 0, plays: 0 };
  const hours = [...s.hours!];
  hours[new Date(now).getHours()] += seconds;
  return {
    ...s,
    seconds: s.seconds + seconds,
    days: { ...s.days, [key]: { ...day, seconds: day.seconds + seconds } },
    hours,
    artists: {
      ...s.artists,
      [track.artist]: { ...artist, seconds: artist.seconds + seconds },
    },
    trackSeconds: {
      ...s.trackSeconds,
      [track.id]: (s.trackSeconds![track.id] ?? 0) + seconds,
    },
    info: s.info![track.id] ? s.info : { ...s.info, [track.id]: snapshot(track) },
  };
}

function migrateIfNeeded(stats: ListeningStats, now: number): ListeningStats {
  return stats.version === STATS_VERSION && stats.days && stats.hours
    ? stats
    : migrateStats(stats, now);
}

/** Rewrites track ids (backup import / library re-matching). */
export function remapStatsIds(
  stats: ListeningStats,
  map: (id: string) => string | null
): ListeningStats {
  const s = migrateIfNeeded(stats, Date.now());
  const remapNum = (rec: Record<string, number> | undefined, sum: boolean) => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(rec ?? {})) {
      const next = map(id) ?? id;
      out[next] = sum ? (out[next] ?? 0) + v : Math.max(out[next] ?? 0, v);
    }
    return out;
  };
  const info: Record<string, TrackStatInfo> = {};
  for (const [id, v] of Object.entries(s.info ?? {})) info[map(id) ?? id] = v;
  return {
    ...s,
    plays: remapNum(s.plays, true),
    trackSeconds: remapNum(s.trackSeconds, true),
    lastPlayed: remapNum(s.lastPlayed, false),
    info,
  };
}

/** Sums two stats objects (backup import merge). */
export function mergeStats(a: ListeningStats, b: ListeningStats): ListeningStats {
  const x = migrateIfNeeded(a, Date.now());
  const y = migrateIfNeeded(b, Date.now());
  const sum = (p: Record<string, number> = {}, q: Record<string, number> = {}) => {
    const out = { ...p };
    for (const [k, v] of Object.entries(q)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const sumPair = <T extends { seconds: number; plays: number }>(
    p: Record<string, T> = {},
    q: Record<string, T> = {}
  ) => {
    const out: Record<string, { seconds: number; plays: number }> = { ...p };
    for (const [k, v] of Object.entries(q)) {
      const cur = out[k] ?? { seconds: 0, plays: 0 };
      out[k] = { seconds: cur.seconds + v.seconds, plays: cur.plays + v.plays };
    }
    return out;
  };
  const lastPlayed = { ...x.lastPlayed };
  for (const [k, v] of Object.entries(y.lastPlayed ?? {})) {
    lastPlayed[k] = Math.max(lastPlayed[k] ?? 0, v);
  }
  return {
    plays: sum(x.plays, y.plays),
    seconds: x.seconds + y.seconds,
    version: STATS_VERSION,
    days: sumPair(x.days, y.days),
    hours: x.hours!.map((v, i) => v + (y.hours?.[i] ?? 0)),
    artists: sumPair(x.artists, y.artists),
    trackSeconds: sum(x.trackSeconds, y.trackSeconds),
    lastPlayed,
    info: { ...y.info, ...x.info },
    since: Math.min(x.since ?? Date.now(), y.since ?? Date.now()),
  };
}

// ---- Aggregates (for the stats UI) -----------------------------------------

export interface RankedTrack {
  id: string;
  plays: number;
  seconds: number;
  info?: TrackStatInfo;
}

export function topTracks(stats: ListeningStats, limit = 10): RankedTrack[] {
  return Object.entries(stats.plays)
    .map(([id, plays]) => ({
      id,
      plays,
      seconds: stats.trackSeconds?.[id] ?? 0,
      info: stats.info?.[id],
    }))
    .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
    .slice(0, limit);
}

export function topArtists(
  stats: ListeningStats,
  limit = 10,
  by: "plays" | "seconds" = "seconds"
): { artist: string; plays: number; seconds: number }[] {
  return Object.entries(stats.artists ?? {})
    .map(([artist, v]) => ({ artist, ...v }))
    .sort((a, b) => b[by] - a[by])
    .slice(0, limit);
}

/** 24 values (seconds listened per hour of day). */
export function hourlyProfile(stats: ListeningStats): number[] {
  return stats.hours && stats.hours.length === 24
    ? [...stats.hours]
    : new Array(24).fill(0);
}

/** Last `days` days, oldest first, including empty days. */
export function dailySeries(
  stats: ListeningStats,
  days = 30,
  now = Date.now()
): { day: string; seconds: number; plays: number }[] {
  const out: { day: string; seconds: number; plays: number }[] = [];
  const today = new Date(now);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d.getTime());
    const v = stats.days?.[key];
    out.push({ day: key, seconds: v?.seconds ?? 0, plays: v?.plays ?? 0 });
  }
  return out;
}

/** Totals over the last `days` days. */
export function periodTotals(
  stats: ListeningStats,
  days: number,
  now = Date.now()
): { seconds: number; plays: number } {
  return dailySeries(stats, days, now).reduce(
    (acc, d) => ({ seconds: acc.seconds + d.seconds, plays: acc.plays + d.plays }),
    { seconds: 0, plays: 0 }
  );
}

/** Consecutive days with listening, ending today (or yesterday). */
export function listeningStreak(stats: ListeningStats, now = Date.now()): number {
  const today = new Date(now);
  let streak = 0;
  for (let i = 0; i < 3660; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const v = stats.days?.[dayKey(d.getTime())];
    if (v && (v.seconds > 0 || v.plays > 0)) streak++;
    else if (i > 0 || streak > 0) break;
  }
  return streak;
}
