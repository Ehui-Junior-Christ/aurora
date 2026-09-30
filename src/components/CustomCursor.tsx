"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CustomCursor.module.css";

interface CursorState {
  x: number;
  y: number;
  rx: number;
  ry: number;
  sx: number;
  sy: number;
  visible: boolean;
  down: boolean;
}

export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const state: CursorState = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      rx: window.innerWidth / 2,
      ry: window.innerHeight / 2,
      sx: 1,
      sy: 1,
      visible: false,
      down: false,
    };

    let activeEl: HTMLElement | null = null;
    let stretch = false;
    let play = false;
    let text = false;
    let mode = "";

    const TEXT_FIELDS =
      'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';

    // Delegated hover detection: no subtree observer, no periodic rebinding.
    const onOver = (event: PointerEvent) => {
      const el = event.target as Element | null;
      text = !!el?.closest(TEXT_FIELDS);
      const target = text ? null : (el?.closest<HTMLElement>("[data-cursor]") ?? null);
      if (target === activeEl) return;
      activeEl = target;
      stretch = target?.dataset.cursor === "stretch";
      play = target?.dataset.cursor === "play";
    };
    document.addEventListener("pointerover", onOver, { passive: true });

    const onMove = (event: MouseEvent) => {
      state.x = event.clientX;
      state.y = event.clientY;
      state.visible = true;
    };
    const onDown = () => {
      state.down = true;
    };
    const onUp = () => {
      state.down = false;
    };
    const onDocLeave = () => {
      state.visible = false;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.documentElement.addEventListener("mouseleave", onDocLeave);

    let raf = 0;
    const loop = () => {
      if (activeEl && !activeEl.isConnected) {
        activeEl = null;
        stretch = false;
        play = false;
      }
      // Modes: text caret, play badge, drag (pressing a stretch target).
      const nextMode = text ? "text" : play ? "play" : stretch && state.down ? "drag" : "";
      if (nextMode !== mode) {
        mode = nextMode;
        if (ringRef.current) ringRef.current.dataset.mode = mode;
        if (dotRef.current) dotRef.current.dataset.mode = mode;
      }

      let tx = state.x;
      let ty = state.y;
      if (activeEl && !play) {
        const rect = activeEl.getBoundingClientRect();
        tx = rect.left + rect.width / 2 + (state.x - rect.left - rect.width / 2) * 0.55;
        ty = rect.top + rect.height / 2 + (state.y - rect.top - rect.height / 2) * 0.55;
      }
      const follow = text || play ? 0.35 : 0.18;
      state.rx += (tx - state.rx) * follow;
      state.ry += (ty - state.ry) * follow;

      const magnet = activeEl && !play;
      const targetSx = mode === "drag" ? 3 : stretch ? 2.4 : magnet ? 1.5 : 1;
      const targetSy = mode === "drag" ? 0.35 : stretch ? 0.55 : magnet ? 1.5 : 1;
      state.sx += (targetSx - state.sx) * 0.22;
      state.sy += (targetSy - state.sy) * 0.22;

      const pressScale = state.down && mode !== "drag" ? 0.82 : 1;
      const opacity = state.visible ? 1 : 0;

      // Both elements are centred by CSS (translate: -50% -50%), so size
      // changes per mode keep them anchored on the pointer.
      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${state.rx}px, ${state.ry}px) ` +
          `scale(${state.sx * pressScale}, ${state.sy * pressScale})`;
        ringRef.current.style.opacity = String(opacity);
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${state.x}px, ${state.y}px)`;
        dotRef.current.style.opacity = String(opacity);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerover", onOver);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.documentElement.removeEventListener("mouseleave", onDocLeave);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div ref={ringRef} className={styles.ring} aria-hidden="true" />
      <div ref={dotRef} className={styles.dot} aria-hidden="true" />
    </>
  );
}
