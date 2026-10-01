import gsap from "gsap";
import { prefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Shared motion language (UI layer only).
 * - Default tween: expo.out, 0.6s.
 * - Reduced motion: every GSAP tween collapses to a 0.2s fade-friendly timing.
 * - Magnetic hero buttons ([data-magnetic]) on fine pointers.
 */

let initialised = false;

export const EASE_OUT = "expo.out";
export const MAGNET_RETURN = "elastic.out(1,0.4)";

export function setupMotion(): () => void {
  if (initialised || typeof window === "undefined") return () => {};
  initialised = true;

  gsap.defaults({ ease: EASE_OUT, duration: 0.6 });

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: reduce)", () => {
    gsap.defaults({ ease: "none", duration: 0.2 });
    return () => gsap.defaults({ ease: EASE_OUT, duration: 0.6 });
  });

  const stopMagnetic = initMagnetic();
  return () => {
    stopMagnetic();
    mm.revert();
    initialised = false;
  };
}

/**
 * Delegated magnetic effect: the element drifts toward the pointer by at most
 * 25% of the pointer-to-centre vector and springs back on leave. It animates
 * the --mx/--my custom properties (applied through the CSS `translate`
 * property) so `transform`-based press/hover states keep working.
 */
function initMagnetic(): () => void {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  let active: HTMLElement | null = null;

  const release = (el: HTMLElement) => {
    gsap.to(el, { "--mx": "0px", "--my": "0px", duration: 0.9, ease: MAGNET_RETURN, overwrite: true });
  };

  const onMove = (event: PointerEvent) => {
    if (!fine.matches || prefersReducedMotion()) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-magnetic]") ?? null;
    if (active && active !== target) {
      release(active);
      active = null;
    }
    if (!target) return;
    active = target;
    const rect = target.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) * 0.25;
    const dy = (event.clientY - (rect.top + rect.height / 2)) * 0.25;
    gsap.to(target, { "--mx": `${dx}px`, "--my": `${dy}px`, duration: 0.4, ease: "power3.out", overwrite: true });
  };

  const onLeaveWindow = () => {
    if (active) release(active);
    active = null;
  };

  document.addEventListener("pointermove", onMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeaveWindow);
  return () => {
    document.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeaveWindow);
  };
}
