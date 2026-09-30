import { create } from "zustand";
import { engine } from "@/lib/audio-engine";
import {
  pickMusicDirectory,
  scanMusicFolder,
  supportsFileSystemAccess,
  baseName,
  isNativeAndroid,
  AudioScanner,
  relativePathOf,
  type FsNode,
} from "@/lib/fs-scanner";
import { Capacitor } from "@capacitor/core";
import { buildTracks, patchCachedTags } from "@/lib/library-cache";
import { detectBpm } from "@/lib/bpm";
import { getCachedAnalysis, normalizationGain } from "@/lib/analysis";
import { parseLrc, type LyricsCue } from "@/lib/lyrics";
import { fetchRemoteLyrics } from "@/lib/lyrics-fetcher";
import {
  onlineResultToTrack,
  searchOnlineMusic,
  toVideoId,
  type OnlineMusicResult,
} from "@/lib/invidious";
import { fnv1a } from "@/lib/hash";
import { replayGainMultiplier } from "@/lib/replaygain";
import { idbGet, idbSet, idbDelete, idbGetAll } from "@/lib/db";
import {
  installMediaSessionHandlers,
  setMediaMetadata,
  setMediaPlaybackState,
  updateMediaPosition,
} from "@/lib/media-session";
import type { PaletteColor, ScanProgress, Track } from "@/lib/types";
import {
  createBackup,
  matchTrackIds,
  parseBackup,
  restoreTrackMeta,
  serializableTrack,
} from "@/lib/backup";
import { exportM3u, matchM3u, parseM3u } from "@/lib/m3u";
import {
  BUILTIN_SMART_PLAYLISTS,
  resolveSmartPlaylist,
  sanitizeSmartPlaylists,
  type SmartPlaylist,
  type SmartRule,
} from "@/lib/smart-playlists";
import {
  fromStoredQueue,
  makeQueueItem,
  moveItem,
  shuffled,
  toStoredQueue,
  type QueueItem,
} from "@/lib/queue";
import {
  emptyStats,
  mergeStats,
  migrateStats,
  remapStatsIds,
  recordListen,
  recordPlay,
  type ListeningStats,
} from "@/lib/stats";

let wired = false;
let searchSeq = 0; // ignores out-of-order online search responses
let ytErrorStreak = 0; // consecutive YouTube failures (avoid infinite skip loops)
let playbackErrorTimer: ReturnType<typeof setTimeout> | null = null;

function ytErrorMessage(code: number): string {
  switch (code) {
    case -1:
      return "Lecteur YouTube injoignable (connexion ou bloqueur de contenu).";
    case 2:
      return "Identifiant de vidéo invalide.";
    case 5:
      return "Cette vidéo ne peut pas être lue dans le navigateur.";
    case 100:
      return "Vidéo introuvable ou supprimée.";
    case 101:
    case 150:
      return "L'auteur interdit la lecture de cette vidéo hors de YouTube.";
    case 153:
      return "Lecture YouTube refusée (en-tête Referer manquant).";
    default:
      return `Lecture en ligne impossible (code ${code}).`;
  }
}

const NATIVE_PALETTE: PaletteColor[] = [
  { hex: "#111111", rgb: [17, 17, 17], hsl: [0, 0, 0.07], css: "rgb(17,17,17)" },
  { hex: "#555555", rgb: [85, 85, 85], hsl: [0, 0, 0.33], css: "rgb(85,85,85)" },
  { hex: "#888888", rgb: [136, 136, 136], hsl: [0, 0, 0.53], css: "rgb(136,136,136)" },
];

