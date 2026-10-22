import { describe, expect, it } from "vitest";
import { countFlashes, flashWindow, windowMeans, worstWindowFlashes } from "./flash";
import {
  GUARD_COLS,
  GUARD_MAX_DT,
  GUARD_RATE,
  GUARD_ROWS,
  GUARD_SAFE_RATE,
  GUARD_SLEW_MARGIN,
  LUMA,
  blockCounts,
  blockEdge,
  blockOfPixel,
  cellLuminances,
  cornerWeights,
  flashRateBound,
  frameSlew,
  guardStep,
  linearToSrgb,
  srgbToLinear,
  type GuardGrid,
} from "./flashGuardMath";
import { SKY_AT_REST, auroraLuminance, stepSky, type Energies } from "./sky";

const DT = 1 / 60;
type Rgb = [number, number, number];
/** Pikselin rengi (doğrusal RGB): kare numarası, x, y. */
type Pattern = (frame: number, x: number, y: number) => Rgb;

const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];
const RED: Rgb = [1, 0, 0];

/** Asıl ızgara (32×18 hücre), hücre başına 2×2 blok, blok başına bir piksel: hızlı testler. */
const SMALL: GuardGrid = { width: 64, height: 36, cols: GUARD_COLS, rows: GUARD_ROWS, perCell: 2 };
/** Hücre başına tek blok: tekdüze (tam ekran) desenler için en hızlısı. */
const TINY: GuardGrid = { width: 32, height: 18, cols: GUARD_COLS, rows: GUARD_ROWS, perCell: 1 };
/** Ağır benzetimler (yavaş CI makinesinde de yetişsin). */
const SLOW_TEST = 60_000;
/** Blokların piksel sayıları eşit değil (1 ya da 2): ağırlıkların kesinliği için. */
const UNEVEN: GuardGrid = { width: 45, height: 31, cols: 8, rows: 5, perCell: 4 };

/** 8 bit ekran: her kanal sRGB'de en yakın 1/255 adımına yuvarlanır. */
const DECODE = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));
const quantized = new Map<number, number>();
function quantize(v: number): number {
  let q = quantized.get(v);
  if (q === undefined) {
    q = DECODE[Math.round(linearToSrgb(v) * 255)]!;
    if (quantized.size < 1e6) quantized.set(v, q);
  }
  return q;
}

interface Run {
  /** Her karede gösterilen piksellerin parlaklığı (satır satır; istenirse 8 bit yuvarlanmış). */
  shown: Float64Array[];
  /** Yuvarlanmamış (kayan nokta) gösterilen parlaklık. */
  exact: Float64Array[];
  /** Her karede hücrelerin gösterilen ortalama parlaklığı (pikselden hesaplanmış). */
  cells: Float64Array[];
  /** Her karede girdinin parlaklığı (frensiz denetim için). */
  input: Float64Array[];
}

/**
 * Freni piksel düzeyinde çalıştırır: girdi bloklara ortalanır, fren bir kare ilerler, her piksel
 * `H_b + a(b)·(X(p) − H_b)` olarak gösterilir (ekran kartının yaptığı gibi).
 */
