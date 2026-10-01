import { analyzeMix } from "./analyze";
import type { MixAnalysis } from "./types";

/**
 * Main-thread bridge to the analysis worker (one shared worker, requests
 * processed in order). Falls back to the main thread if workers fail.
 */

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: MixAnalysis | null) => void; timer: ReturnType<typeof setTimeout> }
>();

function getWorker(): Worker | null {
  if (broken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./analysis.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ requestId: number; result?: MixAnalysis; error?: string }>) => {
      const req = pending.get(event.data.requestId);
      if (!req) return;
      pending.delete(event.data.requestId);
      clearTimeout(req.timer);
      req.resolve(event.data.result ?? null);
    };
    worker.onerror = () => {
      broken = true;
      worker?.terminate();
      worker = null;
      for (const [, req] of pending) {
        clearTimeout(req.timer);
        req.resolve(null);
      }
      pending.clear();
    };
  } catch {
    broken = true;
    worker = null;
  }
  return worker;
}

/**
 * Analyses a mono signal. The buffer is transferred to the worker (the
 * caller must not use `mono` afterwards).
 */
export function analyzeMixAsync(
  mono: Float32Array,
  sampleRate: number,
  silence?: { start: number; end: number }
): Promise<MixAnalysis | null> {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          resolve(analyzeMix(mono, sampleRate, silence));
        } catch {
          resolve(null);
        }
      }, 0);
    });
  }
  return new Promise((resolve) => {
    const requestId = ++seq;
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, 120000);
    pending.set(requestId, { resolve, timer });
    w.postMessage({ requestId, mono, sampleRate, silence }, [mono.buffer]);
  });
}
