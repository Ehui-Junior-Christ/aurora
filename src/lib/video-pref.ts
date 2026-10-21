import { create } from "zustand";

/**
 * Whether the YouTube video is shown (floating card / now-playing artwork).
 * Remembered per device. Hiding it does not stop the sound.
 */
const KEY = "aurora-video-visible";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

interface VideoPref {
  visible: boolean;
  setVisible(value: boolean): void;
  toggle(): void;
}

export const useVideoPref = create<VideoPref>((set, get) => ({
  visible: typeof window === "undefined" ? true : read(),
  setVisible(visible) {
    set({ visible });
    try {
      window.localStorage.setItem(KEY, visible ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  },
  toggle() {
    get().setVisible(!get().visible);
  },
}));
