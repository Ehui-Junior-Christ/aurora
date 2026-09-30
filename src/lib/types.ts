export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  css: string;
}

export interface Track {
  id: string;
  file?: File;
  streamUrl?: string;
  isOnline: boolean;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  durationText?: string;
  palette: PaletteColor[];
  seed: number;
  bpm?: number | null;
  /** When the track entered the library (ms epoch). */
  addedAt?: number;
  /** Duration in seconds when known (tags cache, analysis or playback). */
  durationSec?: number;
  /** ReplayGain values in dB read from tags. */
  replayGain?: ReplayGainInfo;
  /** Path relative to the library root (M3U export/import), when known. */
  relPath?: string;
}

export interface ReplayGainInfo {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
  albumPeak?: number;
}

export type ScanProgress = { done: number; total: number };
