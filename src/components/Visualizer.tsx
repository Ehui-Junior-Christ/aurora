"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { usePlayer } from "@/store/player-store";
import Blob from "./Blob";
import Particles from "./Particles";
import Rig from "./Rig";
import Backdrop from "./scenes/Backdrop";
import Borealis from "./scenes/Borealis";
import Constellation from "./scenes/Constellation";
import Liquid from "./scenes/Liquid";
import Mosaic from "./scenes/Mosaic";
import Prism from "./scenes/Prism";
import Spectrum from "./scenes/Spectrum";
import Vinyl from "./scenes/Vinyl";
import Warp from "./scenes/Warp";
import Galaxy from "./scenes/Galaxy";
import Metaballs from "./scenes/Metaballs";
import Nebula from "./scenes/Nebula";
import Tunnel from "./scenes/Tunnel";
import Waves from "./scenes/Waves";
import PerfGuard from "./PerfGuard";
import type { VisualMode } from "@/store/player-store";

/** Bloom strength per mode: artwork-based scenes keep their detail. */
const BLOOM: Partial<Record<VisualMode, number>> = {
  prism: 0.6,
  liquid: 0.8,
  vinyl: 0.55,
  mosaic: 0.45,
  borealis: 0.22,
};

function SceneContent() {
  const mode = usePlayer((s) => s.visualMode);
  const bloom = usePlayer((s) => s.bloom);
  const qualityLow = usePlayer((s) => s.qualityLow);

  return (
    <>
      <PerfGuard />
      <Backdrop />
      {mode === "organism" && (
        <>
          <Rig />
          <Blob />
          <Particles />
        </>
      )}
      {mode === "tunnel" && <Tunnel />}
      {mode === "metaballs" && <Metaballs />}
      {mode === "particles" && (
        <>
          <Rig />
          <Particles />
        </>
      )}
      {mode === "galaxy" && (
        <>
          <Rig />
          <Galaxy />
        </>
      )}
      {mode === "nebula" && <Nebula />}
      {mode === "waves" && (
        <>
          <Rig />
          <Waves />
        </>
      )}
      {mode === "borealis" && <Borealis />}
      {mode === "prism" && <Prism />}
      {mode === "liquid" && <Liquid />}
      {mode === "spectrum" && <Spectrum />}
      {mode === "vinyl" && <Vinyl />}
      {mode === "warp" && <Warp />}
      {mode === "mosaic" && (
        <>
          <Rig />
          <Mosaic />
        </>
      )}
      {mode === "constellation" && (
        <>
          <Rig />
          <Constellation />
        </>
      )}
      {bloom && !qualityLow && (
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            intensity={BLOOM[mode] ?? 1.2}
            // A small threshold keeps bloom on bright areas only: with 0, tiny
            // moving particles produced halos that shimmered frame to frame.
            luminanceThreshold={0.12}
            luminanceSmoothing={0.9}
            radius={0.8}
          />
        </EffectComposer>
      )}
    </>
  );
}

export default function Visualizer() {
  const mode = usePlayer((s) => s.visualMode);
  const [morphKey, setMorphKey] = useState(0);
  const prevMode = useRef(mode);

  useEffect(() => {
    if (prevMode.current !== mode) {
      prevMode.current = mode;
      setMorphKey((k) => k + 1);
    }
  }, [mode]);

  return (
    <div id="aurora-canvas" className="fixed inset-0 z-(--z-canvas)" aria-hidden="true">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 42, position: [0, 0, 4.4] }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        style={{ pointerEvents: "none" }}
      >
        <SceneContent />
      </Canvas>
      <div key={morphKey} className="morph-flash pointer-events-none absolute inset-0 bg-[#050508]" />
    </div>
  );
}
