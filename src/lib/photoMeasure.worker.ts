/**
 * "Kendi resmin" sahnesinin çizgi bölgesi ölçümü (ayrı iş parçacığı): resmin ya da hareketli
 * resmin karelerinin pikselleriyle `measureLine` (1080p'de 1–3 sn) arayüzü dondurmasın. İstemci
 * `photoMeasure.ts`; iş `photoMeasureJob.ts`.
 */
import { measureJob, transferables, type MeasureMessage } from "./photoMeasureJob";

interface WorkerScope {
  onmessage: ((event: MessageEvent<MeasureMessage>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const run = measureJob((id, map) => scope.postMessage({ id, map }, map ? transferables(map) : []));
scope.onmessage = (event) => run(event.data);
