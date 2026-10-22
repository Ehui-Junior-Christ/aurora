import { analyzeMix } from "./analyze";

/** Aurora Mix analysis worker: heavy DSP off the main thread. */

interface WorkerContext {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

const ctx = self as unknown as WorkerContext;

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as {
    requestId: number;
    mono: Float32Array;
    sampleRate: number;
    silence?: { start: number; end: number };
  };
  try {
    const result = analyzeMix(msg.mono, msg.sampleRate, msg.silence);
    ctx.postMessage({ requestId: msg.requestId, result });
  } catch (error) {
    ctx.postMessage({
      requestId: msg.requestId,
      error: error instanceof Error ? error.message : "mix-analysis-failed",
    });
  }
};
