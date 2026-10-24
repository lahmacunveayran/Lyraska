import { describe, expect, it } from "vitest";
import atlasJson from "./starAtlas.json";
import {
  CONSTELLATION_TR,
  drawArtistPlate,
  plateCoordinates,
  plateField,
  plateFrame,
  ringStars,
  skyPoint,
  type StarAtlas,
} from "./artistPlate";

const atlas = atlasJson as StarAtlas;

describe("sanatçı levhası", () => {
  it("adın gökyüzündeki yeri sabittir (sürümler arasında değişmez)", () => {
    // Bu değerler değişirse kullanıcıların alıştığı levhalar değişir: bilerek değiştirilir.
    expect(plateCoordinates(plateField(atlas, "Ada Yıldız", 3))).toBe("α 23h58m · δ −11°");
    expect(plateCoordinates(plateField(atlas, "Şebnem Ferah", 3))).toBe("α 06h58m · δ −03°");
    const nehir = plateField(atlas, "Nehir", 3);
    expect([nehir.constellation, plateCoordinates(nehir)]).toEqual(["Sct", "α 19h10m · δ −12°"]);
    expect(plateField(atlas, "Barış Manço", 3).constellation).toBe("Vol");
  });

  it("Türkçe büyük/küçük harf aynı levhayı verir", () => {
    expect(skyPoint("ŞEBNEM FERAH", 0)).toEqual(skyPoint("şebnem ferah", 0));
    expect(skyPoint("IŞIK", 0)).toEqual(skyPoint("ışık", 0));
    expect(skyPoint("Nehir", 0)).not.toEqual(skyPoint("Nehir", 1));
  });

  it("alan dolu ve sınırlar içinde; çizgiler alandaki yıldızları birleştirir", () => {
    for (const name of ["Ada Yıldız", "Kaan Erol", "Lâl Ensemble", "Toprak Su", "a", "Ω"]) {
      const field = plateField(atlas, name, 2);
      expect(field.stars.filter((s) => s.mag <= 4.5).length).toBeGreaterThanOrEqual(4);
      for (const s of field.stars) {
        expect(Math.abs(s.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(s.y)).toBeLessThanOrEqual(1);
      }
      expect(field.segments.length).toBeGreaterThanOrEqual(2);
      const inField = new Set(field.stars);
      for (const [a, b] of field.segments) {
        expect(inField.has(a) && inField.has(b)).toBe(true);
      }
      expect(field.decDeg).toBeGreaterThanOrEqual(-90);
      expect(field.decDeg).toBeLessThanOrEqual(90);
    }
  });

  it("atlasın 88 takımyıldızının hepsinin Türkçe adı var", () => {
    const ids = Object.keys(atlas.constellations);
    expect(ids).toHaveLength(88);
    for (const id of ids) expect(CONSTELLATION_TR[id], id).toBeTruthy();
    expect(atlas.stars.length).toBeGreaterThan(8000);
  });

  it("pembe halka sayısı albüm sayısı kadar; halkalar levhada görünür", () => {
    // Çizgisi az (birkaç yıldızlı) takımyıldızlarda halkalar öteki yıldızlarla tamamlanır.
    let short = 0;
    for (let i = 0; i < 300; i++) {
      const name = `Sanatçı ${i}`;
      for (const albums of [1, 5, 12]) {
        const field = plateField(atlas, name, albums);
        const rings = ringStars(field, albums);
        const { mx, my, span } = plateFrame(field);
        const inFrame = (s: { x: number; y: number }) =>
          (Math.abs(s.x - mx) * 0.36) / span <= 0.42 && (Math.abs(s.y - my) * 0.36) / span <= 0.42;
        // Levhada o kadar yıldız yoksa (seyrek gök, çok albüm) görünen yıldızların hepsi.
        const want = Math.min(albums, field.stars.filter(inFrame).length);
        expect(rings).toHaveLength(want);
        expect(new Set(rings).size).toBe(want);
        expect(rings.every(inFrame)).toBe(true);
        if (albums <= 5) short += want < albums ? 1 : 0;
      }
    }
    // Eskiden çizgi yıldızlarıyla sınırlıydı (5 albümde levhaların %39'u eksik halkalıydı).
    expect(short).toBe(0);
  });

  it("halkalar önce çizgilerin en parlak yıldızlarına konur", () => {
    const field = plateField(atlas, "Nehir", 3);
    const onLines = new Set(field.segments.flat());
    expect(ringStars(field, 2).every((s) => onLines.has(s))).toBe(true);
    expect(ringStars(field, 0)).toEqual([]);
  });

  it('künyede sıfıra yuvarlanan eksi derece "+00°" yazılır', () => {
    const field = { ...plateField(atlas, "Nehir", 1), raHours: 5.5, decDeg: -0.3 };
    expect(plateCoordinates(field)).toBe("α 05h30m · δ +00°");
    expect(plateCoordinates({ ...field, decDeg: -0.6 })).toBe("α 05h30m · δ −01°");
  });

  it("çizilemeyen tuvalde (2D bağlamı yok) hata vermez", () => {
    const canvas = document.createElement("canvas");
    canvas.getContext = (() => null) as typeof canvas.getContext;
    const colors = { paper: "#ece5d3", ink: "#1e1c1b", line: "#2b3f78", accent: "#ff5a88" };
    expect(drawArtistPlate(canvas, plateField(atlas, "Nehir", 1), 1, colors)).toBe(false);
  });
});
