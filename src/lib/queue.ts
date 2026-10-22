import type { Track } from "./types";

/**
 * Pure helpers for the play queue ("à suivre"), independent from the library
 * order. Items carry the full Track so local and online tracks can mix.
 */

export interface QueueItem {
  /** Unique per insertion (the same track may be queued twice). */
  qid: string;
  track: Track;
}

/** Persisted form: online tracks keep their metadata, local ones only an id. */
export interface StoredQueueItem {
  id: string;
  online?: Track;
}

let seq = 0;
export function makeQueueItem(track: Track): QueueItem {
  seq = (seq + 1) % 1e9;
  return { qid: `${Date.now().toString(36)}-${seq.toString(36)}`, track };
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function toStoredQueue(queue: readonly QueueItem[]): StoredQueueItem[] {
  return queue.map(({ track }) =>
    track.isOnline
      ? { id: track.id, online: { ...track, file: undefined } }
      : { id: track.id }
  );
}

export function fromStoredQueue(
  stored: unknown,
  library: readonly Track[]
): QueueItem[] {
  if (!Array.isArray(stored)) return [];
  const byId = new Map(library.map((t) => [t.id, t]));
  const out: QueueItem[] = [];
  for (const entry of stored as StoredQueueItem[]) {
    if (!entry || typeof entry.id !== "string") continue;
    const track =
      byId.get(entry.id) ??
      (entry.online && entry.online.isOnline ? entry.online : undefined);
    if (track) out.push(makeQueueItem(track));
  }
  return out;
}

/** Fisher–Yates shuffled copy. */
export function shuffled<T>(list: readonly T[], random = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
