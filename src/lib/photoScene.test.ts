import { describe, expect, it } from "vitest";
import { flashWindow, windowMeans, worstWindowFlashes } from "./flash";
import {
  DEFAULT_ACCENT,
  GLOW_PX,
  GLOW_ALPHA,
  PHOTO_BARS,
  accentFromPixels,
  barRects,
  clockText,
  coreColor,
  displayUpper,
  isTurkishText,
  lineExtent,
  maxBarExtent,
  measureBest,
  meanLuminance,
  pixelContrast,
  relativeLuminance,
  shadeAlpha,
  shadeRange,
  bandAlpha,
  BAND_STOPS,
  BAND_CHOICES,
  type BarRect,
  type Rgb,
} from "./photoScene";

/** Çubukları ve ışıltılarını (çubuğun çevresinde `GLOW_PX` taşan yarı saydam alan) çizer. */
function render(
  rects: BarRect[],
  width: number,
  height: number,
  bar: number,
  background: number,
): Float64Array {
  const image = new Float64Array(width * height).fill(background);
  // Kenarlar yumuşatılır (tarayıcı gibi): piksel, dikdörtgenin kapladığı oranda boyanır.
  const paint = (r: BarRect, value: number) => {
    for (
      let y = Math.max(0, Math.floor(r.y));
      y < Math.min(height, Math.ceil(r.y + r.height));
      y++
    ) {
      const cy = Math.min(y + 1, r.y + r.height) - Math.max(y, r.y);
      for (
        let x = Math.max(0, Math.floor(r.x));
        x < Math.min(width, Math.ceil(r.x + r.width));
        x++
      ) {
        const cx = Math.min(x + 1, r.x + r.width) - Math.max(x, r.x);
        const c = Math.max(0, cx) * Math.max(0, cy);
        const at = y * width + x;
        image[at] = image[at]! * (1 - c) + value * c;
      }
    }
  };
  // Işıltı: çubuğun bulanık gölgesi. Toplam ışığı çubuğun alanının GLOW_ALPHA katı; burada
  // GLOW_PX taşan dikdörtgene aynı toplamla yayılır.
  for (const r of rects) {
    const wide = {
      x: r.x - GLOW_PX,
      y: r.y - GLOW_PX,
      width: r.width + 2 * GLOW_PX,
      height: r.height + 2 * GLOW_PX,
    };
    const spread = (GLOW_ALPHA * r.width * r.height) / (wide.width * wide.height);
    for (
      let y = Math.max(0, Math.floor(wide.y));
      y < Math.min(height, Math.ceil(wide.y + wide.height));
      y++
    ) {
      const cy = Math.min(y + 1, wide.y + wide.height) - Math.max(y, wide.y);
      for (
        let x = Math.max(0, Math.floor(wide.x));
        x < Math.min(width, Math.ceil(wide.x + wide.width));
        x++
      ) {
        const cx = Math.min(x + 1, wide.x + wide.width) - Math.max(x, wide.x);
        image[y * width + x]! += (bar - background) * spread * Math.max(0, cx) * Math.max(0, cy);
      }
    }
  }
  for (const r of rects) paint(r, bar);
  return image;
}

