"use client";

import { usePlayer } from "@/store/player-store";

interface PipWindow extends Window {
  documentPictureInPicture?: {
    requestWindow: (options?: {
      width?: number;
      height?: number;
    }) => Promise<Window>;
  };
}

export function supportsPip(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as PipWindow).documentPictureInPicture);
}

export async function openPipPlayer(): Promise<void> {
  const pip = (window as PipWindow).documentPictureInPicture;
  if (!pip) return;
  const win = await pip.requestWindow({ width: 400, height: 200 });

  const style = win.document.createElement("style");
  style.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #050508;
      color: #f5f5f7;
      font-family: system-ui, -apple-system, sans-serif;
      height: 100vh;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      overflow: hidden;
    }
    .cover {
      width: 84px; height: 84px; border-radius: 14px;
      object-fit: cover; flex-shrink: 0;
      background: linear-gradient(135deg, #6d4dff, #ff4ecd);
    }
    .meta { min-width: 0; flex: 1; }
    .title { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist { font-size: 11px; opacity: 0.5; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .controls { display: flex; gap: 6px; margin-top: 10px; }
    button {
      background: rgba(255,255,255,0.08); color: #fff;
      border: 1px solid rgba(255,255,255,0.14); border-radius: 999px;
      width: 34px; height: 34px; cursor: pointer; font-size: 12px;
      display: grid; place-items: center;
    }
    button:hover { background: rgba(255,255,255,0.16); }
    .play { width: 42px; height: 42px; }
  `;
  win.document.head.append(style);

  const body = win.document.body;
  body.innerHTML = `
    <img class="cover" alt="" />
    <div class="meta">
      <p class="title"></p>
      <p class="artist"></p>
      <div class="controls">
        <button data-action="prev" aria-label="Précédent">⏮</button>
        <button data-action="toggle" class="play" aria-label="Lecture">▶</button>
        <button data-action="next" aria-label="Suivant">⏭</button>
      </div>
    </div>
  `;

  const cover = body.querySelector<HTMLImageElement>(".cover")!;
  const titleEl = body.querySelector<HTMLElement>(".title")!;
  const artistEl = body.querySelector<HTMLElement>(".artist")!;
  const playBtn = body.querySelector<HTMLButtonElement>('[data-action="toggle"]')!;

  const sync = () => {
    const state = usePlayer.getState();
    const track = state.tracks[state.current];
    if (track) {
      if (track.coverUrl && cover.src !== track.coverUrl) cover.src = track.coverUrl;
      titleEl.textContent = track.title;
      artistEl.textContent = `${track.artist} · ${track.album}`;
    } else {
      titleEl.textContent = "AURORA";
      artistEl.textContent = "Aucune piste";
    }
    playBtn.textContent = state.playing ? "⏸" : "▶";
  };

  sync();
  const unsubscribe = usePlayer.subscribe(sync);

  body.querySelector('[data-action="prev"]')?.addEventListener("click", () => {
    usePlayer.getState().prev();
  });
  playBtn.addEventListener("click", () => {
    usePlayer.getState().toggle();
  });
  body.querySelector('[data-action="next"]')?.addEventListener("click", () => {
    usePlayer.getState().next();
  });

  win.addEventListener("pagehide", () => unsubscribe(), { once: true });
}
