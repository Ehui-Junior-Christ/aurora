#!/usr/bin/env node
// Builds public/trends.json ("Tendances") from the Apple Music most-played
// charts (fr / us / gb) and resolves each song to a YouTube video id ONCE,
// keeping every answer in data/yt-map.json (committed) so the app can play
// chart songs without spending any YouTube quota.
//
//   YOUTUBE_API_KEY=... MAX_RESOLVE=60 node scripts/build-trends.mjs
//
// Env:
//   YOUTUBE_API_KEY  YouTube Data API v3 key (without it, only the charts and
//                    already-known video ids are written).
//   MAX_RESOLVE      new songs resolved per run (default 60). Each costs
//                    101 units (search.list 100 + videos.list 1): 60 → 6,060.
//   COUNTRIES        comma list (default "fr,us,gb").
//   CHART_SIZE       songs per chart: 10, 25, 50 or 100 (default 100).
//   YT_REFERER       optional Referer header (keys restricted to a website).
//   RETRY_MISSES_DAYS  retry songs with no match after N days (default 30).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeEntities,
  isoDurationSeconds,
  pickBest,
  regionBlocked,
  songKey,
} from "../src/lib/yt-match.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_FILE = resolve(ROOT, "data/yt-map.json");
const TRENDS_FILE = resolve(ROOT, "public/trends.json");

const API_KEY = (process.env.YOUTUBE_API_KEY ?? "").trim();
const MAX_RESOLVE = Math.max(0, Number.parseInt(process.env.MAX_RESOLVE ?? "60", 10) || 0);
const COUNTRIES = (process.env.COUNTRIES ?? "fr,us,gb")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter((c) => /^[a-z]{2}$/.test(c));
const CHART_SIZE = [10, 25, 50, 100].includes(Number(process.env.CHART_SIZE))
  ? Number(process.env.CHART_SIZE)
  : 100;
const REFERER = process.env.YT_REFERER ?? "";
const RETRY_MISSES_MS = (Number(process.env.RETRY_MISSES_DAYS ?? "30") || 30) * 86400000;
const UNITS_PER_RESOLVE = 101;

class QuotaError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, { headers = {}, attempts = 4, timeout = 20000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: controller.signal });
      if (res.ok) return await res.json();
      const body = await res.text();
      // Client errors are final (quota, bad key...): do not retry them.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      if (res.status === 429) {
        const err = new Error("HTTP 429");
        err.status = 429;
        err.body = body;
        throw err;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (err?.status) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    await sleep(1500 * (i + 1));
  }
  throw lastError ?? new Error("fetch failed");
}

function upscale(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return undefined;
  return url.replace(/\/\d+x\d+(bb|cc)?\.(jpg|png|webp)$/i, "/600x600bb.$2");
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 1) + "\n", "utf8");
}

async function fetchChart(cc) {
  const url = `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${CHART_SIZE}/songs.json`;
  const json = await fetchJson(url);
  const results = Array.isArray(json?.feed?.results) ? json.feed.results : [];
  return results
    .filter((r) => r && r.kind === "songs" && /^\d+$/.test(String(r.id)) && r.name && r.artistName)
    .map((r) => ({
      id: String(r.id),
      title: String(r.name).trim(),
      artist: String(r.artistName).trim(),
      artwork: upscale(r.artworkUrl100),
      releaseDate: typeof r.releaseDate === "string" ? r.releaseDate : undefined,
      genre: Array.isArray(r.genres) ? r.genres.find((g) => g?.name && String(g.genreId) !== "34")?.name : undefined,
    }));
}

/** Duration + album through the iTunes lookup API (no key, batched). */
async function lookupDetails(ids, cc) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 150) {
    const batch = ids.slice(i, i + 150);
    try {
      const json = await fetchJson(
        `https://itunes.apple.com/lookup?id=${batch.join(",")}&country=${cc}&entity=song`
      );
      for (const r of json?.results ?? []) {
        if (r?.wrapperType !== "track" || typeof r.trackId !== "number") continue;
        out.set(String(r.trackId), {
          durationMs: typeof r.trackTimeMillis === "number" ? r.trackTimeMillis : undefined,
          album: typeof r.collectionName === "string" ? r.collectionName : undefined,
          genre: typeof r.primaryGenreName === "string" ? r.primaryGenreName : undefined,
        });
      }
    } catch (err) {
      console.warn(`  lookup ${cc} failed (${err.message}); durations unknown for this batch`);
    }
  }
  return out;
}

async function yt(path, params) {
  const qs = new URLSearchParams({ ...params, key: API_KEY });
  try {
    return await fetchJson(`https://www.googleapis.com/youtube/v3/${path}?${qs}`, {
      headers: REFERER ? { Referer: REFERER } : {},
      attempts: 2,
    });
  } catch (err) {
    const body = String(err?.body ?? "");
    if (err?.status === 429 || /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(body)) {
      throw new QuotaError("YouTube quota exhausted");
    }
    if (err?.status) {
      const reason = /"reason":\s*"([^"]+)"/.exec(body)?.[1] ?? "";
      throw new Error(`YouTube ${path} HTTP ${err.status} ${reason}`.trim());
    }
    throw err;
  }
}

