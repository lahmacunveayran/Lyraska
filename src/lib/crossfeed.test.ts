import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CROSSFEED_PRESETS,
  DEFAULT_CROSSFEED,
  crossfeedCurvePath,
  crossfeedDelayUs,
  crossfeedResponseDb,
  matchCrossfeedPreset,
  previewCrossfeedState,
  sanitizeCrossfeed,
} from "./crossfeed";

const on = (cutoffHz: number, levelDb: number) => ({ enabled: true, cutoffHz, levelDb });

describe("crossfeed", () => {
  it("alçak frekansta kulaklar arası fark seviye ayarı kadar; yüksek frekansta karşı kulak sessiz", () => {
    for (const { cutoffHz, levelDb } of CROSSFEED_PRESETS) {
      const low = crossfeedResponseDb(on(cutoffHz, levelDb), 1);
      expect(low.nearDb - low.farDb).toBeCloseTo(levelDb, 3);
      const high = crossfeedResponseDb(on(cutoffHz, levelDb), 20000);
      expect(high.nearDb).toBeGreaterThan(-0.2);
      expect(high.farDb).toBeLessThan(-25);
    }
  });

  it("aynı kulak hiçbir frekansta yükselmez; karşı kulak hep daha kısık", () => {
    // Yakın kulak 1/(1 + ρ), Re ρ ≥ 0 olduğu için |1 + ρ| ≥ 1.
    const settings = on(700, 6);
    for (let i = 0; i <= 200; i++) {
      const hz = 20 * Math.pow(1000, i / 200);
      const { nearDb, farDb } = crossfeedResponseDb(settings, hz);
      expect(nearDb).toBeLessThanOrEqual(1e-12);
      expect(farDb).toBeLessThan(nearDb);
    }
  });

  it("zaman farkı 1/(2π·kesim)", () => {
    expect(crossfeedDelayUs(700)).toBeCloseTo(227.4, 1);
    expect(previewCrossfeedState(on(570, 1)).delayUs).toBeCloseTo(279.2, 1);
  });

  it("sınırlar ve geçersiz sayılar çekirdekteki gibi", () => {
    expect(sanitizeCrossfeed({ enabled: true, cutoffHz: 1e9, levelDb: Number.NaN })).toEqual({
      enabled: true,
      cutoffHz: 1200,
      levelDb: DEFAULT_CROSSFEED.levelDb,
    });
    expect(sanitizeCrossfeed({ enabled: false, cutoffHz: 10, levelDb: 40 })).toEqual({
      enabled: false,
      cutoffHz: 300,
      levelDb: 15,
    });
  });

  it("hazır ayar adı bulunur; özel ayarda yok", () => {
    expect(matchCrossfeedPreset(on(570, 1), CROSSFEED_PRESETS)).toBe("Hoparlör gibi");
    expect(matchCrossfeedPreset(DEFAULT_CROSSFEED, CROSSFEED_PRESETS)).toBe("Orta");
    expect(matchCrossfeedPreset(on(800, 6), CROSSFEED_PRESETS)).toBeNull();
  });

  it("hazır ayarlar çekirdekteki listeyle aynı", () => {
    // Testler depo kökünde çalışır.
    const source = readFileSync("src-tauri/src/audio/crossfeed.rs", "utf8");
    const block = source.slice(source.indexOf("pub const PRESETS"), source.indexOf("];"));
    const core = [...block.matchAll(/\("([^"]+)",\s*([\d.]+),\s*([\d.]+)\)/g)].map((m) => ({
      name: m[1],
      cutoffHz: Number(m[2]),
      levelDb: Number(m[3]),
    }));
    expect(core).toEqual(CROSSFEED_PRESETS);
    expect(source).toMatch(/let \(_, cutoff_hz, level_db\) = PRESETS\[1\];/);
    expect(DEFAULT_CROSSFEED).toMatchObject({
      cutoffHz: CROSSFEED_PRESETS[1]!.cutoffHz,
      levelDb: CROSSFEED_PRESETS[1]!.levelDb,
    });
  });

  it("eğri yolu 0 dB'den alt sınıra kadar çizilir, dışı kırpılır", () => {
    const path = crossfeedCurvePath([20, 20000], [0, -100], 1000, 120);
    expect(path).toBe("M0.0,0.0L1000.0,120.0");
    expect(crossfeedCurvePath([], [], 1000, 120)).toBe("");
  });
});
