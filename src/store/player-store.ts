import { create } from "zustand";
import { engine } from "@/lib/audio-engine";
import {
  pickMusicDirectory,
  scanMusicFolder,
  supportsFileSystemAccess,
  baseName,
  isNativeAndroid,
  AudioScanner,
  type FsNode,
} from "@/lib/fs-scanner";
import { Capacitor } from "@capacitor/core";
import { parseTrack } from "@/lib/metadata";
import { detectBpm } from "@/lib/bpm";
import { getCachedAnalysis, normalizationGain } from "@/lib/analysis";
import { parseLrc, type LyricsCue } from "@/lib/lyrics";
import { fetchRemoteLyrics } from "@/lib/lyrics-fetcher";
import {
  getAudioStreamUrl,
  onlineResultToTrack,
  searchOnlineMusic,
  type OnlineMusicResult,
} from "@/lib/invidious";
import { idbGet, idbSet, idbDelete, idbGetAll } from "@/lib/db";
import type { PaletteColor, ScanProgress, Track } from "@/lib/types";

let wired = false;
let pendingHandles: FsNode[] = [];
let lyricsFiles = new Map<string, File>();
const playHistory: number[] = [];
let lastActionTime = 0; // Pour l'anti-spam (idempotence)

export type RepeatMode = "off" | "all" | "one";
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
}

export interface ListeningStats {
  plays: Record<string, number>;
  seconds: number;
}

export interface VisualPreset {
  freq: number;
  speed: number;
  amp: number;
}

const DEFAULT_PRESET: VisualPreset = { freq: 1, speed: 1, amp: 1 };

interface PlayerState {
  tracks: Track[];
  sources: string[];
  current: number;
  playing: boolean;
  duration: number;
  volume: number;
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
  ambient: boolean;
  lyrics: LyricsCue[];
  lyricsAvailable: boolean;
  lyricsOffset: number;
  visualPreset: VisualPreset;
  onlineQuery: string;
  onlineResults: OnlineMusicResult[];
  onlineSearching: boolean;
  onlineError: string | null;
  youtubeApiKey: string;
  showHome: boolean;
  history: Track[];
  savedOnlineTracks: Track[];
  addToHistory(track: Track): void;
  saveOnlineTrack(track: Track): void;
  removeOnlineTrack(trackId: string): void;
  setYoutubeApiKey(key: string): void;
  searchOnline(query: string): Promise<void>;
  playOnlineResult(result: OnlineMusicResult): Promise<void>;
  removeSource(source: string): void;
  setSupported(value: boolean): void;
  restore(): Promise<void>;
  reconnect(): Promise<void>;
  openFolder(): Promise<void>;
  loadAllSources(dirs: FsNode[]): Promise<void>;
  play(index: number): void;
  toggle(): void;
  next(auto?: boolean): void;
  prev(): void;
  seek(time: number): void;
  setVolume(value: number): void;
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
  setSleep(minutes: number): void;
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
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;
  if (!track) {
    session.metadata = null;
    return;
  }
  session.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverUrl
      ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }]
      : [],
  });
  session.setActionHandler("play", () => usePlayer.getState().toggle());
  session.setActionHandler("pause", () => usePlayer.getState().toggle());
  session.setActionHandler("previoustrack", () => usePlayer.getState().prev());
  session.setActionHandler("nexttrack", () => usePlayer.getState().next());
}

