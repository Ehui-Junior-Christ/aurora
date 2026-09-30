import { fnv1a } from "./hash";
import { FALLBACK_PALETTES } from "./palette";
import type { Track } from "./types";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT = 8500;

interface YouTubeSnippet {
  title: string;
  channelTitle: string;
  thumbnails: {
    default?: { url: string };
    medium?: { url: string };
    high?: { url: string };
  };
}

interface YouTubeSearchItem {
  id: {
    videoId?: string;
  };
  snippet: YouTubeSnippet;
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: { message: string };
}

export interface OnlineMusicResult {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  durationText?: string;
  isOnline: true;
}

function timeoutSignal(signal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const cleanup = () => {
    clearTimeout(timeout);
  };
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return { signal: controller.signal, cleanup };
}

/** Strips any number of legacy `yt:` / `online_` prefixes from an id. */
export function toVideoId(id: string): string {
  return id.replace(/^(?:yt:|online_)+/, "");
}

export async function searchOnlineMusic(
  query: string,
  apiKey: string
): Promise<OnlineMusicResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  if (!apiKey.trim()) {
    throw new Error(
      "Clé API YouTube manquante. Ajoutez-la dans les réglages ou via NEXT_PUBLIC_YOUTUBE_API_KEY."
    );
  }

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "20",
    q: trimmed,
    videoCategoryId: "10", // Music
    // Only return videos that can actually be played through the embedded
    // IFrame player (many official music videos block embedding -> error 150).
    videoEmbeddable: "true",
    videoSyndicated: "true",
    key: apiKey,
  });

  const timeout = timeoutSignal();
  try {
    const response = await fetch(`${YOUTUBE_API_BASE}/search?${params.toString()}`, {
      signal: timeout.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("Quota ou clé API YouTube invalide (403).");
      }
      if (response.status === 429) {
        throw new Error(
          "Quota YouTube du jour épuisé. Réessaie plus tard ou ajoute ta propre clé API dans les réglages."
        );
      }
      if (response.status === 400) {
        throw new Error("Clé API YouTube invalide (400).");
      }
      throw new Error(`Recherche indisponible (HTTP ${response.status}).`);
    }

    const json = (await response.json()) as YouTubeSearchResponse;
    if (json.error) throw new Error(json.error.message);
    const items = json.items ?? [];

    return items
      .filter((item) => item.id?.videoId)
      .map((item) => {
        const snippet = item.snippet;
        const thumbnail =
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url;

        // Clean up titles (remove HTML entities like &amp;)
        const title = snippet.title
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");

        return {
          // Raw video id: onlineResultToTrack() adds the `yt:` prefix. Prefixing
          // here too produced `yt:yt:<id>` which the IFrame player rejected.
          id: item.id.videoId as string,
          title,
          artist: snippet.channelTitle,
          thumbnail,
          durationText: "",
          isOnline: true as const,
        };
      });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("La recherche a expiré. Réessayez.");
    }
    throw err;
  } finally {
    timeout.cleanup();
  }
}

export async function getAudioStreamUrl(trackId: string): Promise<string> {
  // With the YouTube iframe player, we don't need a stream URL, we just pass the ID.
  // But to satisfy types if needed, return empty or throw.
  // We will intercept the playback in audio-engine.ts instead.
  return `yt:${toVideoId(trackId)}`;
}

export function onlineResultToTrack(result: OnlineMusicResult): Track {
  const videoId = toVideoId(result.id);
  const seed = fnv1a(`${videoId}|${result.title}|${result.artist}`);
  return {
    id: `yt:${videoId}`, // Prefix with yt: so engine knows to use IFrame
    streamUrl: `yt:${videoId}`,
    isOnline: true,
    title: result.title,
    artist: result.artist,
    album: "YouTube",
    coverUrl: result.thumbnail,
    durationText: result.durationText,
    palette: FALLBACK_PALETTES[seed % FALLBACK_PALETTES.length],
    seed,
  };
}
