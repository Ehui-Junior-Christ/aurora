"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { usePlayer } from "@/store/player-store";

const LADDER = [2, 1.5, 1.25, 1];

export default function PerfGuard() {
  const acc = useRef({ t: 0, frames: 0, step: 0, cooldown: 0 });

  useFrame((state, delta) => {
    const a = acc.current;
    a.t += delta;
    a.frames += 1;
    if (a.t < 2) return;
    const fps = a.frames / a.t;
    a.t = 0;
    a.frames = 0;
    a.cooldown -= 2;
    if (fps < 45 && a.step < LADDER.length - 1 && a.cooldown <= 0) {
      a.step += 1;
      a.cooldown = 8;
      state.setDpr(LADDER[a.step]);
      if (a.step >= 2) usePlayer.getState().setQualityLow(true);
    }
  });

  return null;
}
