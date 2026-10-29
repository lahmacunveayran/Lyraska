import { describe, expect, it } from "vitest";
import type { Lyrics } from "./bindings/Lyrics";
import type { Section } from "./bindings/Section";
import {
  COUNTDOWN_BARS,
  LIVE_SHEET,
  SOFT_GAP_DEPTH,
  barPosition,
  climaxAhead,
  climaxBehind,
  cueSheet,
  sectionIndexAt,
  shotIndex,
  songSeed,
  type CueMap,
} from "./cueSheet";

/** 128 BPM, 4/4: ölçü 1,875 sn. 0'dan 240 sn'ye ölçü başları. */
const BAR = (60 / 128) * 4;
const DOWNBEATS = Array.from({ length: Math.floor(240 / BAR) }, (_, i) => i * BAR);
const at = (bar: number) => bar * BAR;

/** Tipik EDM: giriş, kıta, yükseliş, drop, kırılma, yükseliş, drop 2, çıkış. */
const EDM_SECTIONS: Section[] = [
  { start: 0, end: at(16), energy: 0.3, label: 0 },
  { start: at(16), end: at(32), energy: 0.5, label: 1 },
  { start: at(32), end: at(48), energy: 0.95, label: 2 },
  { start: at(48), end: at(64), energy: 0.35, label: 3 },
  { start: at(64), end: at(80), energy: 1, label: 2 },
  { start: at(80), end: at(96), energy: 0.25, label: 4 },
];

function edm(overrides: Partial<CueMap> = {}): CueMap {
  return {
    meter: 4,
    grouping: [],
    meterConfidence: 0.9,
    downbeats: DOWNBEATS,
    sections: EDM_SECTIONS,
    drops: [at(32), at(64)],
    dropConfidence: [0.9, 0.95],
    energy: Array.from({ length: Math.round(at(96)) }, () => 0.5),
    ...overrides,
  };
}

/** Dropsuz Türkçe pop: kıta, nakarat, kıta, nakarat, köprü, nakarat. */
const POP_SECTIONS: Section[] = [
  { start: 0, end: 20, energy: 0.35, label: 0 },
  { start: 20, end: 40, energy: 0.8, label: 1 },
  { start: 40, end: 60, energy: 0.4, label: 0 },
  { start: 60, end: 80, energy: 0.85, label: 1 },
  { start: 80, end: 100, energy: 0.5, label: 2 },
  { start: 100, end: 130, energy: 0.9, label: 1 },
];

