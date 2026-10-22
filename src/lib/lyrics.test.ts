import { describe, expect, it } from "vitest";
import type { LyricLine, Lyrics } from "./backend";
import { LYRIC_LEAD, LYRIC_TAIL, NEXT_PREVIEW, lyricFrame } from "./lyrics";

function line(start: number, end: number, text: string): LyricLine {
  const words = text.split(" ");
  const step = (end - start) / words.length;
  return {
    start,
    end,
    text,
    translation: null,
    estimated: true,
    words: words.map((w, i) => ({
      start: start + i * step,
      end: start + (i + 1) * step,
      text: i < words.length - 1 ? `${w} ` : w,
    })),
  };
}

const lyrics: Lyrics = {
  source: "file",
  synced: true,
  lines: [line(10, 12, "bir iki"), line(12, 14, "üç dört"), line(30, 32, "beş")],
};

describe("kinetik sözler", () => {
  it("satır başlamadan biraz önce yumuşakça belirir", () => {
    expect(lyricFrame(lyrics, 9).line).toBeNull();
    const half = lyricFrame(lyrics, 10 - LYRIC_LEAD / 2);
    expect(half.line?.text).toBe("bir iki");
    expect(half.opacity).toBeCloseTo(0.5, 6);
    expect(half.words.map((w) => w.state)).toEqual(["upcoming", "upcoming"]);
    expect(lyricFrame(lyrics, 10).opacity).toBe(1);
  });

  it("kelimeler söylendikçe yanar; söylenenin ilerlemesi", () => {
    const frame = lyricFrame(lyrics, 11.5);
    expect(frame.words.map((w) => w.state)).toEqual(["sung", "current"]);
    expect(frame.words[1]!.progress).toBeCloseTo(0.5, 6);
    expect(frame.next?.text).toBe("üç dört");
  });

  it("hemen başlayan satıra sönmeden geçer; aradan sonra söner", () => {
    // 12. saniyede ikinci satır başlar; ilk satır o ana kadar tam görünür (araya boşluk girmez).
    for (const t of [11.7, 11.8, 11.9, 11.99]) {
      const frame = lyricFrame(lyrics, t);
      expect(frame.line?.text).toBe("bir iki");
      expect(frame.opacity).toBe(1);
    }
    expect(lyricFrame(lyrics, 12.01).line?.text).toBe("üç dört");
    expect(lyricFrame(lyrics, 12.01).opacity).toBe(1);
    // İkinci satırdan sonra uzun ara: söner.
    expect(lyricFrame(lyrics, 14 + LYRIC_TAIL / 2).opacity).toBeCloseTo(0.5, 6);
    const gap = lyricFrame(lyrics, 20);
    expect(gap.line).toBeNull();
    expect(gap.next).toBeNull();
    // Sıradaki satır yaklaşınca yalnızca o, soluk gösterilir.
    const soon = lyricFrame(lyrics, 30 - NEXT_PREVIEW + 0.1);
    expect(soon.line).toBeNull();
    expect(soon.next?.text).toBe("beş");
  });

  it("zamansız ya da boş sözler sahnede gösterilmez", () => {
    expect(lyricFrame({ ...lyrics, synced: false }, 11).line).toBeNull();
    expect(lyricFrame({ ...lyrics, lines: [] }, 11).line).toBeNull();
    expect(lyricFrame(null, 11).line).toBeNull();
    expect(lyricFrame(lyrics, Number.NaN).line).toBeNull();
  });

  it("görünürlük hiçbir anda sıçramaz (ani kaybolma ya da parlama yok)", () => {
    let previous = lyricFrame(lyrics, 0).opacity;
    for (let t = 0; t <= 40; t += 0.01) {
      const frame = lyricFrame(lyrics, t);
      // Satır değişirken yazı tam görünür kalır ya da ~10 ms'de en çok 0,05 değişir.
      expect(Math.abs(frame.opacity - previous)).toBeLessThanOrEqual(0.05 + 1e-9);
      previous = frame.opacity;
    }
  });

  it("çok satırda doğru satırı bulur", () => {
    const many: Lyrics = {
      source: "embedded",
      synced: true,
      lines: Array.from({ length: 500 }, (_, i) => line(i * 2, i * 2 + 2, `satır ${i}`)),
    };
    expect(lyricFrame(many, 777.3).line?.text).toBe("satır 388");
    expect(lyricFrame(many, 0).line?.text).toBe("satır 0");
  });
});
