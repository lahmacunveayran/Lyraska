import { describe, expect, it } from "vitest";
import type { Lyrics } from "./bindings/Lyrics";
import type { Section } from "./bindings/Section";
import {
  COUNTDOWN_BARS,
  ENVELOPE_FALL_PER_SECOND,
  ENVELOPE_RISE_PER_SECOND,
  barsToDrop,
  buildProgress,
  cueSheet,
  currentSection,
  followEnvelope,
  nextOfKind,
  nextSection,
  nextWord,
  sampleChannel,
  shotIndex,
  timeToDrop,
  type CueSheetInput,
} from "./cueSheet";

/** 4/4, saniyede bir ölçü başı (120 BPM'de iki saniye): 0, 2, 4 … 60. */
const DOWNBEATS = Array.from({ length: 31 }, (_, i) => i * 2);

const SECTIONS: Section[] = [
  { start: 0, end: 20, energy: 0.3, label: 0 },
  { start: 20, end: 40, energy: 0.8, label: 1 },
  { start: 40, end: 60, energy: 0.9, label: 1 },
];

function input(overrides: Partial<CueSheetInput["map"]> = {}): CueSheetInput {
  return {
    map: {
      meter: 4,
      grouping: [],
      meterConfidence: 0.8,
      downbeats: DOWNBEATS,
      sections: SECTIONS,
      drops: [40],
      dropConfidence: [0.9],
      ...overrides,
    },
  };
}

