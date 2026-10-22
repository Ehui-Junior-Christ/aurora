import { idbDelete, idbGet, idbGetMany, idbSet } from "./db";
import type { PaletteColor, Track } from "./types";

/**
 * User overrides of track tags, stored in IndexedDB ("meta" store, key
 * `edit:<id>`) and applied over parsed tags. Audio files are never modified.
 */

export interface TrackEdit {
  title?: string;
  artist?: string;
  album?: string;
  /** Replacement cover image. */
  coverBlob?: Blob;
  /** Palette extracted from coverBlob. */
  palette?: PaletteColor[];
  updatedAt: number;
}

export interface TrackEditPatch {
  title?: string;
  artist?: string;
  album?: string;
  /** Blob = new cover, null = remove the custom cover, undefined = keep. */
  cover?: Blob | null;
}

export function editKey(id: string): string {
  return `edit:${id}`;
}

export async function getTrackEdit(id: string): Promise<TrackEdit | undefined> {
  return idbGet<TrackEdit>("meta", editKey(id));
}

export async function getTrackEdits(ids: string[]): Promise<Map<string, TrackEdit>> {
  const values = await idbGetMany<TrackEdit>("meta", ids.map(editKey));
  const out = new Map<string, TrackEdit>();
  ids.forEach((id, i) => {
    const v = values[i];
    if (v && typeof v === "object") out.set(id, v);
  });
  return out;
}

export async function saveTrackEdit(id: string, edit: TrackEdit | null): Promise<void> {
  if (!edit) await idbDelete("meta", editKey(id));
  else await idbSet("meta", editKey(id), edit);
}

/** Merges a patch into an existing edit ("" clears a text override). */
export function mergeEdit(
  current: TrackEdit | undefined,
  patch: TrackEditPatch,
  palette?: PaletteColor[]
): TrackEdit | null {
  const next: TrackEdit = { ...(current ?? {}), updatedAt: Date.now() };
  for (const key of ["title", "artist", "album"] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  }
  if (patch.cover === null) {
    delete next.coverBlob;
    delete next.palette;
  } else if (patch.cover) {
    next.coverBlob = patch.cover;
    if (palette) next.palette = palette;
  }
  const hasContent =
    next.title !== undefined ||
    next.artist !== undefined ||
    next.album !== undefined ||
    next.coverBlob !== undefined;
  return hasContent ? next : null;
}

/**
 * Applies an edit over `track` (the parsed, unedited track). The visual seed
 * is kept stable so a renamed track keeps its generated scene.
 */
export function applyTrackEdit(track: Track, edit: TrackEdit | undefined): Track {
  if (!edit) return track;
  return {
    ...track,
    title: edit.title ?? track.title,
    artist: edit.artist ?? track.artist,
    album: edit.album ?? track.album,
    ...(edit.coverBlob ? { coverUrl: URL.createObjectURL(edit.coverBlob) } : {}),
    ...(edit.palette && edit.palette.length > 0 ? { palette: edit.palette } : {}),
  };
}