export const usePlayer = create<PlayerState>((set, get) => ({
  tracks: [],
  sources: [],
  current: -1,
  playing: false,
  duration: 0,
  volume: 0.85,
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
  stats: { plays: {}, seconds: 0 },
  crossfade: 0,
  speed: 1,
  skipSilence: false,
  normalize: false,
  sleepAt: null,
  ambient: false,
  lyrics: [],
  lyricsAvailable: false,
  lyricsOffset: 0,
  visualPreset: DEFAULT_PRESET,
  onlineQuery: "",
  onlineResults: [],
  onlineSearching: false,
  onlineError: null,
  youtubeApiKey: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || "AIzaSyBHRkh_QT4tjk_TRZq8U7TBPLkBLHIcobo",
  showHome: false,
  history: [],
  savedOnlineTracks: [],

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
    set({ youtubeApiKey: key });
    savePref("youtubeApiKey", key);
  },

  async searchOnline(query) {
    if (!query.trim()) {
      set({ onlineQuery: "", onlineResults: [], onlineError: null });
      return;
    }
    set({ onlineSearching: true, onlineQuery: query, onlineError: null });
    try {
      const results = await searchOnlineMusic(query, get().youtubeApiKey);
      set({ onlineResults: results, onlineSearching: false });
    } catch (e) {
      set({ onlineError: "Erreur lors de la recherche en ligne", onlineSearching: false });
    }
  },

  async playOnlineResult(result) {
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

    const prefs: Partial<PlayerState> = {};
    if (typeof storedYoutubeApiKey === "string") {
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
      prefs.stats = {
        plays: stats.plays ?? {},
        seconds: typeof stats.seconds === "number" ? stats.seconds : 0,
      };
    }
    if (Array.isArray(playlists?.values) && playlists.values.length > 0) {
      prefs.playlists = playlists.values;
    }
    const cleanTracks = (tracks: Track[]) => {
      const seen = new Set<string>();
      return tracks
        .map(t => ({ ...t, id: t.id.replace(/^(yt:|online_)+/, "yt:") }))
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
        const nativeTracks: Track[] = result.tracks.map((t) => ({
          ...t,
          url: Capacitor.convertFileSrc(t.path),
          isOnline: false,
          palette: [{ hex: "#111111", rgb: [17, 17, 17], hsl: [0, 0, 0.07], css: "rgb(17,17,17)", score: 1 }, { hex: "#555555", rgb: [85, 85, 85], hsl: [0, 0, 0.33], css: "rgb(85,85,85)", score: 0.5 }, { hex: "#888888", rgb: [136, 136, 136], hsl: [0, 0, 0.53], css: "rgb(136,136,136)", score: 0.1 }],
          seed: Math.random(),
        }));
        set({ tracks: nativeTracks, sources: [{ kind: "directory", name: "Appareil" } as any], scanning: false });
      } catch (e) {
        set({ error: "Erreur lors du scan automatique", scanning: false });
      }
      return;
    }

    if (!dirs || dirs.length === 0) return;

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
        const nativeTracks: Track[] = result.tracks.map((t) => ({
          ...t,
          url: Capacitor.convertFileSrc(t.path),
          isOnline: false,
          palette: [{ hex: "#111111", rgb: [17, 17, 17], hsl: [0, 0, 0.07], css: "rgb(17,17,17)", score: 1 }, { hex: "#555555", rgb: [85, 85, 85], hsl: [0, 0, 0.33], css: "rgb(85,85,85)", score: 0.5 }, { hex: "#888888", rgb: [136, 136, 136], hsl: [0, 0, 0.53], css: "rgb(136,136,136)", score: 0.1 }],
          seed: Math.random(),
        }));
        set({ tracks: nativeTracks, sources: [{ kind: "directory", name: "Appareil" } as any], scanning: false });
      } catch (e) {
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
      for (const scanned of perDir) {
        const files = [...scanned.audio].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        for (const file of files) {
          const track = await parseTrack(file);
          if (!byId.has(track.id)) byId.set(track.id, track);
          done++;
          set({ progress: { done, total } });
        }
        for (const [base, file] of scanned.lyrics) {
          lyricsFiles.set(base, file);
        }
      }
      const tracks = [...byId.values()].sort(
        (a, b) =>
          a.artist.localeCompare(b.artist) ||
          a.album.localeCompare(b.album) ||
          a.title.localeCompare(b.title)
      );
      const lastId = await idbGet<string>("prefs", "lastTrackId");
      const restored = lastId ? tracks.findIndex((t) => t.id === lastId) : -1;
      engine.pause();
      set({
        tracks,
        sources: dirs.map((d) => d.name),
        current: restored >= 0 ? restored : -1,
        playing: false,
        duration: 0,
        scanning: false,
      });
      if (restored >= 0) {
        applyPalette(tracks[restored].palette);
        syncMediaSession(tracks[restored]);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "SCAN_FAILED",
        scanning: false,
      });
    }
  },

  play(index) {
    const { tracks, stats, crossfade, normalize, current } = get();
    const track = tracks[index];
    if (!track) return;

    if (!wired && typeof window !== "undefined") {
      wired = true;
      for (const el of engine.getElements()) {
        el.addEventListener("play", (event) => {
          if (event.target !== engine.el) return;
          set({ playing: true });
        });
        el.addEventListener("pause", (event) => {
          if (event.target !== engine.el) return;
          set({ playing: false });
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
        });
      }
      
      let lastCrossfadeId: string | null = null;
      setInterval(() => {
        const state = get();
        if (state.crossfade <= 0 || !state.playing || state.current < 0) return;
        if (engine.ytActive) return; // Crossfade doesn't work well with YouTube iframe yet
        
        const track = state.tracks[state.current];
        if (!track || track.id === lastCrossfadeId) return;
        
        const dur = engine.duration;
        const time = engine.currentTime;
        // Si la piste est assez longue et qu'on atteint la zone de crossfade
        if (dur > state.crossfade + 2 && dur - time <= state.crossfade) {
          lastCrossfadeId = track.id;
          get().next(true);
        }
      }, 250);

      engine.onYtStateChange = (state) => {
        // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
        if (state === 1) {
          set({ playing: true, duration: engine.duration });
        } else if (state === 2) {
          set({ playing: false });
        } else if (state === 0) {
          get().next(true);
        }
      };
      engine.onYtError = (error) => {
        console.warn("YouTube Error:", error);
        get().next(true); // Passer au suivant si erreur (vidéo supprimée/bloquée)
      };
    }

    const previous = current >= 0 ? tracks[current] : null;
    if (previous && previous.id !== track.id) {
      const elapsed = engine.el.currentTime;
      if (elapsed > 0) {
        const nextStats: ListeningStats = {
          plays: { ...stats.plays },
          seconds: stats.seconds + elapsed,
        };
        set({ stats: nextStats });
        savePref("stats", nextStats);
      }
    }

    if (track.isOnline && track.streamUrl) {
      engine.loadSource({ url: track.streamUrl }, crossfade * 1000);
    } else if (track.file) {
      engine.load(track.file, crossfade * 1000);
    }
    engine.volume = get().volume;
    applyPalette(track.palette);
    syncMediaSession(track);
    if (typeof document !== "undefined") {
      document.title = `${track.title} · ${track.artist} — AURORA`;
    }
    playHistory.push(index);
    if (playHistory.length > 60) playHistory.shift();
    savePref("lastTrackId", track.id);
    set({ current: index, duration: 0, lyricsOffset: 0 });

    if (get().autoMode) {
      set({ visualMode: MODE_KEYS[track.seed % MODE_KEYS.length] });
    }

    const nextStats: ListeningStats = {
      plays: { ...get().stats.plays },
      seconds: get().stats.seconds,
    };
    nextStats.plays[track.id] = (nextStats.plays[track.id] ?? 0) + 1;
    set({ stats: nextStats });
    savePref("stats", nextStats);

    void engine.play();

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

    if (normalize && track.file) {
      void getCachedAnalysis(track.id, track.file).then((analysis) => {
        if (analysis) {
          engine.setTrackGain(normalizationGain(analysis.rms, true));
        }
      });
    } else {
      engine.setTrackGain(1);
    }

    set({ lyrics: [], lyricsAvailable: false });
    const applyCues = (cues: LyricsCue[]) => {
      set({ lyrics: cues, lyricsAvailable: cues.length > 0 });
    };
    const lrcFile = track.file ? lyricsFiles.get(baseName(track.file.name)) : undefined;
    if (lrcFile) {
      void lrcFile
        .text()
        .then((text) => applyCues(parseLrc(text)))
        .catch(() => set({ lyrics: [], lyricsAvailable: false }));
    } else {
      void (async () => {
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
      })();
    }

    void idbGet<VisualPreset>("meta", `visual:${track.id}`).then((preset) => {
      set({ visualPreset: preset ?? DEFAULT_PRESET });
    });
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
    if (engine.el.paused) void engine.play();
    else engine.pause();
  },

  next(auto = false) {
    if (!auto) {
      const now = Date.now();
      if (now - lastActionTime < 300) return;
      lastActionTime = now;
    }

    const { current, tracks, shuffle, repeat } = get();
    if (tracks.length === 0) return;
    if (auto && repeat === "one") {
      engine.seek(0);
      void engine.play();
      return;
    }
    if (auto && repeat === "off" && !shuffle && current >= tracks.length - 1) {
      engine.pause();
      engine.seek(0);
      return;
    }
    let index: number;
    if (shuffle && tracks.length > 1) {
      do {
        index = Math.floor(Math.random() * tracks.length);
      } while (index === current);
    } else {
      index = (current + 1) % tracks.length;
    }
    get().play(index);
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
    if (shuffle && playHistory.length > 1) {
      playHistory.pop();
      const target = playHistory[playHistory.length - 1];
      if (tracks[target]) {
        get().play(target);
        return;
      }
    }
    get().play((current - 1 + tracks.length) % tracks.length);
  },

  seek(time) {
    engine.seek(time);
  },

  setVolume(value) {
    engine.volume = value;
    set({ volume: value });
    savePref("volume", value);
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
    navigator.serviceWorker.controller?.postMessage("SKIP_WAITING");
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true }
    );
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
    const playlists = get().playlists.map((p) =>
      p.id === playlistId && !p.trackIds.includes(trackId)
        ? { ...p, trackIds: [...p.trackIds, trackId] }
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
    const stats: ListeningStats = { plays: {}, seconds: 0 };
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
    savePref("speed", speed);
  },

  setSkipSilence(skipSilence) {
    set({ skipSilence });
    savePref("skipSilence", skipSilence);
  },

  setNormalize(normalize) {
    set({ normalize });
    savePref("normalize", normalize);
    if (!normalize) engine.setTrackGain(1);
  },

  setSleep(minutes) {
    const sleepAt = minutes > 0 ? Date.now() + minutes * 60000 : null;
    set({ sleepAt });
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
