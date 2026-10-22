"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { BeatDetector } from "@/lib/beat";
import { getBeatClock, getMixProgress } from "@/lib/mix/clock";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { usePlayer } from "@/store/player-store";
import type { PaletteColor } from "@/lib/types";

/**
 * Shared plumbing for the audio-reactive scenes: smoothed bands, beat pulse,
 * cover palette, VisualTuner preset, adaptive quality and reduced motion.
 */

export const DEFAULT_TRIO = ["#6d4dff", "#22e4ff", "#ff4ecd"] as const;

export function paletteTrio(palette?: PaletteColor[]): [string, string, string] {
  if (!palette?.length) return [...DEFAULT_TRIO];
  return [
    palette[0].hex,
    (palette[1] ?? palette[0]).hex,
    (palette[2] ?? palette[palette.length - 1]).hex,
  ];
}

export interface AudioFrame {
  /** Smoothed bands in [0, 1] (fast attack, slower release). */
  bass: number;
  mid: number;
  treble: number;
  /** Weighted overall loudness. */
  energy: number;
  /** Beat pulse: 1 on a kick, decays to 0 (damped under reduced motion). */
  beat: number;
  /** True on the frame a beat fires. */
  kick: boolean;
  /** True when the beat comes from the analysed beat grid (vs. detection). */
  locked: boolean;
  /** 0 → 1 → 0 swell while Aurora Mix blends two tracks. */
  mix: number;
  /** Scene clock (scaled by the tuner speed and reduced motion). */
  time: number;
  /** Clamped frame delta, already scaled like `time`. */
  dt: number;
  /** Raw clamped frame delta. */
  rawDt: number;
  /** VisualTuner knobs. */
  freq: number;
  amp: number;
  speed: number;
  reduced: boolean;
  low: boolean;
  ambient: boolean;
  playing: boolean;
}

/**
 * Runs `onFrame` every frame with a normalised audio snapshot. Everything is
 * read from the store imperatively so scenes never re-render per frame.
 */
export function useAudioFrame(
  onFrame: (frame: AudioFrame, state: RootState) => void,
  priority = 0
): void {
  const beat = useMemo(() => new BeatDetector(), []);
  const frame = useRef<AudioFrame>({
    bass: 0,
    mid: 0,
    treble: 0,
    energy: 0,
    beat: 0,
    kick: false,
    locked: false,
    mix: 0,
    time: Math.random() * 40,
    dt: 0,
    rawDt: 0,
    freq: 1,
    amp: 1,
    speed: 1,
    reduced: false,
    low: false,
    ambient: false,
    playing: false,
  });
  const reducedCheck = useRef({ t: 1e9, value: false });
  const lastGridBeat = useRef(-1);

  useFrame((state, delta) => {
    const f = frame.current;
    const d = Math.min(delta, 0.05);
    const s = usePlayer.getState();
    // matchMedia is cheap but not free: poll it twice a second.
    reducedCheck.current.t += d;
    if (reducedCheck.current.t > 0.5) {
      reducedCheck.current = { t: 0, value: prefersReducedMotion() };
    }
    const reduced = reducedCheck.current.value;
    const elapsed = state.clock.elapsedTime;
    const raw = s.ambient
      ? {
          bass: 0.16 + 0.08 * Math.sin(elapsed * 0.35),
          mid: 0.1 + 0.04 * Math.sin(elapsed * 0.21 + 1.3),
          treble: 0.07 + 0.03 * Math.sin(elapsed * 0.27 + 2.1),
        }
      : engine.bands();
    const follow = (current: number, target: number) =>
      current + (target - current) * Math.min(1, d * (target > current ? 16 : 5));
    f.bass = follow(f.bass, raw.bass);
    f.mid = follow(f.mid, raw.mid);
    f.treble = follow(f.treble, raw.treble);
    f.energy = f.bass * 0.5 + f.mid * 0.35 + f.treble * 0.15;
    const before = beat.value;
    beat.update(s.ambient ? 0 : raw.bass, elapsed, d);
    // Prefer the analysed beat grid (local files) when it is reliable.
    const clock = s.ambient ? null : getBeatClock(s.tracks[s.current]?.id);
    if (clock && clock.confidence > 0.45) {
      f.locked = true;
      f.kick = s.playing && clock.beat !== lastGridBeat.current;
      lastGridBeat.current = clock.beat;
      const accent = clock.barPhase < 0.25 ? 1 : 0.72;
      f.beat = s.playing ? Math.pow(1 - clock.phase, 3) * accent * (reduced ? 0.3 : 1) : 0;
    } else {
      f.locked = false;
      f.kick = beat.value > before + 0.5;
      f.beat = beat.value * (reduced ? 0.3 : 1);
    }
    const progress = getMixProgress();
    const swell = progress === null ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
    f.mix += (swell - f.mix) * Math.min(1, d * 4);
    f.freq = s.visualPreset.freq;
    f.amp = s.visualPreset.amp;
    f.speed = s.visualPreset.speed;
    f.reduced = reduced;
    f.low = s.qualityLow;
    f.ambient = s.ambient;
    f.playing = s.playing;
    const scale = f.speed * (reduced ? 0.35 : 1) * (s.ambient ? 0.5 : 1);
    f.rawDt = d;
    f.dt = d * scale;
    f.time += f.dt;
    onFrame(f, state);
  }, priority);
}

