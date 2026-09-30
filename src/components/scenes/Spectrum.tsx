"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";
import { easeCamera, paletteTrio, useAudioFrame } from "./kit";

/**
 * Spectre 3D: a circular city of FFT bars (mirrored so lows meet at the
 * front), gravity falloff, a glossy floor reflection and a beat-pulsed core.
 */
const HIGH_COUNT = 128;
const LOW_COUNT = 72;
const BINS = 96;
const RADIUS = 1.55;

const barVertex = /* glsl */ `
attribute float aLevel;
attribute float aAngle;
varying float vY;
varying float vLevel;
varying float vAngle;
void main() {
  vY = position.y;
  vLevel = aLevel;
  vAngle = aAngle;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const barFragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBeat;
uniform float uMirror;
varying float vY;
varying float vLevel;
varying float vAngle;
void main() {
  float side = 0.5 + 0.5 * cos(vAngle);
  vec3 low = mix(uColorA, uColorC, side);
  vec3 col = mix(low * 0.18, uColorB, pow(vY, 1.4));
  col *= 0.3 + vLevel * 0.85 + uBeat * 0.2;
  col += mix(uColorB, vec3(1.0), 0.5) * smoothstep(0.95, 1.0, vY) * (0.15 + vLevel * 0.6);
  float alpha = 1.0;
  if (uMirror > 0.5) {
    float fade = exp(-vY * 4.0) * 0.28;
    col *= fade;
    alpha = fade;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const floorVertex = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const floorFragment = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBass;
uniform float uBeat;
uniform float uTime;
uniform float uRadius;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  float a = atan(vPos.y, vPos.x);
  // Polar grid.
  float rings = abs(fract(r * 3.0 - uTime * 0.15) - 0.5);
  float spokes = abs(fract(a / 6.2831853 * 64.0) - 0.5);
  float grid = (smoothstep(0.03, 0.0, rings) + smoothstep(0.04, 0.0, spokes) * 0.4) * exp(-r * 0.7);
  vec3 col = uColorA * grid * 0.12;
  // Core glow and the ring under the bars.
  col += mix(uColorB, uColorC, 0.5) * exp(-r * r * 3.0) * (0.12 + uBass * 0.7 + uBeat * 0.4);
  col += uColorB * exp(-abs(r - uRadius) * 18.0) * (0.25 + uBeat * 0.6);
  float alpha = smoothstep(4.5, 1.5, r);
  gl_FragColor = vec4(col * alpha, alpha * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const dummy = new THREE.Object3D();

export default function Spectrum() {
  const qualityLow = usePlayer((s) => s.qualityLow);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const count = qualityLow ? LOW_COUNT : HIGH_COUNT;
  const barsRef = useRef<THREE.InstancedMesh>(null!);
  const mirrorRef = useRef<THREE.InstancedMesh>(null!);
  const orbit = useRef(0.4);
  const spectrum = useMemo(() => new Uint8Array(BINS), []);
  const heights = useMemo(() => new Float32Array(HIGH_COUNT), []);

  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const level = new THREE.InstancedBufferAttribute(new Float32Array(HIGH_COUNT), 1);
    level.setUsage(THREE.DynamicDrawUsage);
    const angle = new THREE.InstancedBufferAttribute(new Float32Array(HIGH_COUNT), 1);
    g.setAttribute("aLevel", level);
    g.setAttribute("aAngle", angle);
    return g;
  }, []);
  const floorGeometry = useMemo(() => new THREE.CircleGeometry(4.5, 96), []);

  const colors = useMemo(
    () => ({
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
      uBeat: { value: 0 },
      uBass: { value: 0 },
      uTime: { value: 0 },
      uRadius: { value: RADIUS },
    }),
    []
  );

  const materials = useMemo(() => {
    const bars = new THREE.ShaderMaterial({
      uniforms: { ...colors, uMirror: { value: 0 } },
      vertexShader: barVertex,
      fragmentShader: barFragment,
    });
    const mirror = new THREE.ShaderMaterial({
      uniforms: { ...colors, uMirror: { value: 1 } },
      vertexShader: barVertex,
      fragmentShader: barFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.ShaderMaterial({
      uniforms: colors,
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
      transparent: true,
      depthWrite: false,
    });
    return { bars, mirror, floor };
  }, [colors]);

  useEffect(() => {
    const [a, b, c] = paletteTrio(palette);
    colors.uColorA.value.set(a);
    colors.uColorB.value.set(b);
    colors.uColorC.value.set(c);
  }, [palette, colors]);

  useLayoutEffect(() => {
    const angle = geometry.getAttribute("aAngle") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < count; i++) angle.setX(i, (i / count) * Math.PI * 2);
    angle.needsUpdate = true;
  }, [count, geometry]);

  useEffect(
    () => () => {
      geometry.dispose();
      floorGeometry.dispose();
      materials.bars.dispose();
      materials.mirror.dispose();
      materials.floor.dispose();
    },
    [geometry, floorGeometry, materials]
  );

  useAudioFrame((f, state) => {
    if (f.ambient) {
      for (let i = 0; i < BINS; i++) {
        spectrum[i] =
          255 * (0.18 + 0.12 * Math.sin(f.time * 0.9 + i * 0.21) * Math.sin(f.time * 0.37 + i * 0.05));
      }
    } else {
      engine.getSpectrum(spectrum);
    }
    const level = geometry.getAttribute("aLevel") as THREE.InstancedBufferAttribute;
    const half = count / 2;
    const ringR = RADIUS * (1 + f.beat * 0.035);
    const width = ((Math.PI * 2 * ringR) / count) * 0.62;
    for (let i = 0; i < count; i++) {
      // Mirror: the bass sits at the front, highs meet at the back.
      const k = i < half ? i : count - 1 - i;
      const bin = Math.min(BINS - 1, Math.floor((k / half) * BINS * 0.92));
      // Highs are naturally quieter: tilt them up.
      const v = Math.pow(spectrum[bin] / 255, 1.4) * (1 + (bin / BINS) * 0.9) * f.amp;
      const fall = f.rawDt * (f.reduced ? 0.6 : 1.3);
      heights[i] = v > heights[i] ? heights[i] + (v - heights[i]) * Math.min(1, f.rawDt * 9) : Math.max(v, heights[i] - fall);
      const h = 0.04 + heights[i] * 1.05;
      const a = (i / count) * Math.PI * 2 + Math.PI / 2;
      dummy.position.set(Math.cos(a) * ringR, 0, Math.sin(a) * ringR);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.set(width, h, width);
      dummy.updateMatrix();
      barsRef.current.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(width, -h, width);
      dummy.updateMatrix();
      mirrorRef.current.setMatrixAt(i, dummy.matrix);
      level.setX(i, heights[i]);
    }
    barsRef.current.count = count;
    mirrorRef.current.count = count;
    barsRef.current.instanceMatrix.needsUpdate = true;
    mirrorRef.current.instanceMatrix.needsUpdate = true;
    level.needsUpdate = true;

    colors.uBeat.value = f.beat;
    colors.uBass.value = f.bass * f.amp;
    colors.uTime.value = f.time;
    colors.uRadius.value = ringR;

    // Slow orbit; framed further back on portrait screens.
    orbit.current += f.dt * (0.07 + f.mix * 0.6);
    const aspect = state.size.width / Math.max(1, state.size.height);
    const dist = 4.9 / Math.min(1, Math.max(0.5, aspect * 1.6));
    const o = orbit.current;
    easeCamera(state.camera, Math.sin(o) * dist, 2.2 + Math.sin(o * 0.7) * 0.25 + dist * 0.14, Math.cos(o) * dist, f.rawDt, [0, 0.3, 0]);
  });

  return (
    <group>
      <mesh geometry={floorGeometry} material={materials.floor} rotation-x={-Math.PI / 2} renderOrder={1} />
      <instancedMesh
        ref={mirrorRef}
        args={[geometry, materials.mirror, HIGH_COUNT]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={barsRef}
        args={[geometry, materials.bars, HIGH_COUNT]}
        frustumCulled={false}
        renderOrder={3}
      />
    </group>
  );
}
