"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { engine } from "@/lib/audio-engine";
import { usePlayer } from "@/store/player-store";

const COUNT = 64;
const SPACING = 1.35;
const TOTAL = COUNT * SPACING;
const DEFAULT_COLORS = ["#6d4dff", "#22e4ff", "#ff4ecd"];
const dummy = new THREE.Object3D();
const color = new THREE.Color();

export default function Tunnel() {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const scroll = useRef(0);
  const palette = usePlayer((s) => s.tracks[s.current]?.palette);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    for (let i = 0; i < COUNT; i++) {
      const hex = palette?.length
        ? [
            palette[0],
            palette[1] ?? palette[0],
            palette[2] ?? palette[palette.length - 1],
          ][i % 3].hex
        : DEFAULT_COLORS[i % 3];
      color.set(hex);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [palette]);

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const b = engine.bands();
    scroll.current += d * (2.2 + b.bass * 5.5);

    const cam = state.camera;
    const k = Math.min(1, d * 2.5);
    cam.position.x += (0 - cam.position.x) * k;
    cam.position.y += (0 - cam.position.y) * k;
    cam.position.z += (2.2 - cam.position.z) * k;
    cam.lookAt(0, 0, -30);

    const mesh = meshRef.current;
    for (let i = 0; i < COUNT; i++) {
      const wrapped = (((i * SPACING + scroll.current) % TOTAL) + TOTAL) % TOTAL;
      const z = 2.2 - wrapped;
      const prox = Math.max(0, 1 - Math.abs(z + 4) / 16);
      dummy.position.set(Math.sin(i * 0.7) * 0.35, Math.cos(i * 0.9) * 0.35, z);
      dummy.rotation.z = i * 0.22 + state.clock.elapsedTime * 0.12;
      dummy.scale.setScalar(0.9 + b.bass * 0.55 + prox * 0.65);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <torusGeometry args={[1.15, 0.03, 8, 96]} />
      <meshBasicMaterial transparent opacity={0.85} />
    </instancedMesh>
  );
}