function nativeToTracks(
  list: Array<{ id: string; title: string; artist: string; album: string; duration: number; path: string }>
): Track[] {
  return list.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    // play() reads `streamUrl`; the previous `url` field was never used, so
    // native Android tracks could not be played at all.
    streamUrl: Capacitor.convertFileSrc(t.path),
    isOnline: false,
    durationText:
      t.duration > 0
        ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, "0")}`
        : undefined,
    palette: NATIVE_PALETTE,
    // Must be an integer: it indexes MODE_KEYS / palettes (Math.random()
    // produced an `undefined` visual mode).
    seed: fnv1a(`${t.id}|${t.path}`),
  }));
}
let pendingHandles: FsNode[] = [];
let lyricsFiles = new Map<string, File>();
/** Recently played track ids (for prev() in shuffle / queue playback). */
const playHistory: string[] = [];
/** Upcoming library ids in shuffle mode (each track once per cycle). */
let shuffleBag: string[] = [];
/** True when the current track was taken from the queue. */
let currentFromQueue = false;
let lastActionTime = 0; // Pour l'anti-spam (idempotence)

export type RepeatMode = "off" | "all" | "one";
/** "time": stop at `sleepAt`; "track": stop at the end of the current track. */
export type SleepMode = "off" | "time" | "track";
/** Volume fade duration before the sleep timer stops playback. */
export const SLEEP_FADE_MS = 30000;
export type VisualMode =
  | "organism"
  | "tunnel"
  | "metaballs"
  | "particles"
  | "galaxy"
  | "nebula"
  | "waves";

export const MODE_KEYS: VisualMode[] = [
  "organism",
  "tunnel",
  "metaballs",
  "particles",
  "galaxy",
  "nebula",
  "waves",
];

interface EqSettings {
  low: number;
  mid: number;
  high: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  /** Metadata snapshots of online entries (resolvable without the library). */
  online?: Track[];
}

export interface BackupImportReport {
  playlists: number;
  tracksMatched: number;
  tracksTotal: number;
  metaEntries: number;
}

/** Preferences included in backups (the YouTube API key never is). */
const BACKUP_PREF_KEYS = [
  "volume",
  "repeat",
  "shuffle",
  "autoMode",
  "eq",
  "visualMode",
  "bloom",
  "crossfade",
  "speed",
  "skipSilence",
  "normalize",
] as const;

export type { ListeningStats };

export type { QueueItem, SmartPlaylist, SmartRule };

export interface PlayOptions {
  autoplay?: boolean;
  startAt?: number;
  countPlay?: boolean;
}

export interface AbLoop {
  a: number | null;
  b: number | null;
}

export interface VisualPreset {
  freq: number;
  speed: number;
  amp: number;
}

const DEFAULT_PRESET: VisualPreset = { freq: 1, speed: 1, amp: 1 };

// SECURITY: never hardcode the key; it comes from the build env only
// (NEXT_PUBLIC_YOUTUBE_API_KEY) or from a key the user enters in settings.
const DEFAULT_YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY ?? "";

interface PlayerState {
  tracks: Track[];
  sources: string[];
  current: number;
  playing: boolean;
  duration: number;
  volume: number;
  /** Mute keeps `volume` intact so unmuting restores it. */
  muted: boolean;
  /** A-B repeat points in seconds (both set = active loop). */
  abLoop: AbLoop;
  queueOpen: boolean;
  supported: boolean;
  scanning: boolean;
  progress: ScanProgress;
  error: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
  autoMode: boolean;
  eq: EqSettings;
  visualMode: VisualMode;
  bloom: boolean;
  qualityLow: boolean;
  updateReady: boolean;
  needsPermission: boolean;
  pendingDirName: string;
  helpOpen: boolean;
  playlists: Playlist[];
  stats: ListeningStats;
  crossfade: number;
  speed: number;
  skipSilence: boolean;
  normalize: boolean;
  sleepAt: number | null;
  sleepMode: SleepMode;
  ambient: boolean;
  lyrics: LyricsCue[];
  lyricsAvailable: boolean;
  lyricsOffset: number;
  visualPreset: VisualPreset;
  onlineQuery: string;
  onlineResults: OnlineMusicResult[];
  onlineSearching: boolean;
  onlineError: string | null;
  playbackError: string | null;
  youtubeApiKey: string;
  showHome: boolean;
  history: Track[];
  savedOnlineTracks: Track[];
  /** Upcoming tracks, consulted by next() before the library order. */
  queue: QueueItem[];
  /** User-defined smart playlists (built-ins: BUILTIN_SMART_PLAYLISTS). */
  smartPlaylists: SmartPlaylist[];
  createSmartPlaylist(
    name: string,
    rules: SmartRule[],
    options?: { match?: "all" | "any"; limit?: number }
  ): SmartPlaylist | null;
  updateSmartPlaylist(id: string, patch: Partial<Omit<SmartPlaylist, "id" | "builtin">>): void;
  deleteSmartPlaylist(id: string): void;
  /** Resolves a smart playlist (built-in or user) against the live library. */
  resolveSmart(id: string): Track[];
  playSmartPlaylist(id: string, options?: { shuffle?: boolean }): void;
  /** Plays a regular playlist through the queue. */
  playPlaylist(id: string, options?: { shuffle?: boolean }): void;
  /** Whole library in random order (PWA "shuffle" shortcut). */
  playShuffledLibrary(): void;
  /** Full JSON backup (playlists, favourites, stats, prefs, per-track data). */
  exportBackup(): Promise<string>;
  /**
   * Restores a backup. "merge" (default) unions playlists/favourites and adds
   * stats; "replace" overwrites stats and preferences.
   */
  importBackup(text: string, mode?: "merge" | "replace"): Promise<BackupImportReport>;
  /** Extended M3U8 text of a playlist (null if unknown). */
  exportPlaylistM3u(playlistId: string): string | null;
  /** Creates a playlist from M3U/M3U8 text; returns match counts. */
  importM3u(text: string, name?: string): Promise<{ playlistId: string; matched: number; total: number }>;
  /** Insert at the head of the queue (plays right after the current one). */
  playNext(track: Track | Track[]): void;
  /** Append to the end of the queue. */
  addToQueue(track: Track | Track[]): void;
  removeFromQueue(qid: string): void;
  /** Reorders the queue only (the library order is never touched). */
  reorderQueue(from: number, to: number): void;
  clearQueue(): void;
  /** Plays queue item `qid` now, dropping the items before it. */
  playFromQueue(qid: string): void;
  /**
   * Plays `list[start]` and replaces the queue with the rest of the list
   * (playlist / smart playlist / album playback). `shuffle` shuffles the rest.
   */
  playCollection(list: Track[], start?: number, options?: { shuffle?: boolean }): void;
  addToHistory(track: Track): void;
  saveOnlineTrack(track: Track): void;
  removeOnlineTrack(trackId: string): void;
  setYoutubeApiKey(key: string): void;
  setPlaybackError(message: string | null): void;
  searchOnline(query: string): Promise<void>;
  playOnlineResult(result: OnlineMusicResult): Promise<void>;
  removeSource(source: string): void;
  setSupported(value: boolean): void;
  restore(): Promise<void>;
  reconnect(): Promise<void>;
  openFolder(): Promise<void>;
  loadAllSources(dirs: FsNode[]): Promise<void>;
  /**
   * Plays the library track at `index`. `options.autoplay: false` prepares it
   * paused (used by session resume); `countPlay: false` skips play counting.
   */
  play(index: number, options?: PlayOptions): void;
  toggle(): void;
  next(auto?: boolean): void;
  prev(): void;
  seek(time: number): void;
  /** Relative seek in seconds (clamped to the track bounds). */
  seekBy(delta: number): void;
  setVolume(value: number): void;
  toggleMute(): void;
  /** Cycles A-B repeat: set A → set B → clear. */
  cycleAbLoop(): void;
  clearAbLoop(): void;
  setQueueOpen(value: boolean): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  setAutoMode(value: boolean): void;
  setEq(eq: EqSettings): void;
  setVisualMode(mode: VisualMode): void;
  toggleBloom(): void;
  setQualityLow(value: boolean): void;
  setUpdateReady(value: boolean): void;
  setHelpOpen(value: boolean): void;
  setShowHome(value: boolean): void;
  setLyricsOffset(offset: number): void;
  reorder(from: number, to: number): void;
  refreshApp(): void;
  createPlaylist(name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addToPlaylist(playlistId: string, trackId: string): Promise<void>;
  removeFromPlaylist(playlistId: string, trackId: string): Promise<void>;
  resetStats(): void;
  setCrossfade(seconds: number): void;
  setSpeed(value: number): void;
  setSkipSilence(value: boolean): void;
  setNormalize(value: boolean): void;
  /** Stop after `minutes` (any custom value); 0 or less cancels. */
  setSleep(minutes: number): void;
  /** Stop when the current track ends (with a fade over its last 30 s). */
  setSleepEndOfTrack(): void;
  cancelSleep(): void;
  setAmbient(value: boolean): void;
  setVisualPreset(preset: VisualPreset): void;
  resetVisualPreset(): void;
}

function savePref(key: string, value: unknown): void {
  void idbSet("prefs", key, value);
}

function applyPalette(palette: PaletteColor[]): void {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  for (let i = 0; i < 3; i++) {
    const color = palette[i] ?? palette[palette.length - 1];
    if (color) style.setProperty(`--c${i + 1}`, color.css);
  }
}

function syncMediaSession(track: Track | null): void {
  installMediaSessionHandlers(() => {
    const state = usePlayer.getState();
    return {
      play: () => {
        if (engine.paused) state.toggle();
      },
      pause: () => {
        if (!engine.paused) state.toggle();
      },
      previous: () => state.prev(),
      next: () => state.next(),
      seekTo: (time) => state.seek(time),
      seekBy: (delta) => state.seekBy(delta),
      stop: () => engine.pause(),
    };
  });
  setMediaMetadata(track);
  if (track) setMediaPlaybackState(!engine.paused);
}

function pushMediaPosition(force = false): void {
  const state = usePlayer.getState();
  if (state.current < 0) return;
  updateMediaPosition(
    engine.currentTime,
    engine.duration,
    state.speed,
    engine.paused,
    force
  );
}

let lastCrossfadeId: string | null = null;

/** Silence bounds of the current local track (from analyzeTrack). */
let silence: {
  id: string;
  start: number;
  end: number;
  endFired: boolean;
} | null = null;

function loadSilenceBounds(track: Track): void {
  silence = null;
  if (!track.file || track.isOnline) return;
  void getCachedAnalysis(track.id, track.file).then((analysis) => {
    const state = usePlayer.getState();
    if (!analysis || state.tracks[state.current]?.id !== track.id) return;
    if (analysis.start === undefined || analysis.end === undefined) return;
    silence = {
      id: track.id,
      start: analysis.start,
      end: analysis.end,
      endFired: false,
    };
    if (state.skipSilence && analysis.start > 0.5 && engine.currentTime < analysis.start - 0.3) {
      engine.seek(analysis.start);
    }
  });
}

/** Effective end of the current track (trailing silence trimmed if enabled). */
function effectiveEnd(trackId: string, duration: number): number {
  const state = usePlayer.getState();
  if (
    state.skipSilence &&
    silence &&
    silence.id === trackId &&
    silence.end < duration - 1
  ) {
    return silence.end;
  }
  return duration;
}

// ---- Session resume -------------------------------------------------------

interface SavedPosition {
  id: string;
  t: number;
}

let lastSavedPosition: SavedPosition | null = null;
let lastPositionSaveAt = 0;
const POSITION_SAVE_MS = 5000;

/** Persists the current track + position (throttled unless forced). */
function savePlaybackPosition(force = false): void {
  const state = usePlayer.getState();
  const track = state.tracks[state.current];
  if (!track) return;
  const now = Date.now();
  if (!force && now - lastPositionSaveAt < POSITION_SAVE_MS) return;
  const t = Math.floor(engine.currentTime * 10) / 10;
  if (!Number.isFinite(t)) return;
  if (
    lastSavedPosition &&
    lastSavedPosition.id === track.id &&
    Math.abs(lastSavedPosition.t - t) < 1
  ) {
    return;
  }
  lastPositionSaveAt = now;
  lastSavedPosition = { id: track.id, t };
  savePref("lastPosition", lastSavedPosition);
}

let resumeListenersInstalled = false;
function installResumeListeners(): void {
  if (resumeListenersInstalled || typeof window === "undefined") return;
  resumeListenersInstalled = true;
  const flush = () => {
    savePlaybackPosition(true);
    flushListening(true);
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/**
 * Re-selects the last played track (paused, at the saved position). Online
 * tracks are looked up in history/favourites (metadata only, never audio).
 */
async function resumeLastSession(): Promise<void> {
  const [lastId, position, storedQueue] = await Promise.all([
    idbGet<string>("prefs", "lastTrackId"),
    idbGet<SavedPosition>("prefs", "lastPosition"),
    idbGet<unknown>("prefs", "queue"),
  ]);
  if (usePlayer.getState().queue.length === 0 && storedQueue) {
    usePlayer.setState({
      queue: fromStoredQueue(storedQueue, usePlayer.getState().tracks),
    });
  }
  if (!lastId) return;
  const state = usePlayer.getState();
  if (state.current >= 0) return; // the user already picked something
  let index = state.tracks.findIndex((t) => t.id === lastId);
  if (index < 0 && lastId.startsWith("yt:")) {
    const online =
      state.history.find((t) => t.id === lastId) ??
      state.savedOnlineTracks.find((t) => t.id === lastId);
    if (!online) return;
    const tracks = [...state.tracks, online];
    usePlayer.setState({ tracks });
    index = tracks.length - 1;
  }
  if (index < 0) return;
  const startAt =
    position && position.id === lastId && position.t > 2 ? position.t : 0;
  usePlayer
    .getState()
    .play(index, { autoplay: false, startAt, countPlay: false });
}

// ---- Library cache helpers ---------------------------------------------------

/** Stores the real duration of the current local track (sort by duration). */
function rememberDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const state = usePlayer.getState();
  const track = state.tracks[state.current];
  if (!track || track.isOnline) return;
  const rounded = Math.round(duration * 10) / 10;
  if (track.durationSec === rounded) return;
  const tracks = [...state.tracks];
  tracks[state.current] = { ...track, durationSec: rounded };
  usePlayer.setState({ tracks });
  if (track.file) void patchCachedTags(track.id, { durationSec: rounded });
}

// ---- Queue ------------------------------------------------------------------

/** Playlist entries as Track objects (library first, then online snapshots). */
export function resolvePlaylistTracks(playlist: Playlist): Track[] {
  const { tracks, savedOnlineTracks, history } = usePlayer.getState();
  const byId = new Map<string, Track>();
  for (const t of [...(playlist.online ?? []), ...history, ...savedOnlineTracks, ...tracks]) {
    byId.set(t.id, t);
  }
  return playlist.trackIds
    .map((trackId) => byId.get(trackId))
    .filter((t): t is Track => !!t);
}

function setQueue(queue: QueueItem[]): void {
  usePlayer.setState({ queue });
  savePref("queue", toStoredQueue(queue));
}

/**
 * Index of `track` in the library, inserting it after the current track when
 * absent (online / removed tracks), as playOnlineResult always did.
 */
function ensureTrackIndex(track: Track): number {
  const { tracks, current } = usePlayer.getState();
  const existing = tracks.findIndex((t) => t.id === track.id);
  if (existing >= 0) return existing;
  const insertAt = current >= 0 ? current + 1 : tracks.length;
  const next = [...tracks];
  next.splice(insertAt, 0, track);
  usePlayer.setState({ tracks: next });
  return insertAt;
}

function playTrackObject(track: Track, fromQueue: boolean): void {
  const index = ensureTrackIndex(track);
  usePlayer.getState().play(index);
  currentFromQueue = fromQueue;
}

type NextPlan =
  | { kind: "queue"; item: QueueItem }
  | { kind: "library"; index: number; fromBag: boolean }
  | { kind: "stop" };

/**
 * Decides what next() would play, without side effects (the shuffle bag is
 * only refilled), so gapless preloading and next() always agree.
 */
function planNext(auto: boolean): NextPlan {
  const { queue, tracks, current, shuffle, repeat } = usePlayer.getState();
  if (queue.length > 0) return { kind: "queue", item: queue[0] };
  if (tracks.length === 0) return { kind: "stop" };
  const currentId = tracks[current]?.id;
  if (shuffle && tracks.length > 1) {
    const ids = new Set(tracks.map((t) => t.id));
    shuffleBag = shuffleBag.filter((id) => ids.has(id) && id !== currentId);
    if (shuffleBag.length === 0) {
      shuffleBag = shuffled(
        tracks.map((t) => t.id).filter((id) => id !== currentId)
      );
    }
    const index = tracks.findIndex((t) => t.id === shuffleBag[0]);
    if (index >= 0) return { kind: "library", index, fromBag: true };
  }
  if (auto && repeat === "off" && current >= tracks.length - 1) {
    return { kind: "stop" };
  }
  return { kind: "library", index: (current + 1) % tracks.length, fromBag: false };
}

function commitNext(plan: NextPlan): void {
  if (plan.kind === "queue") {
    setQueue(usePlayer.getState().queue.slice(1));
    playTrackObject(plan.item.track, true);
  } else if (plan.kind === "library") {
    if (plan.fromBag) shuffleBag.shift();
    usePlayer.getState().play(plan.index);
    currentFromQueue = false;
  }
}

// ---- Listening time accounting --------------------------------------------

let pendingListen: { track: Track; seconds: number } | null = null;
let lastListenTick = 0;
let lastListenFlush = 0;
const LISTEN_FLUSH_MS = 15000;

/** Counts real listened time (wall clock while playing), not positions. */
function accumulateListening(track: Track | undefined, playing: boolean): void {
  const now = Date.now();
  const delta = lastListenTick ? Math.min(1000, now - lastListenTick) : 0;
  lastListenTick = now;
  if (!playing || !track || delta <= 0) return;
  if (pendingListen && pendingListen.track.id !== track.id) flushListening(true);
  if (!pendingListen) pendingListen = { track, seconds: 0 };
  pendingListen.seconds += delta / 1000;
  if (now - lastListenFlush > LISTEN_FLUSH_MS) flushListening(true);
}

function flushListening(force = false): void {
  if (!pendingListen || pendingListen.seconds <= 0) return;
  if (!force && Date.now() - lastListenFlush < LISTEN_FLUSH_MS) return;
  lastListenFlush = Date.now();
  const { track, seconds } = pendingListen;
  pendingListen = null;
  const stats = recordListen(usePlayer.getState().stats, track, seconds);
  usePlayer.setState({ stats });
  savePref("stats", stats);
}

let sleepFading = false;

function restoreSleepVolume(): void {
  if (!sleepFading) return;
  sleepFading = false;
  const state = usePlayer.getState();
  engine.volume = state.muted ? 0 : state.volume;
}

function applySleepFade(remainingMs: number): void {
  const state = usePlayer.getState();
  if (remainingMs >= SLEEP_FADE_MS) {
    restoreSleepVolume();
    return;
  }
  sleepFading = true;
  const factor = Math.max(0, Math.min(1, remainingMs / SLEEP_FADE_MS));
  // Equal-power curve sounds more natural than a linear ramp.
  engine.volume = state.muted ? 0 : state.volume * Math.sin((factor * Math.PI) / 2);
}

/** Pauses playback for the sleep timer and resets it. */
function sleepStop(): void {
  engine.pause();
  usePlayer.setState({ playing: false, sleepAt: null, sleepMode: "off" });
  restoreSleepVolume();
}

/** Seconds left before the sleep timer stops playback (null when off). */
export function sleepRemainingSeconds(state: {
  sleepMode: SleepMode;
  sleepAt: number | null;
  current: number;
}): number | null {
  if (state.sleepMode === "time" && state.sleepAt !== null) {
    return Math.max(0, (state.sleepAt - Date.now()) / 1000);
  }
  if (state.sleepMode === "track" && state.current >= 0) {
    const dur = engine.duration;
    if (!Number.isFinite(dur) || dur <= 0) return null;
    return Math.max(0, dur - engine.currentTime);
  }
  return null;
}

function sleepTick(): boolean {
  const state = usePlayer.getState();
  if (state.sleepMode === "time" && state.sleepAt !== null) {
    const remaining = state.sleepAt - Date.now();
    if (remaining <= 0) {
      sleepStop();
      return true;
    }
    if (state.playing) applySleepFade(remaining);
  } else if (state.sleepMode === "track" && state.playing) {
    const track = state.tracks[state.current];
    const dur = engine.duration;
    if (track && Number.isFinite(dur) && dur > 0) {
      let end = engine.ytActive ? dur : effectiveEnd(track.id, dur);
      if (!engine.ytActive && state.crossfade > 0) end -= state.crossfade;
      applySleepFade((end - engine.currentTime) * 1000);
    }
  }
  return false;
}

const GAPLESS_PRELOAD_S = 12;
let lastPreloadCheck = 0;

/** Preloads what next(true) will play, when it is a local track. */
function preloadUpcoming(): void {
  const now = Date.now();
  if (now - lastPreloadCheck < 1000) return;
  lastPreloadCheck = now;
  const state = usePlayer.getState();
  if (state.repeat === "one" || state.sleepMode === "track") return;
  const plan = planNext(true);
  const track =
    plan.kind === "queue"
      ? plan.item.track
      : plan.kind === "library"
        ? state.tracks[plan.index]
        : undefined;
  if (!track || track.isOnline || track.id === state.tracks[state.current]?.id) return;
  if (engine.hasPreloaded(track.id)) return;
  if (track.file) engine.preload(track.id, track.file);
  else if (track.streamUrl && !track.streamUrl.startsWith("yt:")) {
    engine.preload(track.id, { url: track.streamUrl });
  }
}

function playbackTick(): void {
  const get = usePlayer.getState;
  if (sleepTick()) return;
  const state = get();
  accumulateListening(state.tracks[state.current], state.playing);
  if (state.playing) {
    pushMediaPosition();
    savePlaybackPosition();
  }
  const { a, b } = state.abLoop;
  if (a !== null && b !== null && engine.currentTime >= b) {
    engine.seek(a);
  }
  if (!state.playing || state.current < 0) return;
  if (engine.ytActive) return; // crossfade / silence: local tracks only
  const track = state.tracks[state.current];
  if (!track) return;
  const dur = engine.duration;
  const time = engine.currentTime;
  if (!Number.isFinite(dur) || dur <= 0) return;

  if (state.skipSilence && silence && silence.id === track.id) {
    if (silence.start > 0.5 && time < silence.start - 0.3 && (a === null || b === null)) {
      engine.seek(silence.start);
      return;
    }
    if (time < silence.end - 2) silence.endFired = false;
  }

  const end = effectiveEnd(track.id, dur);
  if (state.crossfade <= 0 && end - time < GAPLESS_PRELOAD_S) preloadUpcoming();
  if (state.crossfade > 0) {
    if (track.id === lastCrossfadeId) return;
    if (end > state.crossfade + 2 && end - time <= state.crossfade) {
      lastCrossfadeId = track.id;
      get().next(true);
    }
    return;
  }
  if (end < dur && time >= end && silence && !silence.endFired) {
    silence.endFired = true;
    get().next(true);
  }
}

/** Engine event listeners + the 100 ms playback ticker (installed once). */
function wireEngine(): void {
  const set = usePlayer.setState;
  const get = usePlayer.getState;
  if (wired || typeof window === "undefined") return;
  wired = true;
  installResumeListeners();
  {
    for (const el of engine.getElements()) {
      el.addEventListener("play", (event) => {
        if (event.target !== engine.el) return;
        set({ playing: true });
        setMediaPlaybackState(true);
        pushMediaPosition(true);
      });
      el.addEventListener("pause", (event) => {
        if (event.target !== engine.el) return;
        set({ playing: false });
        savePlaybackPosition(true);
        setMediaPlaybackState(false);
        pushMediaPosition(true);
      });
      el.addEventListener("ended", (event) => {
        if (event.target !== engine.el) return;
        get().next(true);
      });
      el.addEventListener("loadedmetadata", (event) => {
        if (event.target !== engine.el) return;
        set({
          duration: Number.isFinite(el.duration) ? el.duration : 0,
        });
        pushMediaPosition(true);
        rememberDuration(el.duration);
      });
      el.addEventListener("ratechange", (event) => {
        if (event.target !== engine.el) return;
        pushMediaPosition(true);
      });
    }
    
    setInterval(playbackTick, 100);

    engine.onYtStateChange = (state) => {
      // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
      if (state === 1) {
        ytErrorStreak = 0;
        set({ playing: true, duration: engine.duration });
        setMediaPlaybackState(true);
        pushMediaPosition(true);
      } else if (state === 2) {
        set({ playing: false });
        savePlaybackPosition(true);
        setMediaPlaybackState(false);
        pushMediaPosition(true);
      } else if (state === 0) {
        set({ playing: false });
        setMediaPlaybackState(false);
        get().next(true);
      }
    };
    engine.onYtError = (error) => {
      console.warn("YouTube Error:", error);
      ytErrorStreak++;
      set({ playing: false });
      get().setPlaybackError(ytErrorMessage(error));
      // Skip to the next track (deleted/blocked video) but stop after a few
      // consecutive failures instead of looping forever over the queue.
      if (error !== -1 && ytErrorStreak < 3 && get().tracks.length > 1) {
        get().next(true);
      }
    };
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  tracks: [],
  sources: [],
  current: -1,
  playing: false,
  duration: 0,
  volume: 0.85,
  muted: false,
  abLoop: { a: null, b: null },
  queueOpen: true,
  supported: false,
  scanning: false,
  progress: { done: 0, total: 0 },
  error: null,
  shuffle: false,
  repeat: "off",
  autoMode: true,
  eq: { low: 0, mid: 0, high: 0 },
  visualMode: "organism",
  bloom: true,
  qualityLow: false,
  updateReady: false,
  needsPermission: false,
  pendingDirName: "",
  helpOpen: false,
  playlists: [],
  stats: emptyStats(),
  crossfade: 0,
  speed: 1,
  skipSilence: false,
  normalize: false,
  sleepAt: null,
  sleepMode: "off",
  ambient: false,
  lyrics: [],
  lyricsAvailable: false,
  lyricsOffset: 0,
  visualPreset: DEFAULT_PRESET,
  onlineQuery: "",
  onlineResults: [],
  onlineSearching: false,
  onlineError: null,
  playbackError: null,
  youtubeApiKey: DEFAULT_YOUTUBE_API_KEY,
  showHome: false,
  history: [],
  savedOnlineTracks: [],
  queue: [],
  smartPlaylists: [],

  createSmartPlaylist(name, rules, options = {}) {
    const trimmed = name.trim();
    if (!trimmed || rules.length === 0) return null;
    const playlist: SmartPlaylist = {
      id: `smart:${Date.now().toString(36)}`,
      name: trimmed,
      rules,
      ...(options.match ? { match: options.match } : {}),
      ...(options.limit ? { limit: options.limit } : {}),
    };
    const smartPlaylists = [...get().smartPlaylists, playlist];
    set({ smartPlaylists });
    savePref("smartPlaylists", smartPlaylists);
    return playlist;
  },

  updateSmartPlaylist(id, patch) {
    const smartPlaylists = get().smartPlaylists.map((p) =>
      p.id === id ? { ...p, ...patch, id, builtin: false } : p
    );
    set({ smartPlaylists });
    savePref("smartPlaylists", smartPlaylists);
  },

  deleteSmartPlaylist(id) {
    const smartPlaylists = get().smartPlaylists.filter((p) => p.id !== id);
    set({ smartPlaylists });
    savePref("smartPlaylists", smartPlaylists);
  },

  resolveSmart(id) {
    const { smartPlaylists, tracks, stats } = get();
    const playlist =
      smartPlaylists.find((p) => p.id === id) ??
      BUILTIN_SMART_PLAYLISTS.find((p) => p.id === id);
    return playlist ? resolveSmartPlaylist(playlist, tracks, { stats }) : [];
  },

  playSmartPlaylist(id, options = {}) {
    const list = get().resolveSmart(id);
    if (list.length === 0) return;
    const start = options.shuffle ? Math.floor(Math.random() * list.length) : 0;
    get().playCollection(list, start, options);
  },

  playPlaylist(id, options = {}) {
    const playlist = get().playlists.find((p) => p.id === id);
    if (!playlist) return;
    const list = resolvePlaylistTracks(playlist);
    if (list.length === 0) return;
    const start = options.shuffle ? Math.floor(Math.random() * list.length) : 0;
    get().playCollection(list, start, options);
  },

  async exportBackup() {
    const state = get();
    const prefs: Record<string, unknown> = {};
    for (const key of BACKUP_PREF_KEYS) prefs[key] = state[key];
    const data = await createBackup({
      library: state.tracks,
      playlists: state.playlists,
      smartPlaylists: state.smartPlaylists,
      favorites: state.savedOnlineTracks,
      history: state.history,
      stats: state.stats,
      prefs,
    });
    return JSON.stringify(data);
  },

  async importBackup(text, mode = "merge") {
    const data = parseBackup(text);
    const idMap = matchTrackIds(data.tracks, get().tracks);
    const mapId = (id: string) => idMap.get(id) ?? id;

    // Playlists: union by id, remapped track ids.
    const playlists = [...get().playlists];
    for (const imported of data.playlists) {
      if (!imported || typeof imported.id !== "string") continue;
      const trackIds = (imported.trackIds ?? []).map(mapId);
      const at = playlists.findIndex((p) => p.id === imported.id);
      const merged: Playlist =
        at >= 0
          ? {
              ...playlists[at],
              trackIds: [...new Set([...playlists[at].trackIds, ...trackIds])],
              online: [...(playlists[at].online ?? []), ...(imported.online ?? [])],
            }
          : { id: imported.id, name: imported.name, trackIds, online: imported.online };
      if (at >= 0) playlists[at] = merged;
      else playlists.push(merged);
      await idbSet("playlists", merged.id, merged);
    }

    const unionById = (a: Track[], b: Track[]) => {
      const seen = new Set(a.map((t) => t.id));
      return [...a, ...b.filter((t) => t && typeof t.id === "string" && !seen.has(t.id))];
    };
    const savedOnlineTracks = unionById(get().savedOnlineTracks, data.favorites);
    const history = unionById(get().history, data.history).slice(0, 50);
    const smartPlaylists = [
      ...get().smartPlaylists,
      ...sanitizeSmartPlaylists(data.smartPlaylists).filter(
        (p) => !get().smartPlaylists.some((q) => q.id === p.id)
      ),
    ];
    const importedStats = remapStatsIds(migrateStats(data.stats), (id) => idMap.get(id) ?? null);
    const stats = mode === "replace" ? importedStats : mergeStats(get().stats, importedStats);
    flushListening(true);
    set({ playlists, savedOnlineTracks, history, smartPlaylists, stats });
    savePref("savedOnlineTracks", savedOnlineTracks);
    savePref("history", history);
    savePref("smartPlaylists", smartPlaylists);
    savePref("stats", stats);

    if (mode === "replace") {
      const p = data.prefs as Partial<Record<(typeof BACKUP_PREF_KEYS)[number], unknown>>;
      const s = get();
      if (typeof p.volume === "number") s.setVolume(p.volume);
      if (p.repeat === "off" || p.repeat === "all" || p.repeat === "one") {
        set({ repeat: p.repeat });
        savePref("repeat", p.repeat);
      }
      if (typeof p.shuffle === "boolean") {
        set({ shuffle: p.shuffle });
        savePref("shuffle", p.shuffle);
      }
      if (typeof p.autoMode === "boolean") s.setAutoMode(p.autoMode);
      const eq = p.eq as EqSettings | undefined;
      if (eq && typeof eq.low === "number" && typeof eq.mid === "number" && typeof eq.high === "number") {
        s.setEq(eq);
      }
      if (typeof p.visualMode === "string" && MODE_KEYS.includes(p.visualMode as VisualMode)) {
        s.setVisualMode(p.visualMode as VisualMode);
      }
      if (typeof p.bloom === "boolean" && p.bloom !== get().bloom) s.toggleBloom();
      if (typeof p.crossfade === "number") s.setCrossfade(Math.max(0, Math.min(12, p.crossfade)));
      if (typeof p.speed === "number" && p.speed >= 0.5 && p.speed <= 1.5) s.setSpeed(p.speed);
      if (typeof p.skipSilence === "boolean") s.setSkipSilence(p.skipSilence);
      if (typeof p.normalize === "boolean") s.setNormalize(p.normalize);
    }

    const metaEntries = await restoreTrackMeta(data.trackMeta, mapId);
    const localTotal = data.tracks.filter((t) => !t.online && !t.id.startsWith("yt:")).length;
    const localMatched = data.tracks.filter(
      (t) => !t.online && !t.id.startsWith("yt:") && idMap.has(t.id)
    ).length;
    return {
      playlists: data.playlists.length,
      tracksMatched: localMatched,
      tracksTotal: localTotal,
      metaEntries,
    };
  },

  exportPlaylistM3u(playlistId) {
    const { playlists } = get();
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return null;
    return exportM3u(resolvePlaylistTracks(playlist), playlist.name);
  },

  async importM3u(text, name) {
    const parsed = parseM3u(text);
    const { tracks } = matchM3u(parsed.entries, get().tracks, (videoId, entry) =>
      onlineResultToTrack({
        id: videoId,
        title: entry.title ?? videoId,
        artist: entry.artist ?? "YouTube",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationText: entry.duration
          ? `${Math.floor(entry.duration / 60)}:${String(Math.floor(entry.duration % 60)).padStart(2, "0")}`
          : undefined,
        isOnline: true,
      })
    );
    const playlist: Playlist = {
      id: String(Date.now()),
      name: (name ?? parsed.name ?? "Playlist importée").trim() || "Playlist importée",
      trackIds: [...new Set(tracks.map((t) => t.id))],
      online: tracks.filter((t) => t.isOnline).map(serializableTrack),
    };
    set({ playlists: [...get().playlists, playlist] });
    await idbSet("playlists", playlist.id, playlist);
    return { playlistId: playlist.id, matched: tracks.length, total: parsed.entries.length };
  },

  playShuffledLibrary() {
    const { tracks } = get();
    if (tracks.length === 0) return;
    // Shuffle mode + bag rather than a 5000-item queue.
    set({ shuffle: true });
    savePref("shuffle", true);
    shuffleBag = [];
    get().play(Math.floor(Math.random() * tracks.length));
  },

  playNext(input) {
    const items = (Array.isArray(input) ? input : [input]).map(makeQueueItem);
    if (items.length === 0) return;
    setQueue([...items, ...get().queue]);
  },

  addToQueue(input) {
    const items = (Array.isArray(input) ? input : [input]).map(makeQueueItem);
    if (items.length === 0) return;
    setQueue([...get().queue, ...items]);
  },

  removeFromQueue(qid) {
    setQueue(get().queue.filter((item) => item.qid !== qid));
  },

  reorderQueue(from, to) {
    setQueue(moveItem(get().queue, from, to));
  },

  clearQueue() {
    setQueue([]);
  },

  playFromQueue(qid) {
    const queue = get().queue;
    const at = queue.findIndex((item) => item.qid === qid);
    if (at < 0) return;
    setQueue(queue.slice(at + 1));
    playTrackObject(queue[at].track, true);
  },

  playCollection(list, start = 0, options = {}) {
    const first = list[start];
    if (!first) return;
    const rest = [...list.slice(start + 1), ...list.slice(0, start)];
    setQueue((options.shuffle ? shuffled(rest) : rest).map(makeQueueItem));
    playTrackObject(first, false);
  },

  addToHistory(track) {
    if (!track.isOnline) return;
    set((state) => {
      const filtered = state.history.filter((t) => t.id !== track.id);
      const nextHistory = [track, ...filtered].slice(0, 50);
      savePref("history", nextHistory);
      return { history: nextHistory };
    });
  },

  saveOnlineTrack(track) {
    if (!track.isOnline) return;
    set((state) => {
      if (state.savedOnlineTracks.some(t => t.id === track.id)) return state;
      const nextSaved = [track, ...state.savedOnlineTracks];
      savePref("savedOnlineTracks", nextSaved);
      return { savedOnlineTracks: nextSaved };
    });
  },

  removeOnlineTrack(trackId) {
    set((state) => {
      const nextSaved = state.savedOnlineTracks.filter((t) => t.id !== trackId);
      savePref("savedOnlineTracks", nextSaved);
      return { savedOnlineTracks: nextSaved };
    });
  },

  setYoutubeApiKey(key) {
    const trimmed = key.trim();
    if (trimmed) {
      set({ youtubeApiKey: trimmed });
      savePref("youtubeApiKey", trimmed);
    } else {
      // Clearing the custom key falls back to the build-time key instead of
      // persisting an empty string that would break every search.
      set({ youtubeApiKey: DEFAULT_YOUTUBE_API_KEY });
      void idbDelete("prefs", "youtubeApiKey");
    }
  },

  setPlaybackError(message) {
    if (playbackErrorTimer) clearTimeout(playbackErrorTimer);
    playbackErrorTimer = null;
    set({ playbackError: message });
    if (message) {
      playbackErrorTimer = setTimeout(() => {
        playbackErrorTimer = null;
        set({ playbackError: null });
      }, 6000);
    }
  },

  async searchOnline(query) {
    if (!query.trim()) {
      set({ onlineQuery: "", onlineResults: [], onlineError: null });
      return;
    }
    const seq = ++searchSeq;
    set({ onlineSearching: true, onlineQuery: query, onlineError: null });
    try {
      const results = await searchOnlineMusic(query, get().youtubeApiKey);
      if (seq !== searchSeq) return; // a newer search superseded this one
      set({ onlineResults: results, onlineSearching: false });
    } catch (e) {
      if (seq !== searchSeq) return;
      const detail = e instanceof Error && e.message ? ` : ${e.message}` : "";
      set({
        onlineError: `Erreur lors de la recherche en ligne${detail}`,
        onlineSearching: false,
      });
    }
  },

  async playOnlineResult(result) {
    ytErrorStreak = 0; // explicit user choice: give the skip budget back
    const track = onlineResultToTrack(result);
    get().addToHistory(track);
    const { tracks, current } = get();
    const existingIndex = tracks.findIndex(t => t.id === track.id);
    if (existingIndex >= 0) {
      get().play(existingIndex);
      return;
    }
    
    // Insert after current or at the end
    const insertAt = current >= 0 ? current + 1 : tracks.length;
    const nextTracks = [...tracks];
    nextTracks.splice(insertAt, 0, track);
    set({ tracks: nextTracks, showHome: false });
    get().play(insertAt);
  },

  setSupported(value) {
    set({ supported: value });
  },

  removeSource(source) {
    set((state) => ({
      sources: state.sources.filter((s) => s !== source),
    }));
  },

  async restore() {
    const [volume, repeat, shuffle, autoMode, eq, visualMode, bloom, crossfade, speed, skipSilence, normalize, stats, playlists, savedOnlineTracks, history, storedYoutubeApiKey] =
      await Promise.all([
        idbGet<number>("prefs", "volume"),
        idbGet<RepeatMode>("prefs", "repeat"),
        idbGet<boolean>("prefs", "shuffle"),
        idbGet<boolean>("prefs", "autoMode"),
        idbGet<EqSettings>("prefs", "eq"),
        idbGet<VisualMode>("prefs", "visualMode"),
        idbGet<boolean>("prefs", "bloom"),
        idbGet<number>("prefs", "crossfade"),
        idbGet<number>("prefs", "speed"),
        idbGet<boolean>("prefs", "skipSilence"),
        idbGet<boolean>("prefs", "normalize"),
        idbGet<ListeningStats>("prefs", "stats"),
        idbGetAll<Playlist>("playlists"),
        idbGet<Track[]>("prefs", "savedOnlineTracks"),
        idbGet<Track[]>("prefs", "history"),
        idbGet<string>("prefs", "youtubeApiKey"),
      ]);
    const storedSmart = await idbGet<unknown>("prefs", "smartPlaylists");

    const prefs: Partial<PlayerState> = {};
    prefs.smartPlaylists = sanitizeSmartPlaylists(storedSmart);
    if (typeof storedYoutubeApiKey === "string" && storedYoutubeApiKey.trim()) {
      prefs.youtubeApiKey = storedYoutubeApiKey;
    }
    if (typeof volume === "number") {
      prefs.volume = volume;
      engine.volume = volume;
    }
    if (repeat === "off" || repeat === "all" || repeat === "one")
      prefs.repeat = repeat;
    if (typeof shuffle === "boolean") prefs.shuffle = shuffle;
    if (typeof autoMode === "boolean") prefs.autoMode = autoMode;
    if (eq && typeof eq.low === "number") {
      prefs.eq = eq;
      engine.setEq(eq);
    }
    if (
      visualMode === "organism" ||
      visualMode === "tunnel" ||
      visualMode === "metaballs" ||
      visualMode === "particles" ||
      visualMode === "galaxy" ||
      visualMode === "nebula" ||
      visualMode === "waves"
    )
      prefs.visualMode = visualMode;
    if (typeof bloom === "boolean") prefs.bloom = bloom;
    if (typeof crossfade === "number") prefs.crossfade = crossfade;
    if (typeof speed === "number" && speed >= 0.5 && speed <= 1.5) {
      prefs.speed = speed;
      engine.setRate(speed);
    }
    if (typeof skipSilence === "boolean") prefs.skipSilence = skipSilence;
    if (typeof normalize === "boolean") prefs.normalize = normalize;
    if (stats && typeof stats === "object") {
      // v1 {plays, seconds} → v2 (dated history, artists, hours): lossless.
      prefs.stats = migrateStats(stats);
    }
    if (Array.isArray(playlists?.values) && playlists.values.length > 0) {
      prefs.playlists = playlists.values;
    }
    const cleanTracks = (tracks: Track[]) => {
      const seen = new Set<string>();
      return tracks
        .filter((t) => t && typeof t.id === "string")
        .map((t) => {
          // Older builds stored `yt:yt:<id>` in both id and streamUrl, which
          // the IFrame player cannot load. Normalise both.
          const videoId = toVideoId(t.id);
          return { ...t, id: `yt:${videoId}`, streamUrl: `yt:${videoId}`, isOnline: true };
        })
        .filter(t => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
    };

    if (Array.isArray(savedOnlineTracks)) {
      prefs.savedOnlineTracks = cleanTracks(savedOnlineTracks);
      savePref("savedOnlineTracks", prefs.savedOnlineTracks);
    }
    if (Array.isArray(history)) {
      prefs.history = cleanTracks(history);
      savePref("history", prefs.history);
    }
    set(prefs);

    let dirs = await idbGet<FsNode[]>("handles", "musicDirs");
    if (!dirs) {
      const legacy = await idbGet<FsNode>("handles", "musicDir");
      dirs = legacy ? [legacy] : undefined;
    }
    set({ supported: supportsFileSystemAccess() });

    if (isNativeAndroid()) {
      set({ scanning: true, error: null });
      try {
        const result = await AudioScanner.scanAudio();
        const nativeTracks = nativeToTracks(result.tracks);
        // `sources` is rendered as text: an object here crashed React.
        set({ tracks: nativeTracks, sources: ["Appareil"], scanning: false });
      } catch {
        set({ error: "Erreur lors du scan automatique", scanning: false });
      }
      await resumeLastSession();
      return;
    }

    if (!dirs || dirs.length === 0) {
      await resumeLastSession(); // online-only session
      return;
    }

    const granted: FsNode[] = [];
    for (const dir of dirs) {
      const permission = await (dir.queryPermission?.({ mode: "read" }) ??
        Promise.resolve("granted"));
      if (permission === "granted") granted.push(dir);
    }
    if (granted.length > 0) {
      await get().loadAllSources(granted);
    } else {
      pendingHandles = dirs;
      set({ needsPermission: true, pendingDirName: dirs.map((d) => d.name).join(", ") });
    }
  },

  async reconnect() {
    if (pendingHandles.length === 0) return;
    const granted: FsNode[] = [];
    for (const dir of pendingHandles) {
      const permission = await (dir.requestPermission?.({ mode: "read" }) ??
        Promise.resolve("granted"));
      if (permission === "granted") granted.push(dir);
    }
    if (granted.length > 0) {
      pendingHandles = [];
      set({ needsPermission: false, pendingDirName: "", showHome: false });
      await get().loadAllSources(granted);
    }
  },

  async openFolder() {
    if (!supportsFileSystemAccess()) {
      set({ error: "UNSUPPORTED_BROWSER" });
      return;
    }
    set({ error: null });

    if (isNativeAndroid()) {
      set({ scanning: true });
      try {
        const result = await AudioScanner.scanAudio();
        const nativeTracks = nativeToTracks(result.tracks);
        // `sources` is rendered as text: an object here crashed React.
        set({ tracks: nativeTracks, sources: ["Appareil"], scanning: false });
      } catch {
        set({ error: "Erreur lors du scan", scanning: false });
      }
      return;
    }

    try {
      const dir = await pickMusicDirectory();
      if (!dir) return;
      const existing = (await idbGet<FsNode[]>("handles", "musicDirs")) ?? [];
      const merged = [...existing.filter((d) => d.name !== dir.name), dir];
      void idbSet("handles", "musicDirs", merged);
      await get().loadAllSources(merged);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "SCAN_FAILED",
        scanning: false,
      });
    }
  },

  async loadAllSources(dirs) {
    if (get().scanning) return; // IDEMPOTENCE: Empêche les scans en double
    set({ scanning: true, progress: { done: 0, total: 0 }, error: null });
    try {
      const byId = new Map<string, Track>();
      lyricsFiles = new Map();
      let done = 0;
      let total = 0;
      const perDir: {
        audio: File[];
        lyrics: Map<string, File>;
      }[] = [];
      for (const dir of dirs) {
        const scanned = await scanMusicFolder(dir);
        perDir.push(scanned);
        total += scanned.audio.length;
      }
      const allFiles: File[] = [];
      for (const scanned of perDir) {
        allFiles.push(
          ...[...scanned.audio].sort((a, b) => a.name.localeCompare(b.name))
        );
        for (const [base, file] of scanned.lyrics) {
          lyricsFiles.set(base, file);
        }
      }
      // Cached tags are reused; only new/modified files are parsed, in
      // parallel workers. Progress updates are throttled (~10/s).
      let lastProgress = 0;
      const { tracks: built } = await buildTracks(allFiles, (d) => {
        done = d;
        const now = Date.now();
        if (now - lastProgress > 100 || d === total) {
          lastProgress = now;
          set({ progress: { done, total } });
        }
      });
      for (const track of built) {
        const relPath = track.file ? relativePathOf(track.file) : undefined;
        if (relPath) track.relPath = relPath;
        if (!byId.has(track.id)) byId.set(track.id, track);
      }
      const tracks = [...byId.values()].sort(
        (a, b) =>
          a.artist.localeCompare(b.artist) ||
          a.album.localeCompare(b.album) ||
          a.title.localeCompare(b.title)
      );
      engine.pause();
      set({
        tracks,
        sources: dirs.map((d) => d.name),
        current: -1,
        playing: false,
        duration: 0,
        scanning: false,
      });
      await resumeLastSession();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "SCAN_FAILED",
        scanning: false,
      });
    }
  },

  play(index, options = {}) {
    const { tracks, normalize } = get();
    const autoplay = options.autoplay ?? true;
    const countPlay = options.countPlay ?? autoplay;
    // Crossfading into a paused, resumed track makes no sense.
    const crossfade = autoplay ? get().crossfade : 0;
    const loadOptions = { autoplay, startAt: options.startAt ?? 0 };
    const track = tracks[index];
    if (!track) return;

    wireEngine();

    flushListening(true);

    const gapless =
      autoplay && crossfade === 0 && !loadOptions.startAt && engine.startPreloaded(track.id);
    if (gapless) {
      // Already loaded in the second slot and started: nothing to load.
    } else if (track.file) {
      engine.load(track.file, crossfade * 1000, loadOptions);
    } else if (track.streamUrl) {
      // Online (`yt:<id>`) or native Android (Capacitor file URL) tracks.
      engine.loadSource({ url: track.streamUrl }, crossfade * 1000, loadOptions);
    }
    engine.volume = get().muted ? 0 : get().volume;
    applyPalette(track.palette);
    syncMediaSession(track);
    if (typeof document !== "undefined") {
      document.title = `${track.title} · ${track.artist} — AURORA`;
    }
    if (playHistory[playHistory.length - 1] !== track.id) {
      playHistory.push(track.id);
      if (playHistory.length > 60) playHistory.shift();
    }
    currentFromQueue = false;
    savePref("lastTrackId", track.id);
    set({
      current: index,
      duration: 0,
      lyricsOffset: 0,
      abLoop: { a: null, b: null },
    });

    if (get().autoMode) {
      set({ visualMode: MODE_KEYS[track.seed % MODE_KEYS.length] });
    }

    if (countPlay) {
      const nextStats = recordPlay(get().stats, track);
      set({ stats: nextStats });
      savePref("stats", nextStats);
    }

    if (autoplay) void engine.play();
    else set({ playing: false });
    lastSavedPosition = { id: track.id, t: loadOptions.startAt };

    if (track.file && track.bpm === undefined) {
      void detectBpm(track.file).then((bpm) => {
        const state = get();
        const idx = state.tracks.findIndex((t) => t.id === track.id);
        if (idx >= 0) {
          const next = [...state.tracks];
          next[idx] = { ...next[idx], bpm };
          set({ tracks: next });
        }
        void idbSet("meta", track.id, { palette: track.palette, bpm });
      });
    }

    // Async results (analysis, lyrics, presets) must only apply if the user
    // has not switched tracks in the meantime.
    const isCurrent = () => get().tracks[get().current]?.id === track.id;

    const replayGain = normalize ? replayGainMultiplier(track.replayGain) : undefined;
    if (replayGain !== undefined) {
      // ReplayGain tags are authoritative; RMS analysis is only a fallback.
      engine.setTrackGain(replayGain);
    } else if (normalize && track.file) {
      void getCachedAnalysis(track.id, track.file).then((analysis) => {
        if (analysis && isCurrent()) {
          engine.setTrackGain(normalizationGain(analysis.rms, true));
        }
      });
    } else {
      engine.setTrackGain(1);
    }
    if (get().skipSilence) loadSilenceBounds(track);
    else silence = null;

    set({ lyrics: [], lyricsAvailable: false });
    const applyCues = (cues: LyricsCue[]) => {
      if (!isCurrent()) return;
      set({ lyrics: cues, lyricsAvailable: cues.length > 0 });
    };
    const lrcFile = track.file ? lyricsFiles.get(baseName(track.file.name)) : undefined;
    if (lrcFile) {
      void lrcFile
        .text()
        .then((text) => applyCues(parseLrc(text)))
        .catch(() => applyCues([]));
    } else {
      void (async () => {
        try {
          const cached = await idbGet<LyricsCue[]>("meta", `lyrics:${track.id}`);
          if (cached && cached.length > 0) {
            applyCues(cached);
            return;
          }
          const remote = await fetchRemoteLyrics(track.artist, track.title);
          if (remote && remote.length > 0) {
            void idbSet("meta", `lyrics:${track.id}`, remote);
            applyCues(remote);
          }
        } catch {
          // lyrics are optional; never surface an unhandled rejection
        }
      })();
    }

    void idbGet<number>("meta", `lyricsOffset:${track.id}`)
      .then((offset) => {
        if (isCurrent() && typeof offset === "number") set({ lyricsOffset: offset });
      })
      .catch(() => void 0);

    void idbGet<VisualPreset>("meta", `visual:${track.id}`)
      .then((preset) => {
        if (isCurrent()) set({ visualPreset: preset ?? DEFAULT_PRESET });
      })
      .catch(() => void 0);
  },

  toggle() {
    const now = Date.now();
    if (now - lastActionTime < 300) return; // Anti-spam (idempotence)
    lastActionTime = now;

    const { current, tracks } = get();
    if (current < 0 || current >= tracks.length) {
      get().play(0);
      return;
    }
    // engine.paused also covers the YouTube player (the <audio> element is
    // always paused while an online track plays, so pause never worked).
    if (engine.paused) void engine.play();
    else engine.pause();
  },

  next(auto = false) {
    if (!auto) {
      const now = Date.now();
      if (now - lastActionTime < 300) return;
      lastActionTime = now;
    }

    const { tracks, repeat, queue } = get();
    if (tracks.length === 0 && queue.length === 0) return;
    if (auto && get().sleepMode === "track") {
      sleepStop();
      if (!engine.ytActive) engine.seek(0);
      return;
    }
    if (auto && repeat === "one") {
      engine.seek(0);
      void engine.play();
      return;
    }
    const plan = planNext(auto);
    if (plan.kind === "stop") {
      engine.pause();
      // seekTo() on an ENDED YouTube player restarts playback.
      if (!engine.ytActive) engine.seek(0);
      set({ playing: false });
      return;
    }
    commitNext(plan);
  },

  prev() {
    const now = Date.now();
    if (now - lastActionTime < 300) return;
    lastActionTime = now;

    const { current, tracks, shuffle } = get();
    if (tracks.length === 0) return;
    if (engine.currentTime > 3) {
      engine.seek(0);
      return;
    }
    // Shuffle / queue playback: walk back through what was actually heard.
    if ((shuffle || currentFromQueue) && playHistory.length > 1) {
      playHistory.pop();
      const targetId = playHistory.pop();
      const target = tracks.findIndex((t) => t.id === targetId);
      if (target >= 0) {
        get().play(target);
        currentFromQueue = false;
        return;
      }
    }
    get().play((current - 1 + tracks.length) % tracks.length);
    currentFromQueue = false;
  },

  seek(time) {
    engine.seek(time);
    pushMediaPosition(true);
  },

  seekBy(delta) {
    if (get().current < 0) return;
    const duration = engine.duration;
    const target = engine.currentTime + delta;
    const max =
      Number.isFinite(duration) && duration > 0 ? duration - 0.25 : target;
    engine.seek(Math.max(0, Math.min(max, target)));
    pushMediaPosition(true);
  },

  setVolume(value) {
    const volume = Math.max(0, Math.min(1, value));
    engine.volume = volume;
    set({ volume, muted: false });
    savePref("volume", volume);
  },

  toggleMute() {
    const muted = !get().muted;
    engine.volume = muted ? 0 : get().volume;
    set({ muted });
  },

  cycleAbLoop() {
    if (get().current < 0) return;
    const { a, b } = get().abLoop;
    const now = engine.currentTime;
    if (a === null) set({ abLoop: { a: now, b: null } });
    else if (b === null) {
      set({ abLoop: now > a + 0.2 ? { a, b: now } : { a: now, b: null } });
    } else set({ abLoop: { a: null, b: null } });
  },

  clearAbLoop() {
    set({ abLoop: { a: null, b: null } });
  },

  setQueueOpen(queueOpen) {
    set({ queueOpen });
  },

  toggleShuffle() {
    const shuffle = !get().shuffle;
    set({ shuffle });
    savePref("shuffle", shuffle);
  },

  setAutoMode(autoMode) {
    set({ autoMode });
    savePref("autoMode", autoMode);
    if (autoMode) {
      const { tracks, current } = get();
      const track = tracks[current];
      if (track) {
        set({ visualMode: MODE_KEYS[track.seed % MODE_KEYS.length] });
      }
    }
  },

  cycleRepeat() {
    const order: RepeatMode[] = ["off", "all", "one"];
    const repeat = order[(order.indexOf(get().repeat) + 1) % order.length];
    set({ repeat });
    savePref("repeat", repeat);
  },

  setEq(eq) {
    engine.setEq(eq);
    set({ eq });
    savePref("eq", eq);
  },

  setVisualMode(visualMode) {
    set({ visualMode });
    savePref("visualMode", visualMode);
  },

  toggleBloom() {
    const bloom = !get().bloom;
    set({ bloom });
    savePref("bloom", bloom);
  },

  setQualityLow(qualityLow) {
    set({ qualityLow });
  },

  setUpdateReady(updateReady) {
    set({ updateReady });
  },

  setHelpOpen(value) {
    set({ helpOpen: value });
    if (!value) savePref("onboarded", true);
  },

  setShowHome(value) {
    set({ showHome: value });
  },

  setLyricsOffset(offset) {
    set({ lyricsOffset: offset });
    const track = get().tracks[get().current];
    if (!track) return;
    // Persisted per track (and included in backups).
    if (offset === 0) void idbDelete("meta", `lyricsOffset:${track.id}`);
    else void idbSet("meta", `lyricsOffset:${track.id}`, offset);
  },

  reorder(from, to) {
    const tracks = [...get().tracks];
    if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length)
      return;
    const currentId = tracks[get().current]?.id ?? null;
    const [moved] = tracks.splice(from, 1);
    tracks.splice(to, 0, moved);
    const current = currentId
      ? tracks.findIndex((t) => t.id === currentId)
      : -1;
    set({ tracks, current });
  },

  refreshApp() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true }
    );
    // SKIP_WAITING must go to the *waiting* worker: the active controller is
    // the old one, so posting to it never activated the update.
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (registration?.waiting) {
          registration.waiting.postMessage("SKIP_WAITING");
        } else {
          window.location.reload();
        }
      })
      .catch(() => window.location.reload());
  },

  async createPlaylist(name) {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const playlist: Playlist = {
      id: String(Date.now()),
      name: trimmed,
      trackIds: [],
    };
    const playlists = [...get().playlists, playlist];
    set({ playlists });
    await idbSet("playlists", playlist.id, playlist);
  },

  async deletePlaylist(id) {
    const playlists = get().playlists.filter((p) => p.id !== id);
    set({ playlists });
    await idbDelete("playlists", id);
  },

  async addToPlaylist(playlistId, trackId) {
    const online = trackId.startsWith("yt:")
      ? [...get().tracks, ...get().savedOnlineTracks, ...get().history].find(
          (t) => t.id === trackId
        )
      : undefined;
    const playlists = get().playlists.map((p) =>
      p.id === playlistId && !p.trackIds.includes(trackId)
        ? {
            ...p,
            trackIds: [...p.trackIds, trackId],
            ...(online
              ? {
                  online: [
                    ...(p.online ?? []).filter((t) => t.id !== trackId),
                    serializableTrack(online),
                  ],
                }
              : {}),
          }
        : p
    );
    set({ playlists });
    const updated = playlists.find((p) => p.id === playlistId);
    if (updated) await idbSet("playlists", playlistId, updated);
  },

  async removeFromPlaylist(playlistId, trackId) {
    const playlists = get().playlists.map((p) =>
      p.id === playlistId
        ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) }
        : p
    );
    set({ playlists });
    const updated = playlists.find((p) => p.id === playlistId);
    if (updated) await idbSet("playlists", updated.id, updated);
  },

  resetStats() {
    pendingListen = null;
    const stats = emptyStats();
    set({ stats });
    savePref("stats", stats);
  },

  setCrossfade(crossfade) {
    set({ crossfade });
    savePref("crossfade", crossfade);
  },

  setSpeed(speed) {
    engine.setRate(speed);
    set({ speed });
    pushMediaPosition(true);
    savePref("speed", speed);
  },

  setSkipSilence(skipSilence) {
    set({ skipSilence });
    savePref("skipSilence", skipSilence);
    const track = get().tracks[get().current];
    if (skipSilence && track && (!silence || silence.id !== track.id)) {
      loadSilenceBounds(track);
    }
  },

  setNormalize(normalize) {
    set({ normalize });
    savePref("normalize", normalize);
    if (!normalize) {
      engine.setTrackGain(1);
      return;
    }
    const track = get().tracks[get().current];
    if (!track) return;
    const rg = replayGainMultiplier(track.replayGain);
    if (rg !== undefined) engine.setTrackGain(rg);
    else if (track.file) {
      void getCachedAnalysis(track.id, track.file).then((analysis) => {
        const state = get();
        if (analysis && state.normalize && state.tracks[state.current]?.id === track.id) {
          engine.setTrackGain(normalizationGain(analysis.rms, true));
        }
      });
    }
  },

  setSleep(minutes) {
    if (!(minutes > 0)) {
      get().cancelSleep();
      return;
    }
    restoreSleepVolume();
    set({ sleepAt: Date.now() + minutes * 60000, sleepMode: "time" });
  },

  setSleepEndOfTrack() {
    restoreSleepVolume();
    set({ sleepAt: null, sleepMode: "track" });
  },

  cancelSleep() {
    restoreSleepVolume();
    set({ sleepAt: null, sleepMode: "off" });
  },

  setAmbient(ambient) {
    set({ ambient });
  },

  setVisualPreset(visualPreset) {
    const { tracks, current } = get();
    const track = tracks[current];
    set({ visualPreset });
    if (track) void idbSet("meta", `visual:${track.id}`, visualPreset);
  },

  resetVisualPreset() {
    const { tracks, current } = get();
    const track = tracks[current];
    set({ visualPreset: DEFAULT_PRESET });
    if (track) void idbDelete("meta", `visual:${track.id}`);
  },
}));
