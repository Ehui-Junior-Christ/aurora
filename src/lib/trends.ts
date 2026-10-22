import { upscaleArtwork, type CatalogSong } from "./catalog";
import { songKey } from "./yt-match.mjs";

/**
 * "Tendances": Apple Music most-played charts (fr / us / gb), bundled as
 * public/trends.json by scripts/build-trends.mjs (daily GitHub Action) with a
 * YouTube video id per song when already resolved, so playing a chart entry
 * costs zero YouTube quota.
 */

export type TrendCountry = "fr" | "us" | "gb";
export const TREND_COUNTRIES: TrendCountry[] = ["fr", "us", "gb"];

export interface TrendsData {
  generatedAt: string;
  charts: Record<TrendCountry, CatalogSong[]>;
}

const VIDEO_ID = /^[\w-]{11}$/;

function parseEntry(raw: unknown): CatalogSong | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : "";
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const artist = typeof r.artist === "string" ? r.artist.trim() : "";
  if (!/^\d+$/.test(id) || !title || !artist) return null;
  return {
    itunesId: id,
    title,
    artist,
    album: typeof r.album === "string" ? r.album : "",
    durationMs: typeof r.durationMs === "number" && r.durationMs > 0 ? r.durationMs : undefined,
    artwork: upscaleArtwork(r.artwork),
    releaseDate: typeof r.releaseDate === "string" ? r.releaseDate : undefined,
    genre: typeof r.genre === "string" ? r.genre : undefined,
    videoId: typeof r.videoId === "string" && VIDEO_ID.test(r.videoId) ? r.videoId : undefined,
  };
}

let trendsPromise: Promise<TrendsData | null> | null = null;

/** Loads /trends.json once per session (null when missing / invalid). */
export function loadTrends(): Promise<TrendsData | null> {
  if (!trendsPromise) {
    trendsPromise = (async () => {
      try {
        const response = await fetch("/trends.json", { cache: "no-cache" });
        if (!response.ok) return null;
        const json = (await response.json()) as { generatedAt?: unknown; charts?: unknown };
        const charts = (json.charts ?? {}) as Record<string, unknown>;
        const out = {} as Record<TrendCountry, CatalogSong[]>;
        for (const cc of TREND_COUNTRIES) {
          const list = Array.isArray(charts[cc]) ? (charts[cc] as unknown[]) : [];
          out[cc] = list.map(parseEntry).filter((s): s is CatalogSong => !!s);
        }
        return {
          generatedAt: typeof json.generatedAt === "string" ? json.generatedAt : "",
          charts: out,
        };
      } catch {
        trendsPromise = null; // offline: retry on the next call
        return null;
      }
    })();
  }
  return trendsPromise;
}

let mapPromise: Promise<Map<string, string>> | null = null;

/** songKey(artist, title) → videoId for every resolved chart entry. */
export function trendsVideoMap(): Promise<Map<string, string>> {
  if (!mapPromise) {
    mapPromise = loadTrends().then((data) => {
      const map = new Map<string, string>();
      if (!data) {
        mapPromise = null;
        return map;
      }
      for (const cc of TREND_COUNTRIES) {
        for (const song of data.charts[cc]) {
          if (song.videoId) map.set(songKey(song.artist, song.title), song.videoId);
        }
      }
      return map;
    });
  }
  return mapPromise;
}
