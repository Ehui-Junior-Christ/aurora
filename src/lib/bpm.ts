import { getCachedAnalysis } from "./analysis";

/**
 * Tempo of a local track, from the shared track analysis (one decode per
 * track: peaks, silence, loudness and the Aurora Mix beat grid). Rounded
 * for display / smart playlists; the exact value lives in `analysis.mix`.
 */
export async function detectBpm(id: string, file: File): Promise<number | null> {
  try {
    const analysis = await getCachedAnalysis(id, file);
    const bpm = analysis?.mix?.bpm;
    return bpm && bpm > 0 ? Math.round(bpm) : null;
  } catch {
    return null;
  }
}
