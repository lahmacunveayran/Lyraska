import { describe, expect, it } from "vitest";
import {
  BLOOM_THRESHOLD,
  BLOOM_KNEE,
  COMPOSITE_SHADER,
  DITHER_CODES,
  DOWNSAMPLE_BOX_WEIGHTS,
  DOWNSAMPLE_SHADER,
  GRAIN_CODES,
  RESOLUTION_AT_START,
  RESOLUTION_MAX,
  RESOLUTION_MIN,
  TENT_WEIGHTS,
  TONE_KNEE,
  bloomLevelCount,
  bloomLevelWeights,
  bloomPrefilter,
  grainAmount,
  linearToSrgb,
  luminance,
  VIGNETTE_MAX,
  sceneTargetSize,
  scaledSize,
  smoothWarmth,
  srgbToLinear,
  stepResolution,
  toneCurve,
  toneMap,
  vignette,
  warmthGains,
  type ResolutionState,
  type Rgb,
} from "./postProcess";

const DT = 1 / 60;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Belirlenimci rastgele renkler (0..3, doğrusal ışık; 1'in üstü taşan ışık). */
function colors(count: number): Rgb[] {
  let a = 12345;
  const next = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  return Array.from({ length: count }, () => [next() * 3, next() * 3, next() * 3] as Rgb);
}

describe("ton eşleme", () => {
  it("dize kadar birebir; sonra tekdüze, eğimi ≤ 1, 1'i aşmaz", () => {
    for (let x = 0; x <= TONE_KNEE; x += 0.01) expect(toneCurve(x)).toBeCloseTo(x, 12);
    let last = 0;
    for (let x = 0.001; x < 40; x += 0.001) {
      const y = toneCurve(x);
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y - last).toBeLessThanOrEqual(0.001 + 1e-12);
      expect(y).toBeLessThanOrEqual(1);
      if (x < 10) expect(y).toBeLessThan(1);
      last = y;
    }
    // Dizde eğim sürekli (kırık yok).
    const h = 1e-6;
    expect((toneCurve(TONE_KNEE + h) - toneCurve(TONE_KNEE)) / h).toBeCloseTo(1, 4);
    // Bozuk değerde çökmez.
    expect(toneCurve(Number.NaN)).toBe(0);
    expect(toneCurve(-1)).toBe(0);
    expect(toneCurve(Infinity)).toBe(1);
  });

  it("parlaklığı hiçbir zaman artırmaz, tonu korur, değişimi büyütmez", () => {
    for (const c of colors(2000)) {
      const out = toneMap(c);
      expect(Math.max(...out)).toBeLessThanOrEqual(1);
      expect(luminance(out)).toBeLessThanOrEqual(luminance(c) + 1e-12);
      // Aynı rengin iki parlaklığı (müziğin parlaklık çarpanı gibi): ekrandaki fark doğrusal
      // ışıktaki farktan büyük olamaz.
      for (const [g1, g2] of [
        [0.72, 1],
        [0.2, 0.4],
        [1, 3],
      ] as const) {
        const a = luminance(toneMap([c[0] * g1, c[1] * g1, c[2] * g1]));
        const b = luminance(toneMap([c[0] * g2, c[1] * g2, c[2] * g2]));
        expect(b).toBeGreaterThanOrEqual(a - 1e-12);
        expect(b - a).toBeLessThanOrEqual((g2 - g1) * luminance(c) + 1e-12);
      }
    }
    // Koyu renk olduğu gibi kalır; bozuk değer siyaha ya da beyaza gider, NaN üretmez.
    expect(toneMap([0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    expect(toneMap([Number.NaN, 0, 0])).toEqual([0, 0, 0]);
    expect(toneMap([Infinity, 0, 0])).toEqual([1, 1, 1]);
  });

  it("sRGB dönüşümleri birbirinin tersi", () => {
    for (let v = 0; v <= 1; v += 0.01) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 9);
    expect(srgbToLinear(1.2)).toBeGreaterThan(1); // taşan ışık korunur
  });

  it("gölgelendiricideki sabitler TypeScript'tekilerle aynı", () => {
    expect(COMPOSITE_SHADER).toContain(TONE_KNEE.toFixed(6));
    expect(DOWNSAMPLE_SHADER).toContain((BLOOM_THRESHOLD - BLOOM_KNEE).toFixed(6));
    for (const source of [COMPOSITE_SHADER, DOWNSAMPLE_SHADER]) {
      expect(source.startsWith("#version 300 es")).toBe(true);
      expect(source.match(/void main\(\)/g)).toHaveLength(1);
      expect(source).not.toContain("`");
    }
  });
});

describe("bloom", () => {
  it("süzgeç ağırlıkları ve seviye ağırlıkları toplamı 1", () => {
    expect(sum(DOWNSAMPLE_BOX_WEIGHTS)).toBeCloseTo(1, 12);
    expect(sum(TENT_WEIGHTS)).toBeCloseTo(1, 12);
    for (let n = 1; n <= 6; n++) {
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const w = bloomLevelWeights(s, n);
        expect(w).toHaveLength(n);
        expect(sum(w)).toBeCloseTo(1, 12);
        for (const x of w) expect(x).toBeGreaterThanOrEqual(0);
      }
    }
    // Yarıçap büyüdükçe geniş seviyelerin payı artar.
    const narrow = bloomLevelWeights(0.4, 6);
    const wide = bloomLevelWeights(0.8, 6);
    expect(wide[5]!).toBeGreaterThan(narrow[5]!);
    expect(wide[0]!).toBeLessThan(narrow[0]!);
  });

  it("eşik süzgeci tekdüze, eğimi ≤ 1, ışığı artırmaz", () => {
    expect(bloomPrefilter(0)).toBe(0);
    expect(bloomPrefilter(BLOOM_THRESHOLD - BLOOM_KNEE)).toBe(0);
    let last = 0;
    for (let x = 0.0005; x < 5; x += 0.0005) {
      const y = bloomPrefilter(x);
      expect(y).toBeGreaterThanOrEqual(last);
      expect(y - last).toBeLessThanOrEqual(0.0005 + 1e-12);
      expect(y).toBeLessThanOrEqual(x);
      last = y;
    }
  });

  it("seviye sayısı görüntünün boyuna göre", () => {
    expect(bloomLevelCount(1920, 1080)).toBe(6);
    expect(bloomLevelCount(640, 360)).toBe(5);
    expect(bloomLevelCount(16, 16)).toBe(1);
    expect(bloomLevelCount(1, 1)).toBe(1);
  });
});

describe("renk, vinyet ve gren", () => {
  it("renk sıcaklığı bağıl parlaklığı değiştirmez ve yavaş döner", () => {
    for (let w = 0; w <= 1.0001; w += 0.1) expect(luminance(warmthGains(w))).toBeCloseTo(1, 12);
    const warm = warmthGains(1);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const neutral = warmthGains(0.5);
    for (const g of neutral) expect(g).toBeCloseTo(1, 12);
    expect(warmthGains(Number.NaN)).toEqual(neutral);
    // Soğuktan sıcağa bir karede sıçramaz; birkaç saniyede varır.
    expect(smoothWarmth(0, 1, DT)).toBeLessThan(0.01);
    let w = 0;
    for (let i = 0; i < 60 * 12; i++) w = smoothWarmth(w, 1, DT);
    expect(w).toBeGreaterThan(0.95);
  });

  it("titretme ve gren ±2 kod değerini geçmez", () => {
    let peak = 0;
    for (let l = 0; l <= 1; l += 0.01) peak = Math.max(peak, grainAmount(l));
    expect(peak).toBeCloseTo(1, 3);
    expect(grainAmount(0)).toBe(0);
    expect(grainAmount(1)).toBe(0);
    expect(DITHER_CODES / 2 + GRAIN_CODES * peak).toBeLessThanOrEqual(2);
  });

  it("vinyet ortada 1, köşede en fazla VIGNETTE_MAX kadar karartır, sınırlı", () => {
    expect(vignette(0, 0, 0.5)).toBe(1);
    expect(vignette(1, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(vignette(1, 1, 9)).toBeCloseTo(1 - VIGNETTE_MAX, 12);
    expect(vignette(1, 1, Number.NaN)).toBe(1);
    // Ortadan kenara tekdüze azalır.
    let last = 1;
    for (let r = 0; r <= 1.0001; r += 0.05) {
      const v = vignette(r, r, 0.4);
      expect(v).toBeLessThanOrEqual(last + 1e-12);
      last = v;
    }
  });

  it("son geçiş pozlama ve vinyeti ton eşlemeden önce/sonra doğru yerde uygular", () => {
    expect(COMPOSITE_SHADER).toContain("toneMap((scene + bloom * uBloomStrength) * uExposure)");
    expect(COMPOSITE_SHADER).toContain("uVignette");
  });
});

describe("dinamik çözünürlük", () => {
  const run = (state: ResolutionState, frameMs: number, seconds: number) => {
    let s = state;
    const scales: number[] = [];
    for (let t = 0; t < seconds * 1000; t += frameMs) {
      s = stepResolution(s, frameMs);
      scales.push(s.scale);
    }
    return { state: s, scales };
  };
  const changes = (scales: number[]) =>
    scales.filter((x, i) => i > 0 && x !== scales[i - 1]).length;

  it("60 karede tam çözünürlükte kalır", () => {
    const { state, scales } = run(RESOLUTION_AT_START, 1000 / 60, 30);
    expect(state.scale).toBe(RESOLUTION_MAX);
    expect(changes(scales)).toBe(0);
  });

  it("yük sürerse adım adım düşer, en az %60; yük kalkınca yavaşça geri çıkar", () => {
    // Açılışta 2 sn bekleme; sonra yük 0,75 sn sürünce bir adım.
    const heavy = run(RESOLUTION_AT_START, 1000 / 30, 3);
    expect(heavy.state.scale).toBeCloseTo(0.9, 10);
    const longer = run(heavy.state, 1000 / 30, 30);
    expect(longer.state.scale).toBe(RESOLUTION_MIN);
    // Her değişim arasında en az bekleme süresi var.
    const all = [...heavy.scales, ...longer.scales];
    let lastChange = -Infinity;
    all.forEach((x, i) => {
      if (i > 0 && x !== all[i - 1]) {
        expect((i - lastChange) / 30).toBeGreaterThanOrEqual(2 - 1e-9);
        lastChange = i;
      }
    });
    // Yük sürdükçe (iki dakika) ekranı 30 Hz sanıp yeniden yükselmez.
    expect(run(longer.state, 1000 / 30, 120).state.scale).toBe(RESOLUTION_MIN);
    // Yük kalkınca: 4 sn'den önce yükselmez, sonra en fazla yarım adımlarla.
    const early = run(longer.state, 1000 / 60, 3);
    expect(early.state.scale).toBe(RESOLUTION_MIN);
    const back = run(longer.state, 1000 / 60, 60);
    expect(back.state.scale).toBe(RESOLUTION_MAX);
  });

  it("gidip gelen yükte salınmaz (histerezis)", () => {
    // Her yarım saniyede bir ağır ve hafif kareler: ölçek dakikada birkaç kezden fazla değişmez.
    let s = RESOLUTION_AT_START;
    const scales: number[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      const heavyPhase = Math.floor(i / 30) % 2 === 0;
      s = stepResolution(s, heavyPhase ? 1000 / 40 : 1000 / 60);
      scales.push(s.scale);
    }
    expect(changes(scales)).toBeLessThanOrEqual(4);
    for (const x of scales) {
      expect(x).toBeGreaterThanOrEqual(RESOLUTION_MIN);
      expect(x).toBeLessThanOrEqual(RESOLUTION_MAX);
    }
  });

  it("uzun aralıkları (sekme gizli, boşta) ve bozuk değerleri yok sayar", () => {
    expect(stepResolution(RESOLUTION_AT_START, 1000)).toBe(RESOLUTION_AT_START);
    expect(stepResolution(RESOLUTION_AT_START, Number.NaN)).toBe(RESOLUTION_AT_START);
    expect(stepResolution(RESOLUTION_AT_START, -5)).toBe(RESOLUTION_AT_START);
  });

  it("120 Hz ekranda yenilemeyi tanır", () => {
    const fast = run(RESOLUTION_AT_START, 1000 / 120, 10);
    expect(fast.state.scale).toBe(RESOLUTION_MAX);
    expect(fast.state.refreshMs).toBeLessThan(9);
    // 120 Hz ekranda 60 kare yetişemiyor demektir: düşer.
    const slow = run(fast.state, 1000 / 60, 2);
    expect(slow.state.scale).toBeLessThan(RESOLUTION_MAX);
  });

  it("sahne dokusunun boyu ölçekle, en az 1 piksel", () => {
    expect(scaledSize(1920, 1080, 0.6)).toEqual({ width: 1152, height: 648 });
    expect(scaledSize(1, 1, 0.6)).toEqual({ width: 1, height: 1 });
  });

  it("sahne dokusu piksel sayısıyla sınırlı: ekran yoğunluğundan bağımsız", () => {
    const cap = 1280 * 720;
    // 4K tuval de 1080p tuval de aynı yükle çizilir (en-boy oranı korunur).
    const big = sceneTargetSize(3840, 2160, cap, 1);
    const fhd = sceneTargetSize(1920, 1080, cap, 1);
    expect(big).toEqual({ width: 1280, height: 720 });
    expect(fhd).toEqual(big);
    // Küçük tuval büyütülmez; dinamik ölçek ayrıca küçültür.
    expect(sceneTargetSize(640, 360, cap, 1)).toEqual({ width: 640, height: 360 });
    expect(sceneTargetSize(1920, 1080, cap, 0.5)).toEqual({ width: 640, height: 360 });
    expect(sceneTargetSize(1920, 1080, cap, Number.NaN)).toEqual(big);
  });
});
