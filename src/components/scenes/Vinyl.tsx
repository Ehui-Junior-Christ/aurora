"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";
import { coverFit, easeCamera, paletteTrio, useAudioFrame, useCoverTexture } from "./kit";

/**
 * Vinyle: a turntable seen at an angle. The platter spins at 33⅓ rpm nudged by
 * the track BPM and spins down on pause; the cover is the centre label; the
 * grooves carry an anisotropic sheen and a light ring under the needle, which
 * tracks the playback position.
 */
const RECORD_R = 1.5;

const recordVertex = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const recordFragment = /* glsl */ `
uniform sampler2D uCover;
uniform float uHasCover;
uniform vec2 uCoverScale;
uniform float uRot;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uNeedle;
uniform float uTime;
uniform float uSeed;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
varying vec2 vPos;

float hash(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  float r = length(vPos) / ${RECORD_R.toFixed(2)};
  float ang = atan(vPos.y, vPos.x);
  float local = ang - uRot;
  vec2 lp = vec2(cos(local), sin(local)) * r;
  float aa = fwidth(r) * 1.5;

  vec3 col = vec3(0.018, 0.018, 0.022);
  // Grooves: fine rings, track gaps, a little pressing noise.
  float groove = 0.5 + 0.5 * sin(r * 900.0);
  float gaps = 1.0;
  for (int i = 1; i < 6; i++) {
    float gr = 0.36 + 0.6 * hash(float(i) + uSeed * 13.0);
    gaps *= smoothstep(0.0, 0.006, abs(r - gr));
  }
  col += vec3(0.02) * groove * gaps;
  // Anisotropic sheen: two opposite highlight wedges fixed in world space.
  float sheenA = pow(abs(cos(ang - 0.9)), 38.0);
  float sheenB = pow(abs(cos(ang + 0.35)), 90.0) * 0.5;
  vec3 irid = mix(uColorB, uColorC, smoothstep(0.35, 0.95, r));
  col += (irid * 0.55 + 0.25) * (sheenA + sheenB) * (0.25 + uMid * 0.9) * (0.55 + 0.45 * groove) * gaps;
  // Light ring under the needle.
  col += uColorC * exp(-abs(r - uNeedle) * 140.0) * (0.35 + uBass * 1.4 + uBeat * 0.8);
  col += uColorB * exp(-abs(r - uNeedle) * 22.0) * (0.06 + uBass * 0.25);
  // Rim + lead-in.
  col += vec3(0.35) * smoothstep(0.985, 0.995, r) * (1.0 - smoothstep(0.995, 1.0, r));

  // Centre label (cover art or a palette label).
  float labelR = 0.32;
  if (r < labelR + aa) {
    vec3 label;
    if (uHasCover > 0.5) {
      vec2 uv = lp / labelR * 0.5 * uCoverScale + 0.5;
      label = texture2D(uCover, vec2(uv.x, uv.y)).rgb;
    } else {
      float band = smoothstep(0.0, 0.01, abs(r - labelR * 0.62));
      label = mix(uColorA, uColorC, 0.5 + 0.5 * lp.x / labelR) * (0.55 + 0.45 * band);
    }
    label *= 0.85 + uBeat * 0.2;
    // Soft sheen on the paper.
    label += vec3(0.08) * sheenA;
    col = mix(col, label, smoothstep(labelR + aa, labelR - aa, r));
    col = mix(col, vec3(0.8), smoothstep(0.018 + aa, 0.018, r));
    col = mix(col, vec3(0.01), smoothstep(0.011 + aa, 0.011, r));
  }
  float alpha = smoothstep(1.0, 1.0 - aa, r);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const haloFragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBass;
uniform float uBeat;
uniform float uTime;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  float a = atan(vPos.y, vPos.x);
  vec3 tint = mix(uColorA, uColorC, 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.4));
  float glow = exp(-max(r - 1.5, 0.0) * (6.0 - uBass * 2.0)) * smoothstep(1.4, 1.56, r);
  vec3 col = tint * glow * (0.16 + uBass * 0.5 + uBeat * 0.35);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function armAngle(px: number, py: number, length: number, target: number): number {
  const d = Math.hypot(px, py);
  const c = (target * target - d * d - length * length) / (2 * length);
  const phi = Math.atan2(py, px);
  return phi - Math.acos(Math.max(-1, Math.min(1, c / d)));
}

const PIVOT: [number, number] = [1.62, 1.18];
const ARM = 1.95;

export default function Vinyl() {
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);
  const coverUrl = usePlayer((s) => s.tracks[s.current]?.coverUrl);
  const cover = useCoverTexture();
  const groupRef = useRef<THREE.Group>(null!);
  const armRef = useRef<THREE.Group>(null!);
  const spin = useRef({ angle: 0, speed: 0 });

  const uniforms = useMemo(
    () => ({
      uCover: { value: null as THREE.Texture | null },
      uHasCover: { value: 0 },
      uCoverScale: { value: new THREE.Vector2(1, 1) },
      uRot: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uNeedle: { value: 0.9 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
    }),
    []
  );

  const materials = useMemo(() => {
    const record = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: recordVertex,
      fragmentShader: recordFragment,
      transparent: true,
    });
    const halo = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: recordVertex,
      fragmentShader: haloFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const metal = new THREE.MeshStandardMaterial({ color: "#d9dbe4", metalness: 0.35, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: "#1b1c22", metalness: 0.2, roughness: 0.5 });
    return { record, halo, metal, dark };
  }, [uniforms]);

  const geometries = useMemo(
    () => ({
      record: new THREE.CircleGeometry(RECORD_R, 160),
      halo: new THREE.PlaneGeometry(6, 6),
      platter: new THREE.CylinderGeometry(RECORD_R * 1.04, RECORD_R * 1.04, 0.08, 96),
      arm: new THREE.CylinderGeometry(0.022, 0.022, ARM, 12),
      base: new THREE.CylinderGeometry(0.16, 0.19, 0.12, 32),
      weight: new THREE.CylinderGeometry(0.09, 0.09, 0.2, 24),
      head: new THREE.BoxGeometry(0.1, 0.22, 0.06),
    }),
    []
  );

  useEffect(() => {
    const [a, b, c] = paletteTrio(palette);
    uniforms.uColorA.value.set(a);
    uniforms.uColorB.value.set(b);
    uniforms.uColorC.value.set(c);
    uniforms.uSeed.value = (seed % 997) / 997;
  }, [palette, seed, uniforms]);

  useEffect(() => {
    uniforms.uCover.value = cover;
    uniforms.uHasCover.value = cover ? 1 : 0;
    if (cover) uniforms.uCoverScale.value.set(...coverFit(cover, coverUrl));
  }, [cover, coverUrl, uniforms]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
      Object.values(geometries).forEach((g) => g.dispose());
    },
    [materials, geometries]
  );

  useAudioFrame((f, state) => {
    const s = usePlayer.getState();
    const bpm = s.tracks[s.current]?.bpm;
    const factor = bpm ? Math.max(0.82, Math.min(1.25, bpm / 120)) : 1;
    // During a mix handover the deck slows a touch, like a DJ riding the platter.
    const target = s.playing || f.ambient ? (33.333 / 60) * Math.PI * 2 * factor * (f.reduced ? 0.35 : 1) * (f.ambient ? 0.5 : 1) * (1 - f.mix * 0.12) : 0;
    // Motor ramp up / spin down like a real deck.
    spin.current.speed += (target - spin.current.speed) * Math.min(1, f.rawDt * (target > spin.current.speed ? 2.5 : 0.9));
    spin.current.angle += spin.current.speed * f.rawDt * f.speed;
    uniforms.uRot.value = spin.current.angle;
    uniforms.uBass.value = f.bass * f.amp;
    uniforms.uMid.value = f.mid * f.amp;
    uniforms.uTreble.value = f.treble * f.amp;
    uniforms.uBeat.value = f.beat;
    uniforms.uTime.value = f.time;

    const progress = s.duration > 0 ? Math.min(1, Math.max(0, engine.currentTime / s.duration)) : 0;
    const needle = 0.94 - progress * 0.56;
    uniforms.uNeedle.value = needle;
    const arm = armRef.current;
    const theta = armAngle(PIVOT[0], PIVOT[1], ARM, needle * RECORD_R);
    arm.rotation.z += (theta - Math.PI / 2 - arm.rotation.z) * Math.min(1, f.rawDt * 3);

    const aspect = state.size.width / Math.max(1, state.size.height);
    const fit = Math.min(1, aspect * 0.95);
    const g = groupRef.current;
    g.scale.setScalar(fit * 0.84 * (1 + f.beat * 0.012));
    g.position.x = aspect < 1 ? -0.02 : -0.12;
    g.rotation.x = -0.92 + Math.sin(f.time * 0.2) * 0.04;
    g.rotation.z = 0.12 + Math.sin(f.time * 0.13) * 0.03;
    easeCamera(state.camera, 0, 0.15, 4.4, f.rawDt, [0, -0.05, 0]);
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[-2, 3, 4]} intensity={2.2} />
      <group ref={groupRef} position={[-0.12, -0.1, 0]}>
        <mesh geometry={geometries.halo} material={materials.halo} position={[0, 0, -0.06]} renderOrder={-1} />
        <mesh
          geometry={geometries.platter}
          material={materials.dark}
          rotation-x={Math.PI / 2}
          position={[0, 0, -0.05]}
        />
        <mesh geometry={geometries.record} material={materials.record} position={[0, 0, 0.001]} />
        {/* Tonearm: pivot base, counterweight, tube and headshell. */}
        <group position={[PIVOT[0], PIVOT[1], 0.1]}>
          <mesh geometry={geometries.base} material={materials.dark} rotation-x={Math.PI / 2} />
          <group ref={armRef} rotation-z={-2.2}>
            <mesh geometry={geometries.weight} material={materials.metal} position={[0, -0.22, 0.08]} />
            <mesh geometry={geometries.arm} material={materials.metal} position={[0, ARM / 2, 0.08]} />
            <mesh geometry={geometries.head} material={materials.metal} position={[0, ARM, 0.06]} />
          </group>
        </group>
      </group>
    </>
  );
}
