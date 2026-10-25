/**
 * "Kendi resmin" ölçüm işi (iş parçacığında ya da Worker yoksa arayüzde aynı kod): sabit resim tek
 * mesajla; hareketli resmin kareleri tek tek, zarfları toplanır (`FrameEnvelope`), sonunda ölçülür.
 */
import {
  FrameEnvelope,
  imageBackground,
  measureLine,
  type BarColors,
  type LineMap,
} from "./photoScene";

export type MeasureMessage =
  | {
      type: "still";
      id: number;
      rgba: Uint8ClampedArray;
      width: number;
      height: number;
      colors: BarColors;
    }
  | { type: "start"; id: number; width: number; height: number; colors: BarColors }
  | { type: "frame"; id: number; rgba: Uint8ClampedArray }
  | { type: "finish"; id: number }
  | { type: "cancel"; id: number };

/** Ölçümün aktarılabilir belleği (kopyalanmadan gönderilir). */
export function transferables(map: LineMap): ArrayBuffer[] {
  const arrays = [
    map.core,
    map.glow,
    map.glowLinear,
    map.glowTail,
    map.bands.start,
    map.bands.list,
    map.bands.tau,
    map.bands.total,
    map.redIncrease.glow,
    map.redIncrease.withCore,
    map.redIncrease.any,
    map.redIncrease.tail,
    map.redDecrease.glow,
    map.redDecrease.withCore,
    map.redDecrease.any,
    map.redDecrease.tail,
  ];
  return [...new Set(arrays.map((a) => a.buffer as ArrayBuffer))];
}

/** Mesajları işleyen (iş parçacığında ya da burada) ölçüm döngüsü. */
export function measureJob(done: (id: number, map: LineMap | null) => void) {
  const jobs = new Map<number, { envelope: FrameEnvelope; colors: BarColors }>();
  return (message: MeasureMessage) => {
    switch (message.type) {
      case "still": {
        const { rgba, width, height, colors } = message;
        done(message.id, measureLine(imageBackground(rgba, width, height), width, height, colors));
        break;
      }
      case "start":
        jobs.set(message.id, {
          envelope: new FrameEnvelope(message.width, message.height),
          colors: message.colors,
        });
        break;
      case "frame":
        jobs.get(message.id)?.envelope.add(message.rgba);
        break;
      case "finish": {
        const job = jobs.get(message.id);
        jobs.delete(message.id);
        if (!job || job.envelope.frames === 0) {
          done(message.id, null);
          break;
        }
        const { envelope, colors } = job;
        done(
          message.id,
          measureLine(envelope.background(), envelope.width, envelope.height, colors),
        );
        break;
      }
      case "cancel":
        jobs.delete(message.id);
        break;
    }
  };
}
