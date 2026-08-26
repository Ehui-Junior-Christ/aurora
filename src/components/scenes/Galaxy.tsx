"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { BeatDetector } from "@/lib/beat";
import { usePlayer } from "@/store/player-store";

const COUNT = 5000;
const ARMS = 3;

export default function Galaxy() {
  const pointsRef = useRef<THREE.Points>(null!);
  const materialRef = useRef<THREE.PointsMaterial>(null!);
  const beat = useMemo(() => new BeatDetector(), []);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);
  const ambient = usePlayer((s) => s.ambient);

  const geometry = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const base = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const t = Math.pow(Math.random(), 0.65) * 3.4;
      const arm = i % ARMS;
      const jitter = (Math.random() - 0.5) * (0.5 - t * 0.09);
      const angle = t * 2.1 + (arm * Math.PI * 2) / ARMS + jitter;
      const y = (Math.random() - 0.5) * 0.32 * (1.4 - t / 3.4);
      positions[i * 3] = Math.cos(angle) * t;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * t;
      const frac = t / 3.4;
      base[i * 3] = frac;
      base[i * 3 + 1] = Math.random();
      base[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.userData.base = base;
    return geo;
  }, []);

  useEffect(() => {
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    const base = geometry.userData.base as Float32Array;
    const trio = palette?.length
      ? [
          palette[0],
          palette[1] ?? palette[0],
          palette[2] ?? palette[palette.length - 1],
        ]
      : null;
    const cA = new THREE.Color(trio ? trio[0].hex : "#6d4dff");
    const cB = new THREE.Color(trio ? trio[1].hex : "#22e4ff");
    const cC = new THREE.Color(trio ? trio[2].hex : "#ff4ecd");
    const tmp = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const frac = base[i * 3];
      const rnd = base[i * 3 + 1];
      if (frac < 0.25) {
        tmp.copy(cC).lerp(new THREE.Color(1, 1, 1), 0.55 - frac);
      } else {
        tmp.copy(cA).lerp(cB, frac).lerp(new THREE.Color(1, 1, 1), rnd * 0.18);
      }
      colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    colors.needsUpdate = true;
    if (materialRef.current) materialRef.current.color.set("#ffffff");
  }, [palette, geometry]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const elapsed = state.clock.elapsedTime;
    const b = ambient
      ? { bass: 0.14, mid: 0.08 + 0.04 * Math.sin(elapsed * 0.3), treble: 0.06 }
      : engine.bands();
    beat.update(ambient ? 0 : b.bass, elapsed, d);
    const points = pointsRef.current;
    points.rotation.y += d * (0.06 + b.mid * 0.3 + beat.value * 0.1);
    points.rotation.x = 0.45 + Math.sin(elapsed * 0.1) * 0.06;
    const mat = materialRef.current;
    mat.size = 0.02 + b.bass * 0.022 + beat.value * 0.012;
    mat.opacity = ambient ? 0.5 : 0.75 + b.treble * 0.25;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        size={0.022}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
