import type { PaletteColor } from "./types";

export type RgbPixel = [number, number, number];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function toPalette(rgb: RgbPixel): PaletteColor {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const hex = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  return {
    hex,
    rgb,
    hsl: [h, s, l],
    css: `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`,
  };
}

function quantize(pixels: RgbPixel[], depth: number): RgbPixel[][] {
  if (depth <= 0 || pixels.length <= 4) return [pixels];
  let channel = 0;
  let widest = -1;
  for (let c = 0; c < 3; c++) {
    let lo = 255;
    let hi = 0;
    for (const p of pixels) {
      if (p[c] < lo) lo = p[c];
      if (p[c] > hi) hi = p[c];
    }
    const span = hi - lo;
    if (span > widest) {
      widest = span;
      channel = c;
    }
  }
  const sorted = [...pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = sorted.length >> 1;
  return [
    ...quantize(sorted.slice(0, mid), depth - 1),
    ...quantize(sorted.slice(mid), depth - 1),
  ];
}

export function paletteFromPixels(
  pixels: RgbPixel[],
  count = 5
): PaletteColor[] {
  const buckets = quantize(pixels, 4).filter(
    (bucket) => bucket.length >= pixels.length / 512
  );
  return buckets
    .map((bucket) => {
      const sum = bucket.reduce<[number, number, number]>(
        (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
        [0, 0, 0]
      );
      const avg: RgbPixel = [
        Math.round(sum[0] / bucket.length),
        Math.round(sum[1] / bucket.length),
        Math.round(sum[2] / bucket.length),
      ];
      const [, s, l] = rgbToHsl(avg[0], avg[1], avg[2]);
      return {
        avg,
        weight:
          bucket.length * (0.2 + s / 100) * (1 - Math.abs(l - 52) / 100),
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((entry) => toPalette(entry.avg));
}

export function extractPalette(src: string, count = 5): Promise<PaletteColor[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 72;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          reject(new Error("canvas-unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const pixels: RgbPixel[] = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 125) continue;
          pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
        if (pixels.length === 0) {
          reject(new Error("no-pixels"));
          return;
        }
        const buckets = quantize(pixels, 4).filter(
          (bucket) => bucket.length >= pixels.length / 512
        );
        const ranked = buckets
          .map((bucket) => {
            const sum = bucket.reduce<[number, number, number]>(
              (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
              [0, 0, 0]
            );
            const avg: RgbPixel = [
              Math.round(sum[0] / bucket.length),
              Math.round(sum[1] / bucket.length),
              Math.round(sum[2] / bucket.length),
            ];
            const [, s, l] = rgbToHsl(avg[0], avg[1], avg[2]);
            return {
              avg,
              weight:
                bucket.length * (0.2 + s / 100) * (1 - Math.abs(l - 52) / 100),
            };
          })
          .sort((a, b) => b.weight - a.weight)
          .slice(0, count)
          .map((entry) => toPalette(entry.avg));
        if (ranked.length === 0) {
          reject(new Error("no-colors"));
          return;
        }
        resolve(ranked);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("palette-failed"));
      }
    };
    img.onerror = () => reject(new Error("cover-load-failed"));
    img.src = src;
  });
}

const FALLBACK_SEEDS: [string, string, string][] = [
  ["#6d4dff", "#22e4ff", "#ff4ecd"],
  ["#ff5e3a", "#ffd166", "#12d8fa"],
  ["#00c96f", "#a3ff12", "#00b3ff"],
  ["#ff2e63", "#ff9f1c", "#7b61ff"],
  ["#00e0a4", "#4d7cff", "#e94fff"],
  ["#ffb800", "#ff4e00", "#00c2ff"],
];

function hexToRgb(hex: string): RgbPixel {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const FALLBACK_PALETTES: PaletteColor[][] = FALLBACK_SEEDS.map((trio) =>
  trio.map((hex) => toPalette(hexToRgb(hex)))
);
