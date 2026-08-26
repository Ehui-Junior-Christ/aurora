const AUDIO_RE = /\.(mp3|wav|flac|ogg|oga|m4a|aac|opus|webm)$/i;

type FsPermissionState = "granted" | "denied" | "prompt";

interface FsNode {
  kind: "file" | "directory";
  name: string;
  values(): AsyncIterableIterator<FsNode>;
  getFile?(): Promise<File>;
  queryPermission?(descriptor: {
    mode: "read" | "readwrite";
  }): Promise<FsPermissionState>;
  requestPermission?(descriptor: {
    mode: "read" | "readwrite";
  }): Promise<FsPermissionState>;
}

export type { FsNode, FsPermissionState };

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    id?: string;
  }) => Promise<FsNode>;
};

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as PickerWindow).showDirectoryPicker === "function"
  );
}

export async function pickMusicDirectory(): Promise<FsNode | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("UNSUPPORTED_BROWSER");
  try {
    return await picker({ mode: "read", id: "aurora-music-folder" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export async function scanMusicFolder(
  dir: FsNode,
  maxDepth = 8
): Promise<{ audio: File[]; lyrics: Map<string, File> }> {
  const audio: File[] = [];
  const lyrics = new Map<string, File>();
  async function walk(node: FsNode, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    for await (const entry of node.values()) {
      if (entry.kind === "file" && entry.getFile) {
        if (AUDIO_RE.test(entry.name)) {
          try {
            audio.push(await entry.getFile());
          } catch {
            void 0;
          }
        } else if (/\.lrc$/i.test(entry.name)) {
          try {
            const base = entry.name.replace(/\.lrc$/i, "").toLowerCase();
            lyrics.set(base, await entry.getFile());
          } catch {
            void 0;
          }
        }
      } else if (entry.kind === "directory" && !entry.name.startsWith(".")) {
        await walk(entry, depth + 1);
      }
    }
  }
  await walk(dir, 0);
  return { audio, lyrics };
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").toLowerCase();
}
