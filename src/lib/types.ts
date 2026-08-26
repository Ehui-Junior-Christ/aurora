export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  css: string;
}

export interface Track {
  id: string;
  file: File;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  palette: PaletteColor[];
  seed: number;
  bpm?: number | null;
}

export type ScanProgress = { done: number; total: number };
