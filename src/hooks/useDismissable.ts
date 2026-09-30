"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

interface Options {
  /** Elements that must not count as an "outside" click (usually the trigger). */
  ignore?: RefObject<HTMLElement | null>[];
  /** Move focus into the panel on open and back to the opener on close. */
  manageFocus?: boolean;
  /** Close when clicking outside. Defaults to true. */
  outside?: boolean;
  enabled?: boolean;
}

/**
 * Popover/dialog plumbing: Escape and outside click close the panel,
 * focus moves inside on open and returns to the opener on close.
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { ignore = [], manageFocus = true, outside = true, enabled = true }: Options = {}
): void {
  const closeRef = useRef(onClose);
  const ignoreRef = useRef(ignore);

  useEffect(() => {
    closeRef.current = onClose;
    ignoreRef.current = ignore;
  });

  useEffect(() => {
    if (!enabled) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (manageFocus) {
      const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      // Do not steal focus from an input the user is typing in elsewhere.
      if (first) first.focus({ preventScroll: true });
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !ref.current) return;
      if (ref.current.contains(target)) return;
      if (ignoreRef.current.some((r) => r.current?.contains(target))) return;
      closeRef.current();
    };

    document.addEventListener("keydown", onKey);
    if (outside) document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      if (manageFocus && opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [enabled, manageFocus, outside, ref]);
}
