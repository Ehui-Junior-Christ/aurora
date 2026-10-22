"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchCatalog, type CatalogSong } from "@/lib/catalog";

const DEBOUNCE_MS = 280;

export interface CatalogSearchState {
  /** Query the current results belong to. */
  query: string;
  results: CatalogSong[];
  loading: boolean;
  error: string | null;
}

/**
 * Debounced catalog (iTunes) search for `query`: each keystroke aborts the
 * previous request; `runNow` skips the debounce (Enter key, retry).
 */
export function useCatalogSearch(query: string): CatalogSearchState & { runNow: () => void } {
  const [state, setState] = useState<CatalogSearchState>({
    query: "",
    results: [],
    loading: false,
    error: null,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const [nonce, setNonce] = useState(0);
  const immediate = useRef(false);

  const runNow = useCallback(() => {
    immediate.current = true;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const q = query.trim();
    controllerRef.current?.abort();
    if (q.length < 2) {
      setState({ query: "", results: [], loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const delay = immediate.current ? 0 : DEBOUNCE_MS;
    immediate.current = false;
    const timer = window.setTimeout(() => {
      searchCatalog(q, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) return;
          setState({ query: q, results, loading: false, error: null });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setState({
            query: q,
            results: [],
            loading: false,
            error: err instanceof Error ? err.message : "Catalogue indisponible.",
          });
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, nonce]);

  return { ...state, runNow };
}
