import { afterEach, describe, expect, it } from "vitest";

import {
  BACKDROP_MAX,
  BACKDROP_MIN,
  DEFAULT_LOOK,
  TARGET_CONTRAST,
  backdropFor,
  clampScale,
  clampTop,
  colorLuminance,
  contrastRatio,
  formatScale,
  formatTop,
  loadLook,
  lookVars,
  lumaGrid,
  mergeLuma,
  normalizeColor,
  regionLight,
  sanitizeLook,
  saveLook,
} from "./photoLyricLook";

/** Örtüyü tarayıcı gibi sRGB'de karıştırıp karşıtlığı yeniden hesaplar (fonksiyondan bağımsız). */
function contrastAfter(text: number, ground: number, tone: "dark" | "light", alpha: number) {
  const toSrgb = (l: number) => (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const c = toSrgb(ground) * (1 - alpha) + (tone === "light" ? 1 : 0) * alpha;
  return contrastRatio(text, toLin(c));
}

describe("photoLyricLook", () => {
  afterEach(() => window.localStorage.clear());

  it("boyut ve yükseklik aralığa ve adıma oturur; bozuk değer varsayılan", () => {
    expect(clampScale(1.43)).toBe(1.4);
    expect(clampScale(9)).toBe(2.4);
    expect(clampScale(0.1)).toBe(0.8);
    expect(clampScale(Number.NaN)).toBe(DEFAULT_LOOK.scale);
    expect(clampTop(0.2049)).toBe(0.2);
    expect(clampTop(0.9)).toBe(0.46);
    expect(clampTop(0)).toBe(0.06);
    expect(formatScale(1.4)).toBe("1,4×");
    expect(formatTop(0.16)).toBe("%16");
  });

  it("renk yalnızca #rrggbb; bozuk kayıt alan alan varsayılana döner", () => {
    expect(normalizeColor("#FFE2A8")).toBe("#ffe2a8");
    expect(normalizeColor("ffe2a8")).toBe("#ffe2a8");
    expect(normalizeColor("red")).toBeNull();
    expect(normalizeColor("#fff")).toBeNull();
    expect(
      sanitizeLook({ scale: 2, place: "top", top: 0.3, color: "#00ff00", backdrop: "off" }),
    ).toEqual({ scale: 2, place: "top", top: 0.3, color: "#00ff00", backdrop: "off" });
    expect(sanitizeLook({ scale: "büyük", place: "orta", color: 5, backdrop: 1 })).toEqual(
      DEFAULT_LOOK,
    );
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK);
  });

  it("kaydedilir ve okunur; bozuk JSON varsayılan", () => {
    saveLook({ ...DEFAULT_LOOK, scale: 1.8, place: "top", color: "#bfe6ff" });
    expect(loadLook()).toEqual({ ...DEFAULT_LOOK, scale: 1.8, place: "top", color: "#bfe6ff" });
    window.localStorage.setItem("lyraska.photoLyricLook", "{bozuk");
    expect(loadLook()).toEqual(DEFAULT_LOOK);
  });

  it("varsayılan boy eskisinden büyük (sahibi: yazı küçüktü)", () => {
    expect(DEFAULT_LOOK.scale).toBeGreaterThan(1);
  });

  it("açık yazıda zemin koyu ve en az 7:1 karşıtlık; koyu resimde en az örtü", () => {
    const white = colorLuminance("#ffffff");
    expect(white).toBeCloseTo(1, 6);
    for (const ground of [0.05, 0.2, 0.4, 0.6, 0.8]) {
      const b = backdropFor(white, ground, ground);
      expect(b.tone).toBe("dark");
      expect(contrastAfter(white, ground, b.tone, b.alpha)).toBeGreaterThanOrEqual(TARGET_CONTRAST);
      // En küçük yeterli oran: 0,01 eksiği yetmez (en az sınırında değilse).
      if (b.alpha > BACKDROP_MIN) {
        expect(contrastAfter(white, ground, b.tone, b.alpha - 0.01)).toBeLessThan(TARGET_CONTRAST);
      }
    }
    expect(backdropFor(white, 0.02, 0.0).alpha).toBe(BACKDROP_MIN);
    // Daha açık resim daha koyu zemin ister.
    expect(backdropFor(white, 0.8, 0.8).alpha).toBeGreaterThan(backdropFor(white, 0.3, 0.3).alpha);
  });

  it("bembeyaz resimde beyaz yazı 7:1'i sınırın altında bulur; açık renkli yazı daha koyu zemin ister", () => {
    const white = backdropFor(1, 1, 1);
    expect(white.tone).toBe("dark");
    expect(white.alpha).toBeLessThan(BACKDROP_MAX);
    expect(contrastAfter(1, 1, "dark", white.alpha)).toBeGreaterThanOrEqual(TARGET_CONTRAST);
    const rose = colorLuminance("#ffc4dc");
    expect(backdropFor(rose, 1, 1).alpha).toBeGreaterThan(white.alpha);
    // Yetmeyen durumda sınırda kalır (resim yine seçilir).
    expect(backdropFor(0.2, 1, 1)).toEqual({ tone: "dark", alpha: BACKDROP_MAX });
  });

  it("koyu yazıda zemin açık, en koyu yere göre", () => {
    const navy = colorLuminance("#10204a");
    const b = backdropFor(navy, 0.9, 0.02);
    expect(b.tone).toBe("light");
    expect(contrastAfter(navy, 0.02, "light", b.alpha)).toBeGreaterThanOrEqual(TARGET_CONTRAST);
  });

  it("parlaklık ızgarası ve bölgenin %90/%10 dilimleri", () => {
    // 10×10 resim: üst yarı beyaz, alt yarı siyah.
    const w = 10;
    const h = 10;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = y < 5 ? 255 : 0;
        rgba.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    const grid = lumaGrid(rgba, w, h);
    expect(grid.width).toBe(10);
    expect(grid.height).toBe(10);
    expect(regionLight(grid, grid, { left: 0, right: 1, top: 0, bottom: 0.4 })).toEqual({
      brightest: 1,
      darkest: 1,
    });
    const mixed = regionLight(grid, grid, { left: 0, right: 1, top: 0.3, bottom: 0.7 });
    expect(mixed).toEqual({ brightest: 1, darkest: 0 });
    expect(regionLight(grid, grid, { left: 0, right: 1, top: 1.2, bottom: 1.5 })).toBeNull();
  });

  it("geniş resimde ızgara küçülür, oran korunur", () => {
    const grid = lumaGrid(new Uint8ClampedArray(960 * 540 * 4), 960, 540);
    expect(grid.width).toBe(96);
    expect(grid.height).toBe(54);
  });

  it("hareketli resmin kareleri: hücre hücre en açık ve en koyu", () => {
    const a = { data: Float32Array.from([0.1, 0.9]), width: 2, height: 1 };
    const b = { data: Float32Array.from([0.5, 0.2]), width: 2, height: 1 };
    const merged = mergeLuma(mergeLuma(null, a), b);
    expect(Array.from(merged.max.data)).toEqual([0.5, Math.fround(0.9)]);
    expect(Array.from(merged.min.data)).toEqual([Math.fround(0.1), Math.fround(0.2)]);
    // İlk ızgara kopyalanır (kaynağı değişmez).
    expect(Array.from(a.data)).toEqual([Math.fround(0.1), Math.fround(0.9)]);
  });

  it("CSS değişkenleri", () => {
    expect(lookVars({ ...DEFAULT_LOOK, scale: 1.8, top: 0.3, color: "#FFC4DC" })).toEqual({
      "--photo-lyric-scale": "1.8",
      "--photo-lyric-color": "#ffc4dc",
      "--photo-lyric-top": "30.0%",
    });
  });
});
