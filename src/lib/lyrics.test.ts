import { afterEach, describe, expect, it } from "vitest";
import type { LyricLine, Lyrics } from "./backend";
import {
  AUTO_TIMING_TEXT,
  LYRIC_LEAD,
  LYRIC_MIN_SCALE,
  LYRIC_TAIL,
  MAX_SAVED_SHIFTS,
  NEXT_PREVIEW,
  autoTiming,
  clampLyricShift,
  formatLyricShift,
  hasTimedLyrics,
  loadLyricShift,
  lyricFit,
  lyricFrame,
  lyricPan,
  lyricShiftKey,
  lyricTime,
  lyricsTextStats,
  photoLyricWords,
  saveLyricShift,
  type WordState,
} from "./lyrics";

function line(start: number, end: number, text: string): LyricLine {
  const words = text.split(" ");
  const step = (end - start) / words.length;
  return {
    start,
    end,
    text,
    translation: null,
    estimated: true,
    uncertain: false,
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
  auto: null,
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
      auto: null,
    };
    expect(lyricFrame(many, 777.3).line?.text).toBe("satır 388");
    expect(lyricFrame(many, 0).line?.text).toBe("satır 0");
  });
});

describe("Kendi resmin: başlık bloğundaki söz satırı", () => {
  it("yer yalnızca zamanlı, satırı olan sözlere ayrılır", () => {
    expect(hasTimedLyrics(lyrics)).toBe(true);
    expect(hasTimedLyrics(null)).toBe(false);
    expect(hasTimedLyrics({ ...lyrics, synced: false })).toBe(false);
    expect(hasTimedLyrics({ ...lyrics, lines: [] })).toBe(false);
  });

  it("söylenen kelime ışıldar; güvenli modda hiçbir kelime ışıldamaz", () => {
    // 10,5 sn: "bir" söyleniyor (10–11), "iki" sırada.
    const frame = lyricFrame(lyrics, 10.5);
    expect(photoLyricWords(frame, false)).toEqual([
      { text: "bir ", state: "current", glow: true },
      { text: "iki", state: "upcoming", glow: false },
    ]);
    const safe = photoLyricWords(frame, true);
    expect(safe.map((w) => w.state)).toEqual(["current", "upcoming"]);
    expect(safe.some((w) => w.glow)).toBe(false);
  });

  it("satır yoksa kelime yok; kelime zamanı olmayan satır tek parça ve ışıltısız", () => {
    expect(photoLyricWords(lyricFrame(lyrics, 0), false)).toEqual([]);
    const plain: Lyrics = { ...lyrics, lines: [{ ...line(10, 12, "bir iki"), words: [] }] };
    expect(photoLyricWords(lyricFrame(plain, 11), false)).toEqual([
      { text: "bir iki", state: "sung", glow: false },
    ]);
  });

  it("sığan satır olduğu gibi; uzun satır önce küçülür, yetmezse taşar (kesilmez)", () => {
    expect(lyricFit(400, 1000)).toEqual({ scale: 1, overflow: 0 });
    const shrunk = lyricFit(1200, 1000);
    expect(shrunk.scale).toBeCloseTo(1000 / 1200);
    expect(shrunk.overflow).toBeCloseTo(0);
    const long = lyricFit(2000, 1000);
    expect(long.scale).toBe(LYRIC_MIN_SCALE);
    expect(long.overflow).toBeCloseTo(2000 * LYRIC_MIN_SCALE - 1000);
    // Ölçülemeyen (gizli, henüz çizilmemiş) satır.
    expect(lyricFit(0, 1000)).toEqual({ scale: 1, overflow: 0 });
    expect(lyricFit(500, 0)).toEqual({ scale: 1, overflow: 0 });
  });

  it("taşan satır söylendikçe kayar: başta baş, sonda son, söylenen kelime hep görünür", () => {
    const words = (states: WordState[]) =>
      ["aaaa ", "bbbb ", "cccc ", "dddd"].map((text, i) => ({ text, state: states[i]! }));
    expect(lyricPan(words(["upcoming", "upcoming", "upcoming", "upcoming"]), 300)).toBe(0);
    expect(lyricPan(words(["sung", "sung", "sung", "sung"]), 300)).toBe(300);
    expect(lyricPan(words(["sung", "sung", "sung", "sung"]), 0)).toBe(0);
    // İkinci kelime söylenirken kayma onun ortasına göre (5 + 2,5 harf / 19).
    expect(lyricPan(words(["sung", "current", "upcoming", "upcoming"]), 300)).toBe(
      Math.round((300 * 7.5) / 19),
    );
    // İki kelime arasındaki sessizlikte söylenenlerin sonunda durur.
    expect(lyricPan(words(["sung", "sung", "upcoming", "upcoming"]), 300)).toBe(
      Math.round((300 * 10) / 19),
    );
    // Görünen pencere (genişlik W) her durumda söylenen kelimenin ortasını içerir.
    const W = 500;
    const natural = W + 300;
    for (let i = 0; i < 4; i++) {
      const states = [0, 1, 2, 3].map((j) => (j < i ? "sung" : j === i ? "current" : "upcoming"));
      const pan = lyricPan(words(states as WordState[]), 300);
      const center = (natural * (5 * i + 2.5)) / 19;
      expect(center).toBeGreaterThanOrEqual(pan);
      expect(center).toBeLessThanOrEqual(pan + W);
    }
  });
});

describe("lyricTime", () => {
  it("ses aygıtı gecikmesi kadar geriden okunur (konum zaten karenin ekrana çıktığı an)", () => {
    expect(lyricTime(10, 0)).toBe(10);
    // Bluetooth kulaklık sesi 100 ms geç çalıyor: söz de 100 ms geç.
    expect(lyricTime(10, 0.1)).toBeCloseTo(9.9, 12);
  });
});

