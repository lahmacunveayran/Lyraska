import { describe, expect, it } from "vitest";
import { flashWindow, windowMeans, worstWindowFlashes } from "./flash";
import {
  BAR_DUTY,
  DEFAULT_ACCENT,
  FLASH_BUDGET,
  PHOTO_BARS,
  addedLight,
  barColors,
  barGeometry,
  blurredBox,
  clockText,
  coreColor,
  coreRects,
  displayUpper,
  dominantColor,
  exactAddedLight,
  flashBudget,
  glowRects,
  imageBackground,
  isTurkishText,
  lightBound,
  limitExtents,
  measureLine,
  relativeLuminance,
  targetExtents,
  uniformBackground,
  type BarColors,
  type Background,
  type Rgb,
} from "./photoScene";

describe("kendi resmin sahnesi: görünüş (örnek videolardan ölçülen)", () => {
  it("çubuklar çizgiden yalnızca aşağı sarkar, kenardan kenara 200 çubuk", () => {
    const g = barGeometry(1920, 1080);
    expect(g.top).toBe(540);
    expect(g.pitch).toBeCloseTo(1920 / 199);
    expect(g.core).toBeCloseTo(BAR_DUTY * g.pitch);
    expect(g.rest).toBeCloseTo(0.0033 * 1080);
    expect(g.cap).toBeCloseTo(0.45 * 1080);
    const extents = targetExtents([0, 1, 0.5], g, false);
    expect(extents[0]).toBeCloseTo(g.rest);
    expect(extents[1]).toBeCloseTo(g.cap);
    expect(extents[2]).toBeCloseTo((g.rest + g.cap) / 2);
    // Güvenli modda yarı boy.
    expect(targetExtents([1], g, true)[0]).toBeCloseTo(g.rest + (g.cap - g.rest) / 2);
    const rects = coreRects(extents, g);
    expect(rects[0]!.y).toBe(540); // üst kenar çizgide: yukarı uzanmaz
    expect(rects[1]!.height).toBeCloseTo(g.cap);
    expect(rects[0]!.x + rects[0]!.width / 2).toBeCloseTo(0); // ilk çubuk sol kenarda
    const last = coreRects(new Array<number>(PHOTO_BARS).fill(4), g)[PHOTO_BARS - 1]!;
    expect(last.x + last.width / 2).toBeCloseTo(1920); // son çubuk sağ kenarda
    // Işıltı dikdörtgenleri çubuk aralığı genişliğinde, örtüşmez.
    const glows = glowRects([10, 10], g);
    expect(glows[0]!.width).toBeCloseTo(g.pitch);
    expect(glows[1]!.x).toBeCloseTo(glows[0]!.x + glows[0]!.width);
    expect(flashBudget(true)).toBe(FLASH_BUDGET / 2);
  });

  it("öz beyaza yakın (ışıltının %12'si), ışıltı aynı parlaklıkta", () => {
    // Örnekte kırmızı çubuğun özü (254, 226, 230).
    expect(coreColor([255, 0, 23])).toEqual([255, 224, 227]);
    expect(coreColor([255, 255, 255])).toEqual([255, 255, 255]);
    expect(barColors([255, 0, 23]).glowAlpha).toBeCloseTo(1, 2);
    // Beyaz ışıltı kırmızıyla aynı parlaklığı ekler: saydamlığı ~0,21.
    const white = barColors([255, 255, 255]);
    expect(white.glowAlpha).toBeCloseTo(0.2126, 3);
    expect(white.glowAlpha * relativeLuminance(white.glow)).toBeCloseTo(
      relativeLuminance([255, 0, 0]),
      3,
    );
  });

  it("baskın renk: kırmızı resimde saf kırmızı, çok renkli açık resimde beyaz", () => {
    const pixels = (rgb: Rgb, n: number) => Array.from({ length: n }, () => [...rgb, 255]).flat();
    // Çoğu koyu kırmızı, beyaz tüyler, biraz pembe (örnek resim gibi).
    const red = dominantColor([
      ...pixels([53, 14, 21], 40),
      ...pixels([250, 240, 236], 25),
      ...pixels([220, 180, 178], 15),
      ...pixels([110, 45, 55], 20),
    ]);
    expect(red[0]).toBe(255);
    expect(red[1]).toBeLessThan(40);
    expect(red[2]).toBeLessThan(60);
    // Lacivert, ten rengi, açık gök mavisi, kahverengi: tonlar birbirini götürür, beyaz.
    const mixed = dominantColor([
      ...pixels([39, 31, 60], 30),
      ...pixels([215, 185, 145], 20),
      ...pixels([190, 220, 236], 25),
      ...pixels([120, 80, 50], 10),
      ...pixels([150, 158, 158], 15),
    ]);
    expect(Math.min(...mixed)).toBeGreaterThan(225);
    // Renksiz resim ve boş örnek: beyaz. Tek renkli mavi resim: mavi.
    expect(dominantColor(pixels([90, 90, 90], 50))).toEqual([255, 255, 255]);
    expect(dominantColor([])).toEqual([255, 255, 255]);
    const blue = dominantColor(pixels([20, 40, 200], 50));
    expect(blue[2]).toBe(255);
    expect(blue[0]).toBeLessThan(40);
  });

  it("soluk tek renkli resimde (bej) çizgi de soluk: parlak turuncu değil", () => {
    const pixels = (rgb: Rgb, n: number) => Array.from({ length: n }, () => [...rgb, 255]).flat();
    const beige = dominantColor([...pixels([222, 205, 180], 70), ...pixels([200, 182, 160], 30)]);
    expect(Math.min(...beige)).toBeGreaterThan(190);
    // Koyu ama canlı kırmızı (doygunluk 0,8) yine tam canlı kırmızı.
    const crimson = dominantColor(pixels([150, 20, 40], 50));
    expect(crimson[0]).toBe(255);
    expect(crimson[1]).toBeLessThan(40);
  });
});

