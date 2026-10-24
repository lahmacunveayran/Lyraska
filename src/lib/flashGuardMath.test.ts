import { describe, expect, it } from "vitest";
import {
  countChanges,
  countFlashes,
  createChangeCounter,
  flashWindow,
  windowMeans,
  worstWindowFlashes,
} from "./flash";
import {
  GUARD_COLS,
  GUARD_MAX_DT,
  GUARD_PATTERN_RATE,
  GUARD_PATTERN_SAFE_RATE,
  GUARD_RATE,
  GUARD_ROWS,
  GUARD_SAFE_RATE,
  GUARD_SLEW_MARGIN,
  LUMA,
  STATE_HALF_STEP,
  blockCounts,
  blockEdge,
  blockOfPixel,
  cornerWeights,
  flashRateBound,
  frameSlew,
  guardRates,
  guardStep,
  linearToSrgb,
  patternReversalBound,
  pixelBlocks,
  quantizeState,
  redSlew,
  RED_FLASH_SCALE,
  GUARD_RED_RATE,
  GUARD_RED_SAFE_RATE,
  srgbToLinear,
  worstBlockChanges,
  type GuardGrid,
  type GuardRates,
} from "./flashGuardMath";
import { SKY_AT_REST, auroraLuminance, stepSky, type Energies } from "./sky";

const DT = 1 / 60;
type Rgb = [number, number, number];
/** Pikselin rengi (doğrusal RGB): kare numarası, x, y. */
type Pattern = (frame: number, x: number, y: number) => Rgb;

const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];
const RED: Rgb = [1, 0, 0];
const NORMAL = guardRates(false);
const SAFE = guardRates(true);

/** Asıl ızgara (32×18 hücre), hücre başına 2×2 blok, blok başına bir piksel: hızlı testler. */
const SMALL: GuardGrid = { width: 64, height: 36, cols: GUARD_COLS, rows: GUARD_ROWS, perCell: 2 };
/** Hücre başına tek blok: tekdüze (tam ekran) desenler için en hızlısı. */
const TINY: GuardGrid = { width: 32, height: 18, cols: GUARD_COLS, rows: GUARD_ROWS, perCell: 1 };
/** Blok başına 2×2 piksel: bloktan ince desenler (blok ortalaması sabit kalabilir). */
const FINE: GuardGrid = { width: 128, height: 72, cols: GUARD_COLS, rows: GUARD_ROWS, perCell: 2 };
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
  /** Saklanan (16 bit) gösterilen parlaklık. */
  exact: Float64Array[];
  /** Her karede hücrelerin gösterilen ortalama parlaklığı (pikselden hesaplanmış). */
  cells: Float64Array[];
  /** Her karede girdinin parlaklığı (frensiz denetim için). */
  input: Float64Array[];
  /** Her karede blokların payı. */
  gains: Float64Array[];
  /** Her karede blokların ortalama mutlak parlaklık değişimi (önceki gösterilene göre). */
  blockSteps: Float64Array[];
  /** Her karede gösterilen piksellerin kırmızı değeri `320 · max(0, R − G − B)` (8 bit isteğe bağlı). */
  red: Float64Array[];
}

/**
 * Freni piksel düzeyinde çalıştırır (ekran kartının yaptığı gibi): durum önceki gösterilen
 * görüntüdür (16 bit), her piksel `P + a(b)·(X − P)` olarak gösterilir.
 */
