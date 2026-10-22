// Plain JavaScript on purpose: shared by the app (yt-resolve.ts) and by the
// Node script scripts/build-trends.mjs, so a song gets the same cache key and
// the same YouTube pick in both places. Types live in yt-match.d.mts.

/** Lowercase, accents stripped, punctuation collapsed to single spaces. */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Title without "(feat. X)", "[Remastered]", "- Radio Edit" style suffixes. */
export function coreTitle(title) {
  return normalizeText(
    String(title ?? "")
      .replace(/[([](?:feat|ft|with|avec|prod)\.?\s[^)\]]*[)\]]/gi, " ")
      .replace(/\s[-–]\s(?:\d{4}\s)?(?:remaster(?:ed)?|radio edit|single version|edit)\b.*$/i, " ")
      .replace(/[([](?:\d{4}\s)?(?:remaster(?:ed)?|radio edit|single version|explicit|clean)[^)\]]*[)\]]/gi, " ")
  );
}

/** Main artist ("A & B", "A, B", "A feat. B" → "a"). */
export function primaryArtist(artist) {
  const first = String(artist ?? "").split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\bet\b)\s*/i)[0];
  return normalizeText(first || artist);
}

/** Cache key shared by IndexedDB (`yt:<key>`) and data/yt-map.json. */
export function songKey(artist, title) {
  return `${primaryArtist(artist)}|${coreTitle(title)}`;
}

/** ISO 8601 duration (PT3M34S) → seconds (0 when unknown). */
export function isoDurationSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso ?? ""));
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0));
}

const BAD_WORDS = [
  "live",
  "en direct",
  "concert",
  "cover",
  "remix",
  "karaoke",
  "instrumental",
  "sped up",
  "speed up",
  "slowed",
  "reverb",
  "nightcore",
  "8d",
  "acapella",
  "a cappella",
  "reaction",
  "tutorial",
  "lesson",
  "piano version",
  "1 hour",
  "10 hours",
  "extended",
  "bass boosted",
  "mashup",
  "parody",
];

const LYRIC_WORDS = ["lyrics", "lyric video", "paroles", "letra"];

function hasWord(haystack, word) {
  return ` ${haystack} `.includes(` ${word} `);
}

/** Share of `needle` words present in `haystack` (0..1). */
function overlap(needle, haystack) {
  const words = needle.split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  if (words.length === 0) return 0;
  let hit = 0;
  for (const w of words) if (hasWord(haystack, w)) hit++;
  return hit / words.length;
}

/**
 * Scores a YouTube candidate for a song. Higher is better; a score below
 * MIN_SCORE means "probably not this song".
 *
 * target:    { title, artist, durationMs? }
 * candidate: { title, channel, durationSec?, blocked? }
 */
export function scoreCandidate(target, candidate) {
  const title = coreTitle(target.title);
  const fullTitle = normalizeText(target.title);
  const artist = primaryArtist(target.artist);
  const vTitle = normalizeText(candidate.title);
  const channel = normalizeText(candidate.channel);
  let score = 0;

  // Title match.
  if (title && vTitle.includes(title)) score += 30;
  else score += Math.round(overlap(title, vTitle) * 22) - 6;

  // Artist in the video title or the channel name ("Aya Nakamura - Topic",
  // "AyaNakamuraVEVO", "Aya Nakamura Officiel"...).
  const compact = artist.replace(/ /g, "");
  const chanCompact = channel.replace(/ /g, "");
  const artistInTitle = !!artist && vTitle.includes(artist);
  const artistInChannel = !!compact && chanCompact.includes(compact);
  if (artistInTitle || artistInChannel) score += 20;
  else score -= 15;

  // Official sources.
  if (channel.endsWith(" topic") && artistInChannel) score += 25;
  else if (chanCompact.endsWith("vevo") && artistInChannel) score += 18;
  else if (artistInChannel && chanCompact.replace(/(official|officiel)$/, "") === compact) score += 14;
  else if (/\bofficial\b|\bofficiel\b/.test(channel)) score += 6;
  if (/\bofficial audio\b|\baudio officiel\b/.test(vTitle)) score += 8;
  else if (/\bofficial (music )?video\b|\bclip officiel\b|\bofficial mv\b/.test(vTitle)) score += 5;
  else if (hasWord(vTitle, "audio")) score += 3;

  // Unwanted versions (unless the catalog title asks for them).
  for (const word of BAD_WORDS) {
    if (hasWord(vTitle, word) && !hasWord(fullTitle, word)) score -= 40;
  }
  for (const word of LYRIC_WORDS) {
    if (hasWord(vTitle, word) && !hasWord(fullTitle, word)) {
      score -= 12;
      break;
    }
  }

  // Duration agreement (the strongest signal when both are known).
  const want = target.durationMs ? target.durationMs / 1000 : 0;
  const got = candidate.durationSec ?? 0;
  if (want > 0 && got > 0) {
    const diff = Math.abs(got - want);
    if (diff <= 3) score += 30;
    else if (diff <= 8) score += 20;
    else if (diff <= 20) score += 6;
    else if (diff <= 45) score -= 10;
    else score -= 35;
  }

  if (candidate.blocked) score -= 200;
  return score;
}

export const MIN_SCORE = 15;

/** Best candidate (or null when none is convincing). */
export function pickBest(target, candidates) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(target, c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best && bestScore >= MIN_SCORE ? { candidate: best, score: bestScore } : null;
}

/** True when contentDetails.regionRestriction blocks `country` (ISO 3166). */
export function regionBlocked(restriction, country) {
  if (!restriction || !country) return false;
  const cc = String(country).toUpperCase();
  if (Array.isArray(restriction.blocked) && restriction.blocked.includes(cc)) return true;
  if (Array.isArray(restriction.allowed) && !restriction.allowed.includes(cc)) return true;
  return false;
}

/** Decodes the few HTML entities the Data API leaves in titles. */
export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
