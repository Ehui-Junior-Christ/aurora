export interface MatchTarget {
  title: string;
  artist: string;
  durationMs?: number;
}

export interface MatchCandidate {
  videoId: string;
  title: string;
  channel: string;
  durationSec?: number;
  blocked?: boolean;
}

export interface RegionRestriction {
  allowed?: string[];
  blocked?: string[];
}

export function normalizeText(value: unknown): string;
export function coreTitle(title: unknown): string;
export function primaryArtist(artist: unknown): string;
export function songKey(artist: unknown, title: unknown): string;
export function isoDurationSeconds(iso: unknown): number;
export function scoreCandidate(target: MatchTarget, candidate: MatchCandidate): number;
export const MIN_SCORE: number;
export function pickBest<C extends MatchCandidate>(
  target: MatchTarget,
  candidates: C[]
): { candidate: C; score: number } | null;
export function regionBlocked(restriction: RegionRestriction | undefined, country: string): boolean;
export function decodeEntities(value: unknown): string;