describe("cueSheet", () => {
  it("droptan önce sekiz ölçülük geri sayım kurar", () => {
    const sheet = cueSheet(input());
    const countdown = sheet.events.filter((e) => e.kind === "countdown");
    expect(countdown).toHaveLength(COUNTDOWN_BARS);
    expect(countdown.map((e) => (e.kind === "countdown" ? e.barsLeft : 0))).toEqual([
      8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(countdown[0]!.time).toBe(24);
    expect(countdown.at(-1)!.time).toBe(38);
  });

  it("kurulumu sekiz ölçü önce başlatır", () => {
    const sheet = cueSheet(input());
    const build = sheet.events.find((e) => e.kind === "buildStart");
    expect(build).toMatchObject({ time: 24, dropAt: 40 });
  });

  it("drop'tan önce son dört vuruşu sayar", () => {
    const sheet = cueSheet(input());
    const beats = sheet.events.filter((e) => e.kind === "finalBeat");
    expect(beats.map((e) => (e.kind === "finalBeat" ? e.beatsLeft : 0))).toEqual([4, 3, 2, 1]);
    // 4/4 ve iki saniyelik ölçüde vuruş 0,5 saniyedir.
    expect(beats.map((e) => e.time)).toEqual([38, 38.5, 39, 39.5]);
  });

  it("güveni düşük drop'u yok sayar", () => {
    const sheet = cueSheet(input({ drops: [30], dropConfidence: [0.2] }));
    expect(sheet.dropTimes).toEqual([]);
    expect(sheet.events.some((e) => e.kind === "drop")).toBe(false);
    expect(sheet.events.some((e) => e.kind === "countdown")).toBe(false);
  });

  it("dropsuz şarkıda yalnızca bölüm ve ölçü olayları kalır", () => {
    const sheet = cueSheet(input({ drops: [], dropConfidence: [] }));
    expect(sheet.events.some((e) => e.kind === "countdown")).toBe(false);
    expect(buildProgress(sheet, 10)).toBeNull();
    expect(timeToDrop(sheet, 10)).toBeNull();
    expect(sheet.sections).toHaveLength(3);
  });

  it("bölüm tekrarlarını sayar, son bölümü final sayar", () => {
    const sheet = cueSheet(input());
    expect(sheet.sections.map((s) => s.repeat)).toEqual([0, 0, 1]);
    expect(sheet.sections.at(-1)).toMatchObject({ isOutro: true, isFinalChorus: true });
    expect(sheet.sections[0]).toMatchObject({ isOutro: false });
  });

  it("sekiz ölçüde bir büyük döngü kurar", () => {
    const sheet = cueSheet(input());
    const phrases = sheet.events.filter((e) => e.kind === "phrase");
    expect(phrases.map((e) => e.time)).toEqual([0, 16, 32, 48]);
  });

  it("aksak ölçüde grup başlarını sekizlik ızgarasına yerleştirir", () => {
    // 9/8 = 2+2+2+3: ölçü 4,5 saniye, sekizlik 0,5 saniye.
    const sheet = cueSheet(
      input({
        downbeats: [0, 4.5, 9],
        meter: 4,
        grouping: [2, 2, 2, 3],
        sections: [],
        drops: [],
        dropConfidence: [],
      }),
    );
    const heads = sheet.events.filter((e) => e.kind === "groupHead");
    expect(heads.slice(0, 4)).toMatchObject([
      { time: 0, index: 0, length: 2 },
      { time: 1, index: 1, length: 2 },
      { time: 2, index: 2, length: 2 },
      { time: 3, index: 3, length: 3 },
    ]);
  });

  it("ölçü güveni düşükse grup başlarını vurgulamaz", () => {
    const sheet = cueSheet(
      input({ downbeats: [0, 4.5, 9], grouping: [2, 2, 2, 3], meterConfidence: 0.2 }),
    );
    expect(sheet.events.some((e) => e.kind === "groupHead")).toBe(false);
  });

  it("bozuk ölçü başlarını temizler ve sıralar", () => {
    const sheet = cueSheet(input({ downbeats: [4, Number.NaN, -1, 2, 4] }));
    expect(sheet.downbeats).toEqual([2, 4]);
  });

  it("sözleri kelime kelime, satır başını işaretleyerek dizer", () => {
    const lyrics: Lyrics = {
      source: "file",
      synced: true,
      lines: [
        {
          start: 1,
          end: 2,
          text: "bir iki",
          translation: null,
          estimated: false,
          words: [
            { start: 1, end: 1.4, text: "bir " },
            { start: 1.4, end: 2, text: "iki" },
          ],
        },
        {
          start: 3,
          end: 4,
          text: "üç",
          translation: null,
          estimated: true,
          words: [{ start: 3, end: 4, text: "üç" }],
        },
      ],
    };
    const sheet = cueSheet({ ...input(), lyrics });
    expect(sheet.words.map((w) => [w.time, w.lineStart, w.estimated])).toEqual([
      [1, true, false],
      [1.4, false, false],
      [3, true, true],
    ]);
    expect(nextWord(sheet, 0)?.text).toBe("bir ");
    expect(nextWord(sheet, 1.2)?.text).toBe("iki");
    expect(nextWord(sheet, 10)).toBeNull();
  });

  it("aynı anda gelen olaylarda bölümü drop'un önüne koyar", () => {
    const sheet = cueSheet(
      input({
        downbeats: [0, 2, 4, 6],
        sections: [{ start: 0, end: 6, energy: 0.5, label: 0 }],
        drops: [4],
        dropConfidence: [1],
      }),
    );
    const atFour = sheet.events.filter((e) => e.time === 4);
    expect(atFour[0]!.kind).toBe("drop");
  });
});

describe("ileriye bakış", () => {
  const sheet = cueSheet(input());

  it("drop'a kalan süreyi ve ölçüyü verir", () => {
    expect(timeToDrop(sheet, 30)).toBe(10);
    expect(barsToDrop(sheet, 30)).toBe(5);
    expect(timeToDrop(sheet, 40)).toBeNull();
  });

  it("kurulum yüzdesini 0'dan 1'e taşır", () => {
    expect(buildProgress(sheet, 24)).toBe(0);
    expect(buildProgress(sheet, 32)).toBeCloseTo(0.5);
    expect(buildProgress(sheet, 41)).toBeNull();
  });

  it("bölümü ve sıradaki bölümü bulur", () => {
    expect(currentSection(sheet, 25)?.label).toBe(1);
    expect(nextSection(sheet, 25)?.time).toBe(40);
    expect(nextSection(sheet, 59)).toBeNull();
  });

  it("türden bağımsız olarak sıradaki olayı verir", () => {
    expect(nextOfKind(sheet, "drop", 0)).toMatchObject({ time: 40 });
    expect(nextOfKind(sheet, "drop", 40)).toBeNull();
  });
});

describe("sampleChannel", () => {
  it("kareler arasını eğriye göre doldurur", () => {
    const keys = [
      { time: 0, value: 0 },
      { time: 10, value: 10, ease: "linear" as const },
    ];
    expect(sampleChannel(keys, 5)).toBeCloseTo(5);
    expect(sampleChannel(keys, -1)).toBe(0);
    expect(sampleChannel(keys, 20)).toBe(10);
  });

  it("basamak eğrisi değeri anahtar karede değiştirir", () => {
    const keys = [
      { time: 0, value: 0 },
      { time: 10, value: 10, ease: "step" as const },
    ];
    expect(sampleChannel(keys, 9.9)).toBe(0);
    expect(sampleChannel(keys, 10)).toBe(10);
  });

  it("yumuşak eğri uçlarda düzleşir", () => {
    const keys = [
      { time: 0, value: 0 },
      { time: 10, value: 10, ease: "smooth" as const },
    ];
    expect(sampleChannel(keys, 0.5)).toBeLessThan(0.5);
    expect(sampleChannel(keys, 9.5)).toBeGreaterThan(9.5);
    expect(sampleChannel(keys, 5)).toBeCloseTo(5);
  });

  it("boş kanalda sıfır döner", () => {
    expect(sampleChannel([], 3)).toBe(0);
  });
});

describe("followEnvelope", () => {
  it("yükselişte hızlıdır", () => {
    expect(followEnvelope(0, 1, 1)).toBe(1);
    expect(followEnvelope(0, 1, 0.01)).toBeCloseTo(ENVELOPE_RISE_PER_SECOND * 0.01);
  });

  it("düşüşte en az on kat yavaştır", () => {
    // Kare başına en çok 0,25 saniye ilerlenir (sekme ya da uyku sonrası sıçrama sınırı).
    expect(followEnvelope(1, 0, 0.25)).toBeCloseTo(1 - ENVELOPE_FALL_PER_SECOND * 0.25);
    // Çok hızlı bir düşüş istense bile yükselişin onda birini geçmez.
    expect(followEnvelope(1, 0, 0.25, 8, 8)).toBeCloseTo(1 - 0.2);
  });

  it("bozuk girdiyi olduğu gibi bırakır", () => {
    expect(followEnvelope(Number.NaN, 1, 1)).toBeNaN();
    expect(followEnvelope(0.5, 1, Number.NaN)).toBe(0.5);
  });
});

describe("shotIndex", () => {
  it("belirlenimcidir ve aralıkta kalır", () => {
    expect(shotIndex(7, 1, 0, 6)).toBe(shotIndex(7, 1, 0, 6));
    for (let label = 0; label < 5; label++) {
      const shot = shotIndex(7, label, 1, 6);
      expect(shot).toBeGreaterThanOrEqual(0);
      expect(shot).toBeLessThan(6);
    }
  });

  it("çekim yoksa sıfır döner", () => {
    expect(shotIndex(1, 0, 0, 0)).toBe(0);
  });
});
