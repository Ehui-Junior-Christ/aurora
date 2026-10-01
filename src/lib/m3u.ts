import { normalizeText, trackDuration } from "./library-query";
import type { Track } from "./types";

/** M3U / M3U8 playlist import & export (pure). */

export interface M3uEntry {
  location: string;
  title?: string;
  artist?: string;
  duration?: number;
}

const YT_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/;

export function youtubeIdFromUrl(url: string): string | null {
  const m = YT_RE.exec(url);
  return m ? m[1] : null;
}

function escapeLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}

/** Extended M3U (UTF-8, i.e. .m3u8). Online tracks export as YouTube URLs. */
export function exportM3u(tracks: readonly Track[], name?: string): string {
  const lines = ["#EXTM3U"];
  if (name) lines.push(`#PLAYLIST:${escapeLine(name)}`);
  for (const track of tracks) {
    const duration = Math.round(trackDuration(track) ?? -1);
    lines.push(
      `#EXTINF:${duration},${escapeLine(track.artist)} - ${escapeLine(track.title)}`
    );
    if (track.isOnline && (track.streamUrl ?? track.id).startsWith("yt:")) {
      const id = (track.streamUrl ?? track.id).replace(/^(?:yt:)+/, "");
      lines.push(`https://www.youtube.com/watch?v=${id}`);
    } else if (track.isOnline) {
      // Catalog entry whose video was never resolved: keep a readable line.
      lines.push(`${escapeLine(track.artist)} - ${escapeLine(track.title)}`);
    } else {
      lines.push(track.relPath ?? track.file?.name ?? `${track.artist} - ${track.title}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function parseM3u(text: string): { name?: string; entries: M3uEntry[] } {
  const entries: M3uEntry[] = [];
  let name: string | undefined;
  let pending: Omit<M3uEntry, "location"> = {};
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (line.startsWith("#PLAYLIST:")) name = line.slice(10).trim();
      const inf = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line);
      if (inf) {
        const duration = Number(inf[1]);
        const label = inf[2].trim();
        const dash = label.indexOf(" - ");
        pending = {
          duration: duration > 0 ? duration : undefined,
          ...(dash > 0
            ? { artist: label.slice(0, dash).trim(), title: label.slice(dash + 3).trim() }
            : { title: label }),
        };
      }
      continue;
    }
    entries.push({ location: line, ...pending });
    pending = {};
  }
  return { name, entries };
}

function baseNameOf(location: string): string {
  const clean = decodeURIComponentSafe(location.replace(/^file:\/\/\/?/i, ""));
  const last = clean.split(/[\\/]/).pop() ?? clean;
  return last.replace(/\.[^.]+$/, "");
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface M3uMatchResult {
  /** Matched library tracks or created online tracks, in playlist order. */
  tracks: Track[];
  unmatched: M3uEntry[];
}

/**
 * Resolves entries against the library: relative path suffix, then file base
 * name, then "artist - title" from #EXTINF. YouTube URLs become online tracks
 * (metadata only — audio is always streamed by the official player).
 */
export function matchM3u(
  entries: readonly M3uEntry[],
  library: readonly Track[],
  makeOnline: (videoId: string, entry: M3uEntry) => Track
): M3uMatchResult {
  const byPath = new Map<string, Track>();
  const byBase = new Map<string, Track>();
  const byMeta = new Map<string, Track>();
  for (const t of library) {
    if (t.relPath) byPath.set(normalizeText(t.relPath), t);
    const fileName = t.file?.name ?? t.relPath?.split("/").pop();
    if (fileName) byBase.set(normalizeText(fileName.replace(/\.[^.]+$/, "")), t);
    byMeta.set(`${normalizeText(t.artist)}|${normalizeText(t.title)}`, t);
  }
  const tracks: Track[] = [];
  const unmatched: M3uEntry[] = [];
  for (const entry of entries) {
    const yt = youtubeIdFromUrl(entry.location);
    if (yt) {
      const existing = library.find((t) => t.id === `yt:${yt}`);
      tracks.push(existing ?? makeOnline(yt, entry));
      continue;
    }
    const normPath = normalizeText(entry.location.replace(/\\/g, "/"));
    let found: Track | undefined;
    for (const [path, t] of byPath) {
      if (normPath.endsWith(path) || path.endsWith(normPath)) {
        found = t;
        break;
      }
    }
    found ??= byBase.get(normalizeText(baseNameOf(entry.location)));
    if (!found && entry.title) {
      found = byMeta.get(
        `${normalizeText(entry.artist ?? "")}|${normalizeText(entry.title)}`
      );
    }
    if (found) tracks.push(found);
    else unmatched.push(entry);
  }
  return { tracks, unmatched };
}