describe("kendi resmin sahnesi", () => {
  it.each([
    { width: 480, height: 270, bar: 1, background: 0, safe: false },
    { width: 480, height: 270, bar: 0.2, background: 0.02, safe: false },
    { width: 320, height: 480, bar: 1, background: 0, safe: false }, // dikey pencere
    { width: 480, height: 270, bar: 0, background: 1, safe: false }, // beyaz resim, koyu çubuk
    { width: 480, height: 270, bar: 1, background: 0, safe: true },
  ])(
    "çubuklar 10 Hz'de tümden yanıp sönse de parlama yok ($width×$height, çubuk $bar, zemin $background)",
    ({ width, height, bar, background, safe }) => {
      const half = maxBarExtent(width, height, bar, background, safe);
      expect(half).toBeGreaterThan(0);
      const win = flashWindow(width, height);
      const full = barRects(new Array(PHOTO_BARS).fill(1), width, height, half);
      const empty = barRects(new Array(PHOTO_BARS).fill(0), width, height, half);
      const frames: Float64Array[] = [];
      // 60 kare/sn, 3 kare dolu 3 kare boş: saniyede 10 tam yanıp sönme.
      for (let i = 0; i < 60; i++) {
        const rects = Math.floor(i / 3) % 2 === 0 ? full : empty;
        frames.push(
          windowMeans(render(rects, width, height, bar, background), width, height, win, 4),
        );
      }
      const { flashes, maxStep } = worstWindowFlashes(frames);
      expect(maxStep).toBeLessThan(0.1);
      expect(flashes).toBe(0);
    },
  );

  it("güvenli modda artış yarıya iner; çubuk ekranın küçük bir kısmında kalır", () => {
    const normal = maxBarExtent(1920, 1080, 0.3, 0.05, false);
    expect(maxBarExtent(1920, 1080, 0.3, 0.05, true)).toBeCloseTo(2 + (normal - 2) / 2);
    expect(normal).toBeLessThanOrEqual(1080 * 0.2 + 1e-9);
    expect(normal).toBeGreaterThan(100); // vuruşta belirgin iner
    expect(maxBarExtent(0, 1080, 1, 0, false)).toBe(0);
  });

  it("çubuk çizgiden aşağı sarkar, yukarıya kısa ucu çıkar; sessizlikte ince çizgi", () => {
    const rects = barRects([0, 1], 200, 100, 59);
    expect(rects[0]!.height).toBe(2);
    expect(rects[1]!.height).toBe(59);
    // Çizgi y = 50: üstte 59 · 0,18 / 1,18 = 9 piksel, altta 50.
    expect(rects[1]!.y).toBeCloseTo(41);
    expect(rects[1]!.y + rects[1]!.height).toBeCloseTo(100);
    expect(rects[1]!.x + rects[1]!.width).toBeLessThanOrEqual(200);
  });

  it("resmin baskın canlı rengi bulunur; renksiz resimde vurgu yeşili", () => {
    const pixels = (rgb: [number, number, number], n: number) =>
      Array.from({ length: n }, () => [...rgb, 255]).flat();
    // Çoğu koyu kırmızı, biraz gri ve beyaz (örnekteki gibi).
    const red = accentFromPixels([
      ...pixels([120, 20, 30], 60),
      ...pixels([128, 128, 128], 30),
      ...pixels([255, 255, 255], 10),
    ]);
    expect(red[0]).toBeGreaterThan(200);
    expect(red[1]).toBeLessThan(100);
    expect(accentFromPixels(pixels([90, 90, 90], 50))).toEqual(DEFAULT_ACCENT);
    expect(accentFromPixels([])).toEqual(DEFAULT_ACCENT);
  });

  it("büyük harf: İngilizce adda I, Türkçe harfli adda İ", () => {
    expect(displayUpper("Flying High")).toBe("FLYING HIGH");
    expect(displayUpper("DJ Splash Remix")).toBe("DJ SPLASH REMIX");
    expect(displayUpper("Şirin")).toBe("ŞİRİN");
    expect(displayUpper("Gülpembe")).toBe("GÜLPEMBE");
  });

  it("büyük harf kuralı adla sanatçı birlikte seçilir", () => {
    // "Kelimeler"de Türkçeye özgü harf yok; sanatçısı Türkçe harfliyse Türkçe kural.
    const turkish = isTurkishText("Kelimeler", "Şebnem Ferah");
    expect(turkish).toBe(true);
    expect(displayUpper("Kelimeler", turkish)).toBe("KELİMELER");
    expect(displayUpper("Şebnem Ferah", turkish)).toBe("ŞEBNEM FERAH");
    // İkisinde de yoksa İngilizce kural.
    const english = isTurkishText("Flying High", "DJ Splash Remix");
    expect(english).toBe(false);
    expect(displayUpper("Flying High", english)).toBe("FLYING HIGH");
    expect(isTurkishText(null, undefined, "")).toBe(false);
  });

  it("parlaklık ve süre yazısı", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1);
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(meanLuminance([255, 255, 255, 255, 0, 0, 0, 255])).toBeCloseTo(0.5);
    expect(meanLuminance([])).toBe(0);
    expect(clockText(25.9)).toBe("00:25");
    expect(clockText(3725)).toBe("1:02:05");
    expect(clockText(Number.NaN)).toBe("00:00");
  });
});

