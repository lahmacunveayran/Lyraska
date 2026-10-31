import { describe, expect, it } from "vitest";
import {
  LYRIC_FRAME_LIMIT_MS,
  LYRIC_SLOW_FRAME_MS,
  LYRIC_TOLERANCE_MS,
  lyricClockVerdict,
  lyricTolerance,
} from "./lyricClock.mjs";

/** n ölçüm: `bad` tanesi `high` ms, geri kalanı `low` ms sapar (işaret karışık). */
const errors = (n, low, bad, high) =>
  Array.from({ length: n }, (_, i) => (i < bad ? high : low) * (i % 2 ? -1 : 1));

describe("söz saati denetiminin sınırı", () => {
  it("60 Hz'te ve daha hızlıda 8 ms; kareler 17 ms'den uzunsa ölçülen karenin yarısı", () => {
    for (const frameMs of [1000 / 60, 16.8, LYRIC_SLOW_FRAME_MS, 10]) {
      expect(lyricTolerance(frameMs)).toBe(LYRIC_TOLERANCE_MS);
    }
    expect(lyricTolerance(17.2)).toBeCloseTo(8.6);
    expect(lyricTolerance(19.9)).toBeCloseTo(9.95);
    expect(lyricTolerance(Number.NaN)).toBe(LYRIC_TOLERANCE_MS);
  });

  it("yavaş CI makinesindeki titreme geçer (31 Ekim 2026, #168: kare 18,7 ve 19,9 ms)", () => {
    // O çalışmalarda %95'lik değer 8,4 ve 9,7 ms idi; ortalama ~0 (kayma yok, yalnızca titreme).
    const slow = lyricClockVerdict(errors(255, 3, 20, 9.7), 19.9);
    expect(slow.p95).toBe(9.7);
    expect(slow.ok).toBe(true);
    expect(lyricClockVerdict(errors(269, 3, 20, 8.4), 18.7).ok).toBe(true);
  });

  it("60 Hz'te sınır aynı kalır: %95'i 8 ms'yi aşan saat yine kalır", () => {
    expect(lyricClockVerdict(errors(300, 3, 20, 8.4), 1000 / 60).ok).toBe(false);
  });

  it("sistematik bir kare gecikme sıkı yolun her kare süresinde yakalanır", () => {
    for (const frameMs of [1000 / 60, 18, 19.9]) {
      expect(lyricClockVerdict(errors(300, 1000 / 60, 0, 0), frameMs).ok).toBe(false);
    }
  });

  it("tek bir karede bir kareyi aşan sapma %99'da yakalanır", () => {
    const verdict = lyricClockVerdict(errors(300, 3, 5, LYRIC_FRAME_LIMIT_MS + 5), 19.9);
    expect(verdict.p95).toBe(3);
    expect(verdict.ok).toBe(false);
  });
});