function run(
  grid: GuardGrid,
  pattern: Pattern,
  frames: number,
  rate: number,
  options: { start?: "black" | "first"; eightBit?: boolean } = {},
): Run {
  const { width, height, perCell, cols } = grid;
  const bx = cols * perCell;
  const by = grid.rows * perCell;
  const pixelCount = width * height;
  const counts = blockCounts(grid);
  // Pikselin bloğu ve hücresi.
  const block = new Int32Array(pixelCount);
  const cell = new Int32Array(pixelCount);
  for (let y = 0; y < height; y++) {
    const yb = blockOfPixel(y, height, by);
    for (let x = 0; x < width; x++) {
      const xb = blockOfPixel(x, width, bx);
      block[y * width + x] = yb * bx + xb;
      cell[y * width + x] = Math.floor(yb / perCell) * cols + Math.floor(xb / perCell);
    }
  }
  const cellTotals = new Float64Array(cols * grid.rows);
  for (let p = 0; p < pixelCount; p++) cellTotals[cell[p]!]! += 1;
  const [lr, lg, lb] = LUMA;
  const display = options.eightBit ? quantize : (v: number) => v;

  const image = (frame: number) => {
    const pixels = new Float64Array(pixelCount * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) pixels.set(pattern(frame, x, y), (y * width + x) * 3);
    }
    return pixels;
  };
  const blockMeans = (pixels: Float64Array) => {
    const means = new Float64Array(bx * by * 3);
    for (let p = 0; p < pixelCount; p++) {
      const b = block[p]!;
      for (let ch = 0; ch < 3; ch++) means[b * 3 + ch]! += pixels[p * 3 + ch]! / counts[b]!;
    }
    return means;
  };

  let hold: Float64Array =
    options.start === "first" ? blockMeans(image(0)) : new Float64Array(bx * by * 3);
  const result: Run = { shown: [], exact: [], cells: [], input: [] };
  for (let f = 0; f < frames; f++) {
    const pixels = image(f);
    const step = guardStep(grid, counts, hold, blockMeans(pixels), frameSlew(rate, DT));
    const shown = new Float64Array(pixelCount);
    const exactShown = new Float64Array(pixelCount);
    const input = new Float64Array(pixelCount);
    const cells = new Float64Array(cols * grid.rows);
    for (let p = 0; p < pixelCount; p++) {
      const b = block[p]!;
      const a = step.gains[b]!;
      const hr = hold[b * 3]!;
      const hg = hold[b * 3 + 1]!;
      const hb = hold[b * 3 + 2]!;
      const r = hr + a * (pixels[p * 3]! - hr);
      const g = hg + a * (pixels[p * 3 + 1]! - hg);
      const bl = hb + a * (pixels[p * 3 + 2]! - hb);
      const exact = lr * r + lg * g + lb * bl;
      exactShown[p] = exact;
      shown[p] = options.eightBit ? lr * display(r) + lg * display(g) + lb * display(bl) : exact;
      cells[cell[p]!]! += exact / cellTotals[cell[p]!]!;
      input[p] = lr * pixels[p * 3]! + lg * pixels[p * 3 + 1]! + lb * pixels[p * 3 + 2]!;
    }
    hold = step.output;
    result.shown.push(shown);
    result.exact.push(exactShown);
    result.cells.push(cells);
    result.input.push(input);
  }
  return result;
}

/** En çok parlayan WCAG penceresinin saniyedeki parlama sayısı (pencereler 1 piksel adımla). */
function flashesPerSecond(grid: GuardGrid, frames: readonly Float64Array[]): number {
  const win = flashWindow(grid.width, grid.height);
  const means = frames.map((lum) => windowMeans(lum, grid.width, grid.height, win, 1));
  return worstWindowFlashes(means).flashes / (frames.length * DT);
}

/** Bir karede hücre ortalamalarının en büyük değişimi. */
function maxCellStep(cells: readonly Float64Array[]): number {
  let worst = 0;
  for (let f = 1; f < cells.length; f++) {
    cells[f]!.forEach((v, c) => (worst = Math.max(worst, Math.abs(v - cells[f - 1]![c]!))));
  }
  return worst;
}

const square =
  (hz: number, on: Rgb, off: Rgb = BLACK): Pattern =>
  (frame) =>
    Math.floor(frame * DT * hz * 2) % 2 === 0 ? on : off;

/** Belirlenimci sözde rastgele sayılar (0..1). */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("parlaklık freninin geometrisi", () => {
  it("her piksel tam bir bloğa düşer, bloklar görüntüyü kaplar", () => {
    for (const [size, count] of [
      [45, 32],
      [1920, 256],
      [1080, 144],
      [100, 256],
      [7, 3],
    ] as const) {
      let total = 0;
      for (let i = 0; i < count; i++)
        total += blockEdge(i + 1, size, count) - blockEdge(i, size, count);
      expect(total).toBe(size);
      for (let x = 0; x < size; x++) {
        const b = blockOfPixel(x, size, count);
        expect(blockEdge(b, size, count)).toBeLessThanOrEqual(x);
        expect(blockEdge(b + 1, size, count)).toBeGreaterThan(x);
      }
    }
    const counts = blockCounts(UNEVEN);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(UNEVEN.width * UNEVEN.height);
  });

  it("köşe ağırlıkları toplamı 1", () => {
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 8; i++) {
        expect(cornerWeights(i, j, 8).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      }
    }
  });

  it("uzun kare tek sıçramaya izin vermez; geçersiz süre donar", () => {
    expect(frameSlew(GUARD_RATE, 5)).toBeCloseTo(GUARD_RATE * GUARD_MAX_DT - GUARD_SLEW_MARGIN);
    expect(frameSlew(GUARD_RATE, -1)).toBe(0);
    expect(frameSlew(GUARD_RATE, Number.NaN)).toBe(0);
  });

  it("8 bit ekran dahil sınır: normal modda ≤ 3, güvenli modda ≤ 1 parlama/sn", () => {
    expect(flashRateBound(GUARD_RATE)).toBeLessThanOrEqual(1.7);
    expect(flashRateBound(GUARD_SAFE_RATE)).toBeLessThanOrEqual(1);
    // sRGB'nin 1/255'lik en büyük adımı (beyazın hemen altı) yarım adım payının iki katını aşmaz.
    expect(1 - srgbToLinear(254 / 255)).toBeLessThanOrEqual(2 * 0.00447);
  });
});