/*
 * Tarayıcının gerçekten çizdiği gibi model: renkler sRGB uzayında karışır (doğrusal ışıkta değil),
 * ışıltı vurgu renginde Gauss gölgesidir (σ = shadowBlur / 2), bütün çubuklar tek yolda: önce
 * yolun gölgesi, sonra öz; kenarlar yumuşatılır, resmin üstünde karartma katmanı
 * (`.photo-scene__shade`: kenar karartması ve çizginin koyu bandı) vardır.
 * Resim RGB'dir: yarısı karanlık yarısı aydınlık resim, açık zeminde kırmızı ışıltı, ince desenler.
 */
let W = 640;
let H = 360;

function lin(v: number): number {
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}
/**
 * Tarayıcı gibi: bütün çubuklar tek yol, tek doldurma. Önce yolun gölgesi (yolun kaplama
 * maskesinin Gauss bulanıklığı, σ = GLOW_PX/2, vurgu renginde GLOW_ALPHA saydamlıkla; çubuklar
 * örtüşmediğinden maske çubukların toplamıdır), sonra çubuklar (kenarlar yumuşatılmış), sRGB'de.
 */
function renderSrgb(
  rects: BarRect[],
  image: Float64Array,
  core: Rgb,
  accent: Rgb,
  band: number,
): Float64Array {
  const layer = new Float64Array(W * H * 4);
  const over = (i: number, c: Rgb, a: number) => {
    for (let k = 0; k < 3; k++) layer[i * 4 + k] = (c[k]! / 255) * a + layer[i * 4 + k]! * (1 - a);
    layer[i * 4 + 3] = a + layer[i * 4 + 3]! * (1 - a);
  };
  const sigma = GLOW_PX / 2;
  const g = (p: number, a: number, b: number) =>
    0.5 * (erf((b - p) / (sigma * Math.SQRT2)) - erf((a - p) / (sigma * Math.SQRT2)));
  const mask = new Float64Array(W * H);
  for (const r of rects) {
    for (
      let y = Math.max(0, Math.floor(r.y - 3 * sigma));
      y < Math.min(H, Math.ceil(r.y + r.height + 3 * sigma));
      y++
    ) {
      const gy = g(y + 0.5, r.y, r.y + r.height);
      for (
        let x = Math.max(0, Math.floor(r.x - 3 * sigma));
        x < Math.min(W, Math.ceil(r.x + r.width + 3 * sigma));
        x++
      ) {
        mask[y * W + x]! += gy * g(x + 0.5, r.x, r.x + r.width);
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    const a = GLOW_ALPHA * Math.min(1, mask[i]!);
    if (a > 0) over(i, accent, a);
  }
  for (const r of rects) {
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(H, Math.ceil(r.y + r.height)); y++) {
      const cy = Math.min(y + 1, r.y + r.height) - Math.max(y, r.y);
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.width)); x++) {
        const cx = Math.min(x + 1, r.x + r.width) - Math.max(x, r.x);
        over(y * W + x, core, Math.max(0, cx) * Math.max(0, cy));
      }
    }
  }
  const out = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const s = 1 - shadeAlpha((i % W) / W, Math.floor(i / W) / H, band);
    const a = layer[i * 4 + 3]!;
    const c = [0, 1, 2].map((k) => layer[i * 4 + k]! + image[i * 3 + k]! * s * (1 - a));
    out[i] = 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
  }
  return out;
}