async function resolveSong(song, cc) {
  const search = await yt("search", {
    part: "snippet",
    type: "video",
    maxResults: "8",
    q: `${song.artist} ${song.title} audio`,
    videoEmbeddable: "true",
    videoCategoryId: "10",
    regionCode: cc.toUpperCase(),
  });
  const candidates = [];
  for (const item of search?.items ?? []) {
    const videoId = item?.id?.videoId;
    if (!videoId || candidates.some((c) => c.videoId === videoId)) continue;
    candidates.push({
      videoId,
      title: decodeEntities(item.snippet?.title),
      channel: decodeEntities(item.snippet?.channelTitle),
    });
  }
  if (candidates.length > 0) {
    const details = await yt("videos", {
      part: "contentDetails",
      id: candidates.map((c) => c.videoId).join(","),
      maxResults: "8",
    });
    for (const item of details?.items ?? []) {
      const c = candidates.find((x) => x.videoId === item.id);
      if (!c) continue;
      c.durationSec = isoDurationSeconds(item.contentDetails?.duration);
      c.blocked = regionBlocked(item.contentDetails?.regionRestriction, cc.toUpperCase());
    }
  }
  return pickBest({ title: song.title, artist: song.artist, durationMs: song.durationMs }, candidates);
}

async function main() {
  console.log(`Charts: ${COUNTRIES.join(", ")} (top ${CHART_SIZE}) · max new resolutions: ${MAX_RESOLVE}`);
  const map = await loadJson(MAP_FILE, { version: 1, entries: {} });
  map.entries ??= {};
  const previous = await loadJson(TRENDS_FILE, null);

  const charts = {};
  for (const cc of COUNTRIES) {
    try {
      const songs = await fetchChart(cc);
      const details = await lookupDetails(songs.map((s) => s.id), cc);
      for (const s of songs) {
        const d = details.get(s.id);
        if (d?.durationMs) s.durationMs = d.durationMs;
        if (d?.album) s.album = d.album;
        if (!s.genre && d?.genre) s.genre = d.genre;
      }
      charts[cc] = songs;
      console.log(`  ${cc}: ${songs.length} songs`);
    } catch (err) {
      // Keep yesterday's chart rather than publishing an empty one.
      charts[cc] = Array.isArray(previous?.charts?.[cc]) ? previous.charts[cc] : [];
      console.warn(`  ${cc}: chart unavailable (${err.message}), kept ${charts[cc].length} previous entries`);
    }
  }

  // Songs to resolve, best ranked first (a song may appear in several charts).
  const queue = new Map();
  for (const cc of COUNTRIES) {
    charts[cc].forEach((song, rank) => {
      const key = songKey(song.artist, song.title);
      const known = map.entries[key];
      const retry = known && !known.videoId && Date.now() - (known.at ?? 0) > RETRY_MISSES_MS;
      if (known && !retry) return;
      const prev = queue.get(key);
      if (!prev || rank < prev.rank) queue.set(key, { song, cc, rank });
    });
  }
  const todo = [...queue.entries()].sort((a, b) => a[1].rank - b[1].rank);
  console.log(`Unknown songs: ${todo.length}`);

  let resolved = 0;
  let missed = 0;
  let calls = 0;
  if (!API_KEY && todo.length > 0) {
    console.warn("YOUTUBE_API_KEY missing: skipping YouTube resolution.");
  } else {
    for (const [key, { song, cc }] of todo) {
      if (calls >= MAX_RESOLVE) break;
      calls++;
      try {
        const best = await resolveSong(song, cc);
        if (best) {
          map.entries[key] = {
            videoId: best.candidate.videoId,
            title: best.candidate.title,
            channel: best.candidate.channel,
            score: best.score,
            itunesId: song.id,
            at: Date.now(),
          };
          resolved++;
          console.log(`  + ${song.artist} - ${song.title} → ${best.candidate.videoId} (${best.score}) ${best.candidate.channel}`);
        } else {
          map.entries[key] = { videoId: null, itunesId: song.id, at: Date.now() };
          missed++;
          console.log(`  ? ${song.artist} - ${song.title}: no convincing match`);
        }
      } catch (err) {
        if (err instanceof QuotaError) {
          console.warn("YouTube quota exhausted: stopping (progress saved).");
          calls--;
          break;
        }
        console.warn(`  ! ${song.artist} - ${song.title}: ${err.message}`);
        if (/HTTP 40[03]/.test(err.message)) break; // bad key: no point going on
      }
    }
  }
  console.log(
    `Resolved ${resolved}, no match ${missed}, left for later ${Math.max(0, todo.length - calls)} · ~${calls * UNITS_PER_RESOLVE} quota units`
  );

  // data/yt-map.json: sorted keys → stable diffs.
  const sorted = {};
  for (const key of Object.keys(map.entries).sort()) sorted[key] = map.entries[key];
  await writeJson(MAP_FILE, { version: 1, entries: sorted });

  const out = {};
  let withVideo = 0;
  let total = 0;
  for (const cc of COUNTRIES) {
    out[cc] = charts[cc].map((s) => {
      const videoId = map.entries[songKey(s.artist, s.title)]?.videoId ?? undefined;
      total++;
      if (videoId) withVideo++;
      return {
        id: s.id,
        title: s.title,
        artist: s.artist,
        ...(s.album ? { album: s.album } : {}),
        ...(s.artwork ? { artwork: s.artwork } : {}),
        ...(s.durationMs ? { durationMs: s.durationMs } : {}),
        ...(s.releaseDate ? { releaseDate: s.releaseDate } : {}),
        ...(s.genre ? { genre: s.genre } : {}),
        ...(videoId ? { videoId } : {}),
      };
    });
  }
  const unchanged = previous && JSON.stringify(previous.charts) === JSON.stringify(out);
  await writeJson(TRENDS_FILE, {
    generatedAt: unchanged && previous.generatedAt ? previous.generatedAt : new Date().toISOString(),
    charts: out,
  });
  console.log(`public/trends.json: ${total} entries, ${withVideo} with a video id${unchanged ? " (unchanged)" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