describe("kendi resmin sahnesi: ışık toplama sınırı", () => {
  it("piksel sınırı sRGB toplamanın gerçek artışını hiç geçmez; parçaların toplamı da", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 4000; i++) {
      const bg = [0, 1, 2].map(() => Math.floor(rand() * 256)) as Rgb;
      const parts = Array.from(
        { length: 1 + Math.floor(rand() * 4) },
        () => [0, 1, 2].map(() => rand() * 0.4) as Rgb,
      );
      const total = [0, 1, 2].map((k) => parts.reduce((s, p) => s + p[k]!, 0)) as Rgb;
      const exact = exactAddedLight(total, bg);
      const bound = parts.reduce((s, p) => s + addedLight(p, bg, bg), 0);
      expect(bound + 1e-12).toBeGreaterThanOrEqual(exact);
    }
    // Açık zeminde aynı ekleme koyu zemindekinden çok ışık verir (dışbükey eğri).
    expect(exactAddedLight([0.1, 0.1, 0.1], [200, 200, 200])).toBeGreaterThan(
      2 * exactAddedLight([0.1, 0.1, 0.1], [0, 0, 0]),
    );
    // Beyazın üstünde hiçbir şey parlamaz.
    expect(exactAddedLight([1, 0, 0], [255, 255, 255])).toBe(0);
  });

  it("Gauss bulanıklığı ışığı korur", () => {
    let sum = 0;
    for (let x = -60; x < 60; x += 0.25) sum += blurredBox(x, -5, 5, 6) * 0.25;
    expect(sum).toBeCloseTo(10, 2);
    expect(blurredBox(0, -5, 5, 6)).toBeLessThan(1);
  });
});

/*
 * Tarayıcının gerçekten çizdiği gibi model: tuvalde ışıltı dikdörtgenleri (çubuk aralığı
 * genişliğinde) ışıltı renginde `glowAlpha` saydamlıkla, CSS `blur(σ)` (Gauss) bulanıklığıyla;
 * üstüne öz (kenarları yumuşatılmış) toplanır (`lighter`, 1'de kesilir). Tuval resmin üstüne
 * `plus-lighter` ile eklenir: sRGB'de kanal kanal toplanır, 1'de kesilir. Resim RGB'dir.
 */
let W = 640;
let H = 360;

