import { describe, expect, it } from "vitest";
import { patternPhase } from "./flashGuardCheck";

// Hata avı (1 Kasım 2026) A12: desen her yarım periyotta tersine döner; kayan nokta yuvarlaması
// bir kareyi atlatmaz.
describe("parlama denetiminin deseni", () => {
  it("saniyede 60 kez tersine dönen desen her karede döner", () => {
    for (let i = 1; i < 240; i++) {
      expect(patternPhase(i, 60), `kare ${i}`).not.toBe(patternPhase(i - 1, 60));
    }
  });

  it("saniyede 6 kez tersine dönen desen her 10 karede döner", () => {
    const flips = [];
    for (let i = 1; i < 240; i++) if (patternPhase(i, 6) !== patternPhase(i - 1, 6)) flips.push(i);
    expect(flips).toEqual(Array.from({ length: 23 }, (_, k) => 10 * (k + 1)));
  });
});
