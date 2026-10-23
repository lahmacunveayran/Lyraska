/**
 * Parlama sayacı (epilepsi güvenliği). WCAG 2.3.1'e göre parlama: bağıl
 * parlaklıkta en az %10'luk, birbirine zıt iki değişim. Sahnelerin parlaklık
 * eğrileri bununla denetlenir: hiçbir sahne saniyede 3'ten fazla parlamaz.
 */
export const FLASH_DELTA = 0.1;

/** Parlaklık eğrisindeki (0..1 bağıl parlaklık) parlama sayısı. */
export function countFlashes(luminance: readonly number[]): number {
  return Math.floor(countChanges(luminance) / 2);
}

/**
 * Parlaklık eğrisindeki değişim sayısı: yükselirken en yüksek, düşerken en düşük değer izlenir;
 * ondan %10 dönüş bir değişimdir (iki zıt değişim bir parlama). Bir pikselin eğrisinde her
 * değişim desenin bir "tersine dönmesi"dir.
 */
export function countChanges(luminance: readonly number[]): number {
  const counter = createChangeCounter(1);
  const sample = new Float64Array(1);
  for (const l of luminance) {
    sample[0] = l;
    counter.push(sample);
  }
  return counter.changes[0] ?? 0;
}

export interface ChangeCounter {
  /** Her eğrinin şimdiye kadarki değişim sayısı. */
  readonly changes: Float64Array;
  /** Bütün eğrilerin bir sonraki değeri. */
  push(values: ArrayLike<number>): void;
}

/** Aynı anda `size` eğrinin (ör. her pikselin) değişimlerini sayar (`countChanges` gibi). */
export function createChangeCounter(size: number): ChangeCounter {
  const min = new Float64Array(size);
  const max = new Float64Array(size);
  const direction = new Int8Array(size);
  const changes = new Float64Array(size);
  let started = false;
  return {
    changes,
    push(values) {
      for (let i = 0; i < size; i++) {
        const l = values[i] ?? 0;
        if (!started) {
          min[i] = l;
          max[i] = l;
        }
        const d = direction[i]!;
        if (d <= 0) min[i] = Math.min(min[i]!, l);
        if (d >= 0) max[i] = Math.max(max[i]!, l);
        if (d >= 0 && max[i]! - l >= FLASH_DELTA) {
          direction[i] = -1;
          changes[i]! += 1;
          min[i] = l;
        } else if (d <= 0 && l - min[i]! >= FLASH_DELTA) {
          direction[i] = 1;
          changes[i]! += 1;
          max[i] = l;
        }
      }
      started = true;
    },
  };
}

/**
 * WCAG'nin parlama alanı (görüş alanının %25'i): 1024×768 ekranda 341×256 piksel. Ekranı
 * `width` piksel genişliğinde olan bir görüntüde aynı oranda.
 */
export function flashWindow(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.min(width, Math.round((341 * width) / 1024))),
    height: Math.max(1, Math.min(height, Math.round((256 * width) / 1024))),
  };
}

/**
 * Bir görüntünün (satır satır bağıl parlaklık, 0..1) pencere ortalamaları: `win` büyüklüğündeki
 * pencere `step` piksel adımla her konumda (hücrelere ya da bloklara hizalı olması gerekmez).
 */
export function windowMeans(
  luminance: ArrayLike<number>,
  width: number,
  height: number,
  win: { width: number; height: number },
  step: number,
): Float64Array {
  const stride = width + 1;
  const sum = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += luminance[y * width + x] ?? 0;
      sum[(y + 1) * stride + x + 1] = (sum[y * stride + x + 1] ?? 0) + row;
    }
  }
  const at = (x: number, y: number) => sum[y * stride + x] ?? 0;
  const means: number[] = [];
  const area = win.width * win.height;
  for (let y = 0; y + win.height <= height; y += step) {
    for (let x = 0; x + win.width <= width; x += step) {
      const s =
        at(x + win.width, y + win.height) - at(x, y + win.height) - at(x + win.width, y) + at(x, y);
      means.push(s / area);
    }
  }
  return Float64Array.from(means);
}

/**
 * Karelerin pencere ortalamalarından (her kare için `windowMeans`, hepsi aynı uzunlukta) en çok
 * parlayan penceredeki parlama sayısı ve bir karede en büyük ortalama değişimi.
 */
export function worstWindowFlashes(frames: readonly Float64Array[]): {
  flashes: number;
  maxStep: number;
} {
  const windows = frames[0]?.length ?? 0;
  let flashes = 0;
  let maxStep = 0;
  for (let w = 0; w < windows; w++) {
    const series = frames.map((f) => f[w] ?? 0);
    flashes = Math.max(flashes, countFlashes(series));
    for (let i = 1; i < series.length; i++) {
      maxStep = Math.max(maxStep, Math.abs(series[i]! - series[i - 1]!));
    }
  }
  return { flashes, maxStep };
}
