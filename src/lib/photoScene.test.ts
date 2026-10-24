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
  displayUpper,
  maxBarExtent,
  meanLuminance,
  relativeLuminance,
  type BarRect,
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