function run(
  grid: GuardGrid,
  pattern: Pattern,
  frames: number,
  rates: GuardRates,
  options: { start?: "black" | "first"; eightBit?: boolean } = {},
): Run {
  const { width, height, perCell, cols } = grid;
  const bx = cols * perCell;
  const pixelCount = width * height;
  const counts = blockCounts(grid);
  const blocks = pixelBlocks(grid);
  const cell = new Int32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const b = blocks[p]!;
    cell[p] = Math.floor(Math.floor(b / bx) / perCell) * cols + Math.floor((b % bx) / perCell);
  }
  const cellTotals = new Float64Array(cols * grid.rows);
  for (let p = 0; p < pixelCount; p++) cellTotals[cell[p]!]! += 1;
  const [lr, lg, lb] = LUMA;
  const lum = (rgb: Float64Array, p: number) =>
    lr * rgb[p * 3]! + lg * rgb[p * 3 + 1]! + lb * rgb[p * 3 + 2]!;

  const image = (frame: number) => {
    const pixels = new Float64Array(pixelCount * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) pixels.set(pattern(frame, x, y), (y * width + x) * 3);
    }
    return pixels;
  };

  let state: Float64Array =
    options.start === "first" ? image(0).map(quantizeState) : new Float64Array(pixelCount * 3);
  const result: Run = {
    shown: [],
    exact: [],
    cells: [],
    input: [],
    gains: [],
    blockSteps: [],
    red: [],
  };
  for (let f = 0; f < frames; f++) {
    const pixels = image(f);
    const step = guardStep(
      grid,
      blocks,
      counts,
      state,
      pixels,
      frameSlew(rates.mean, DT),
      frameSlew(rates.pattern, DT),
      true,
      redSlew(rates.red, DT),
    );
    const out = step.output;
    const red = new Float64Array(pixelCount);
    for (let p = 0; p < pixelCount; p++) {
      const c = [0, 1, 2].map((k) =>
        options.eightBit ? quantize(out[p * 3 + k]!) : out[p * 3 + k]!,
      ) as Rgb;
      red[p] = RED_FLASH_SCALE * Math.max(0, c[0] - c[1] - c[2]);
    }
    result.red.push(red);
    const shown = new Float64Array(pixelCount);
    const exact = new Float64Array(pixelCount);
    const input = new Float64Array(pixelCount);
    const cells = new Float64Array(cols * grid.rows);
    const blockSteps = new Float64Array(counts.length);
    for (let p = 0; p < pixelCount; p++) {
      const e = lum(out, p);
      exact[p] = e;
      shown[p] = options.eightBit
        ? lr * quantize(out[p * 3]!) +
          lg * quantize(out[p * 3 + 1]!) +
          lb * quantize(out[p * 3 + 2]!)
        : e;
      cells[cell[p]!]! += e / cellTotals[cell[p]!]!;
      input[p] = lum(pixels, p);
      const b = blocks[p]!;
      blockSteps[b]! += Math.abs(e - lum(state, p)) / counts[b]!;
    }
    state = out;
    result.shown.push(shown);
    result.exact.push(exact);
    result.cells.push(cells);
    result.input.push(input);
    result.gains.push(step.gains);
    result.blockSteps.push(blockSteps);
  }
  return result;
}

/** En çok parlayan WCAG penceresinin saniyedeki parlama sayısı (pencereler 1 piksel adımla). */
function flashesPerSecond(grid: GuardGrid, frames: readonly Float64Array[]): number {
  const win = flashWindow(grid.width, grid.height);
  const means = frames.map((lum) => windowMeans(lum, grid.width, grid.height, win, 1));
  return worstWindowFlashes(means).flashes / (frames.length * DT);
}

/** En kötü blokta piksel başına saniyedeki tersine dönme (0,1'lik değişim) sayısı. */
function reversalsPerSecond(grid: GuardGrid, frames: readonly Float64Array[]): number {
  const counter = createChangeCounter(grid.width * grid.height);
  for (const lum of frames) counter.push(lum);
  return (
    worstBlockChanges(pixelBlocks(grid), blockCounts(grid), counter.changes) / (frames.length * DT)
  );
}

/** Bir karede hücre ortalamalarının en büyük değişimi. */
function maxCellStep(cells: readonly Float64Array[]): number {
  let worst = 0;
  for (let f = 1; f < cells.length; f++) {
    cells[f]!.forEach((v, c) => (worst = Math.max(worst, Math.abs(v - cells[f - 1]![c]!))));
  }
  return worst;
}

/** Bir karede blokların ortalama mutlak değişiminin en büyüğü. */
function maxBlockStep(steps: readonly Float64Array[]): number {
  return steps.reduce((worst, s) => s.reduce((w, v) => Math.max(w, v), worst), 0);
}

const square =
  (hz: number, on: Rgb, off: Rgb = BLACK): Pattern =>
  (frame) =>
    Math.floor(frame * DT * hz * 2) % 2 === 0 ? on : off;

/** Saniyede `reversals` kez tersine dönen şeritler (`period` piksel; dikey çizgiler). */
const stripes =
  (reversals: number, period: number): Pattern =>
  (frame, x) => {
    const phase = Math.floor(frame * DT * reversals) % 2;
    return Math.floor(x / (period / 2)) % 2 === phase ? WHITE : BLACK;
  };