function lin(v: number): number {
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Çubukları `extents` boylarıyla resmin üstüne ekler; her pikselin bağıl parlaklığı. */
function renderSrgb(extents: number[], image: Float64Array, colors: BarColors): Float64Array {
  const g = barGeometry(W, H);
  const layer = new Float64Array(W * H * 3);
  const reach = g.glowWidth / 2 + 4 * g.sigma;
  const unit = colors.glow.map((c) => (c / 255) * colors.glowAlpha);
  for (const r of glowRects(extents, g)) {
    const y0 = Math.max(0, Math.floor(r.y - 4 * g.sigma));
    const y1 = Math.min(H, Math.ceil(r.y + r.height + 4 * g.sigma));
    const cx = r.x + r.width / 2;
    for (let y = y0; y < y1; y++) {
      const gy = blurredBox(y + 0.5, r.y, r.y + r.height, g.sigma);
      for (
        let x = Math.max(0, Math.floor(cx - reach));
        x < Math.min(W, Math.ceil(cx + reach));
        x++
      ) {
        const v = gy * blurredBox(x + 0.5, r.x, r.x + r.width, g.sigma);
        for (let k = 0; k < 3; k++) layer[(y * W + x) * 3 + k]! += v * unit[k]!;
      }
    }
  }
  for (let i = 0; i < layer.length; i++) layer[i] = Math.min(1, layer[i]!);
  for (const r of coreRects(extents, g)) {
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(H, Math.ceil(r.y + r.height)); y++) {
      const cy = Math.min(y + 1, r.y + r.height) - Math.max(y, r.y);
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.width)); x++) {
        const cx = Math.min(x + 1, r.x + r.width) - Math.max(x, r.x);
        const c = Math.max(0, cx) * Math.max(0, cy);
        for (let k = 0; k < 3; k++) {
          const i = (y * W + x) * 3 + k;
          layer[i] = Math.min(1, layer[i]! + (c * colors.core[k]!) / 255);
        }
      }
    }
  }
  const out = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const c = [0, 1, 2].map((k) => Math.min(1, image[i * 3 + k]! + layer[i * 3 + k]!));
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

/** Sınamada çubukların seviyeleri: sessizlik, hepsi dolu, tek-çift, yalnızca bas, tiz, rastgele. */
function levelPatterns(): number[][] {
  let seed = 3;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const zeros = new Array<number>(PHOTO_BARS).fill(0);
  return [
    zeros,
    new Array<number>(PHOTO_BARS).fill(1),
    zeros.map((_, i) => (i % 2 ? 1 : 0)),
    zeros.map((_, i) => (i < 40 ? 1 : 0)),
    zeros.map((_, i) => (i > 120 ? 1 : 0)),
    zeros.map((_, i) => (i < 10 ? 1 : 0)),
    ...Array.from({ length: 3 }, () => zeros.map(() => rand() ** 2)),
  ];
}

/**
 * Bileşen gibi: renk resimden, ölçüm resmin pikselleriyle (ya da verilen zeminle), her karede
 * sınır. Her desen sessizlikle art arda (saniyede 10 kez) yanıp söner; bütün pencerelerde en büyük
 * değişim.
 */
function worst(
  at: (x: number, y: number) => Rgb,
  safe = false,
  background?: Background,
): { maxStep: number; flashes: number; drawn: number[][] } {
  const img = makeImage(at);
  const sample = img.rgba.filter((_, i) => Math.floor(i / 4) % 7 === 0);
  const colors = barColors(dominantColor(sample));
  const map = measureLine(background ?? imageBackground(img.rgba, W, H), W, H, colors);
  const g = barGeometry(W, H);
  const win = flashWindow(W, H);
  const drawn = levelPatterns().map((levels) =>
    limitExtents(map, targetExtents(levels, g, safe), flashBudget(safe)),
  );
  const means = drawn.map((e) => windowMeans(renderSrgb(e, img.srgb, colors), W, H, win, 4));
  const frames: Float64Array[] = [];
  for (let p = 1; p < means.length; p++) {
    for (let i = 0; i < 6; i++) frames.push(i % 2 ? means[0]! : means[p]!);
  }
  const { flashes, maxStep } = worstWindowFlashes(frames);
  return { maxStep, flashes, drawn };
}

