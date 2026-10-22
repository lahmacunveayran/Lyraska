import { describe, expect, it } from "vitest";
import { countFlashes, flashWindow, windowMeans, worstWindowFlashes } from "./flash";

describe("parlama sayacı", () => {
  it("%10'luk zıt değişim çiftlerini sayar", () => {
    expect(countFlashes([0, 0.2, 0, 0.2, 0])).toBe(2);
    expect(countFlashes([0, 0.05, 0, 0.05, 0])).toBe(0); // eşiğin altında
    expect(countFlashes([0, 0.1, 0.2, 0.3])).toBe(0); // tek yönlü değişim parlama değil
    expect(countFlashes([])).toBe(0);
  });

  it("yavaş da olsa gidip gelmeyi sayar", () => {
    const wave = Array.from({ length: 400 }, (_, i) => 0.5 + 0.2 * Math.sin(i / 20));
    expect(countFlashes(wave)).toBeGreaterThanOrEqual(2);
  });
});

describe("parlama penceresi", () => {
  it("1024×768 ekranda 341×256, başka genişlikte aynı oranda", () => {
    expect(flashWindow(1024, 768)).toEqual({ width: 341, height: 256 });
    expect(flashWindow(320, 180)).toEqual({ width: 107, height: 80 });
    expect(flashWindow(4, 2)).toEqual({ width: 1, height: 1 });
  });

  it("pencere ortalamaları her konumda doğru", () => {
    // 4×3 görüntü, sol iki sütun parlak.
    const lum = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0];
    const means = windowMeans(lum, 4, 3, { width: 2, height: 2 }, 1);
    expect(Array.from(means)).toEqual([1, 0.5, 0, 1, 0.5, 0]);
  });

  it("en çok parlayan pencereyi bulur", () => {
    // İki pencere: ilki saniyede (60 karede) 2 kez gidip geliyor, ikincisi sabit.
    const frames = Array.from({ length: 60 }, (_, i) =>
      Float64Array.from([Math.floor(i / 15) % 2 ? 0.5 : 0, 0.3]),
    );
    const worst = worstWindowFlashes(frames);
    expect(worst.flashes).toBe(1);
    expect(worst.maxStep).toBeCloseTo(0.5);
  });
});
