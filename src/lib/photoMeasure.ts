/**
 * "Kendi resmin" sahnesinin ölçüm istemcisi: çizgi bölgesinin ölçümü (`measureLine`, 1080p'de
 * 1–3 sn) ayrı bir iş parçacığında (`photoMeasure.worker.ts`) yapılır, arayüz donmaz; Worker
 * yoksa (testler) aynı iş burada (`photoMeasureJob.ts`).
 */
import type { BarColors, LineMap } from "./photoScene";
import { measureJob, type MeasureMessage } from "./photoMeasureJob";

type Pending = Map<number, (map: LineMap | null) => void>;
let worker: Worker | null | undefined;
let local: ((message: MeasureMessage) => void) | null = null;
const pending: Pending = new Map();
let nextId = 1;

function post(message: MeasureMessage, transfer: Transferable[] = []) {
  if (worker === undefined) {
    try {
      worker =
        typeof Worker === "function"
          ? new Worker(new URL("./photoMeasure.worker.ts", import.meta.url), { type: "module" })
          : null;
    } catch {
      worker = null;
    }
    if (worker) {
      worker.onmessage = (event: MessageEvent<{ id: number; map: LineMap | null }>) => {
        const resolve = pending.get(event.data.id);
        pending.delete(event.data.id);
        resolve?.(event.data.map);
      };
      // İş parçacığı açılamadıysa (ör. dosya yüklenemedi) ölçüm burada yapılır.
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        for (const resolve of pending.values()) resolve(null);
        pending.clear();
      };
    }
  }
  if (worker) {
    worker.postMessage(message, transfer);
    return;
  }
  local ??= measureJob((id, map) => {
    const resolve = pending.get(id);
    pending.delete(id);
    // Yerelde de eşzamansız: çağıran gibi bir sonraki görevde.
    if (resolve) setTimeout(() => resolve(map), 0);
  });
  local(message);
}

function request(id: number): Promise<LineMap | null> {
  return new Promise((resolve) => pending.set(id, resolve));
}

/** Sabit resmin ölçümü (`rgba` ölçüm boyunda, ekrandaki gibi kırpılmış). */
export function measureStill(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  colors: BarColors,
): Promise<LineMap | null> {
  const id = nextId++;
  const result = request(id);
  post({ type: "still", id, rgba, width, height, colors }, [rgba.buffer as ArrayBuffer]);
  return result;
}

/** Hareketli resmin ölçümü: kareler `add` ile (zarfın satırları), sonra `finish`. */
export function measureFrames(width: number, height: number, colors: BarColors) {
  const id = nextId++;
  post({ type: "start", id, width, height, colors });
  return {
    add(rgba: Uint8ClampedArray) {
      post({ type: "frame", id, rgba }, [rgba.buffer as ArrayBuffer]);
    },
    finish(): Promise<LineMap | null> {
      const result = request(id);
      post({ type: "finish", id });
      return result;
    },
    cancel() {
      post({ type: "cancel", id });
    },
  };
}