/** Saniyede `reversals` kez tersine dönen dama (`size` piksel kareler). */
const checker =
  (reversals: number, size: number): Pattern =>
  (frame, x, y) => {
    const phase = Math.floor(frame * DT * reversals) % 2;
    return (Math.floor(x / size) + Math.floor(y / size)) % 2 === phase ? WHITE : BLACK;
  };

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
    const blocks = pixelBlocks(UNEVEN);
    const tally = new Float64Array(counts.length);
    blocks.forEach((b) => (tally[b]! += 1));
    expect(Array.from(tally)).toEqual(Array.from(counts));
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

  it("8 bit ekran dahil sınır: parlama normal ≤ 3, güvenli ≤ 1; desen ≤ 3 ve ~1 tersine dönme/sn", () => {
    expect(flashRateBound(GUARD_RATE)).toBeLessThanOrEqual(1.7);
    expect(flashRateBound(GUARD_SAFE_RATE)).toBeLessThanOrEqual(1);
    expect(patternReversalBound(GUARD_PATTERN_RATE)).toBeLessThanOrEqual(3);
    expect(patternReversalBound(GUARD_PATTERN_SAFE_RATE)).toBeLessThanOrEqual(1.05);
    // Desen hızı ortalama hızdan büyük değil: desen sınırı ortalamanınkini de kapsar.
    expect(GUARD_PATTERN_RATE).toBeLessThanOrEqual(GUARD_RATE);
    expect(GUARD_PATTERN_SAFE_RATE).toBeLessThanOrEqual(GUARD_SAFE_RATE);
    // sRGB'nin 1/255'lik en büyük adımı (beyazın hemen altı) yarım adım payının iki katını aşmaz.
    expect(1 - srgbToLinear(254 / 255)).toBeLessThanOrEqual(2 * 0.00447);
  });

  it("durumun 16 bit saklanması 8 bit ekran rengini bozmaz; yuvarlaması payın içinde", () => {
    expect(STATE_HALF_STEP).toBeLessThan(GUARD_SLEW_MARGIN);
    for (let code = 0; code < 256; code++) {
      const stored = quantizeState(srgbToLinear(code / 255));
      expect(Math.abs(stored - srgbToLinear(code / 255))).toBeLessThanOrEqual(STATE_HALF_STEP);
      expect(Math.round(linearToSrgb(stored) * 255)).toBe(code);
    }
  });

  it("değişim sayacı countFlashes'in değişimleriyle aynı", () => {
    const rand = random(5);
    const curves = Array.from({ length: 20 }, () => Array.from({ length: 200 }, () => rand()));
    const counter = createChangeCounter(curves.length);
    for (let t = 0; t < 200; t++) counter.push(curves.map((c) => c[t]!));
    curves.forEach((c, i) => {
      expect(counter.changes[i]).toBe(countChanges(c));
      expect(Math.floor(countChanges(c) / 2)).toBe(countFlashes(c));
    });
  });
});