/** Standard uniforms for a full-screen audio shader. */
export function createShaderUniforms() {
  return {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uEnergy: { value: 0 },
    uBeat: { value: 0 },
    uFreq: { value: 1 },
    uAmp: { value: 1 },
    uSeed: { value: 0 },
    uLow: { value: 0 },
    uAspect: { value: 1.6 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uColorA: { value: new THREE.Color(DEFAULT_TRIO[0]) },
    uColorB: { value: new THREE.Color(DEFAULT_TRIO[1]) },
    uColorC: { value: new THREE.Color(DEFAULT_TRIO[2]) },
  };
}

export type ShaderUniforms = ReturnType<typeof createShaderUniforms>;

/** Keeps uColorA/B/C and uSeed in sync with the current track. */
export function useTrackUniforms(uniforms: ShaderUniforms): void {
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);
  useEffect(() => {
    const [a, b, c] = paletteTrio(palette);
    uniforms.uColorA.value.set(a);
    uniforms.uColorB.value.set(b);
    uniforms.uColorC.value.set(c);
    uniforms.uSeed.value = (seed % 997) / 997;
  }, [palette, seed, uniforms]);
}

/** Writes an AudioFrame into the standard uniforms. */
export function applyFrame(
  uniforms: ShaderUniforms,
  f: AudioFrame,
  state: RootState
): void {
  uniforms.uTime.value = f.time;
  uniforms.uBass.value = f.bass * f.amp;
  uniforms.uMid.value = f.mid * f.amp;
  uniforms.uTreble.value = f.treble * f.amp;
  uniforms.uEnergy.value = (f.energy + f.mix * 0.25) * f.amp;
  uniforms.uBeat.value = f.beat * Math.min(1.5, f.amp);
  uniforms.uFreq.value = f.freq;
  uniforms.uAmp.value = f.amp;
  uniforms.uLow.value = f.low ? 1 : 0;
  const { width, height } = state.size;
  uniforms.uAspect.value = width / Math.max(1, height);
  uniforms.uResolution.value.set(width, height);
}

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.996, 1.0);
}
`;

/** Cheap helpers shared by the shader scenes (value noise, fbm, grain). */
export const COMMON_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int octaves) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += a * vnoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
vec3 vivid(vec3 c) {
  return c / max(max(c.r, c.g), max(c.b, 0.04));
}
float grain(vec2 fragCoord, float t) {
  return hash12(fragCoord + fract(t * 7.13) * 431.0) - 0.5;
}
`;

/** Full-screen quad with the standard uniforms, driven by useAudioFrame. */
export function useFullscreenShader(
  fragmentShader: string,
  onFrame?: (uniforms: ShaderUniforms, f: AudioFrame, state: RootState) => void,
  extraUniforms?: Record<string, THREE.IUniform>
) {
  const uniforms = useMemo(() => createShaderUniforms(), []);
  useTrackUniforms(uniforms);
  useAudioFrame((f, state) => {
    applyFrame(uniforms, f, state);
    onFrame?.(uniforms, f, state);
  });
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, ...extraUniforms },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [uniforms, fragmentShader, extraUniforms]
  );
  useEffect(() => () => material.dispose(), [material]);
  return { uniforms, material };
}

/**
 * Loads the current track's cover as a texture (CORS permitting). Returns null
 * while loading, without a cover, or when the image is tainted/unreachable.
 */
export function useCoverTexture(): THREE.Texture | null {
  const coverUrl = usePlayer((s) => s.tracks[s.current]?.coverUrl);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!coverUrl) {
      setTexture(null);
      return;
    }
    let alive = true;
    let loaded: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      coverUrl,
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = 4;
        loaded = tex;
        setTexture(tex);
      },
      undefined,
      () => {
        if (alive) setTexture(null);
      }
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [coverUrl]);
  return texture;
}

/** Eases the camera toward a pose (scenes that don't mount Rig). */
export function easeCamera(
  camera: THREE.Camera,
  x: number,
  y: number,
  z: number,
  dt: number,
  look: THREE.Vector3Tuple = [0, 0, 0]
): void {
  const k = Math.min(1, dt * 2.4);
  camera.position.x += (x - camera.position.x) * k;
  camera.position.y += (y - camera.position.y) * k;
  camera.position.z += (z - camera.position.z) * k;
  camera.lookAt(look[0], look[1], look[2]);
}

/**
 * UV scale that cover-fits a texture into a square (1 = full axis). YouTube
 * thumbnails are letterboxed 16:9 inside 4:3: zoom past the black bars.
 */
export function coverFit(texture: THREE.Texture, url?: string): [number, number] {
  const img = texture.image as { width?: number; height?: number } | undefined;
  const w = img?.width || 1;
  const h = img?.height || 1;
  const zoom = url?.includes("ytimg") ? 1.34 : 1;
  return [(w > h ? h / w : 1) / zoom, (h > w ? w / h : 1) / zoom];
}
