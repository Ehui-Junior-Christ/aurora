import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { TRACKS, LYRICS } from "./data.mjs";
const [, , COVERS, OUT, ONLY] = process.argv;
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4177/";
const cover = (i) => `https://mock.aurora/covers/cover-${i + 1}.png`;
function hexInfo(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4; h *= 60; }
  return { hex, rgb: [r, g, b], hsl: [Math.round(h), Math.round(s * 100), Math.round(l * 100)], css: `rgb(${r}, ${g}, ${b})` };
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const tracks = TRACKS.map((t, i) => ({ id: `mock:${i + 1}`, isOnline: false, title: t.title, artist: t.artist, album: t.album,
  coverUrl: `/mock-covers/cover-${i + 1}.png`, durationText: fmt(t.dur), durationSec: t.dur, palette: t.colors.map(hexInfo), seed: i * 7 + 3, bpm: t.bpm, addedAt: Date.now() - i * 86400000 }));
const songs = TRACKS.map((t, i) => ({ id: String(900000 + i), title: t.title, artist: t.artist, album: t.album, artwork: cover(i), durationMs: t.dur * 1000, releaseDate: "2026-09-01", genre: t.genre, videoId: "dQw4w9WgXcQ" }));
const rot = (k) => songs.slice(k).concat(songs.slice(0, k));
const trends = { generatedAt: new Date().toISOString(), charts: { fr: songs, us: rot(4), gb: rot(8) } };
const itunes = { resultCount: 12, results: TRACKS.map((t, i) => ({ wrapperType: "track", kind: "song", trackId: 900000 + i, trackName: t.title, artistName: t.artist, collectionName: t.album, artworkUrl100: cover(i), trackTimeMillis: t.dur * 1000, releaseDate: "2026-09-01T00:00:00Z", primaryGenreName: t.genre, previewUrl: "https://mock.aurora/p.m4a" })) };
const cues = LYRICS.map((text, k) => ({ time: 10 + k * 4.2, text }));

async function setup(ctx) {
  await ctx.route("**/trends.json", (r) => r.fulfill({ json: trends }));
  await ctx.route("https://itunes.apple.com/**", (r) => r.fulfill({ json: itunes, headers: { "access-control-allow-origin": "*" } }));
  await ctx.route("https://mock.aurora/covers/**", (r) => r.fulfill({ body: readFileSync(`${COVERS}/${r.request().url().split("/").pop()}`), contentType: "image/png", headers: { "access-control-allow-origin": "*" } }));
  await ctx.route(/youtube|ytimg|googleapis|doubleclick|lrclib/, (r) => r.abort());
}
async function open(ctx) {
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { sessionStorage.setItem("aurora-intro-seen", "1"); } catch {} });
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: '[class*="CustomCursor"]{display:none!important}' });
  await p.waitForTimeout(2500);
  await p.getByText("Passer").first().click().catch(() => {});
  await p.waitForTimeout(1500);
  return p;
}
async function inject(p, { mode = "borealis", current = 0, t = 63, queueOpen = false } = {}) {
  await p.evaluate(({ tracks, cues, mode, current, t, queueOpen }) => {
    const { usePlayer, engine } = window.__aurora;
    for (const [k, v] of [["currentTime", t], ["duration", tracks[current].durationSec], ["paused", false]])
      Object.defineProperty(engine, k, { get: () => v, configurable: true });
    usePlayer.setState({ tracks, current, playing: true, duration: tracks[current].durationSec, visualMode: mode, autoMode: false,
      lyrics: cues, lyricsAvailable: true, showHome: false, queueOpen, bloom: true });
  }, { tracks, cues, mode, current, t, queueOpen });
  await p.waitForTimeout(2600);
  await p.mouse.move(10, 10);
}
const shot = async (p, name) => {
  // Keep the UI "awake" (no immersive fade) and drop any focus ring.
  await p.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 5, clientY: 5 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    (document.activeElement instanceof HTMLElement) && document.activeElement.blur();
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log("✓", name);
};

const b = await chromium.launch({ channel: "msedge", args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
// ---------- PC ----------
if (!ONLY || ONLY === "pc") {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await setup(ctx);
  let p = await open(ctx);
  await p.mouse.move(720, 450); await p.waitForTimeout(800);
  await shot(p, "pc-01-accueil");
  await p.keyboard.press("/"); await p.waitForTimeout(700); await p.keyboard.type("lu", { delay: 120 }); await p.waitForTimeout(2500);
  await shot(p, "pc-02-recherche");
  await p.keyboard.press("Escape"); await p.waitForTimeout(500);
  const modes = [["organism", 0], ["borealis", 0], ["prism", 7], ["liquid", 2], ["warp", 4], ["vinyl", 1], ["spectrum", 10], ["constellation", 8], ["mosaic", 5]];
  for (const [mode, cur] of modes) { await inject(p, { mode, current: cur }); await shot(p, `pc-03-scene-${mode}`); }
  await inject(p, { mode: "borealis", current: 0, queueOpen: true }); await shot(p, "pc-04-bibliotheque");
  await inject(p, { mode: "nebula", current: 0, t: 31 });
  await p.mouse.move(700, 820); await p.waitForTimeout(300);
  await p.locator('button[aria-label="Paroles"]:visible').first().click().catch((e) => console.log("lyrics btn", e.message.split("\n")[0]));
  await p.waitForTimeout(1800); await p.mouse.move(10, 10); await p.waitForTimeout(300);
  await shot(p, "pc-05-paroles");
  await ctx.close();
}
// ---------- Mobile ----------
if (!ONLY || ONLY === "m") {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await setup(ctx);
  let p = await open(ctx);
  await shot(p, "mobile-01-accueil");
  await p.evaluate(() => window.scrollTo(0, 99999)); await p.waitForTimeout(1500);
  await shot(p, "mobile-02-tendances");
  await p.evaluate(() => window.scrollTo(0, 0));
  await inject(p, { mode: "borealis", current: 0 }); await shot(p, "mobile-03-lecteur");
  await inject(p, { mode: "prism", current: 7 }); await shot(p, "mobile-04-scene-prism");
  await inject(p, { mode: "liquid", current: 2 });
  await p.evaluate(() => window.dispatchEvent(new Event("aurora:open-now-playing"))); await p.waitForTimeout(1800);
  await shot(p, "mobile-05-en-lecture");
  await p.keyboard.press("Escape"); await p.waitForTimeout(900);
  await inject(p, { mode: "warp", current: 0, queueOpen: true }); await shot(p, "mobile-06-bibliotheque");
  await inject(p, { mode: "nebula", current: 0, t: 31 });
  await p.locator('button[aria-label="Paroles"]:visible').first().click().catch(async () => {
    await p.evaluate(() => window.dispatchEvent(new Event("aurora:open-now-playing"))); await p.waitForTimeout(1200);
    await p.locator('button[aria-label="Paroles"]:visible').first().click().catch((e) => console.log("m lyrics", e.message.split("\n")[0]));
  });
  await p.waitForTimeout(1800);
  await shot(p, "mobile-07-paroles");
  await ctx.close();
}
await b.close();
