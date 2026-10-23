import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASS_CLUB_DB, BASS_MAX_DB, EQ_BANDS_HZ, EQ_MAX_DB, PUNCH_MAX_DB } from "./eq";
import { MIN_EVALUATION_BEATS } from "./marks";
import { PEQ_FREQ_MAX, PEQ_FREQ_MIN, PEQ_LIMITS } from "./parametric";
import { MAX_AUDIO_DELAY_MS, MIN_AUDIO_DELAY_MS } from "./sync";

/**
 * Arayüzün çekirdekten kopyaladığı sınırlar (durum gelmeden önce de çizim ve doğrulama için)
 * Rust'taki asıllarıyla aynı mı? Rust'ta bir sınır değişip arayüzde unutulursa bu test kırmızı
 * olur (DENETIM-FAZ0 ISK-10). Testler depo kökünde çalışır.
 */
function rustConst(file: string, name: string): string {
  const source = readFileSync(`src-tauri/src/${file}`, "utf8");
  const match = new RegExp(`pub const ${name}\\s*:[^=]+=\\s*([^;]+);`).exec(source);
  if (!match) throw new Error(`${file}: ${name} bulunamadı`);
  return match[1]!.trim();
}

const rustNumber = (file: string, name: string) => Number(rustConst(file, name).replace(/_/g, ""));

describe("arayüzdeki sınırlar çekirdekteki asıllarıyla aynı", () => {
  it("ekolayzer, bas ve vuruş", () => {
    const centers = rustConst("audio/eq.rs", "CENTERS_HZ")
      .replace(/[[\]\s]/g, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    expect(EQ_BANDS_HZ).toEqual(centers);
    expect(EQ_MAX_DB).toBe(rustNumber("audio/eq.rs", "MAX_GAIN_DB"));
    expect(BASS_MAX_DB).toBe(rustNumber("audio/bass.rs", "MAX_BASS_DB"));
    expect(BASS_CLUB_DB).toBe(rustNumber("audio/bass.rs", "CLUB_BASS_DB"));
    expect(PUNCH_MAX_DB).toBe(rustNumber("audio/punch.rs", "PUNCH_MAX_DB"));
  });

  it("işaretleme: doğruluk ölçümü için en az vuruş", () => {
    expect(MIN_EVALUATION_BEATS).toBe(rustNumber("analysis/annotation.rs", "MIN_EVALUATION_BEATS"));
  });

  it("ses gecikmesi (senkron)", () => {
    expect(MIN_AUDIO_DELAY_MS).toBe(rustNumber("visual_bridge/mod.rs", "MIN_AUDIO_DELAY_MS"));
    expect(MAX_AUDIO_DELAY_MS).toBe(rustNumber("visual_bridge/mod.rs", "MAX_AUDIO_DELAY_MS"));
  });

  it("elle parametrik ekolayzer", () => {
    expect(PEQ_LIMITS.maxBands).toBe(rustNumber("audio/peq.rs", "MAX_FILTERS"));
    expect(PEQ_LIMITS.maxGainDb).toBe(rustNumber("audio/peq.rs", "PARAMETRIC_MAX_GAIN_DB"));
    expect(PEQ_LIMITS.minQ).toBe(rustNumber("audio/peq.rs", "PARAMETRIC_MIN_Q"));
    const peq = readFileSync("src-tauri/src/audio/peq.rs", "utf8");
    const privateConst = (name: string) =>
      Number(new RegExp(`const ${name}: f64 = ([\\d_.]+);`).exec(peq)![1]!.replace(/_/g, ""));
    expect(PEQ_LIMITS.maxQ).toBe(privateConst("MAX_Q"));
    expect(PEQ_FREQ_MIN).toBe(privateConst("MIN_FREQ"));
    expect(PEQ_FREQ_MAX).toBe(privateConst("MAX_FREQ"));
  });
});
