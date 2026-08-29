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

export async function searchOnlineMusic(
  query: string,
  apiKey: string
): Promise<OnlineMusicResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "20",
    q: trimmed,
    videoCategoryId: "10", // Music
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
      throw new Error(`HTTP_${response.status}`);
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
          .replace(/&#39;/g, "'");

        return {
          id: item.id.videoId!,
          title: title.trim() || "Titre inconnu",
          artist: snippet.channelTitle.trim() || "YouTube",
          thumbnail,
          durationText: undefined, // Requires another API call to videos endpoint, skipped to save quota
          isOnline: true,
        };
      });
  } catch (error) {
    throw error instanceof Error ? error : new Error("YOUTUBE_UNAVAILABLE");
  } finally {
    timeout.cleanup();
  }
}

export async function getAudioStreamUrl(trackId: string): Promise<string> {
  // With the YouTube iframe player, we don't need a stream URL, we just pass the ID.
  // But to satisfy types if needed, return empty or throw.
  // We will intercept the playback in audio-engine.ts instead.
  return `yt:${trackId}`;
}

export function onlineResultToTrack(result: OnlineMusicResult): Track {
  const seed = fnv1a(`${result.id}|${result.title}|${result.artist}`);
  return {
    id: `yt:${result.id}`, // Prefix with yt: so engine knows to use IFrame
    streamUrl: `yt:${result.id}`,
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
