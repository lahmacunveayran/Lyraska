import { describe, expect, it } from "vitest";
import { parseShard, pickShard } from "./shard.mjs";

describe("sahne denetimini parçalara bölme", () => {
  it("SCENE_SHARD okunur; boşsa tek parça, bozuksa hata", () => {
    expect(parseShard(undefined)).toEqual({ index: 1, count: 1 });
    expect(parseShard("2/3")).toEqual({ index: 2, count: 3 });
    for (const bad of ["0/3", "4/3", "1/0", "abc", "1-3", "2/"]) {
      expect(() => parseShard(bad)).toThrow(/SCENE_SHARD/);
    }
  });

  it("parçaların birleşimi tam olarak bütün denetimlerdir (eksik ve tekrar yok)", () => {
    const items = Array.from({ length: 47 }, (_, i) => i);
    for (const count of [1, 2, 3, 5]) {
      const parts = Array.from({ length: count }, (_, i) =>
        pickShard(items, { index: i + 1, count }),
      );
      expect(parts.flat().sort((a, b) => a - b)).toEqual(items);
      // Parçalar dengeli: en büyük ile en küçük arasında en çok bir denetim fark.
      const sizes = parts.map((p) => p.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });
});
