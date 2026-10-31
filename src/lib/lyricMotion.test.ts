import { describe, expect, it } from "vitest";
import type { LyricLine } from "./backend";
import {
  ENTER_RISE,
  GHOST_SECS,
  METEOR_GAP,
  STRING_F1,
  SPRING_OMEGA,
  SPRING_ZETA,
  graphemes,
  heldGlyph,
  heldStrength,
  lineMotion,
  lineShownAt,
  linkProgress,
  meteorLines,
  meteorState,
  springOffset,
  starBrightness,
  starHeight,
  stringShape,
} from "./lyricMotion";
import { lyricFrame } from "./lyrics";

function line(start: number, end: number, text: string): LyricLine {
  return { start, end, text, translation: null, words: [], estimated: false, uncertain: false };
}

const xs = Array.from({ length: 201 }, (_, k) => k / 200);
const maxAbs = (ys: number[]) => Math.max(...ys.map(Math.abs));

describe("yay: satırın yerine oturması", () => {
  it("dalga denklemini sağlar: e'' + 2ζω e' + ω² e = 0, başta e0 ve hız 0", () => {
    const h = 1e-4;
    for (const tau of [0.02, 0.1, 0.25, 0.5]) {
      const e = springOffset(tau, 1);
      const d1 = (springOffset(tau + h, 1) - springOffset(tau - h, 1)) / (2 * h);
      const d2 = (springOffset(tau + h, 1) - 2 * e + springOffset(tau - h, 1)) / (h * h);
      const residual = d2 + 2 * SPRING_ZETA * SPRING_OMEGA * d1 + SPRING_OMEGA ** 2 * e;
      expect(Math.abs(residual)).toBeLessThan(1e-3 * SPRING_OMEGA ** 2);
    }
    expect(springOffset(0, 1)).toBe(1);
    expect((springOffset(1e-6, 1) - 1) / 1e-6).toBeCloseTo(0, 3);
  });

  it("~0,4 sn'de oturur, hedefi en çok %5 geçer", () => {
    const samples = Array.from({ length: 2000 }, (_, i) => springOffset(i / 1000, 1));
    expect(Math.min(...samples)).toBeGreaterThan(-0.05);
    expect(Math.min(...samples)).toBeLessThan(0); // bir kez hafifçe geçer: canlı
    expect(Math.abs(springOffset(0.45, 1))).toBeLessThan(0.03);
  });

  it("satır belirdiği anda başlar; hemen ardından gelen satırda önceki satır yukarı kayıp söner", () => {
    const lines = [line(10, 12, "bir"), line(12.1, 14, "iki"), line(20, 22, "üç")];
    // Bitişik satır başladığı anda yerine geçer (lyricFrame de o anda gösterir).
    expect(lineShownAt(lines, 1)).toBe(12.1);
    expect(lyricFrame({ source: "file", synced: true, lines, auto: null }, 12.1).line).toBe(
      lines[1],
    );
    // Aralı satır `LYRIC_LEAD` önce belirmeye başlar.
    expect(lineShownAt(lines, 2)).toBeCloseTo(19.75, 9);
    const entering = lineMotion(lines, lines[1]!, 12.1);
    expect(entering.y).toBe(ENTER_RISE);
    expect(entering.ghost?.line).toBe(lines[0]);
    expect(entering.ghost?.opacity).toBeCloseTo(0.75, 9);
    expect(lineMotion(lines, lines[1]!, 12.1 + GHOST_SECS + 1e-6).ghost).toBeNull();
    expect(lineMotion(lines, lines[1]!, 13).y).toBeCloseTo(0, 2);
    // Aralı satırda hayalet yok (önceki satır zaten sönmüştü).
    expect(lineMotion(lines, lines[2]!, 19.8).ghost).toBeNull();
  });
});

describe("lir teli: çekilen telin titreşimi", () => {
  const pluck = { at: 0.3, time: 0, height: 10 };

  it("uçları sabittir ve çekildiği anda sıçramaz", () => {
    for (const t of [0, 0.05, 0.3, 1]) {
      const ys = stringShape([pluck], t, xs);
      expect(Math.abs(ys[0]!)).toBeLessThan(1e-9);
      expect(Math.abs(ys[200]!)).toBeLessThan(1e-9);
    }
    expect(maxAbs(stringShape([pluck], 0, xs))).toBe(0);
    expect(maxAbs(stringShape([pluck], 0.005, xs))).toBeLessThan(0.15 * pluck.height);
  });

  it("her tam periyotta en yüksek yeri çekilen yerdedir ve genlik her periyotta azalır", () => {
    const period = 1 / STRING_F1;
    let previous = Infinity;
    for (let k = 1; k <= 4; k++) {
      const ys = stringShape([pluck], k * period, xs);
      const peak = ys.indexOf(Math.max(...ys)) / 200;
      expect(Math.abs(peak - pluck.at)).toBeLessThan(0.12 * k); // kıvrım zamanla yumuşar, ortaya kayar
      expect(maxAbs(ys)).toBeLessThan(previous);
      expect(maxAbs(ys)).toBeLessThan(pluck.height);
      previous = maxAbs(ys);
    }
    expect(maxAbs(stringShape([pluck], 2.5, xs))).toBeLessThan(0.05 * pluck.height);
  });

  it("yüksek kipler önce söner: bir süre sonra tel temel kipe (yarım sinüs) döner", () => {
    const ys = stringShape([pluck], 3 / STRING_F1, xs);
    const base = xs.map((x) => Math.sin(Math.PI * x));
    const dot = ys.reduce((s, y, k) => s + y * base[k]!, 0);
    const norm = Math.sqrt(ys.reduce((s, y) => s + y * y, 0) * base.reduce((s, b) => s + b * b, 0));
    expect(dot / norm).toBeGreaterThan(0.99);
  });

  it("çekişler doğrusal toplanır; henüz gelmemiş çekiş teli oynatmaz", () => {
    const other = { at: 0.7, time: 0.2, height: 6 };
    const both = stringShape([pluck, other], 0.5, xs);
    const sum = stringShape([pluck], 0.5, xs).map((y, k) => y + stringShape([other], 0.5, xs)[k]!);
    both.forEach((y, k) => expect(y).toBeCloseTo(sum[k]!, 9));
    expect(stringShape([other], 0.1, xs)).toEqual(new Array(xs.length).fill(0));
  });
});

