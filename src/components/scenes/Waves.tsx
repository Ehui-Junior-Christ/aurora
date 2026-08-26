"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";

const BINS = 220;

export default function Waves() {
  const pointsRef = useRef<THREE.Points>(null!);
  const materialRef = useRef<THREE.PointsMaterial>(null!);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const ambient = usePlayer((s) => s.ambient);

  const spectrum = useMemo(() => new Uint8Array(BINS), []);
  const smoothed = useMemo(() => new Float32Array(BINS), []);

  const geometry = useMemo(() => {
    const positions = new Float32Array(BINS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const elapsed = state.clock.elapsedTime;
    if (ambient) {
      for (let i = 0; i < BINS; i++) {
        smoothed[i] =
          0.12 +
          0.08 * Math.sin(elapsed * 0.6 + (i / BINS) * Math.PI * 4) +
          0.05 * Math.sin(elapsed * 0.35 + i * 0.12);
      }
    } else {
      engine.getSpectrum(spectrum);
      for (let i = 0; i < BINS; i++) {
        const v = (spectrum[i] / 255) ** 1.3;
        smoothed[i] += (v - smoothed[i]) * Math.min(1, d * 14);
      }
    }

    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < BINS; i++) {
      const angle = (i / BINS) * Math.PI * 2;
      const r = 1.45 + smoothed[i] * 1.15;
      positions.setXYZ(
        i,
        Math.cos(angle) * r,
        Math.sin(angle) * r * 0.62,
        Math.sin(angle * 2 + elapsed * 0.4) * 0.12
      );
    }
    positions.needsUpdate = true;

    const points = pointsRef.current;
    points.rotation.z += d * 0.08;
    points.rotation.x = -0.35 + Math.sin(elapsed * 0.15) * 0.08;
    const mat = materialRef.current;
    mat.size = 0.03 + smoothed.reduce((a, b) => a + b, 0) / BINS * 0.05;
  });

  useEffect(() => {
    if (palette?.[1]) {
      materialRef.current.color.set(palette[1].hex);
    }
  }, [palette]);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        size={0.035}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        color="#22e4ff"
      />
    </points>
  );
}