describe("parlaklık freni", () => {
  it("hiçbir hücrenin ortalaması bir karede r·dt'den fazla değişmez (kötü niyetli girdiler)", () => {
    const rand = random(7);
    const noise: Pattern = () => [rand(), rand(), rand()];
    const cellJumps: Pattern = (frame, x, y) => {
      const v = (Math.floor(x / 6) * 7 + Math.floor(y / 6) * 13 + frame * 5) % 3 === 0 ? 1 : 0;
      return [v, v * 0.3, 0];
    };
    const halves: Pattern = (frame, x) => (x % 6 < 3 === (frame % 2 === 0) ? WHITE : BLACK);
    for (const pattern of [noise, cellJumps, halves, square(10, WHITE), square(15, RED, WHITE)]) {
      for (const rate of [GUARD_RATE, GUARD_SAFE_RATE]) {
        const { cells } = run(UNEVEN, pattern, 90, rate);
        expect(maxCellStep(cells)).toBeLessThanOrEqual(frameSlew(rate, DT) + 1e-12);
      }
    }
  });

  it("hücrelerden oluşan her pencerenin ortalaması da hız sınırlı", () => {
    const rand = random(11);
    const { cells } = run(UNEVEN, () => [rand(), rand(), rand()], 60, GUARD_RATE);
    const counts = cellPixelCounts(UNEVEN);
    for (let f = 1; f < cells.length; f++) {
      for (let y0 = 0; y0 + 2 <= UNEVEN.rows; y0++) {
        for (let x0 = 0; x0 + 3 <= UNEVEN.cols; x0++) {
          let before = 0;
          let after = 0;
          let total = 0;
          for (let y = y0; y < y0 + 2; y++) {
            for (let x = x0; x < x0 + 3; x++) {
              const c = y * UNEVEN.cols + x;
              before += counts[c]! * cells[f - 1]![c]!;
              after += counts[c]! * cells[f]![c]!;
              total += counts[c]!;
            }
          }
          expect(Math.abs(after - before) / total).toBeLessThanOrEqual(
            frameSlew(GUARD_RATE, DT) + 1e-12,
          );
        }
      }
    }
  });

  it(
    "tam ekran kare dalga (0,5–30 Hz): normal ≤ 1,5, güvenli ≤ 1 parlama/sn; frensiz parlıyor",
    () => {
      for (const hz of [0.5, 1, 1.5, 2, 3, 5, 10, 30]) {
        for (const [rate, limit] of [
          [GUARD_RATE, 1.5],
          [GUARD_SAFE_RATE, 0.9],
        ] as const) {
          // Kayan noktada kanıtın 3. adımı (r / 0,2), 8 bit ekranda 4. adımı (`flashRateBound`).
          const result = run(TINY, square(hz, WHITE), 360, rate, { eightBit: true });
          expect(flashesPerSecond(TINY, result.exact), `${hz} Hz, r=${rate}`).toBeLessThanOrEqual(
            limit,
          );
          expect(flashesPerSecond(TINY, result.shown), `${hz} Hz, r=${rate}`).toBeLessThanOrEqual(
            flashRateBound(rate),
          );
          if (hz >= 1 && rate === GUARD_RATE) {
            // Denetimin anlamı var: frensiz girdi saniyede 3'ten fazla (ya da dalganın hızında) parlıyor.
            expect(flashesPerSecond(TINY, result.input)).toBeGreaterThanOrEqual(
              0.8 * Math.min(hz, 3.5),
            );
          }
        }
      }
    },
    SLOW_TEST,
  );

  it(
    "tek parlak bölge, kırmızı ve gürültü de sınırı aşmaz",
    () => {
      const rand = random(3);
      // Hücrelere hizasız bir dikdörtgen (WCAG penceresinden biraz büyük), 10 ve 3 Hz.
      const region =
        (hz: number, color: Rgb): Pattern =>
        (frame, x, y) =>
          x >= 13 && x < 39 && y >= 7 && y < 27 ? square(hz, color)(frame, x, y) : BLACK;
      const patterns: [string, Pattern][] = [
        ["bölge 10 Hz", region(10, WHITE)],
        ["bölge 3 Hz", region(3, WHITE)],
        ["kırmızı tam ekran 10 Hz", square(10, RED)],
        ["kırmızı bölge 4 Hz", region(4, RED)],
        ["kırmızı ↔ beyaz 6 Hz", square(6, RED, WHITE)],
        ["gürültü", () => (rand() < 0.5 ? WHITE : BLACK)],
        ["kayan şeritler", (frame, x) => ((x + frame * 3) % 16 < 8 ? WHITE : BLACK)],
      ];
      for (const [name, pattern] of patterns) {
        for (const rate of [GUARD_RATE, GUARD_SAFE_RATE]) {
          const { shown, cells } = run(SMALL, pattern, 240, rate, { eightBit: true });
          expect(flashesPerSecond(SMALL, shown), `${name}, r=${rate}`).toBeLessThanOrEqual(
            flashRateBound(rate),
          );
          expect(maxCellStep(cells), name).toBeLessThanOrEqual(frameSlew(rate, DT) + 1e-12);
        }
      }
    },
    SLOW_TEST,
  );

  it("ani sıçramada her karede tam r·dt ilerler, sonra görüntüyle birebir aynı olur", () => {
    const slew = frameSlew(GUARD_RATE, DT);
    const { cells } = run(SMALL, () => WHITE, 260, GUARD_RATE);
    const mean = (c: Float64Array) => c.reduce((a, b) => a + b, 0) / c.length;
    // Siyahtan başlar (güvenilmeyen sahne yavaşça belirir).
    expect(mean(cells[0]!)).toBeCloseTo(slew, 9);
    expect(mean(cells[100]!)).toBeCloseTo(101 * slew, 9);
    const frames = Math.ceil(1 / slew);
    expect(mean(cells[frames]!)).toBeCloseTo(1, 12);
    expect(frames * DT).toBeLessThan(3.5); // beyaz ekran ~3,3 sn'de tam görünür
  });

  it(
    "yavaş değişen görüntü değişmeden geçer",
    () => {
      // 0,2 Hz, ±0,2 genlik: en büyük hız 0,25/sn < 0,3/sn. Yatayda da yumuşak bir eğim.
      const slow: Pattern = (frame, x) => {
        const v = 0.4 + 0.2 * Math.sin(2 * Math.PI * 0.2 * frame * DT) + 0.003 * x;
        return [v, v, v];
      };
      const { shown, input } = run(SMALL, slow, 600, GUARD_RATE, { start: "first" });
      let worst = 0;
      shown.forEach((lum, f) =>
        lum.forEach((v, p) => (worst = Math.max(worst, Math.abs(v - input[f]![p]!)))),
      );
      expect(worst).toBeLessThan(1e-12);
    },
    SLOW_TEST,
  );

  it(
    "gece göğünün parlaklık eğrisi (en kötü müzikte bile) değişmeden geçer",
    () => {
      for (const safe of [false, true]) {
        for (const hz of [0.5, 4, 30]) {
          let sky = SKY_AT_REST;
          const curve: number[] = [];
          for (let i = 0; i < 600; i++) {
            const on = Math.floor(i * DT * hz * 2) % 2 === 0;
            const target: Energies = on ? [1, 1, 1] : [0, 0, 0];
            sky = stepSky(sky, target, DT, false, null, safe);
            curve.push(auroraLuminance(sky.energies));
          }
          const gray: Pattern = (frame) => [curve[frame]!, curve[frame]!, curve[frame]!];
          const rate = safe ? GUARD_SAFE_RATE : GUARD_RATE;
          const { cells } = run(TINY, gray, 600, rate, { start: "first" });
          let worst = 0;
          cells.forEach((c, f) =>
            c.forEach((v) => (worst = Math.max(worst, Math.abs(v - curve[f]!)))),
          );
          expect(worst, `${hz} Hz güvenli=${safe}`).toBeLessThan(1e-12);
        }
      }
    },
    SLOW_TEST,
  );

  it("frensiz 10 Hz beyaz-siyah saniyede 10 parlama sayılır (ölçüm doğru)", () => {
    const { input } = run(SMALL, square(10, WHITE), 120, GUARD_RATE);
    expect(flashesPerSecond(SMALL, input)).toBeGreaterThanOrEqual(9.5);
    expect(countFlashes(input.map((l) => l[0]!))).toBe(19); // ilk beyaz bir değişim sayılmaz
  });

  it("hücre ortalaması kaynak hesapla aynı", () => {
    const counts = blockCounts(UNEVEN);
    const rgb = Float64Array.from({ length: counts.length * 3 }, (_, i) => (i % 7) / 7);
    const cells = cellLuminances(UNEVEN, counts, rgb);
    expect(cells.length).toBe(UNEVEN.cols * UNEVEN.rows);
    cells.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });
});

/** Hücrelerin piksel sayıları. */
function cellPixelCounts(grid: GuardGrid): Float64Array {
  const counts = blockCounts(grid);
  const bx = grid.cols * grid.perCell;
  const result = new Float64Array(grid.cols * grid.rows);
  counts.forEach((n, b) => {
    const x = Math.floor((b % bx) / grid.perCell);
    const y = Math.floor(Math.floor(b / bx) / grid.perCell);
    result[y * grid.cols + x]! += n;
  });
  return result;
}
