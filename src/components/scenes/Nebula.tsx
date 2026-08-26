"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { NOISE_GLSL } from "@/lib/shaders/noise";
import { usePlayer } from "@/store/player-store";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.997, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uSeed;
uniform float uAspect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;

varying vec2 vUv;

${NOISE_GLSL}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p);
    p *= 2.05;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime * 0.06;

  vec2 q = vec2(fbm(vec3(p * 1.5, t + uSeed * 0.01)),
                fbm(vec3(p * 1.5 + 4.7, t * 1.2 + uSeed * 0.013)));
  float cloud = fbm(vec3(p * 2.2 + q * 1.4, t * 1.5 + uSeed * 0.017));
  float density = smoothstep(-0.25, 0.75, cloud);

  vec3 col = mix(uColorA, uColorB, q.x * 0.5 + 0.5) * density * (0.35 + uBass * 0.95);
  col += uColorC * smoothstep(0.35, 0.85, cloud) * (0.5 + uTreble * 1.6);
  col += vec3(1.0) * pow(smoothstep(0.55, 1.0, cloud), 3.0) * 0.5;

  float alpha = clamp(density * 0.9 + 0.08, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Nebula() {
  const { size } = useThree();
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);
  const ambient = usePlayer((s) => s.ambient);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uSeed: { value: 0 },
      uAspect: { value: 1.6 },
      uColorA: { value: new THREE.Color("#6d4dff") },
      uColorB: { value: new THREE.Color("#22e4ff") },
      uColorC: { value: new THREE.Color("#ff4ecd") },
    }),
    []
  );

  useEffect(() => {
    uniforms.uSeed.value = seed % 991;
    if (!palette?.length) return;
    uniforms.uColorA.value.set(palette[0].hex);
    uniforms.uColorB.value.set((palette[1] ?? palette[0]).hex);
    uniforms.uColorC.value.set(
      (palette[2] ?? palette[palette.length - 1]).hex
    );
  }, [palette, seed, uniforms]);

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const b = ambient
      ? {
          bass: 0.16 + 0.08 * Math.sin(uniforms.uTime.value * 0.3),
          mid: 0.1,
          treble: 0.07,
        }
      : engine.bands();
    uniforms.uTime.value += d * (ambient ? 0.4 : 1);
    uniforms.uBass.value = b.bass;
    uniforms.uMid.value = b.mid;
    uniforms.uTreble.value = b.treble;
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
