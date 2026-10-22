import type { LyricsCue } from "./lyrics";

/**
 * Pure helpers for LRC editing: tap-to-sync sessions, shifting and export.
 * A session is immutable: every helper returns a new object (store-friendly).
 */

export interface SyncSession {
  lines: string[];
  /** Timestamp (s) per line, null until tapped. */
  times: (number | null)[];
  /** Index of the next line to stamp. */
  cursor: number;
}

/** Plain lines from pasted lyrics (existing [mm:ss] stamps are removed). */
export function linesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\[(\d{1,2}):(\d{1,2})(?:[.:]\d{1,3})?\]/g, "")
        .replace(/^\[[a-z]+:.*\]$/i, "") // [ar:], [ti:] headers
        .trim()
    )
    .filter((line) => line.length > 0);
}

export function createSyncSession(
  lines: string[],
  existing?: LyricsCue[]
): SyncSession {
  const times = lines.map((line, i) => {
    const cue = existing?.[i];
    return cue && cue.text === line ? cue.time : null;
  });
  const firstMissing = times.findIndex((t) => t === null);
  return { lines, times, cursor: firstMissing < 0 ? lines.length : firstMissing };
}

/** Stamps the line under the cursor with `time` and advances. */
export function tapLine(session: SyncSession, time: number): SyncSession {
  if (session.cursor >= session.lines.length) return session;
  const times = [...session.times];
  // Keep timestamps monotonic even if the user taps early.
  const prev = session.cursor > 0 ? times[session.cursor - 1] : null;
  times[session.cursor] = Math.max(prev ?? 0, Math.max(0, time));
  return { ...session, times, cursor: session.cursor + 1 };
}

/** Un-stamps the previous line and moves the cursor back to it. */
export function undoTap(session: SyncSession): SyncSession {
  if (session.cursor <= 0) return session;
  const times = [...session.times];
  times[session.cursor - 1] = null;
  return { ...session, times, cursor: session.cursor - 1 };
}

/** Moves the cursor (e.g. click on a line to re-stamp from there). */
export function seekCursor(session: SyncSession, index: number): SyncSession {
  return {
    ...session,
    cursor: Math.max(0, Math.min(session.lines.length, index)),
  };
}

/** Fine-tunes one line's timestamp by `delta` seconds. */
export function nudgeLine(
  session: SyncSession,
  index: number,
  delta: number
): SyncSession {
  const t = session.times[index];
  if (t === null || t === undefined) return session;
  const times = [...session.times];
  times[index] = Math.max(0, t + delta);
  return { ...session, times };
}

export function isSyncComplete(session: SyncSession): boolean {
  return session.times.every((t) => t !== null);
}

/** Stamped lines as cues (unstamped lines are dropped). */
export function sessionToCues(session: SyncSession): LyricsCue[] {
  const cues: LyricsCue[] = [];
  session.lines.forEach((text, i) => {
    const time = session.times[i];
    if (time !== null && time !== undefined) cues.push({ time, text });
  });
  return cues.sort((a, b) => a.time - b.time);
}

/** Applies a global offset (s); negative times are clamped to 0. */
export function shiftCues(cues: LyricsCue[], seconds: number): LyricsCue[] {
  if (!seconds) return cues;
  return cues.map((c) => ({ ...c, time: Math.max(0, c.time + seconds) }));
}

export function formatLrcTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100));
  const m = Math.floor(total / 6000);
  const s = Math.floor((total % 6000) / 100);
  const cs = total % 100;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export interface LrcMeta {
  title?: string;
  artist?: string;
  album?: string;
  lengthSec?: number;
}

/** Serialises cues to LRC text (with ID tags). */
export function formatLrc(cues: LyricsCue[], meta: LrcMeta = {}): string {
  const clean = (s: string) => s.replace(/[\r\n\]]+/g, " ").trim();
  const lines: string[] = [];
  if (meta.title) lines.push(`[ti:${clean(meta.title)}]`);
  if (meta.artist) lines.push(`[ar:${clean(meta.artist)}]`);
  if (meta.album) lines.push(`[al:${clean(meta.album)}]`);
  if (meta.lengthSec && meta.lengthSec > 0) {
    lines.push(`[length:${formatLrcTime(meta.lengthSec).slice(0, 5)}]`);
  }
  lines.push("[re:AURORA]");
  for (const cue of [...cues].sort((a, b) => a.time - b.time)) {
    lines.push(`[${formatLrcTime(cue.time)}]${cue.text.replace(/[\r\n]+/g, " ")}`);
  }
  return lines.join("\n") + "\n";
}

export function lrcFileName(artist: string, title: string): string {
  const safe = `${artist} - ${title}`.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return `${safe || "paroles"}.lrc`;
}
