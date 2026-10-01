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
  /**
   * Catalog (iTunes Search / Apple charts) metadata of an online track found
   * through the catalog. Its id is `cat:<itunesId>` and `streamUrl` stays
   * undefined until a YouTube video is resolved at play time (`yt:<id>`).
   */
  catalog?: CatalogInfo;
}

export interface CatalogInfo {
  itunesId: string;
  durationMs?: number;
  releaseDate?: string;
  genre?: string;
  previewUrl?: string;
}

export interface ReplayGainInfo {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
  albumPeak?: number;
}

export type ScanProgress = { done: number; total: number };
