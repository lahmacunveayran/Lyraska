import { describe, expect, it } from "vitest";
import { RELEASE_TAU, barTargets, barTargetsFromBands, stepBars } from "./spectrumBars";

describe("ince spektrum çubukları", () => {
  it("çekirdeğin çubukları yoksa 32 banttan soldan sağa ara değerle", () => {
    const levels = barTargetsFromBands([1, 0], 3);
    expect(levels[0]).toBe(1);
    expect(levels[2]).toBe(0);
    expect(levels[1]).toBeGreaterThan(0);
    expect(levels[1]).toBeLessThan(0.5);
    expect(barTargetsFromBands([], 2)).toEqual([0, 0]);
  });

  it("çubuk hemen yükselir, bir iki karede söner (örnek videolardaki gibi)", () => {
    // 60 kare/sn'de bir karede yüksekliğinin e^(−1/(60·0,02)) ≈ %43'ünü korur.
    expect(stepBars([0, 1], [1, 0], 1 / 60)).toEqual([1, expect.closeTo(0.435, 2)]);
    expect(RELEASE_TAU).toBeLessThanOrEqual(0.02);
    let level = [1];
    for (let i = 0; i < 6; i++) level = stepBars(level, [0], 1 / 60);
    expect(level[0]!).toBeLessThan(0.01); // 0,1 saniyede sönmüş
  });

  it("çekirdek boş ya da eksik dizi verirse bantlardan: çizgi hiç kaybolmaz", () => {
    // Çalan oturum yokken çekirdek boş dizi döndürür; çubuk sayısı tutmayan dizi de kullanılmaz.
    const bands = [1, 0];
    expect(barTargets([], bands, 3)).toEqual(barTargetsFromBands(bands, 3));
    expect(barTargets([0.5, 0.5], bands, 3)).toEqual(barTargetsFromBands(bands, 3));
    expect(barTargets(null, bands, 3)).toEqual(barTargetsFromBands(bands, 3));
    expect(barTargets([0.1, 0.2, 0.3], bands, 3)).toEqual([0.1, 0.2, 0.3]);
    // Bozuk değerler 0..1'e sıkıştırılır.
    expect(barTargets([Number.NaN, 2, -1], bands, 3)).toEqual([0, 1, 0]);
  });
});
