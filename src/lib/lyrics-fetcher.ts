import { parseLrc, type LyricsCue } from "./lyrics";

interface LrcLibResult {
  id: number;
  trackName: string;
  artistName: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export async function fetchRemoteLyrics(
  artist: string,
  title: string
): Promise<LyricsCue[] | null> {
  if (artist === "Unknown Artist") return null;
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });
    const response = await fetch(
      `https://lrclib.net/api/search?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "LRCLIB-User-Agent": "AURORA/1.0 (https://github.com/Ehui-Junior-Christ/aurora)",
        },
      }
    );
    if (!response.ok) return null;
    const results = (await response.json()) as LrcLibResult[];
    if (!Array.isArray(results) || results.length === 0) return null;
    const best =
      results.find((r) => r.syncedLyrics && r.syncedLyrics.trim().length > 0) ??
      null;
    if (!best?.syncedLyrics) return null;
    const cues = parseLrc(best.syncedLyrics);
    return cues.length > 0 ? cues : null;
  } catch {
    return null;
  }
}
