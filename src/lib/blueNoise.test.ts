import { describe, expect, it } from "vitest";
import { BLUE_NOISE_SIZE, blueNoise, voidAndCluster } from "./blueNoise";

const N = BLUE_NOISE_SIZE;

/** 4×4 kutu ortalamalarının (toroidal) varyansı: düşük frekanslı lekelerin ölçüsü. */
function blockVariance(values: ArrayLike<number>): number {
  const means: number[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) s += values[((y + dy) % N) * N + ((x + dx) % N)] ?? 0;
      }
      means.push(s / 16);
    }
  }
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  return means.reduce((a, b) => a + (b - mean) ** 2, 0) / means.length;
}

describe("mavi gürültü", () => {
  const noise = blueNoise();

  it("her bayt değeri eşit sayıda geçer; sıralar bir permütasyon", () => {
    expect(noise).toHaveLength(N * N);
    const counts = new Array<number>(256).fill(0);
    for (const v of noise) counts[v]! += 1;
    for (const c of counts) expect(c).toBe((N * N) / 256);
    const ranks = voidAndCluster(16);
    expect([...ranks].sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i));
  });

  it("belirlenimci ve önbellekte", () => {
    expect(blueNoise()).toBe(noise);
    expect(voidAndCluster(16)).toEqual(voidAndCluster(16));
  });

  it("düşük frekanslı bileşeni beyaz gürültüden çok daha az", () => {
    // Beyaz gürültüde (0..255 düzgün) 16 pikselin ortalamasının varyansı ≈ 5461/16 ≈ 341.
    let seed = 1;
    const white = Array.from({ length: N * N }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor((seed / 2147483648) * 256);
    });
    expect(blockVariance(noise)).toBeLessThan(80);
    expect(blockVariance(noise)).toBeLessThan(blockVariance(white) / 4);
    // Komşu pikseller birbirinden belirgin farklı (beyaz gürültüde ortalama fark ≈ 85).
    let diff = 0;
    for (let i = 0; i < N * N; i++) diff += Math.abs(noise[i]! - noise[(i + 1) % (N * N)]!);
    expect(diff / (N * N)).toBeGreaterThan(85);
  });
});