function makeImage(at: (x: number, y: number) => Rgb): { srgb: Float64Array; rgba: number[] } {
  const srgb = new Float64Array(W * H * 3);
  const rgba: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = at(x / W, y / H);
      for (let k = 0; k < 3; k++) srgb[(y * W + x) * 3 + k] = c[k]! / 255;
      rgba.push(c[0], c[1], c[2], 255);
    }
  return { srgb, rgba };
}

/**
 * Bileşen gibi: vurgu bütün resimden, karşıtlık 2×2 blokların en koyusu ve en açığından, bant
 * koyuluğu çubukları en uzun tutan (`measureBest`).
 */
function extentNow(
  rgba: number[],
  safe = false,
  choices: readonly number[] = BAND_CHOICES,
): { extent: number; core: Rgb; accent: Rgb; band: number } {
  const accent = accentFromPixels(rgba);
  const core = coreColor(accent);
  const map = measureBest(rgba, W, H, W, H, core, accent, choices);
  return { extent: lineExtent(map, safe), core, accent, band: map.band };
}

function worst(
  at: (x: number, y: number) => Rgb,
  safe = false,
  choices: readonly number[] = BAND_CHOICES,
) {
  const img = makeImage(at);
  const { extent, core, accent, band } = extentNow(img.rgba, safe, choices);
  const win = flashWindow(W, H);
  const full = renderSrgb(
    barRects(new Array(PHOTO_BARS).fill(1), W, H, extent),
    img.srgb,
    core,
    accent,
    band,
  );
  const empty = renderSrgb(
    barRects(new Array(PHOTO_BARS).fill(0), W, H, extent),
    img.srgb,
    core,
    accent,
    band,
  );
  const a = windowMeans(full, W, H, win, 4);
  const b = windowMeans(empty, W, H, win, 4);
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
  return { extent, max, core, band };
}

const IMAGES: [string, (x: number, y: number) => Rgb][] = [
  ["koyu", () => [10, 8, 14]],
  // Ortalaması çubuğun parlaklığına yakın: eski hesap (bandın ortalaması) burada parlıyordu.
  ["yarısı siyah yarısı beyaz", (x) => (x < 0.35 ? [0, 0, 0] : [255, 255, 255])],
  ["açık bant, kırmızı resim", (_x, y) => (y > 0.38 && y < 0.8 ? [255, 255, 255] : [150, 20, 30])],
  ["açık gri", () => [200, 200, 200]],
  ["mavi", () => [20, 40, 200]],
  ["çubukların altında açık şerit", (_x, y) => (y > 0.5 && y < 0.62 ? [255, 255, 255] : [0, 0, 0])],
  ["ince dikey çizgiler", (x) => (Math.floor(x * W) % 2 ? [255, 255, 255] : [0, 0, 0])],
  ["ince yatay çizgiler", (_x, y) => (Math.floor(y * H) % 2 ? [255, 255, 255] : [200, 0, 0])],
];

