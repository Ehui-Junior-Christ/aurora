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

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.projectsegfau.lt",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.tokhmi.xyz"
];

export async function searchOnlineMusic(
  query: string,
  _apiKey?: string
): Promise<OnlineMusicResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ q: trimmed, filter: "music_songs" });

  let lastError: any;
  for (const instance of PIPED_INSTANCES) {
    const timeout = timeoutSignal();
    try {
      const response = await fetch(`${instance}/search?${params.toString()}`, {
        signal: timeout.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const json = await response.json();
      if (json.error) throw new Error(json.error);
      const items = json.items ?? [];

      return items
        .filter((item: any) => item.url?.includes("/watch?v="))
        .map((item: any) => {
          const videoId = item.url.split("v=")[1]?.split("&")[0];
          
          const title = (item.title || "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

          return {
            id: `yt:${videoId}`,
            title,
            artist: item.uploaderName || item.author || "YouTube",
            thumbnail: item.thumbnail,
            durationText: item.duration > 0 ? formatDuration(item.duration) : "",
            isOnline: true as const,
          };
        });
    } catch (err: any) {
      lastError = err;
      // Continue to next instance
    } finally {
      timeout.cleanup();
    }
  }

  // If all instances failed
  if (lastError?.name === "AbortError") {
    throw new Error("La recherche a expiré. Réessayez.");
  }
  throw new Error("Impossible de se connecter aux serveurs de recherche. Réessayez plus tard.");
}

function formatDuration(seconds: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
