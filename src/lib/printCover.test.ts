import { describe, expect, it } from "vitest";
import {
  catalogNumber,
  coverData,
  drawPrintCover,
  familyFor,
  hash,
  palette,
  readPrintColors,
  rng,
} from "./printCover";

const colors = readPrintColors();

describe("baskı kapağı", () => {
  it("tohum Türkçe büyük/küçük harfe duyarsız ve sabittir", () => {
    expect(hash("İSTANBUL")).toBe(hash("istanbul"));
    expect(hash("IŞIK")).toBe(hash("ışık"));
    expect(hash("a")).not.toBe(hash("b"));
    // Sabit tohum: kapaklar program sürümleri arasında değişmesin.
    expect(hash("Ada Yıldız\u0000Işık Haritası")).toBe(hash("ada yıldız\u0000ışık haritası"));
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("aynı albüm aynı veriyi alır; veri geçerli aralıklarda", () => {
    const d = coverData(1234, 124);
    expect(coverData(1234, 124)).toEqual(d);
    expect(d.bpm).toBe(124);
    expect(d.secs[0]!.start).toBe(0);
    expect(d.secs[d.secs.length - 1]!.end).toBeCloseTo(d.dur, 6);
    for (const v of d.curve) expect(v).toBeGreaterThanOrEqual(0);
    for (const row of d.spec) for (const v of row) expect(v).toBeLessThanOrEqual(1);
    // Tempo bilinmiyorsa tohumdan, makul aralıkta.
    const unknown = coverData(99, null).bpm;
    expect(unknown).toBeGreaterThanOrEqual(80);
    expect(unknown).toBeLessThan(160);
  });

  it("minör koyu kart + açık mürekkep, majör açık kâğıt; uyumlu tonlar komşu mürekkep", () => {
    const minor = palette("8A", 0, colors);
    const major = palette("8B", 0, colors);
    expect(minor.dark).toBe(true);
    expect(minor.ink1).toBe(colors.white);
    expect(major.dark).toBe(false);
    expect(major.ink1).toBe(colors.inks[7]);
    expect(major.ink2).toBe(colors.inks[8]);
    expect(palette("9B", 0, colors).ink1).toBe(major.ink2);
    // Tonu bilinmeyen albüm de bir palet alır.
    expect(palette(null, 5, colors).paper).toMatch(/^#/);
  });

  it("aile: hızlı albüm vuruş haritası, ötekiler tohumdan; katalog numarası dört hane", () => {
    expect(familyFor(7, 140)).toBe("C");
    expect(new Set([0, 1, 2].map((s) => familyFor(s, 100)))).toEqual(new Set(["A", "B", "D"]));
    expect(familyFor(3, null)).toBe(familyFor(3, 90));
    expect(catalogNumber(427)).toBe("0427");
    expect(catalogNumber(123456)).toBe("3456");
  });

  it("çizilemeyen tuvalde (2D bağlamı yok) hata vermez", () => {
    const canvas = document.createElement("canvas");
    canvas.getContext = (() => null) as typeof canvas.getContext;
    expect(
      drawPrintCover(canvas, { album: "A", artist: null, key: null, bpm: null }, colors),
    ).toBeNull();
  });
});
