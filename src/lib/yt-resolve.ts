import { idbGet, idbSet } from "./db";
import { catalogCountry } from "./catalog";
import { fnv1a } from "./hash";
import { trendsVideoMap } from "./trends";
import {
  decodeEntities,
  isoDurationSeconds,
  pickBest,
  regionBlocked,
  songKey,
  type MatchCandidate,
  type RegionRestriction,
} from "./yt-match.mjs";

/**
 * Turns a catalog song into a playable YouTube video id, spending as little
 * quota as possible:
 *   1. bundled Tendances map (public/trends.json)          → 0 unit
 *   2. IndexedDB cache `yt:<artist|title>` (never expires)  → 0 unit
 *   3. search.list (100 units) + one videos.list (1 unit)  → 101 units
 * Concurrent resolutions of the same song share one request.
 */

const API = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT = 8500;
const QUOTA_KEY = "aurora-yt-quota-blocked";

export interface ResolveTarget {
  title: string;
  artist: string;
  durationMs?: number;
}

export interface ResolvedVideo {
  videoId: string;
  title?: string;
  source: "trends" | "cache" | "api";
}

export type ResolveErrorCode = "quota" | "key" | "nokey" | "notfound" | "network";

export class YtResolveError extends Error {
  constructor(
    public code: ResolveErrorCode,
    message: string
  ) {
    super(message);
    this.name = "YtResolveError";
  }
}

export const QUOTA_MESSAGE =
  "Quota YouTube du jour épuisé : impossible de trouver la vidéo de ce titre pour l'instant. " +
  "Les Tendances et les titres déjà écoutés restent lisibles. Réessaie après 9 h (heure de Paris).";

interface CachedVideo {
  videoId: string;
  title?: string;
  at: number;
}

const inflight = new Map<string, Promise<ResolvedVideo>>();

/** Quota resets at midnight Pacific time (08:00 UTC at the latest). */
function nextQuotaReset(now = Date.now()): number {
  const d = new Date(now);
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0);
  return reset > now ? reset : reset + 24 * 60 * 60 * 1000;
}

function quotaSlot(apiKey: string): string {
  return `${QUOTA_KEY}:${fnv1a(apiKey).toString(36)}`;
}

export function quotaExhausted(apiKey: string): boolean {
  try {
    const until = Number(window.localStorage.getItem(quotaSlot(apiKey)) ?? 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

function markQuotaExhausted(apiKey: string): void {
  try {
    window.localStorage.setItem(quotaSlot(apiKey), String(nextQuotaReset()));
  } catch {
    /* private mode: the next call simply fails again */
  }
}

async function ytApi<T>(path: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const query = new URLSearchParams({ ...params, key: apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let response: Response;
  try {
    response = await fetch(`${API}/${path}?${query.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new YtResolveError(
      "network",
      aborted ? "YouTube ne répond pas. Réessaie." : "YouTube injoignable (connexion ou bloqueur de contenu)."
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let reason = "";
    try {
      const body = (await response.json()) as { error?: { errors?: { reason?: string }[] } };
      reason = body.error?.errors?.[0]?.reason ?? "";
    } catch {
      /* non-JSON error page */
    }
    if (response.status === 429 || /quota|dailyLimit|rateLimit/i.test(reason)) {
      markQuotaExhausted(apiKey);
      throw new YtResolveError("quota", QUOTA_MESSAGE);
    }
    if (response.status === 400 || response.status === 403) {
      throw new YtResolveError(
        "key",
        `Clé API YouTube refusée (${response.status}${reason ? ` · ${reason}` : ""}). Vérifie-la dans les réglages.`
      );
    }
    throw new YtResolveError("network", `YouTube indisponible (HTTP ${response.status}).`);
  }
  return (await response.json()) as T;
}

interface SearchResponse {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
}

interface VideosResponse {
  items?: {
    id: string;
    contentDetails?: { duration?: string; regionRestriction?: RegionRestriction };
  }[];
}

async function searchAndScore(target: ResolveTarget, apiKey: string): Promise<ResolvedVideo> {
  const country = catalogCountry();
  const search = await ytApi<SearchResponse>(
    "search",
    {
      part: "snippet",
      type: "video",
      maxResults: "8",
      q: `${target.artist} ${target.title} audio`,
      videoEmbeddable: "true",
      videoCategoryId: "10",
      regionCode: country,
    },
    apiKey
  );
  const candidates: MatchCandidate[] = [];
  for (const item of search.items ?? []) {
    const videoId = item.id?.videoId;
    if (!videoId || candidates.some((c) => c.videoId === videoId)) continue;
    candidates.push({
      videoId,
      title: decodeEntities(item.snippet?.title ?? ""),
      channel: decodeEntities(item.snippet?.channelTitle ?? ""),
    });
  }
  if (candidates.length === 0) {
    throw new YtResolveError("notfound", `Aucune vidéo YouTube trouvée pour « ${target.title} ».`);
  }
  // One videos.list call (1 unit) for every candidate's duration/region.
  try {
    const details = await ytApi<VideosResponse>(
      "videos",
      { part: "contentDetails", id: candidates.map((c) => c.videoId).join(","), maxResults: "8" },
      apiKey
    );
    for (const item of details.items ?? []) {
      const c = candidates.find((x) => x.videoId === item.id);
      if (!c) continue;
      c.durationSec = isoDurationSeconds(item.contentDetails?.duration);
      c.blocked = regionBlocked(item.contentDetails?.regionRestriction, country);
    }
  } catch (err) {
    // Durations only refine the pick; quota errors still propagate.
    if (err instanceof YtResolveError && err.code === "quota") throw err;
  }
  const best = pickBest(target, candidates);
  if (!best) {
    throw new YtResolveError("notfound", `Aucune vidéo YouTube ne correspond à « ${target.title} ».`);
  }
  return { videoId: best.candidate.videoId, title: best.candidate.title, source: "api" };
}

/** Video id from the Tendances map or the IndexedDB cache (no network quota). */
export async function resolveCached(target: ResolveTarget): Promise<ResolvedVideo | null> {
  const key = songKey(target.artist, target.title);
  const trends = await trendsVideoMap();
  const fromTrends = trends.get(key);
  if (fromTrends) return { videoId: fromTrends, source: "trends" };
  const cached = await idbGet<CachedVideo>("meta", `yt:${key}`);
  if (cached && typeof cached.videoId === "string" && cached.videoId) {
    return { videoId: cached.videoId, title: cached.title, source: "cache" };
  }
  return null;
}

/**
 * Best YouTube video for a song. Throws YtResolveError with a French message
 * (quota exhausted, missing/invalid key, nothing found, network).
 */
export function resolveYouTube(target: ResolveTarget, apiKey: string): Promise<ResolvedVideo> {
  const key = songKey(target.artist, target.title);
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const cached = await resolveCached(target);
    if (cached) return cached;
    if (!apiKey.trim()) {
      throw new YtResolveError(
        "nokey",
        "Clé API YouTube manquante : ajoute-la dans les réglages pour lire ce titre."
      );
    }
    if (quotaExhausted(apiKey)) throw new YtResolveError("quota", QUOTA_MESSAGE);
    const found = await searchAndScore(target, apiKey);
    await idbSet("meta", `yt:${key}`, { videoId: found.videoId, title: found.title, at: Date.now() });
    return found;
  })();
  inflight.set(key, job);
  void job.then(
    () => inflight.delete(key),
    () => inflight.delete(key)
  );
  return job;
}
