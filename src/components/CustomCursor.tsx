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

    const collectTargets = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-cursor]"));

    let targets = collectTargets();
    const observer = new MutationObserver(() => {
      targets = collectTargets();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onEnter = (event: Event) => {
      activeEl = event.currentTarget as HTMLElement;
      stretch = activeEl.dataset.cursor === "stretch";
    };
    const onLeave = () => {
      activeEl = null;
      stretch = false;
    };

    const bind = () => {
      targets.forEach((target) => {
        target.removeEventListener("mouseenter", onEnter);
        target.removeEventListener("mouseleave", onLeave);
        target.addEventListener("mouseenter", onEnter);
        target.addEventListener("mouseleave", onLeave);
      });
    };
    bind();
    const rebindInterval = window.setInterval(bind, 1500);

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
      let tx = state.x;
      let ty = state.y;
      if (activeEl) {
        const rect = activeEl.getBoundingClientRect();
        tx = rect.left + rect.width / 2 + (state.x - rect.left - rect.width / 2) * 0.55;
        ty = rect.top + rect.height / 2 + (state.y - rect.top - rect.height / 2) * 0.55;
      }
      state.rx += (tx - state.rx) * 0.18;
      state.ry += (ty - state.ry) * 0.18;

      const targetSx = stretch ? 2.4 : activeEl ? 1.5 : 1;
      const targetSy = stretch ? 0.55 : activeEl ? 1.5 : 1;
      state.sx += (targetSx - state.sx) * 0.22;
      state.sy += (targetSy - state.sy) * 0.22;

      const pressScale = state.down ? 0.82 : 1;
      const opacity = state.visible ? 1 : 0;

      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${state.rx - 20}px, ${state.ry - 20}px) ` +
          `scale(${state.sx * pressScale}, ${state.sy * pressScale})`;
        ringRef.current.style.opacity = String(opacity);
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${state.x - 3}px, ${state.y - 3}px)`;
        dotRef.current.style.opacity = String(opacity);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.clearInterval(rebindInterval);
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
