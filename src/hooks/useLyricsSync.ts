"use client";

import { useCallback, useState } from "react";
import { engine } from "@/lib/audio-engine";
import {
  createSyncSession,
  isSyncComplete,
  linesFromText,
  nudgeLine,
  seekCursor,
  sessionToCues,
  tapLine,
  undoTap,
  type SyncSession,
} from "@/lib/lrc-sync";
import { usePlayer } from "@/store/player-store";

/**
 * Tap-to-sync editor state for the current track. Typical flow:
 * start(pastedText) → play → tap() on each line start → save().
 */
export function useLyricsSync() {
  const [session, setSession] = useState<SyncSession | null>(null);

  const start = useCallback((text?: string) => {
    const { lyrics } = usePlayer.getState();
    const lines = text ? linesFromText(text) : lyrics.map((c) => c.text);
    setSession(lines.length > 0 ? createSyncSession(lines, text ? undefined : lyrics) : null);
  }, []);

  const tap = useCallback(() => {
    setSession((s) => (s ? tapLine(s, engine.currentTime) : s));
  }, []);

  const undo = useCallback(() => setSession((s) => (s ? undoTap(s) : s)), []);

  const goTo = useCallback(
    (index: number) => setSession((s) => (s ? seekCursor(s, index) : s)),
    []
  );

  const nudge = useCallback(
    (index: number, delta: number) =>
      setSession((s) => (s ? nudgeLine(s, index, delta) : s)),
    []
  );

  const save = useCallback(async () => {
    const state = usePlayer.getState();
    const track = state.tracks[state.current];
    if (!session || !track) return false;
    await state.setUserLyrics(track.id, sessionToCues(session));
    setSession(null);
    return true;
  }, [session]);

  const cancel = useCallback(() => setSession(null), []);

  return {
    session,
    complete: session ? isSyncComplete(session) : false,
    start,
    tap,
    undo,
    goTo,
    nudge,
    save,
    cancel,
  };
}