describe("kurgu defteri: dorular", () => {
  it("droptan önce 8 → 1 geri sayım, son vuruşta boşluk, dropta doruk", () => {
    const sheet = cueSheet({ map: edm() });
    expect(sheet.live).toBe(false);
    expect(sheet.climaxes.map((c) => [c.time, c.kind])).toEqual([
      [at(32), "drop"],
      [at(64), "drop"],
    ]);
    const first = sheet.climaxes[0]!;
    expect(first.buildStart).toBeCloseTo(at(24), 9);
    expect(first.gapStart).toBeCloseTo(at(32) - BAR / 4, 9);
    expect(first.gapDepth).toBe(1);
    expect(first.final).toBe(false);
    expect(sheet.climaxes[1]!.final).toBe(true);
    const counts = sheet.events.filter((e) => e.kind === "countdown" && e.climaxAt === first.time);
    expect(counts.map((e) => (e.kind === "countdown" ? e.barsLeft : 0))).toEqual([
      8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(counts[0]!.time).toBeCloseTo(at(24), 9);
    expect(counts.at(-1)!.time).toBeCloseTo(at(31), 9);
  });

  it("geri sayım gerçek ölçü başlarına oturur (canlı çalınmış, tempo kayan şarkı)", () => {
    // Her ölçü bir öncekinden biraz uzun: sabit ızgara droptan uzakta kayardı.
    const drifting: number[] = [];
    let t = 0;
    for (let i = 0; i < 60; i++) {
      drifting.push(t);
      t += 2 + i * 0.01;
    }
    const drop = drifting[40]!;
    const sheet = cueSheet({
      map: edm({ downbeats: drifting, drops: [drop], dropConfidence: [1], sections: [] }),
    });
    const counts = sheet.events.filter((e) => e.kind === "countdown");
    expect(counts.map((e) => e.time)).toEqual(drifting.slice(32, 40));
  });

  it("güveni düşük drop doruk sayılmaz", () => {
    const sheet = cueSheet({ map: edm({ drops: [at(32)], dropConfidence: [0.3] }) });
    expect(sheet.climaxes.some((c) => c.kind === "drop")).toBe(false);
  });

  it("dropsuz şarkıda doruk nakaratın girişidir; boşluk yarı derinlikte", () => {
    const sheet = cueSheet({
      map: edm({ sections: POP_SECTIONS, drops: [], dropConfidence: [], downbeats: [] }),
    });
    expect(sheet.climaxes.map((c) => [c.time, c.kind])).toEqual([
      [20, "chorusEntry"],
      [60, "chorusEntry"],
      [100, "chorusEntry"],
    ]);
    for (const c of sheet.climaxes) {
      expect(c.gapDepth).toBe(SOFT_GAP_DEPTH);
      expect(c.strength).toBeLessThan(1);
      expect(c.strength).toBeGreaterThan(0.5);
    }
    // Ölçü başı yoksa geri sayım varsayılan ölçüyle doruktan geriye sayılır.
    const counts = sheet.events.filter((e) => e.kind === "countdown" && e.climaxAt === 60);
    expect(counts).toHaveLength(COUNTDOWN_BARS);
  });

  it("nakarat yoksa belirgin enerji sıçraması, o da yoksa son yüksek bölüm doruktur", () => {
    const step = cueSheet({
      map: edm({
        drops: [],
        dropConfidence: [],
        sections: [
          { start: 0, end: 40, energy: 0.3, label: 0 },
          { start: 40, end: 80, energy: 0.9, label: 1 },
          { start: 80, end: 120, energy: 0.4, label: 2 },
        ],
      }),
    });
    expect(step.climaxes.map((c) => c.kind)).toEqual(["energyStep"]);
    const flat = cueSheet({
      map: edm({
        drops: [],
        dropConfidence: [],
        sections: [
          { start: 0, end: 40, energy: 0.5, label: 0 },
          { start: 40, end: 80, energy: 0.6, label: 1 },
          { start: 80, end: 120, energy: 0.62, label: 2 },
        ],
      }),
    });
    expect(flat.climaxes.map((c) => [c.time, c.kind])).toEqual([[80, "finalSection"]]);
  });

  it("birbirine çok yakın dorukların güçlüsü kalır, geri sayım öncekinin üstüne binmez", () => {
    const sheet = cueSheet({
      map: edm({ drops: [at(32), at(36), at(60)], dropConfidence: [0.7, 0.95, 0.9] }),
    });
    expect(sheet.climaxes.map((c) => c.time)).toEqual([at(36), at(60)]);
    expect(sheet.climaxes[1]!.buildStart).toBeGreaterThanOrEqual(at(52) - 1e-9);
    // Şarkının ilk ölçülerindeki drop: geri sayım 0'dan önce başlamaz.
    const early = cueSheet({ map: edm({ drops: [at(3)], dropConfidence: [1] }) });
    expect(early.climaxes[0]!.buildStart).toBe(0);
  });

  it("kırılma ve çıkışı işaretler", () => {
    const sheet = cueSheet({ map: edm() });
    expect(sheet.sections.map((s) => s.breakdown)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(sheet.sections.at(-1)!.outro).toBe(true);
    expect(sheet.sections.map((s) => s.repeat)).toEqual([0, 0, 0, 0, 1, 0]);
  });
});

describe("kurgu defteri: canlı mod, tohum, bozuk girdi", () => {
  it("harita yoksa canlı mod: olay yok, doruk yok", () => {
    const sheet = cueSheet({ map: null });
    expect(sheet).toBe(LIVE_SHEET);
    expect(sheet.live).toBe(true);
    expect(climaxAhead(sheet, 10)).toBeNull();
    expect(sectionIndexAt(sheet, 10)).toBe(-1);
  });

  it("aynı harita aynı defteri verir (anlık görüntü), tohum yalnızca süre ve etiketlerden", () => {
    const a = cueSheet({ map: edm() });
    const b = cueSheet({ map: edm() });
    expect(b).toEqual(a);
    expect(a.seed).toBe(songSeed(a.duration, EDM_SECTIONS));
    // Anlık görüntü: kurgu sessizce değişirse test yakalar.
    expect({
      seed: a.seed,
      duration: Math.round(a.duration),
      climaxes: a.climaxes.map((c) => [c.kind, c.time.toFixed(3), c.buildStart.toFixed(3)]),
      events: a.events.length,
    }).toEqual({
      seed: 1777011972,
      duration: 180,
      climaxes: [
        ["drop", "60.000", "45.000"],
        ["drop", "120.000", "105.000"],
      ],
      events: 44,
    });
    // Vuruş zamanları (analiz sürümüyle değişebilir) tohumu değiştirmez.
    const shifted = cueSheet({ map: edm({ downbeats: DOWNBEATS.map((d) => d + 0.01) }) });
    expect(shifted.seed).toBe(a.seed);
    // Bölüm etiketleri değişince tohum değişir.
    const other = cueSheet({
      map: edm({ sections: EDM_SECTIONS.map((s) => ({ ...s, label: (s.label + 1) % 5 })) }),
    });
    expect(other.seed).not.toBe(a.seed);
  });

  it("bozuk değerleri atar, sıralar", () => {
    const sheet = cueSheet({
      map: edm({
        downbeats: [4, Number.NaN, -1, 2, 4, Infinity],
        drops: [Number.NaN, -3],
        dropConfidence: [1, 1],
        sections: [
          { start: 10, end: 5, energy: 0.5, label: 0 },
          { start: 0, end: 10, energy: Number.NaN, label: Number.NaN },
        ],
        meter: Number.NaN,
      }),
    });
    expect(sheet.downbeats).toEqual([2, 4]);
    expect(sheet.meter).toBe(4);
    expect(sheet.sections).toHaveLength(1);
    expect(sheet.sections[0]).toMatchObject({ label: 0, energy: 0 });
    expect(sheet.climaxes).toEqual([]);
  });

  it("aksak ölçüde grup başları; ölçü güveni düşükse hiç", () => {
    const map = edm({ downbeats: [0, 4.5, 9], grouping: [2, 2, 2, 3], drops: [], sections: [] });
    const heads = cueSheet({ map }).events.filter((e) => e.kind === "groupHead");
    expect(heads.slice(0, 4).map((e) => e.time)).toEqual([0, 1, 2, 3]);
    const unsure = cueSheet({ map: { ...map, meterConfidence: 0.2 } });
    expect(unsure.barsConfident).toBe(false);
    expect(unsure.events.some((e) => e.kind === "groupHead")).toBe(false);
  });

  it("ton değişimini bölüm sınırında verir; sözleri yalnızca zamanlıysa dizer", () => {
    const key = { tonic: 9, minor: true, confidence: 0.8, camelot: 8 };
    const other = { tonic: 0, minor: false, confidence: 0.8, camelot: 8 };
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
      ],
    };
    const sheet = cueSheet({
      map: edm(),
      keys: { key, sections: [null, null, other, null, null, null] },
      lyrics,
    });
    expect(sheet.sectionKeys[2]).toEqual(other);
    expect(sheet.sectionKeys[0]).toEqual(key);
    const changes = sheet.events.filter((e) => e.kind === "keyChange");
    expect(changes.map((e) => e.time)).toEqual([at(32), at(48)]);
    expect(sheet.words.map((w) => [w.time, w.lineStart])).toEqual([
      [1, true],
      [1.4, false],
    ]);
    expect(cueSheet({ map: edm(), lyrics: { ...lyrics, synced: false } }).words).toEqual([]);
  });
});

describe("ileriye bakış ve mutlak zaman", () => {
  const sheet = cueSheet({ map: edm() });

  it("doruğa kalan süre, ölçü ve kurulumun ilerleyişi", () => {
    expect(climaxAhead(sheet, at(20))).toBeNull();
    const start = climaxAhead(sheet, at(24))!;
    expect(start.progress).toBeCloseTo(0, 9);
    expect(start.barsLeft).toBe(8);
    const mid = climaxAhead(sheet, at(28.5))!;
    expect(mid.progress).toBeCloseTo(0.5625, 9);
    expect(mid.barsLeft).toBe(4);
    expect(climaxAhead(sheet, at(31.9))!.barsLeft).toBe(1);
    expect(climaxAhead(sheet, at(32))).toBeNull();
    expect(climaxBehind(sheet, at(33))).toMatchObject({ seconds: expect.closeTo(BAR, 9) });
    expect(climaxBehind(sheet, 1)).toBeNull();
  });

  it("ölçü ve vuruş konumu ölçü başlarından; uçların ötesinde sürer", () => {
    const p = barPosition(sheet, at(10) + BAR * 0.625);
    expect(p.bar).toBe(10);
    expect(p.barPhase).toBeCloseTo(0.625, 9);
    expect(p.beat).toBe(2);
    expect(p.beatPhase).toBeCloseTo(0.5, 9);
    expect(p.beatSecs).toBeCloseTo(60 / 128, 9);
    const after = barPosition(sheet, DOWNBEATS.at(-1)! + 2.5 * BAR);
    expect(after.bar).toBe(DOWNBEATS.length - 1 + 2);
    expect(after.barPhase).toBeCloseTo(0.5, 9);
    // Ölçü başı yoksa verilen tempoyla.
    const live = barPosition(LIVE_SHEET, 1.25, 120);
    expect(live.bar).toBe(0);
    expect(live.beat).toBe(2);
    expect(live.beatPhase).toBeCloseTo(0.5, 9);
  });

  it("çekim seçimi belirlenimci; nakaratın tekrarı sonraki çekime kayar", () => {
    expect(shotIndex(7, 1, 0, 4)).toBe(shotIndex(7, 1, 0, 4));
    expect(shotIndex(7, 1, 1, 4)).toBe((shotIndex(7, 1, 0, 4) + 1) % 4);
    for (let label = 0; label < 8; label++) {
      const shot = shotIndex(123456, label, 0, 3);
      expect(shot).toBeGreaterThanOrEqual(0);
      expect(shot).toBeLessThan(3);
    }
    expect(shotIndex(1, 0, 0, 0)).toBe(0);
  });
});
