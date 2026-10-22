"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";
import { coverFit, paletteTrio, useAudioFrame, useCoverTexture } from "./kit";

/**
 * Mosaïque: the cover art broken into instanced tiles. Every tile reads the
 * spectrum by its distance to the centre (lows in the middle), the gaps
 * breathe with the beat and each kick sends a shock wave through the grid.
 * All tile transforms are computed in the vertex shader.
 */
const HIGH_GRID = 34;
const LOW_GRID = 20;
const SPEC_BINS = 64;
const EXTENT = 2.5;

const vertexShader = /* glsl */ `
attribute vec2 aCell;
uniform sampler2D uSpec;
uniform float uTime;
uniform float uBeat;
uniform float uWave;
uniform float uEnergy;
uniform float uTile;
uniform float uGrid;
uniform float uFlip;
varying vec2 vUv;
varying float vLevel;
varying float vLight;
varying float vFront;
varying float vWave;

mat3 rot(vec3 a) {
  float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  return ry * rx;
}

void main() {
  float d = clamp(length(aCell) * 1.414, 0.0, 1.0);
  float lvl = texture2D(uSpec, vec2(0.02 + d * 0.9, 0.5)).r;
  float wave = exp(-pow((d - uWave * 1.3) * 5.0, 2.0)) * (1.0 - uWave);
  float n = sin(aCell.x * 9.0 + uTime * 0.7) * cos(aCell.y * 7.0 - uTime * 0.5);

  vec3 p = position;
  float s = uTile * (0.9 - uBeat * 0.14 + lvl * 0.06);
  p.xy *= s;
  p.z *= uTile * 0.45;
  vec2 dir = normalize(aCell + 1e-4);
  vec3 angles = vec3(-dir.y, dir.x, 0.0) * (wave * 1.4 + lvl * 0.35 + n * 0.08);
  angles.y += 6.2831853 * smoothstep(0.0, 1.0, clamp(uFlip * 2.0 - d, 0.0, 1.0));
  mat3 r = rot(angles);
  p = r * p;
  vec3 n3 = r * normal;
  vec3 center = vec3(aCell * ${EXTENT.toFixed(2)} * (1.0 + uEnergy * 0.07 + wave * 0.05),
                     lvl * 0.55 + wave * 0.35 + n * 0.04);
  vec3 world = center + p;

  vUv = aCell + 0.5 + position.xy / uGrid;
  vLevel = lvl;
  vWave = wave;
  vFront = step(0.5, normal.z);
  vLight = 0.45 + 0.55 * max(dot(n3, normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uCover;
uniform float uHasCover;
uniform vec2 uCoverScale;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTime;
uniform float uTreble;
varying vec2 vUv;
varying float vLevel;
varying float vLight;
varying float vFront;
varying float vWave;

void main() {
  vec3 art;
  if (uHasCover > 0.5) {
    art = texture2D(uCover, (vUv - 0.5) * uCoverScale + 0.5).rgb;
  } else {
    float g = vUv.x * 0.6 + vUv.y * 0.4 + 0.08 * sin(vUv.y * 9.0 + uTime * 0.3);
    art = mix(mix(uColorA, uColorB, smoothstep(0.1, 0.6, g)), uColorC, smoothstep(0.55, 1.0, g));
  }
  vec3 side = mix(uColorA, uColorC, vUv.y) * 0.25;
  vec3 col = mix(side, art, vFront) * vLight;
  col *= 0.75 + vLevel * 0.9;
  col += mix(uColorB, vec3(1.0), 0.4) * vWave * 0.45;
  col += vec3(1.0) * vLevel * vLevel * uTreble * 0.6 * vFront;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Mosaic() {
  const qualityLow = usePlayer((s) => s.qualityLow);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const coverUrl = usePlayer((s) => s.tracks[s.current]?.coverUrl);
  const cover = useCoverTexture();
  const grid = qualityLow ? LOW_GRID : HIGH_GRID;
  const groupRef = useRef<THREE.Group>(null!);
  const wave = useRef({ t: 1, flip: 0, flipTarget: 0, offset: 0, mixFlipped: false });
  const spectrum = useMemo(() => new Uint8Array(SPEC_BINS), []);
  const levels = useMemo(() => new Float32Array(SPEC_BINS), []);

  const specTexture = useMemo(() => {
    const tex = new THREE.DataTexture(new Uint8Array(SPEC_BINS * 4), SPEC_BINS, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const uniforms = useMemo(
    () => ({
      uSpec: { value: specTexture },
      uCover: { value: null as THREE.Texture | null },
      uHasCover: { value: 0 },
      uCoverScale: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uWave: { value: 1 },
      uEnergy: { value: 0 },
      uTreble: { value: 0 },
      uTile: { value: EXTENT / HIGH_GRID },
      uGrid: { value: HIGH_GRID },
      uFlip: { value: 0 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
    }),
    [specTexture]
  );

  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = box.index;
    g.setAttribute("position", box.getAttribute("position"));
    g.setAttribute("normal", box.getAttribute("normal"));
    const cells = new Float32Array(grid * grid * 2);
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const i = y * grid + x;
        cells[i * 2] = (x + 0.5) / grid - 0.5;
        cells[i * 2 + 1] = (y + 0.5) / grid - 0.5;
      }
    }
    g.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
    g.instanceCount = grid * grid;
    box.dispose();
    return g;
  }, [grid]);

  const material = useMemo(
    () => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader }),
    [uniforms]
  );

  useEffect(() => {
    uniforms.uTile.value = EXTENT / grid;
    uniforms.uGrid.value = grid;
  }, [grid, uniforms]);

  useEffect(() => {
    const [a, b, c] = paletteTrio(palette);
    uniforms.uColorA.value.set(a);
    uniforms.uColorB.value.set(b);
    uniforms.uColorC.value.set(c);
  }, [palette, uniforms]);

  useEffect(() => {
    uniforms.uCover.value = cover;
    uniforms.uHasCover.value = cover ? 1 : 0;
    if (cover) uniforms.uCoverScale.value.set(...coverFit(cover, coverUrl));
  }, [cover, coverUrl, uniforms]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      material.dispose();
      specTexture.dispose();
    },
    [material, specTexture]
  );

  useAudioFrame((f, state) => {
    if (f.ambient) {
      for (let i = 0; i < SPEC_BINS; i++) {
        spectrum[i] = 255 * (0.12 + 0.1 * Math.sin(f.time * 0.8 - i * 0.18));
      }
    } else {
      engine.getSpectrum(spectrum);
    }
    const data = specTexture.image.data as Uint8Array;
    for (let i = 0; i < SPEC_BINS; i++) {
      const target = Math.min(255, spectrum[i] * f.amp * (1 + i / SPEC_BINS));
      // Smooth per bin so the fake/jittery spectra stay fluid.
      levels[i] += (target - levels[i]) * Math.min(1, f.rawDt * 12);
      data[i * 4] = levels[i];
    }
    specTexture.needsUpdate = true;

    const w = wave.current;
    if (f.kick && !f.reduced) w.t = 0;
    w.t = Math.min(1, w.t + f.rawDt * 1.1);
    // Every ~20 s, and whenever Aurora Mix hands over, the board flips.
    if (f.mix > 0.5 && !w.mixFlipped) {
      w.mixFlipped = true;
      w.offset += 1;
    } else if (f.mix < 0.1) w.mixFlipped = false;
    w.flipTarget = (Math.floor(f.time / 20) + w.offset) % 2;
    w.flip += (w.flipTarget - w.flip) * Math.min(1, f.dt * 0.9);
    uniforms.uFlip.value = f.reduced ? 0 : w.flip;
    uniforms.uWave.value = w.t;
    uniforms.uTime.value = f.time;
    uniforms.uBeat.value = f.beat;
    uniforms.uEnergy.value = f.energy * f.amp;
    uniforms.uTreble.value = f.treble * f.amp;

    const aspect = state.size.width / Math.max(1, state.size.height);
    const g = groupRef.current;
    g.scale.setScalar(Math.min(1, aspect * 1.05));
    g.rotation.x = -0.18 + Math.sin(f.time * 0.23) * 0.06;
    g.rotation.y = Math.sin(f.time * 0.17) * 0.12;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
