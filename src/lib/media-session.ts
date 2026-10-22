import type { Track } from "./types";

/**
 * Media Session integration (lock screen / OS media controls / hardware keys).
 * Works for local and YouTube tracks: callers feed positions read from the
 * audio engine (currentTime/duration/paused), never from a specific element.
 */

export interface MediaSessionActions {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
  seekTo(time: number): void;
  seekBy(delta: number): void;
  stop?(): void;
}

const DEFAULT_SKIP = 10;
const POSITION_THROTTLE_MS = 1000;

let lastPositionPush = 0;
let lastPushed = { duration: -1, rate: -1, position: -1 };
let handlersInstalled = false;

function session(): MediaSession | null {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return null;
  }
  return navigator.mediaSession;
}

function youtubeId(track: Track): string | null {
  const source = track.streamUrl ?? track.id;
  const match = /^(?:yt:)+([\w-]{6,})$/.exec(source);
  return match ? match[1] : null;
}

function guessImageType(src: string): string | undefined {
  if (/\.png(?:$|\?)/i.test(src)) return "image/png";
  if (/\.webp(?:$|\?)/i.test(src)) return "image/webp";
  if (/\.jpe?g(?:$|\?)/i.test(src)) return "image/jpeg";
  return undefined; // blob: URLs — let the browser sniff the type
}

/** Artwork list in several sizes (lock screens pick the closest one). */
export function buildArtwork(track: Track): MediaImage[] {
  // Catalog tracks carry a square 600x600 cover: better than video frames.
  const ytId = track.isOnline && !track.catalog ? youtubeId(track) : null;
  if (ytId) {
    const base = `https://i.ytimg.com/vi/${ytId}`;
    return [
      { src: `${base}/default.jpg`, sizes: "120x90", type: "image/jpeg" },
      { src: `${base}/mqdefault.jpg`, sizes: "320x180", type: "image/jpeg" },
      { src: `${base}/hqdefault.jpg`, sizes: "480x360", type: "image/jpeg" },
      { src: `${base}/sddefault.jpg`, sizes: "640x480", type: "image/jpeg" },
    ];
  }
  if (track.coverUrl) {
    const type = guessImageType(track.coverUrl);
    if (track.catalog && /\/600x600bb\.jpg$/.test(track.coverUrl)) {
      const url = track.coverUrl;
      return [100, 300, 600].map((size) => ({
        src: url.replace(/600x600bb\.jpg$/, `${size}x${size}bb.jpg`),
        sizes: `${size}x${size}`,
        type: "image/jpeg",
      }));
    }
    return [96, 128, 192, 256, 384, 512].map((size) => ({
      src: track.coverUrl as string,
      sizes: `${size}x${size}`,
      ...(type ? { type } : {}),
    }));
  }
  return [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ];
}

function safeHandler(
  s: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
): void {
  try {
    s.setActionHandler(action, handler);
  } catch {
    // Unsupported action on this browser (e.g. seekto on older Safari).
  }
}

/** Installs the action handlers once; they always call the latest actions. */
export function installMediaSessionHandlers(
  getActions: () => MediaSessionActions
): void {
  const s = session();
  if (!s || handlersInstalled) return;
  handlersInstalled = true;
  safeHandler(s, "play", () => getActions().play());
  safeHandler(s, "pause", () => getActions().pause());
  safeHandler(s, "previoustrack", () => getActions().previous());
  safeHandler(s, "nexttrack", () => getActions().next());
  safeHandler(s, "stop", () => {
    const actions = getActions();
    if (actions.stop) actions.stop();
    else actions.pause();
  });
  safeHandler(s, "seekto", (details) => {
    if (typeof details.seekTime === "number") {
      getActions().seekTo(details.seekTime);
      forcePositionUpdate();
    }
  });
  safeHandler(s, "seekbackward", (details) => {
    getActions().seekBy(-(details.seekOffset ?? DEFAULT_SKIP));
    forcePositionUpdate();
  });
  safeHandler(s, "seekforward", (details) => {
    getActions().seekBy(details.seekOffset ?? DEFAULT_SKIP);
    forcePositionUpdate();
  });
}

export function setMediaMetadata(track: Track | null): void {
  const s = session();
  if (!s) return;
  lastPushed = { duration: -1, rate: -1, position: -1 };
  if (!track) {
    s.metadata = null;
    s.playbackState = "none";
    return;
  }
  try {
    s.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: buildArtwork(track),
    });
  } catch {
    void 0;
  }
}

export function setMediaPlaybackState(playing: boolean | null): void {
  const s = session();
  if (!s) return;
  s.playbackState = playing === null ? "none" : playing ? "playing" : "paused";
}

let forceNext = false;
function forcePositionUpdate(): void {
  forceNext = true;
}

/**
 * Pushes the position state, throttled to ~1/s. Skips redundant pushes when
 * the extrapolated position matches (the OS extrapolates from rate itself).
 */
export function updateMediaPosition(
  position: number,
  duration: number,
  rate: number,
  paused: boolean,
  force = false
): void {
  const s = session();
  if (!s || typeof s.setPositionState !== "function") return;
  const now = Date.now();
  if (!force && !forceNext && now - lastPositionPush < POSITION_THROTTLE_MS) {
    return;
  }
  if (!Number.isFinite(duration) || duration <= 0) return;
  const safeRate = rate > 0 ? rate : 1;
  const safePosition = Math.min(Math.max(0, position || 0), duration);
  if (
    !force &&
    !forceNext &&
    lastPushed.duration === duration &&
    lastPushed.rate === safeRate &&
    Math.abs(
      lastPushed.position +
        (paused ? 0 : ((now - lastPositionPush) / 1000) * safeRate) -
        safePosition
    ) < 0.75
  ) {
    return;
  }
  forceNext = false;
  lastPositionPush = now;
  lastPushed = { duration, rate: safeRate, position: safePosition };
  try {
    s.setPositionState({
      duration,
      playbackRate: safeRate,
      position: safePosition,
    });
  } catch {
    void 0;
  }
}
