"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { usePlayer } from "@/store/player-store";

export default function Rig() {
  const target = useRef({ x: 0, y: 0 });
  const mode = usePlayer((s) => s.visualMode);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      target.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.current.y = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame(({ camera }, delta) => {
    if (mode === "tunnel" || mode === "metaballs" || mode === "nebula") return;
    const k = Math.min(1, delta * 2.2);
    camera.position.x += (target.current.x * 0.55 - camera.position.x) * k;
    camera.position.y += (target.current.y * 0.35 - camera.position.y) * k;
    camera.position.z += (4.4 - camera.position.z) * k;
    camera.lookAt(0, 0, 0);
  });

  return null;
}
