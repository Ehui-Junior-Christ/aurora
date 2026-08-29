"use client";

import { useState, useRef, useEffect } from "react";
import UnifiedSearch from "./UnifiedSearch";

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.4 10.4 3.1 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function FloatingSearch() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {!open ? (
        <button
          type="button"
          data-cursor="magnetic"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center gap-3 rounded-full border border-white/12 bg-white/5 px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-white/75 backdrop-blur-md transition-all hover:border-white/35 hover:text-white"
        >
          <SearchIcon />
          Rechercher
        </button>
      ) : (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <UnifiedSearch compact onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