const IMAGES: [string, (x: number, y: number) => Rgb][] = [
  ["koyu", () => [10, 8, 14]],
  ["yarısı siyah yarısı beyaz", (x) => (x < 0.35 ? [0, 0, 0] : [255, 255, 255])],
  ["açık bant, kırmızı resim", (_x, y) => (y > 0.38 && y < 0.8 ? [255, 255, 255] : [150, 20, 30])],
  ["açık gri", () => [200, 200, 200]],
  ["orta gri", () => [128, 128, 128]],
  ["mavi", () => [20, 40, 200]],
  ["çubukların altında açık şerit", (_x, y) => (y > 0.5 && y < 0.62 ? [255, 255, 255] : [0, 0, 0])],
  ["ince dikey çizgiler", (x) => (Math.floor(x * W) % 2 ? [255, 255, 255] : [0, 0, 0])],
  ["ince yatay çizgiler", (_x, y) => (Math.floor(y * H) % 2 ? [255, 255, 255] : [200, 0, 0])],
  [
    "kırmızı zeminde beyaz tüyler",
    (x, y) => (Math.floor((x * 7 + y * 3) * 40) % 3 === 0 ? [255, 240, 240] : [140, 20, 35]),
  ],
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
    // Pencere değişimi her karede sınırın (0,08; güvenli modda 0,04) altında: parlama yok.
    expect(r.maxStep).toBeLessThanOrEqual(flashBudget(safe));
    expect(r.flashes).toBe(0);
  });

  it(
    "resim bilinmezken (yükleniyor) en kötü zemine göre ölçüm de parlamasız",
    { timeout: 120_000 },
    () => {
      W = 640;
      H = 360;
      for (const [, at] of IMAGES) {
        const r = worst(at, false, uniformBackground([0, 0, 0], [255, 255, 255]));
        expect(r.maxStep).toBeLessThanOrEqual(FLASH_BUDGET);
      }
    },
  );

  it("sınır çubukları gereksiz kısaltmaz: koyu resimde de bas belirgin iner", () => {
    W = 640;
    H = 360;
    // Koyu resimde beyaz çubuklar (en büyük karşıtlık): ilk 10 çubuk dolu → ekranın en az
    // %25'i; bütün çubuklar dolu olsa bile çizgi kaybolmaz.
    const dark = worst(() => [10, 8, 14]);
    expect(dark.drawn[5]![0]).toBeGreaterThan(0.25 * H);
    expect(dark.drawn[1]![0]).toBeGreaterThan(0.03 * H);
    // Kırmızı zeminde geniş beyaz tüyler (örnek resim gibi): 10 bas çubuğu ekranın en az %20'si.
    // (Birkaç piksellik ince desende her piksel komşularının en koyusu ve en açığıyla sayılır:
    // orada daha kısa kalır.)
    const feathers = worst((x, y) =>
      Math.floor((x * 7 + y * 3) * 6) % 3 === 0 ? [255, 240, 240] : [140, 20, 35],
    );
    expect(feathers.drawn[5]![0]).toBeGreaterThan(0.2 * H);
  });

  it("sınır, çizilen ışığın gerçek pencere artışından küçük değil", () => {
    W = 640;
    H = 360;
    const img = makeImage(IMAGES[9]![1]);
    const colors = barColors([255, 0, 23]);
    const map = measureLine(imageBackground(img.rgba, W, H), W, H, colors);
    const g = barGeometry(W, H);
    const win = flashWindow(W, H);
    const none = new Array<number>(PHOTO_BARS).fill(0);
    const base = windowMeans(renderSrgb(none, img.srgb, colors), W, H, win, 2);
    for (const levels of levelPatterns()) {
      const extents = targetExtents(levels, g, false);
      const lit = windowMeans(renderSrgb(extents, img.srgb, colors), W, H, win, 2);
      let actual = 0;
      for (let i = 0; i < lit.length; i++) actual = Math.max(actual, lit[i]! - base[i]!);
      expect(lightBound(map, extents)).toBeGreaterThanOrEqual(actual);
    }
  });

  it("resimsiz koyu zeminde vurgu yeşili çizgi de parlamasız", () => {
    W = 640;
    H = 360;
    const colors = barColors(DEFAULT_ACCENT);
    const map = measureLine(uniformBackground([0, 0, 0], [26, 20, 36]), W, H, colors);
    const g = barGeometry(W, H);
    const full = limitExtents(map, targetExtents(new Array<number>(PHOTO_BARS).fill(1), g, false));
    const rest = targetExtents(new Array<number>(PHOTO_BARS).fill(0), g, false);
    const img = makeImage(() => [26, 20, 36]);
    const win = flashWindow(W, H);
    const a = windowMeans(renderSrgb(full, img.srgb, colors), W, H, win, 4);
    const b = windowMeans(renderSrgb(rest, img.srgb, colors), W, H, win, 4);
    let max = 0;
    for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!));
    expect(max).toBeLessThanOrEqual(FLASH_BUDGET);
  });
});

describe("kendi resmin sahnesi: yazılar", () => {
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
    expect(clockText(25.9)).toBe("00:25");
    expect(clockText(3725)).toBe("1:02:05");
    expect(clockText(Number.NaN)).toBe("00:00");
  });
});
