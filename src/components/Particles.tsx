"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { BeatDetector } from "@/lib/beat";
import { usePlayer } from "@/store/player-store";

const COUNT = 1300;

export default function Particles() {
  const groupRef = useRef<THREE.Group>(null!);
  const materialRef = useRef<THREE.PointsMaterial>(null!);
  const beat = useMemo(() => new BeatDetector(), []);

  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 2.3 + Math.pow(Math.random(), 0.7) * 3.6;
      arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = radius * Math.cos(phi);
    }
    return arr;
  }, []);

  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const ambient = usePlayer((s) => s.ambient);

  useEffect(() => {
    if (palette?.[1]) {
      materialRef.current.color.set(palette[1].hex);
    }
  }, [palette]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const elapsed = state.clock.elapsedTime;
    const b = ambient
      ? {
          bass: 0.14 + 0.08 * Math.sin(elapsed * 0.35),
          mid: 0.09,
          treble: 0.06 + 0.04 * Math.sin(elapsed * 0.22 + 1.7),
        }
      : engine.bands();
    beat.update(ambient ? 0 : b.bass, elapsed, d);
    const group = groupRef.current;
    group.rotation.y += d * (ambient ? 0.015 : 0.02 + b.treble * 0.18 + beat.value * 0.12);
    group.rotation.x = Math.sin(group.rotation.y * 0.4) * 0.08;
    const mat = materialRef.current;
    mat.opacity = ambient
      ? 0.18
      : Math.min(1, 0.22 + b.treble * 0.5 + beat.value * 0.4);
    mat.size = 0.028 + b.bass * 0.02 + beat.value * 0.015;
  });

  return (
    <group ref={groupRef}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          size={0.028}
          sizeAttenuation
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color="#22e4ff"
        />
      </points>
    </group>
  );
}
