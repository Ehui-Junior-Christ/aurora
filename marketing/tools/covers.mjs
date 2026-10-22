import sharp from "sharp";
import { TRACKS } from "./data.mjs";
import { mkdirSync } from "node:fs";
const out = process.argv[2]; mkdirSync(out, { recursive: true });
let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
for (const [i, t] of TRACKS.entries()) {
  const [a, b, c] = t.colors;
  const blobs = Array.from({ length: 5 }, (_, k) => `<circle cx="${(rnd() * 600) | 0}" cy="${(rnd() * 600) | 0}" r="${150 + rnd() * 200}" fill="${[a, b, c][k % 3]}" opacity="${0.55 + rnd() * 0.4}"/>`).join("");
  const ring = i % 3 === 0 ? `<circle cx="300" cy="300" r="170" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2"/>` : i % 3 === 1 ? `<rect x="120" y="120" width="360" height="360" rx="180" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="2" transform="rotate(${(rnd() * 90) | 0} 300 300)"/>` : `<path d="M60 420 Q300 ${180 + rnd() * 120} 540 380" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="60"/></filter>
  <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/></filter></defs>
  <rect width="600" height="600" fill="#0a0a12"/><g filter="url(#b)">${blobs}</g>${ring}
  <rect width="600" height="600" filter="url(#n)"/>
  <text x="40" y="560" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="#fff" fill-opacity="0.92" letter-spacing="3">${t.artist.toUpperCase().replace(/&/g, "&amp;")}</text>
  <text x="40" y="80" font-family="Arial, sans-serif" font-size="20" fill="#fff" fill-opacity="0.7" letter-spacing="6">${t.album.toUpperCase()}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${out}/cover-${i + 1}.png`);
}
console.log("covers ok");
