import { describe, expect, it } from "vitest";
import { countFlashes } from "../lib/flash";
import { FRAME_MS, createDemo, spectrumColumns, stepDemo } from "./SpectrumDemo";

const BANDS = 16;
const ROWS = 10;
const SECONDS = 20;

/** Gösteriyi SECONDS saniye çalıştırır; her karede bütün matrisin ve bas sütunlarının doluluğu. */
function run(safe: boolean) {
  const demo = createDemo(BANDS);
  const whole: number[] = [];
  const bass: number[] = [];
  const frames = Math.round((SECONDS * 1000) / FRAME_MS);
  for (let f = 0; f < frames; f++) {
    stepDemo(demo, safe);
    const columns = spectrumColumns(demo.levels, demo.peaks, ROWS);
    const lit = (cols: boolean[][]) =>
      cols.reduce((n, c) => n + c.filter(Boolean).length, 0) / (cols.length * ROWS);
    whole.push(lit(columns));
    bass.push(lit(columns.slice(0, 2))); // en bas bant (2 sütun)
  }
  return { whole, bass };
}

describe("karşılama gösterisi: parlama ve nabız", () => {
  it("normalde: bütün ekranda saniyede 3'ten az parlama", () => {
    const { whole } = run(false);
    expect(countFlashes(whole) / SECONDS).toBeLessThan(3);
  });

  it("güvenli modda: bütün ekran ve bas sütunu saniyede en fazla 1 kez değişir", () => {
    // Doluluk oranı parlaklığın üst sınırıdır (noktalar kısık yanar; gerçek bağıl parlaklık çok
    // daha düşük): bu ölçüde bile sınırın altında.
    const { whole, bass } = run(true);
    expect(countFlashes(whole) / SECONDS).toBeLessThanOrEqual(1);
    expect(countFlashes(bass) / SECONDS).toBeLessThanOrEqual(1);
  });

  it("güvenli mod gerçekten daha sakin (senaryo hareket ediyor)", () => {
    const normal = countFlashes(run(false).bass);
    const safe = countFlashes(run(true).bass);
    expect(normal).toBeGreaterThan(safe);
    expect(safe).toBeGreaterThan(0);
  });
});
