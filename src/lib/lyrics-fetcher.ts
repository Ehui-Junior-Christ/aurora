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
    .normalize("NFC")
    .replace(/\([^)]*(official|video|audio|lyrics|visualizer|remaster)[^)]*\)/gi, "")
    .replace(/\[[^\]]*(official|video|audio|lyrics|visualizer|remaster)[^\]]*\]/gi, "")
    .replace(/\s+-\s+topic$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const LYRICS_TIMEOUT_MS = 8000;
/** lrclib often answers 503 when busy: retry a couple of times. */
const RETRY_DELAYS_MS = [700, 1800];
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with a timeout (AbortSignal.timeout is missing on older phones). */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LYRICS_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function queryLyrics(params: URLSearchParams): Promise<LyricsCue[] | null> {
  const url = `https://lrclib.net/api/search?${params.toString()}`;
  let response = await fetchWithTimeout(url);
  for (const delay of RETRY_DELAYS_MS) {
    if (response.status !== 429 && response.status < 500) break;
    await sleep(delay);
    response = await fetchWithTimeout(url);
  }
  if (!response.ok) return null;
  const results = (await response.json()) as unknown;
  if (!Array.isArray(results) || results.length === 0) return null;
  return pickBest(results as LrcLibResult[]);
}

/** Main artist of "A & B", "A feat. B", "A, B", "A x B". */
function mainArtist(artist: string): string {
  return artist
    .normalize("NFC")
    .split(/\s*(?:&|,|feat\.?|ft\.?|x|et)\s*/i)[0]
    .trim();
}

export async function fetchRemoteLyrics(
  artist: string,
  title: string
): Promise<LyricsCue[] | null> {
  const cleanTitle = cleanOnlineTitle(title)
    // "Title (feat. X)" is stored without the featuring on lrclib.
    .replace(/\s*[([]\s*(feat|ft)\.?[^)\]]*[)\]]/gi, "")
    .trim();
  if (!cleanTitle) return null;
  try {
    const known = artist !== "Unknown Artist" && artist !== "YouTube";
    const lead = known ? mainArtist(artist) : "";
    if (lead) {
      const exact = await queryLyrics(
        new URLSearchParams({ artist_name: lead, track_name: cleanTitle })
      );
      if (exact) return exact;
      const loose = await queryLyrics(new URLSearchParams({ q: `${lead} ${cleanTitle}` }));
      if (loose) return loose;
    }
    return await queryLyrics(new URLSearchParams({ q: cleanTitle }));
  } catch {
    return null;
  }
}