describe("şarkı başına söz kaydırma", () => {
  afterEach(() => window.localStorage.clear());

  it("kaydırma sözü o kadar geç getirir", () => {
    expect(lyricTime(10, 0, 0.25)).toBeCloseTo(9.75, 12);
    expect(lyricTime(10, 0.1, -0.5)).toBeCloseTo(10.4, 12);
  });

  it("adıma yuvarlanır, ±2 sn ile sınırlanır; geçersiz değer 0", () => {
    expect(clampLyricShift(74)).toBe(50);
    expect(clampLyricShift(-76)).toBe(-100);
    expect(clampLyricShift(9000)).toBe(2000);
    expect(clampLyricShift(-9000)).toBe(-2000);
    expect(clampLyricShift(Number.NaN)).toBe(0);
    expect(Object.is(clampLyricShift(-10), 0)).toBe(true); // eksi sıfır değil
  });

  it("yazısı yönüyle", () => {
    expect(formatLyricShift(0)).toBe("0,00 sn");
    expect(formatLyricShift(150)).toBe("+0,15 sn (daha geç)");
    expect(formatLyricShift(-1250)).toBe("−1,25 sn (daha erken)");
  });

  it("şarkının yoluna göre hatırlanır; 0 kaydı siler; bozuk kayıt 0", () => {
    saveLyricShift("C:/a.flac", 300);
    saveLyricShift("C:/b.flac", -50);
    expect(loadLyricShift("C:/a.flac")).toBe(300);
    expect(loadLyricShift("C:/b.flac")).toBe(-50);
    expect(loadLyricShift("C:/c.flac")).toBe(0);
    saveLyricShift("C:/a.flac", 0);
    expect(window.localStorage.getItem("lyraska.lyrics.shift")).toBe('{"C:/b.flac":-50}');
    window.localStorage.setItem("lyraska.lyrics.shift", "[1,2");
    expect(loadLyricShift("C:/b.flac")).toBe(0);
    window.localStorage.setItem("lyraska.lyrics.shift", '{"C:/b.flac":"çok"}');
    expect(loadLyricShift("C:/b.flac")).toBe(0);
  });

  it("en çok MAX_SAVED_SHIFTS şarkı: en eski değiştirilen unutulur", () => {
    for (let i = 0; i < MAX_SAVED_SHIFTS; i++) saveLyricShift(`C:/${i}.flac`, 50);
    saveLyricShift("C:/0.flac", 100); // en eskisi yeniden değişti: sona geçer
    saveLyricShift("C:/yeni.flac", 50);
    expect(loadLyricShift("C:/1.flac")).toBe(0); // artık en eskisi buydu
    expect(loadLyricShift("C:/0.flac")).toBe(100);
    expect(loadLyricShift("C:/yeni.flac")).toBe(50);
    const saved = JSON.parse(window.localStorage.getItem("lyraska.lyrics.shift") ?? "{}");
    expect(Object.keys(saved)).toHaveLength(MAX_SAVED_SHIFTS);
  });

  it("kısayol: yalnızca Alt+← / Alt+→", () => {
    const key = (
      key: string,
      mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
    ) =>
      lyricShiftKey({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...mods,
      });
    expect(key("ArrowLeft", { altKey: true })).toBe(-50);
    expect(key("ArrowRight", { altKey: true })).toBe(50);
    expect(key("ArrowRight")).toBeNull(); // düz ok: sarma
    expect(key("ArrowRight", { altKey: true, shiftKey: true })).toBeNull();
    expect(key("ArrowUp", { altKey: true })).toBeNull();
  });
});

describe("lyricsTextStats", () => {
  it("söz satırlarını ve zamanlı olanları sayar; boş, künye ve sözsüz ara sayılmaz", () => {
    expect(lyricsTextStats("")).toEqual({ lines: 0, timed: 0 });
    expect(lyricsTextStats("Gece yolunda yalnız\n\nIşıklar akıyor\n")).toEqual({
      lines: 2,
      timed: 0,
    });
    expect(
      lyricsTextStats(
        "[ar:Lyraska]\n[offset:+200]\n[00:01.00]Bir\n[00:02.50][01:10.00]İki\n[00:03.00]\nÜç",
      ),
    ).toEqual({ lines: 3, timed: 2 });
    expect(lyricsTextStats("[00:01:50]Salise iki nokta\r\n[1:02]Kısa")).toEqual({
      lines: 2,
      timed: 2,
    });
  });
});

describe("otomatik zamanlamanın durumu", () => {
  const untimed: Lyrics = { ...lyrics, synced: false, auto: null };

  it("zamansız sözde paket kurulu mu, oturtulmuşta hüküm; dosyadan zamanlıda ve sözsüzde yok", () => {
    expect(autoTiming(untimed, false)).toBe("noPackage");
    expect(autoTiming(untimed, true)).toBe("pending");
    expect(autoTiming(untimed, null)).toBeNull(); // henüz bilinmiyor: yanlış not gösterilmez
    expect(autoTiming({ ...lyrics, auto: "good" }, false)).toBe("good");
    expect(autoTiming({ ...lyrics, auto: "partlyEstimated" }, null)).toBe("partly");
    expect(autoTiming({ ...lyrics, auto: "unaligned" }, true)).toBe("unaligned");
    expect(autoTiming(lyrics, false)).toBeNull();
    expect(autoTiming(null, false)).toBeNull();
    expect(autoTiming({ ...untimed, lines: [] }, false)).toBeNull();
  });

  it("her durumun yazısı var", () => {
    for (const state of ["noPackage", "pending", "good", "partly", "unaligned"] as const) {
      expect(AUTO_TIMING_TEXT[state].length).toBeGreaterThan(10);
    }
  });
});
