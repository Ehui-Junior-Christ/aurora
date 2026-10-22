import { idbGet, idbSet } from "./db";
import { fnv1a } from "./hash";
import { FALLBACK_PALETTES } from "./palette";
import type { Track } from "./types";

/**
 * Music catalog search through the iTunes Search API (free, no key, CORS
 * enabled). It only provides clean metadata + covers: playback is resolved
 * to a YouTube video at play time (see yt-resolve.ts), so typing in the
 * search box never spends YouTube quota.
 */

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const REQUEST_TIMEOUT = 8000;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MEMORY_MAX = 60;

export interface CatalogSong {
  itunesId: string;
  title: string;
  artist: string;
  album: string;
  durationMs?: number;
  /** 600x600 artwork (https only). */
  artwork?: string;
  releaseDate?: string;
  genre?: string;
  previewUrl?: string;
  /** Known YouTube video id (Tendances), when bundled. */
  videoId?: string;
}

interface CacheEntry {
  at: number;
  results: CatalogSong[];
}

const memory = new Map<string, CacheEntry>();

/** Two-letter storefront from the browser language ("fr-FR" → "FR"). */
export function catalogCountry(): string {
  if (typeof navigator === "undefined") return "FR";
  for (const lang of navigator.languages ?? [navigator.language]) {
    const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(lang ?? "")?.[1];
    if (region) return region.toUpperCase();
  }
  return "FR";
}

function httpsOnly(url: unknown): string | undefined {
  return typeof url === "string" && url.startsWith("https://") ? url : undefined;
}

/** mzstatic artwork URLs encode their size: ask for a 600x600 rendition. */
export function upscaleArtwork(url: unknown, size = 600): string | undefined {
  const safe = httpsOnly(url);
  return safe?.replace(/\/\d+x\d+(bb|cc)?\.(jpg|png|webp)$/i, `/${size}x${size}bb.$2`);
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Validates one iTunes result; returns null for anything but a song. */
export function parseItunesSong(raw: unknown): CatalogSong | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.wrapperType !== "track" || r.kind !== "song") return null;
  const id = typeof r.trackId === "number" ? String(r.trackId) : undefined;
  const title = str(r.trackName);
  const artist = str(r.artistName);
  if (!id || !title || !artist) return null;
  const durationMs =
    typeof r.trackTimeMillis === "number" && r.trackTimeMillis > 0 ? r.trackTimeMillis : undefined;
  return {
    itunesId: id,
    title,
    artist,
    album: str(r.collectionName) ?? "",
    durationMs,
    artwork: upscaleArtwork(r.artworkUrl100 ?? r.artworkUrl60),
    releaseDate: str(r.releaseDate),
    genre: str(r.primaryGenreName),
    previewUrl: httpsOnly(r.previewUrl),
  };
}

function remember(key: string, entry: CacheEntry): void {
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

/**
 * Searches songs in the catalog. Results are cached 24 h (memory + IndexedDB).
 * `signal` aborts the request (superseded keystroke); a timeout applies.
 */
export async function searchCatalog(
  query: string,
  options: { signal?: AbortSignal; limit?: number; country?: string } = {}
): Promise<CatalogSong[]> {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  const country = options.country ?? catalogCountry();
  const limit = options.limit ?? 25;
  const key = `catalog:${country}:${limit}:${q}`;

  const now = Date.now();
  const hot = memory.get(key);
  if (hot && now - hot.at < CACHE_TTL) return hot.results;
  const stored = await idbGet<CacheEntry>("meta", key);
  if (stored && Array.isArray(stored.results) && now - stored.at < CACHE_TTL) {
    remember(key, stored);
    return stored.results;
  }
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const params = new URLSearchParams({
    term: q,
    entity: "song",
    media: "music",
    limit: String(limit),
    country,
  });
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Catalogue indisponible (HTTP ${response.status}).`);
    }
    const json = (await response.json()) as { results?: unknown };
    const results: CatalogSong[] = [];
    const seen = new Set<string>();
    for (const raw of Array.isArray(json.results) ? json.results : []) {
      const song = parseItunesSong(raw);
      if (!song || seen.has(song.itunesId)) continue;
      seen.add(song.itunesId);
      results.push(song);
    }
    const entry = { at: Date.now(), results };
    remember(key, entry);
    void idbSet("meta", key, entry);
    return results;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (timedOut) throw new Error("Le catalogue ne répond pas. Réessaie.");
      throw err;
    }
    if (err instanceof TypeError) {
      throw new Error("Catalogue injoignable (connexion ?).");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export function formatDurationMs(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function catalogTrackId(itunesId: string): string {
  return `cat:${itunesId}`;
}

/** Online Track for a catalog song (stream resolved at play time). */
export function catalogSongToTrack(song: CatalogSong): Track {
  const seed = fnv1a(`cat:${song.itunesId}|${song.title}|${song.artist}`);
  return {
    id: catalogTrackId(song.itunesId),
    streamUrl: song.videoId ? `yt:${song.videoId}` : undefined,
    isOnline: true,
    title: song.title,
    artist: song.artist,
    album: song.album,
    coverUrl: song.artwork,
    durationText: formatDurationMs(song.durationMs),
    durationSec: song.durationMs ? Math.round(song.durationMs / 100) / 10 : undefined,
    palette: FALLBACK_PALETTES[seed % FALLBACK_PALETTES.length],
    seed,
    catalog: {
      itunesId: song.itunesId,
      durationMs: song.durationMs,
      releaseDate: song.releaseDate,
      genre: song.genre,
      previewUrl: song.previewUrl,
    },
  };
}

/** True for ids of online tracks (YouTube or catalog). */
export function isOnlineTrackId(id: string): boolean {
  return id.startsWith("yt:") || id.startsWith("cat:");
}