describe("parlaklık freni", () => {
  it("hiçbir hücrenin ortalaması bir karede r·dt'den, bloğun pikselleri r_p·dt'den fazla değişmez", () => {
    const rand = random(7);
    const noise: Pattern = () => [rand(), rand(), rand()];
    const cellJumps: Pattern = (frame, x, y) => {
      const v = (Math.floor(x / 6) * 7 + Math.floor(y / 6) * 13 + frame * 5) % 3 === 0 ? 1 : 0;
      return [v, v * 0.3, 0];
    };
    const halves: Pattern = (frame, x) => (x % 6 < 3 === (frame % 2 === 0) ? WHITE : BLACK);
    const fine: Pattern = (frame, x, y) => ((x + y + frame) % 2 === 0 ? WHITE : BLACK);
    for (const pattern of [
      noise,
      cellJumps,
      halves,
      fine,
      square(10, WHITE),
      square(15, RED, WHITE),
    ]) {
      for (const rates of [NORMAL, SAFE]) {
        const { cells, blockSteps } = run(UNEVEN, pattern, 90, rates);
        // Saklanan görüntüde (16 bit yuvarlama dahil) kesin sınır.
        expect(maxCellStep(cells)).toBeLessThanOrEqual(rates.mean * DT);
        expect(maxBlockStep(blockSteps)).toBeLessThanOrEqual(rates.pattern * DT);
      }
    }
  });

  it("hücrelerden oluşan her pencerenin ortalaması da hız sınırlı", () => {
    const rand = random(11);
    const { cells } = run(UNEVEN, () => [rand(), rand(), rand()], 60, NORMAL);
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
          expect(Math.abs(after - before) / total).toBeLessThanOrEqual(GUARD_RATE * DT);
        }
      }
    }
  });

  it(
    "hücrelere ve bloklara hizasız her pencere ≤ r_p·dt·N⁺/N değişir",
    () => {
      const rand = random(13);
      const patterns: Pattern[] = [
        () => (rand() < 0.5 ? WHITE : BLACK),
        stripes(60, 2),
        checker(30, 1),
        (frame, x, y) => ((x * 3 + y * 5 + frame * 7) % 11 < 4 ? WHITE : BLACK),
      ];
      const bx = FINE.cols * FINE.perCell;
      const by = FINE.rows * FINE.perCell;
      const span = (start: number, length: number, size: number, count: number) => {
        const first = blockOfPixel(start, size, count);
        const last = blockOfPixel(start + length - 1, size, count);
        return blockEdge(last + 1, size, count) - blockEdge(first, size, count);
      };
      let worst = 0;
      for (const pattern of patterns) {
        const { exact } = run(FINE, pattern, 40, NORMAL);
        for (const [w, h] of [
          [21, 13],
          [5, 3],
          [64, 40],
        ] as const) {
          const means = exact.map((lum) =>
            windowMeans(lum, FINE.width, FINE.height, { width: w, height: h }, 1),
          );
          let i = 0;
          for (let y = 0; y + h <= FINE.height; y++) {
            for (let x = 0; x + w <= FINE.width; x++, i++) {
              const touched = span(x, w, FINE.width, bx) * span(y, h, FINE.height, by);
              const limit = (GUARD_PATTERN_RATE * DT * touched) / (w * h);
              for (let f = 1; f < means.length; f++) {
                worst = Math.max(worst, Math.abs(means[f]![i]! - means[f - 1]![i]!) / limit);
              }
            }
          }
        }
      }
      // Sınırın en çok bu kadarı kullanıldı (1'i aşmamalı).
      expect(worst).toBeLessThanOrEqual(1 + 1e-9);
      expect(worst).toBeGreaterThan(0.5);
    },
    SLOW_TEST,
  );

  it(
    "tam ekran kare dalga (0,5–30 Hz): normal ≤ 1,5, güvenli ≤ 1 parlama/sn; frensiz parlıyor",
    () => {
      for (const hz of [0.5, 1, 1.5, 2, 3, 5, 10, 30]) {
        for (const [rates, limit] of [
          [NORMAL, 1.5],
          [SAFE, 0.9],
        ] as const) {
          // Kayan noktada kanıtın 5. adımı (r / 0,2), 8 bit ekranda 6. adımı (`flashRateBound`).
          const result = run(TINY, square(hz, WHITE), 360, rates, { eightBit: true });
          const name = `${hz} Hz, r=${rates.mean}`;
          expect(flashesPerSecond(TINY, result.exact), name).toBeLessThanOrEqual(limit);
          expect(flashesPerSecond(TINY, result.shown), name).toBeLessThanOrEqual(
            flashRateBound(rates.mean),
          );
          if (hz >= 1 && rates === NORMAL) {
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
        for (const rates of [NORMAL, SAFE]) {
          const { shown, cells } = run(SMALL, pattern, 240, rates, { eightBit: true });
          expect(flashesPerSecond(SMALL, shown), `${name}, r=${rates.mean}`).toBeLessThanOrEqual(
            flashRateBound(rates.mean),
          );
          expect(maxCellStep(cells), name).toBeLessThanOrEqual(rates.mean * DT);
        }
      }
    },
    SLOW_TEST,
  );

  it(
    "bloktan ince, tersine dönen şerit ve dama: piksel başına ≤ 2,96 (güvenli ≤ 1,04) dönüş/sn",
    () => {
      // Blok 2×2 piksel: 1 piksellik şerit ve dama blok ortalamasını hiç değiştirmez (yalnızca
      // ortalamayı sınırlayan fren onları olduğu gibi geçirirdi).
      const patterns: [string, Pattern, number][] = [
        ["şerit, her karede tersine (60/sn)", stripes(60, 2), 30],
        ["şerit, 30/sn", stripes(30, 2), 20],
        ["şerit, 10/sn", stripes(10, 2), 8],
        ["şerit 4 px, 15/sn", stripes(15, 4), 10],
        ["dama, 60/sn", checker(60, 1), 30],
        ["dama, 20/sn", checker(20, 1), 15],
        ["dama, 6/sn", checker(6, 1), 4],
        ["dama 2 px, 30/sn", checker(30, 2), 20],
        ["dama, 3/sn", checker(3, 1), 2],
      ];
      for (const [name, pattern, unguarded] of patterns) {
        for (const rates of [NORMAL, SAFE]) {
          const result = run(FINE, pattern, 180, rates, { eightBit: true });
          const label = `${name}, r_p=${rates.pattern}`;
          expect(reversalsPerSecond(FINE, result.shown), label).toBeLessThanOrEqual(
            patternReversalBound(rates.pattern),
          );
          expect(maxBlockStep(result.blockSteps), label).toBeLessThanOrEqual(rates.pattern * DT);
          expect(flashesPerSecond(FINE, result.shown), label).toBeLessThanOrEqual(
            flashRateBound(rates.mean),
          );
          // Denetim: frensiz desen ölçümde gerçekten tersine dönüyor.
          if (rates === NORMAL) {
            expect(reversalsPerSecond(FINE, result.input), label).toBeGreaterThanOrEqual(unguarded);
          }
        }
      }
    },
    SLOW_TEST,
  );

  it(
    "hareket eden ince doku yavaşlar; yavaş kayan yumuşak doku değişmeden geçer",
    () => {
      // Keskin şeritler karede 1 piksel kayıyor: her piksel saniyede 15 kez değişir.
      const moving: Pattern = (frame, x) => ((x + frame) % 8 < 4 ? WHITE : BLACK);
      for (const rates of [NORMAL, SAFE]) {
        const result = run(FINE, moving, 240, rates, { eightBit: true });
        expect(reversalsPerSecond(FINE, result.shown)).toBeLessThanOrEqual(
          patternReversalBound(rates.pattern),
        );
        expect(maxBlockStep(result.blockSteps)).toBeLessThanOrEqual(rates.pattern * DT);
      }
      // Yumuşak (sinüs) doku, genlik 0,1, 32 piksel, saniyede 4 piksel kayıyor: pikselin en
      // büyük değişim hızı 0,1·2π/32·4 ≈ 0,079/sn < r_p (güvenli modda da).
      const soft: Pattern = (frame, x, y) => {
        const v = 0.5 + 0.1 * Math.sin((2 * Math.PI * (x + y * 0.5 - 4 * frame * DT)) / 32);
        return [v, v * 0.9, v * 0.8];
      };
      for (const rates of [NORMAL, SAFE]) {
        const { gains } = run(FINE, soft, 180, rates, { start: "first" });
        for (const g of gains) expect(Math.min(...g)).toBe(1);
      }
    },
    SLOW_TEST,
  );

  it("ani sıçramada her karede tam r_p·dt ilerler, sonra görüntüyle birebir aynı olur", () => {
    const slew = frameSlew(GUARD_PATTERN_RATE, DT);
    const { cells, gains } = run(SMALL, () => WHITE, 300, NORMAL);
    const mean = (c: Float64Array) => c.reduce((a, b) => a + b, 0) / c.length;
    // Siyahtan başlar (güvenilmeyen sahne yavaşça belirir); 16 bit yuvarlama payıyla.
    expect(Math.abs(mean(cells[0]!) - slew)).toBeLessThan(2 * STATE_HALF_STEP);
    // Her karenin 16 bit yuvarlaması (yarım adım) birikebilir; sınır yine her karede geçerlidir.
    expect(Math.abs(mean(cells[100]!) - 101 * slew)).toBeLessThanOrEqual(101 * STATE_HALF_STEP);
    const frames = Math.ceil(1 / slew) + 1;
    expect(mean(cells[frames]!)).toBe(1);
    expect(Math.min(...gains[frames]!)).toBe(1);
    expect(frames * DT).toBeLessThan(3.8); // beyaz ekran ~3,7 sn'de tam görünür
  });

  it(
    "yavaş değişen görüntü değişmeden geçer",
    () => {
      // 0,2 Hz, ±0,2 genlik: en büyük hız 0,25/sn < 0,27/sn. Yatayda da yumuşak bir eğim.
      const slow: Pattern = (frame, x) => {
        const v = 0.4 + 0.2 * Math.sin(2 * Math.PI * 0.2 * frame * DT) + 0.003 * x;
        return [v, v, v];
      };
      const { shown, input, gains } = run(SMALL, slow, 600, NORMAL, { start: "first" });
      let worst = 0;
      shown.forEach((lum, f) =>
        lum.forEach((v, p) => (worst = Math.max(worst, Math.abs(v - input[f]![p]!)))),
      );
      // Yalnızca durumun 16 bit yuvarlaması (ekrana giden 8 bit renk aynı).
      expect(worst).toBeLessThanOrEqual(STATE_HALF_STEP);
      for (const g of gains) expect(Math.min(...g)).toBe(1);
    },
    SLOW_TEST,
  );

  it(
    "güvenli modda gece göğünün parlaklık eğrisi (en kötü müzikte bile) değişmeden geçer",
    () => {
      for (const safe of [true]) {
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
          const { gains } = run(TINY, gray, 600, guardRates(safe), { start: "first" });
          gains.forEach((g, f) =>
            expect(Math.min(...g), `${hz} Hz güvenli=${safe} kare ${f}`).toBe(1),
          );
        }
      }
    },
    SLOW_TEST,
  );

  it("frensiz 10 Hz beyaz-siyah saniyede 10 parlama sayılır (ölçüm doğru)", () => {
    const { input } = run(SMALL, square(10, WHITE), 120, NORMAL);
    expect(flashesPerSecond(SMALL, input)).toBeGreaterThanOrEqual(9.5);
    expect(countFlashes(input.map((l) => l[0]!))).toBe(19); // ilk beyaz bir değişim sayılmaz
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

describe("parlaklık freni: kırmızı kanal (isteğe bağlı)", () => {
  // Aynı parlaklıkta doymuş kırmızı ↔ gri (parlaklık freni görmez): WCAG kırmızı parlaması.
  const grey = 0.2126;
  const GREY: Rgb = [grey, grey, grey];
  /** Kırmızı değer eğrisi 20'lik değişimle sayılır (parlaklığın 0,1'i gibi: 200'e bölünür). */
  const redFlashesPerSecond = (grid: GuardGrid, frames: readonly Float64Array[]) =>
    flashesPerSecond(
      grid,
      frames.map((f) => f.map((v) => v / 200)),
    );

  it("kapalıyken aynı parlaklıkta kırmızı ↔ gri titreşim olduğu gibi geçer (denetim)", () => {
    const r = run(TINY, square(10, RED, GREY), 120, NORMAL, { start: "first" });
    expect(redFlashesPerSecond(TINY, r.red)).toBeGreaterThan(8);
    // Parlaklık hiç değişmez: parlaklık freni bunu göremez.
    expect(flashesPerSecond(TINY, r.shown)).toBe(0);
  });

  it.each([
    { name: "normal", safe: false, limit: 3 },
    { name: "güvenli", safe: true, limit: 1 },
  ])(
    "açıkken saniyede en çok $limit kırmızı parlama ($name, 8 bit ekran)",
    { timeout: SLOW_TEST },
    ({ safe, limit }) => {
      const rates = guardRates(safe, true);
      expect(rates.red).toBe(safe ? GUARD_RED_SAFE_RATE : GUARD_RED_RATE);
      for (const pattern of [
        square(10, RED, GREY),
        square(3, RED, BLACK),
        square(10, RED, WHITE),
      ]) {
        const r = run(SMALL, pattern, 240, rates, { start: "first", eightBit: true });
        expect(redFlashesPerSecond(SMALL, r.red)).toBeLessThanOrEqual(limit);
        // Pencere ortalaması bir karede en çok 320 · s_r · N⁺/N (+ 8 bit yuvarlama) değişir.
        const win = flashWindow(SMALL.width, SMALL.height);
        const means = r.red.map((f) => windowMeans(f, SMALL.width, SMALL.height, win, 1));
        const step = worstWindowFlashes(means.map((m) => m.map((v) => v / 200))).maxStep * 200;
        const bw = SMALL.width / (SMALL.cols * SMALL.perCell);
        const bh = SMALL.height / (SMALL.rows * SMALL.perCell);
        const excess = ((win.width + 2 * bw) * (win.height + 2 * bh)) / (win.width * win.height);
        const rounding = 2 * RED_FLASH_SCALE * 3 * ((0.5 / 255) * (2.4 / 1.055));
        expect(step).toBeLessThanOrEqual(
          RED_FLASH_SCALE * redSlew(rates.red, DT) * excess + rounding,
        );
      }
    },
  );

  it("kırmızı kanal kapalıyken fren eskisi gibi (hız sonsuz)", () => {
    expect(guardRates(false).red).toBe(Infinity);
    expect(redSlew(Infinity, DT)).toBe(Infinity);
    expect(redSlew(GUARD_RED_RATE, 5)).toBeCloseTo(GUARD_RED_RATE * GUARD_MAX_DT - 3e-5);
  });
});
