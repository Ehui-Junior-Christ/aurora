"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { BeatDetector } from "@/lib/beat";
import { seededRandom } from "@/lib/hash";
import { usePlayer } from "@/store/player-store";
import { fragmentShader, vertexShader } from "@/lib/shaders";

export default function Blob() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const smooth = useMemo(() => ({ bass: 0, mid: 0, treble: 0 }), []);
  const beat = useMemo(() => new BeatDetector(), []);

  const detail = useMemo(
    () =>
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 ? 36 : 64,
    []
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: Math.random() * 100 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uSeed: { value: 12.34 },
      uNoiseFreq: { value: 1.7 },
      uFlowSpeed: { value: 0.5 },
      uAmpMul: { value: 1 },
      uColorA: { value: new THREE.Color("#6d4dff") },
      uColorB: { value: new THREE.Color("#22e4ff") },
      uColorC: { value: new THREE.Color("#ff4ecd") },
    }),
    []
  );

  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const seed = usePlayer((s) => s.tracks[s.current]?.seed ?? 0);
  const ambient = usePlayer((s) => s.ambient);
  const preset = usePlayer((s) => s.visualPreset);

  useEffect(() => {
    const rand = seededRandom(seed);
    uniforms.uSeed.value = rand(1) * 80;
    uniforms.uNoiseFreq.value = (1.25 + rand(2) * 1.5) * preset.freq;
    uniforms.uFlowSpeed.value = (0.32 + rand(3) * 0.55) * preset.speed;
    uniforms.uAmpMul.value = preset.amp;

    const colors =
      palette && palette.length > 0
        ? [
            palette[0],
            palette[1] ?? palette[0],
            palette[2] ?? palette[palette.length - 1],
          ]
        : null;
    if (colors) {
      uniforms.uColorA.value.set(colors[0].hex);
      uniforms.uColorB.value.set(colors[1].hex);
      uniforms.uColorC.value.set(colors[2].hex);
    }
  }, [palette, seed, preset, uniforms]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const elapsed = state.clock.elapsedTime;
    const b = ambient
      ? {
          bass: 0.16 + 0.1 * Math.sin(elapsed * 0.4),
          mid: 0.1 + 0.06 * Math.sin(elapsed * 0.27 + 1.3),
          treble: 0.07 + 0.04 * Math.sin(elapsed * 0.19 + 2.1),
        }
      : engine.bands();
    const k = Math.min(1, d * (ambient ? 2 : 9));
    smooth.bass += (b.bass - smooth.bass) * k;
    smooth.mid += (b.mid - smooth.mid) * k;
    smooth.treble += (b.treble - smooth.treble) * k;
    beat.update(b.bass, state.clock.elapsedTime, d);

    uniforms.uTime.value += d * (0.4 + smooth.bass * 0.85);
    uniforms.uBass.value = smooth.bass;
    uniforms.uMid.value = smooth.mid;
    uniforms.uTreble.value = smooth.treble;
    uniforms.uBeat.value = beat.value;

    const mesh = meshRef.current;
    mesh.rotation.y += d * (0.06 + smooth.mid * 0.12);
    mesh.rotation.z += d * 0.03;
    mesh.scale.setScalar(1 + smooth.bass * 0.08 + beat.value * 0.05);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.32, detail]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
      />
    </mesh>
  );
}
