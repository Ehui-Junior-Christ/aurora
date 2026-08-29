"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { usePlayer } from "@/store/player-store";
import Blob from "./Blob";
import Particles from "./Particles";
import Rig from "./Rig";
import Backdrop from "./scenes/Backdrop";
import Galaxy from "./scenes/Galaxy";
import Metaballs from "./scenes/Metaballs";
import Nebula from "./scenes/Nebula";
import Tunnel from "./scenes/Tunnel";
import Waves from "./scenes/Waves";
import PerfGuard from "./PerfGuard";

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
      {bloom && !qualityLow && (
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            intensity={1.2}
            luminanceThreshold={0}
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
    <div id="aurora-canvas" className="fixed inset-0 z-[1]" aria-hidden="true">
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
