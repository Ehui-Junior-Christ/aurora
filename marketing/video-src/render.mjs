// Renders index.html frame by frame (deterministic timeline) to JPEGs.
// Usage: node render.mjs <outDir> [fps=30] [only=comma list of seconds for stills]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const [, , OUT, FPS = "30", ONLY] = process.argv;
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: "msedge", args: ["--force-color-profile=srgb"] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(pathToFileURL(path.join(here, "index.html")).href);
await page.evaluate(() => window.ready);
const times = ONLY ? ONLY.split(",").map(Number) : Array.from({ length: Math.round(46 * Number(FPS)) }, (_, i) => i / Number(FPS));
const t0 = Date.now();
for (const [i, t] of times.entries()) {
  await page.evaluate((t) => window.renderAt(t), t);
  const name = ONLY ? `still-${t.toFixed(2)}.jpg` : `f${String(i).padStart(5, "0")}.jpg`;
  await page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 93 });
  if (!ONLY && i % 150 === 0) console.log(`${i}/${times.length} frames · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
await b.close();
