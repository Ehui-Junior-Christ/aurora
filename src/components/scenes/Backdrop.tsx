"use client";

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePlayer } from "@/store/player-store";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTime;
uniform float uAspect;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float rot = uTime * 0.02;
  float c = cos(rot);
  float s = sin(rot);
  p = mat2(c, -s, s, c) * p;

  vec3 col = vec3(0.025, 0.025, 0.04);
  float g1 = length(p - vec2(-0.5, 0.35));
  float g2 = length(p - vec2(0.55, -0.42));
  float g3 = length(p - vec2(0.18, 0.12));
  col += uColorA * exp(-g1 * g1 * 5.0) * 0.42;
  col += uColorB * exp(-g2 * g2 * 6.5) * 0.30;
  col += uColorC * exp(-g3 * g3 * 8.0) * 0.22;

  float vig = smoothstep(1.5, 0.35, length(p));
  col *= mix(0.75, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default function Backdrop() {
  const { size } = useThree();
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1.6 },
      uColorA: { value: new THREE.Color("#6d4dff") },
      uColorB: { value: new THREE.Color("#22e4ff") },
      uColorC: { value: new THREE.Color("#ff4ecd") },
    }),
    []
  );

  useEffect(() => {
    if (!palette?.length) return;
    uniforms.uColorA.value.set(palette[0].hex);
    uniforms.uColorB.value.set(
      (palette[1] ?? palette[0]).hex
    );
    uniforms.uColorC.value.set(
      (palette[2] ?? palette[palette.length - 1]).hex
    );
  }, [palette, uniforms]);

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uAspect.value = size.width / Math.max(1, size.height);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
