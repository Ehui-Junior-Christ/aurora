"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { BeatDetector } from "@/lib/beat";
import { usePlayer } from "@/store/player-store";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.998, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeat;
uniform float uSeed;
uniform float uAspect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

varying vec2 vUv;

vec2 center(float i) {
  float a = 0.25 + fract(sin(i * 12.9898 + uSeed) * 43758.5453) * 0.35;
  float b = 0.2 + fract(sin(i * 78.233 + uSeed) * 43758.5453) * 0.3;
  float ph = i * 17.13 + uSeed * 0.017;
  return vec2(sin(uTime * a + ph) * 0.72, cos(uTime * b + ph * 1.3) * 0.62);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float field = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = center(fi) * (1.0 + uMid * 0.35);
    float r = 0.11 + 0.05 * sin(fi * 2.7 + uTime * 0.4) + uBass * 0.09 + uBeat * 0.05;
    float d2 = dot(p - c, p - c);
    field += (r * r) / max(d2, 1e-5);
  }

  float body = smoothstep(1.05, 2.4, field);
  float edge = smoothstep(0.45, 1.05, field) * (1.0 - body);
  float swirl = sin(field * 2.4 - uTime * 0.8) * 0.5 + 0.5;

  vec3 col = mix(uColorA, uColorB, swirl) * body * (0.55 + uBass * 1.1 + uBeat * 0.45);
  col += uColorC * edge * (0.9 + uTreble * 2.2);
  col += vec3(1.0) * pow(edge, 3.0) * 0.25;

  float alpha = clamp(body * 0.92 + edge * 0.55 + 0.05, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Metaballs() {
  const { size } = useThree();
  const beat = useMemo(() => new BeatDetector(), []);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uSeed: { value: 0 },
      uAspect: { value: 1.6 },
      uColorA: { value: new THREE.Color("#6d4dff") },
      uColorB: { value: new THREE.Color("#22e4ff") },
      uColorC: { value: new THREE.Color("#ff4ecd") },
    }),
    []
  );

  useEffect(() => {
    uniforms.uSeed.value = seed % 997;
    if (!palette?.length) return;
    uniforms.uColorA.value.set(palette[0].hex);
    uniforms.uColorB.value.set((palette[1] ?? palette[0]).hex);
    uniforms.uColorC.value.set(
      (palette[2] ?? palette[palette.length - 1]).hex
    );
  }, [palette, seed, uniforms]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const b = engine.bands();
    beat.update(b.bass, performance.now() / 1000, d);
    uniforms.uTime.value += d * (0.5 + b.bass * 0.6);
    uniforms.uBass.value = b.bass;
    uniforms.uMid.value = b.mid;
    uniforms.uTreble.value = b.treble;
    uniforms.uBeat.value = beat.value;
    uniforms.uAspect.value = size.width / Math.max(1, size.height);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-5}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
