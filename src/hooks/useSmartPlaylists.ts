"use client";

import { useMemo } from "react";
import { usePlayer } from "@/store/player-store";
import {
  BUILTIN_SMART_PLAYLISTS,
  resolveSmartPlaylist,
  type SmartPlaylist,
} from "@/lib/smart-playlists";
import type { Track } from "@/lib/types";

export interface ResolvedSmartPlaylist {
  playlist: SmartPlaylist;
  tracks: Track[];
}

/**
 * Built-in + user smart playlists, resolved live against the library and
 * stats. `hideEmpty` drops lists that currently match nothing.
 */
export function useSmartPlaylists(hideEmpty = false): ResolvedSmartPlaylist[] {
  const tracks = usePlayer((s) => s.tracks);
  const stats = usePlayer((s) => s.stats);
  const user = usePlayer((s) => s.smartPlaylists);
  return useMemo(() => {
    const now = Date.now();
    return [...BUILTIN_SMART_PLAYLISTS, ...user]
      .map((playlist) => ({
        playlist,
        tracks: resolveSmartPlaylist(playlist, tracks, { stats, now }),
      }))
      .filter((r) => !hideEmpty || r.tracks.length > 0);
  }, [tracks, stats, user, hideEmpty]);
}
