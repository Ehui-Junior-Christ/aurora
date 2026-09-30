"use client";

import { useMemo } from "react";
import { usePlayer } from "@/store/player-store";
import { queryLibrary, type LibraryQuery } from "@/lib/library-query";
import type { Track } from "@/lib/types";

/**
 * Sorted / filtered / searched view of the library. Returns the tracks and,
 * for each, its index in `usePlayer().tracks` (pass it to `play(index)`).
 */
export function useLibraryQuery(query: LibraryQuery): {
  tracks: Track[];
  indices: number[];
} {
  const tracks = usePlayer((s) => s.tracks);
  const plays = usePlayer((s) => s.stats.plays);
  const { search, sort, direction, filter } = query;
  const filterKey = JSON.stringify(filter ?? null);

  return useMemo(() => {
    const result = queryLibrary(
      tracks,
      { search, sort, direction, filter: filterKey === "null" ? undefined : JSON.parse(filterKey) },
      { plays: sort === "plays" ? plays : undefined }
    );
    const position = new Map<Track, number>();
    tracks.forEach((t, i) => position.set(t, i));
    return { tracks: result, indices: result.map((t) => position.get(t) ?? -1) };
    // `plays` only matters for the "plays" sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, search, sort, direction, filterKey, sort === "plays" ? plays : null]);
}
