"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { usePlayer } from "@/store/player-store";
import { COMMON_GLSL, easeCamera, paletteTrio, useAudioFrame, useFullscreenShader } from "./kit";

/**
 * Hyperespace: instanced star streaks rushing past the camera. The energy
 * drives the jump speed (streaks stretch with it), kicks punch a boost and a
 * flash at the vanishing point, highs brighten the heads.
 */
const HIGH_COUNT = 2600;
const LOW_COUNT = 1100;
const DEPTH = 70;

const streakVertex = /* glsl */ `
attribute vec4 aStar; // angle, radius, phase, tint
uniform float uTravel;
uniform float uStretch;
uniform float uDepth;
varying float vAlong;
varying float vFade;
varying float vTint;
void main() {
  float along = position.y + 0.5; // 0 = head, 1 = tail
  float zHead = -uDepth + mod(aStar.z * uDepth + uTravel * (0.75 + aStar.w * 0.5), uDepth + 2.0);
  float len = uStretch * (0.6 + aStar.w * 0.8);
  float z = zHead - along * len;
  vec2 dir = vec2(cos(aStar.x), sin(aStar.x));
  vec2 tangent = vec2(-dir.y, dir.x);
  float width = 0.018 + aStar.w * 0.02;
  vec3 p = vec3(dir * aStar.y + tangent * position.x * width, z);
  vAlong = along;
  vTint = aStar.w;
  vFade = smoothstep(-uDepth, -uDepth * 0.55, zHead) * smoothstep(1.5, -0.5, zHead);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const streakFragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTreble;
uniform float uBeat;
varying float vAlong;
varying float vFade;
varying float vTint;
void main() {
  vec3 tint = vTint < 0.5 ? mix(uColorA, uColorB, vTint * 2.0) : mix(uColorB, uColorC, vTint * 2.0 - 1.0);
  vec3 head = mix(tint, vec3(1.0), 0.65);
  vec3 col = mix(head, tint, smoothstep(0.0, 0.35, vAlong));
  float a = (1.0 - vAlong) * (1.0 - vAlong) * vFade;
  col *= a * (0.8 + uTreble * 1.4 + uBeat * 0.6);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const backgroundFragment = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uBeat;
uniform float uEnergy;
uniform float uSeed;
uniform float uAspect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uSpeed;
varying vec2 vUv;
${COMMON_GLSL}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = vec3(0.008, 0.008, 0.018);
  // Radial tunnel haze streaming outward.
  float z = 0.35 / max(r, 0.02) + uTime * (0.4 + uSpeed * 0.08);
  float haze = fbm(vec2(a * 3.0 + uSeed * 20.0, z), 3);
  haze = smoothstep(0.35, 0.9, haze) * smoothstep(0.05, 0.5, r) * exp(-r * 1.2);
  col += mix(uColorA, uColorC, 0.5 + 0.5 * sin(a + uTime * 0.2)) * haze * (0.25 + uMid * 0.8);
  // Vanishing point glow, flashes on kicks.
  col += mix(uColorB, vec3(1.0), 0.35) * exp(-r * (9.0 - uBeat * 4.0)) * (0.35 + uBass * 0.8 + uBeat * 1.2);
  col *= 1.0 - smoothstep(0.6, 1.3, r) * 0.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += grain(gl_FragCoord.xy, uTime) * 0.022;
}
`;

export default function Warp() {
  const qualityLow = usePlayer((s) => s.qualityLow);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const count = qualityLow ? LOW_COUNT : HIGH_COUNT;
  const groupRef = useRef<THREE.Group>(null!);
  const motion = useRef({ travel: 0, speed: 6, boost: 0 });

  const bgExtra = useMemo(() => ({ uSpeed: { value: 6 } }), []);
  const { material: background } = useFullscreenShader(backgroundFragment, undefined, bgExtra);

  const uniforms = useMemo(
    () => ({
      uTravel: { value: 0 },
      uStretch: { value: 1 },
      uDepth: { value: DEPTH },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
    }),
    []
  );

  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1, 1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute("position", plane.getAttribute("position"));
    const data = new Float32Array(HIGH_COUNT * 4);
    for (let i = 0; i < HIGH_COUNT; i++) {
      data[i * 4] = Math.random() * Math.PI * 2;
      data[i * 4 + 1] = 0.35 + Math.pow(Math.random(), 0.6) * 7.5;
      data[i * 4 + 2] = Math.random();
      data[i * 4 + 3] = Math.random();
    }
    g.setAttribute("aStar", new THREE.InstancedBufferAttribute(data, 4));
    plane.dispose();
    return g;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: streakVertex,
        fragmentShader: streakFragment,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [uniforms]
  );

  useEffect(() => {
    geometry.instanceCount = count;
  }, [count, geometry]);

  useEffect(() => {
    const [a, b, c] = paletteTrio(palette);
    uniforms.uColorA.value.set(a);
    uniforms.uColorB.value.set(b);
    uniforms.uColorC.value.set(c);
  }, [palette, uniforms]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useAudioFrame((f, state) => {
    const m = motion.current;
    if (f.kick && !f.reduced) m.boost = Math.min(2, m.boost + 1);
    m.boost *= Math.exp(-f.rawDt * 3);
    const target = (f.reduced ? 2.5 : 5) + f.energy * f.amp * (f.reduced ? 12 : 42) + m.boost * 18 + f.mix * (f.reduced ? 8 : 55);
    m.speed += (target - m.speed) * Math.min(1, f.rawDt * 3);
    m.travel += m.speed * f.rawDt * f.speed;
    uniforms.uTravel.value = m.travel;
    uniforms.uStretch.value = 0.25 + m.speed * 0.16;
    uniforms.uTreble.value = f.treble * f.amp;
    uniforms.uBeat.value = f.beat;
    bgExtra.uSpeed.value = m.speed;
    groupRef.current.rotation.z += f.dt * (0.04 + f.mid * 0.12);
    easeCamera(state.camera, 0, 0, 1, f.rawDt, [0, 0, -20]);
  });

  return (
    <>
      <mesh frustumCulled={false} renderOrder={-5} material={background}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <group ref={groupRef}>
        <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
      </group>
    </>
  );
}