describe("uzun hece", () => {
  it("0,8 sn'den kısa kelimede yok, 2 sn'de tam", () => {
    expect(heldStrength(0.5)).toBe(0);
    expect(heldStrength(1.4)).toBeCloseTo(0.5, 9);
    expect(heldStrength(3)).toBe(1);
  });

  it("her harf bir kez yükselip iner; başta ve sonda yerinde; silme harf harf ilerler", () => {
    const n = 5;
    for (let i = 0; i < n; i++) {
      expect(heldGlyph(i, n, 0, 1).lift).toBe(0);
      expect(heldGlyph(i, n, 1, 1).lift).toBe(0);
      const lifts = Array.from({ length: 101 }, (_, k) => heldGlyph(i, n, k / 100, 1).lift);
      const low = Math.min(...lifts);
      expect(low).toBeLessThan(-0.07);
      // Tek tepe: en alçak noktadan iki yana tekdüze.
      const at = lifts.indexOf(low);
      for (let k = 1; k <= at; k++) expect(lifts[k]!).toBeLessThanOrEqual(lifts[k - 1]! + 1e-12);
      for (let k = at + 1; k < 101; k++)
        expect(lifts[k]!).toBeGreaterThanOrEqual(lifts[k - 1]! - 1e-12);
    }
    expect(heldGlyph(2, 5, 0.5, 0).lift).toBe(0);
    expect(heldGlyph(0, 4, 0.5, 1).progress).toBe(1);
    expect(heldGlyph(2, 4, 0.5, 1).progress).toBe(0);
    expect(heldGlyph(1, 4, 0.375, 1).progress).toBeCloseTo(0.5, 9);
  });

  it("harfler Türkçe ve birleşik harflerde bölünmez", () => {
    expect(graphemes("İğne ")).toEqual(["İ", "ğ", "n", "e", " "]);
    expect(graphemes("éy")).toEqual(["é", "y"]);
  });
});

describe("meteor ve takımyıldız", () => {
  it("meteorlar arasında en az 4 sn; kısa ve sınırlı parlaklıkta", () => {
    const lines = Array.from({ length: 20 }, (_, i) => line(i * 1.5, i * 1.5 + 1.4, `s${i}`));
    const chosen = [...meteorLines(lines)].map((i) => lineShownAt(lines, i));
    expect(chosen.length).toBeGreaterThan(3);
    for (let k = 1; k < chosen.length; k++)
      expect(chosen[k]! - chosen[k - 1]!).toBeGreaterThanOrEqual(METEOR_GAP);
    expect(meteorState(-0.01)).toBeNull();
    expect(meteorState(0.76)).toBeNull();
    const peak = Math.max(
      ...Array.from({ length: 76 }, (_, i) => meteorState(i / 100)?.opacity ?? 0),
    );
    expect(peak).toBeLessThan(0.85);
    expect(meteorState(0.6)!.travel).toBeGreaterThan(0.95);
  });

  it("yıldızın yeri kelimeden türer ve sabittir; pırıltı ortalama parlaklığı değiştirmez", () => {
    expect(starHeight("gece", 2)).toBe(starHeight("gece", 2));
    for (const [w, i] of [
      ["a", 0],
      ["yolunda", 3],
      ["İğne", 7],
    ] as const) {
      expect(starHeight(w, i)).toBeGreaterThanOrEqual(0.25);
      expect(starHeight(w, i)).toBeLessThanOrEqual(1);
    }
    expect(starBrightness(-0.1, 0, 1)).toBe(0);
    // Oturmuş yıldız (τ büyük): uzun süre ortalaması 0,55 (pırıltının ortalaması 1, %1 içinde).
    let sum = 0;
    const count = 200_000;
    for (let i = 0; i < count; i++) sum += starBrightness(100, i * 0.013, 0.7);
    expect(sum / count / 0.55).toBeGreaterThan(0.99);
    expect(sum / count / 0.55).toBeLessThan(1.01);
  });

  it("takımyıldız çizgisi kısa arada hızlı, en geç 0,3 sn'de tamamlanır", () => {
    expect(linkProgress(0, 1)).toBe(0);
    expect(linkProgress(0.3, 2)).toBe(1);
    expect(linkProgress(0.08, 0.05)).toBe(1);
    expect(linkProgress(0.15, 2)).toBeCloseTo(1 - 0.5 ** 4, 9);
  });
});
