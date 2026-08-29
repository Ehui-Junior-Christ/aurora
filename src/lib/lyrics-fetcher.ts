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

function pickBest(results: LrcLibResult[]): LyricsCue[] | null {
  const best =
    results.find((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 0) ??
    null;
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
    }
  );
  if (!response.ok) return null;
  const results = (await response.json()) as LrcLibResult[];
  if (!Array.isArray(results) || results.length === 0) return null;
  return pickBest(results);
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
