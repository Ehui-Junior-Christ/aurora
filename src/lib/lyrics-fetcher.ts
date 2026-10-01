import { parseLrc, type LyricsCue } from "./lyrics";

interface LrcLibResult {
  id: number;
  trackName: string;
  artistName: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function cleanOnlineTitle(value: string): string {
  return value
    .replace(/\([^)]*(official|video|audio|lyrics|visualizer|remaster)[^)]*\)/gi, "")
    .replace(/\[[^\]]*(official|video|audio|lyrics|visualizer|remaster)[^\]]*\]/gi, "")
    .replace(/\s+-\s+topic$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const LYRICS_TIMEOUT_MS = 8000;
const MAX_LYRICS_LENGTH = 200_000;

function pickBest(results: LrcLibResult[]): LyricsCue[] | null {
  const best =
    results.find(
      (r) =>
        r !== null &&
        typeof r === "object" &&
        typeof r.syncedLyrics === "string" &&
        r.syncedLyrics.trim().length > 0 &&
        r.syncedLyrics.length <= MAX_LYRICS_LENGTH
    ) ?? null;
  if (!best?.syncedLyrics) return null;
  const cues = parseLrc(best.syncedLyrics);
  return cues.length > 0 ? cues : null;
}

async function queryLyrics(params: URLSearchParams): Promise<LyricsCue[] | null> {
  const response = await fetch(
    `https://lrclib.net/api/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(LYRICS_TIMEOUT_MS),
    }
  );
  if (!response.ok) return null;
  const results = (await response.json()) as unknown;
  if (!Array.isArray(results) || results.length === 0) return null;
  return pickBest(results as LrcLibResult[]);
}

export async function fetchRemoteLyrics(
  artist: string,
  title: string
): Promise<LyricsCue[] | null> {
  const cleanTitle = cleanOnlineTitle(title);
  if (!cleanTitle) return null;
  try {
    if (artist !== "Unknown Artist" && artist !== "YouTube") {
      const exact = await queryLyrics(
        new URLSearchParams({
          artist_name: artist,
          track_name: cleanTitle,
        })
      );
      if (exact) return exact;
    }
    return await queryLyrics(new URLSearchParams({ q: cleanTitle }));
  } catch {
    return null;
  }
}