describe("kendi resmin sahnesi: tarayıcı gibi çizimde parlama yok", () => {
  it.each(
    IMAGES.flatMap(([name, at]) => [
      { name, at, width: 640, height: 360, safe: false },
      { name, at, width: 360, height: 640, safe: false },
    ]).concat(
      IMAGES.slice(0, 3).map(([name, at]) => ({ name, at, width: 640, height: 360, safe: true })),
    ),
  )("$name ($width×$height, güvenli $safe)", ({ at, width, height, safe }) => {
    W = width;
    H = height;
    const r = worst(at, safe);
    expect(r.extent).toBeGreaterThanOrEqual(2);
    expect(r.max).toBeLessThan(0.1);
  });

  it.each(IMAGES.map(([name, at]) => ({ name, at })))(
    "$name: her bant koyuluğunda ölçülen boy parlamasız",
    ({ at }) => {
      W = 480;
      H = 270;
      for (const band of BAND_CHOICES) {
        const r = worst(at, false, [band]);
        expect(r.band).toBe(band);
        expect(r.max).toBeLessThan(0.1);
      }
    },
  );

  it("koyu resimde çubuklar belirgin iner; eski hesaptan kısalmaz", () => {
    W = 640;
    H = 360;
    const { extent, core } = extentNow(makeImage(() => [10, 8, 14]).rgba);
    expect(extent).toBeGreaterThan(0.8 * maxBarExtent(W, H, relativeLuminance(core), 0.004, false));
  });

  it("sRGB karışımı: açık zeminde yarı saydam koyu renk doğrusal hesaptan fazla karartır", () => {
    const red: Rgb = [245, 61, 61];
    const white: Rgb = [255, 255, 255];
    const linear = 1 - relativeLuminance(red);
    expect(pixelContrast(red, white)).toBeGreaterThan(1.5 * linear);
    // Karanlık zeminde açık renk: tam kaplamadaki fark.
    expect(pixelContrast(white, [0, 0, 0])).toBeCloseTo(1);
    // Kenar karartması ortada yok, köşede en koyu; çizginin arkasında koyu bant.
    expect(shadeAlpha(0.5, 0.35, 0.6)).toBe(0);
    expect(shadeAlpha(0, 0, 0)).toBeGreaterThan(shadeAlpha(0, 0.35, 0));
    expect(shadeAlpha(0.5, 0.5, 0.6)).toBeCloseTo(0.6 * BAND_STOPS[1]![1]);
    expect(shadeAlpha(0.5, 0.5, 0)).toBe(0);
    expect(bandAlpha(0.3, 0.6)).toBe(0);
    expect(bandAlpha(0.9, 0.6)).toBe(0);
  });
});

describe("kendi resmin sahnesi: karartma katmanı", () => {
  it("dikdörtgendeki karartma aralığı her noktayı kapsar", () => {
    for (const [x0, y0, w, h] of [
      [0.4, 0.38, 0.05, 0.08],
      [0.48, 0.49, 0.04, 0.02],
      [0, 0, 0.1, 0.1],
      [0.9, 0.6, 0.1, 0.2],
      [0.2, 0.7, 0.003, 0.003],
    ] as const) {
      for (const band of BAND_CHOICES) {
        const [lo, hi] = shadeRange(x0, x0 + w, y0, y0 + h, band);
        for (let i = 0; i <= 20; i++) {
          for (let j = 0; j <= 20; j++) {
            const a = shadeAlpha(x0 + (w * i) / 20, y0 + (h * j) / 20, band);
            expect(a).toBeGreaterThanOrEqual(lo);
            expect(a).toBeLessThanOrEqual(hi);
          }
        }
      }
    }
  });

  it("açık resimde koyu bant kırmızı çubukları uzun tutar, parlama yine yok", () => {
    W = 640;
    H = 360;
    // Beyaz tüyler kırmızı zeminde (örnek resim gibi): kırmızı çubuk, açık çizgiler.
    const feathers = (x: number, y: number): Rgb =>
      Math.floor((x * 7 + y * 3) * 40) % 3 === 0 ? [255, 240, 240] : [140, 20, 35];
    const banded = worst(feathers);
    const plain = worst(feathers, false, [0]);
    expect(banded.max).toBeLessThan(0.1);
    expect(banded.band).toBeGreaterThan(0);
    expect(banded.extent).toBeGreaterThan(2 * plain.extent);
    // Açık yeşil çizgi beyaz resimde: koyu bant karşıtlığı artırır; seçilen koyuluk bantsızdan
    // kısa çubuk vermez.
    const white = worst(() => [255, 255, 255]);
    expect(white.band).toBeLessThan(0.6);
    expect(white.extent).toBeGreaterThanOrEqual(worst(() => [255, 255, 255], false, [0]).extent);
    expect(white.max).toBeLessThan(0.1);
  });
});
