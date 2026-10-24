import { describe, expect, it } from "vitest";
import {
  WAVE_RATE,
  WAVE_SAMPLES,
  barBands,
  barTargetsFromBands,
  barTargetsFromWave,
  magnitudes,
  stepBars,
} from "./spectrumBars";

/** Çekirdeğin dalga baytları (karışım, sol, sağ): `hz` frekansında, `amp` genlikte sinüs. */
function wave(parts: { hz: number; amp: number }[]): Uint8Array {
  const bytes = new Uint8Array(3 * WAVE_SAMPLES).fill(128);
  for (let i = 0; i < WAVE_SAMPLES; i++) {
    const v = parts.reduce((s, p) => s + p.amp * Math.sin((2 * Math.PI * p.hz * i) / WAVE_RATE), 0);
    bytes[i] = Math.max(0, Math.min(255, Math.round(128 + 127 * v)));
  }
  return bytes;
}

const BANDS = barBands(200);
const peakBar = (levels: number[]) => levels.indexOf(Math.max(...levels));
const barOf = (hz: number) => BANDS.findIndex((b) => b.hz >= hz);

describe("ince spektrum çubukları", () => {
  it("tam ölçekli sinüs kendi kutusunda ≈ 1 genlik verir", () => {
    const bin = 64;
    const signal = Array.from({ length: 1024 }, (_, i) => {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 1023);
      return Math.sin((2 * Math.PI * bin * i) / 1024) * hann;
    });
    const spectrum = magnitudes(signal);
    expect(spectrum).toHaveLength(512);
    expect(spectrum[bin]).toBeCloseTo(1, 1);
    expect(spectrum[bin + 10]!).toBeLessThan(0.01);
  });

  it("çubuklar logaritmik: bas solda, tiz sağda; her çubuk kendi frekansını gösterir", () => {
    expect(BANDS[0]!.hz).toBeLessThan(45);
    expect(BANDS.at(-1)!.hz).toBeGreaterThan(15000);
    const bass = barTargetsFromWave(wave([{ hz: 60, amp: 0.8 }]), BANDS);
    const mid = barTargetsFromWave(wave([{ hz: 1000, amp: 0.8 }]), BANDS);
    const high = barTargetsFromWave(wave([{ hz: 8000, amp: 0.8 }]), BANDS);
    // 1024 örnekte kutu genişliği ≈ 43 Hz: bas birkaç çubuğa yayılır, yine de en solda kalır.
    expect(BANDS[peakBar(bass)]!.hz).toBeLessThan(150);
    expect(bass[barOf(1000)]!).toBeLessThan(0.15);
    expect(Math.abs(peakBar(mid) - barOf(1000))).toBeLessThanOrEqual(3);
    expect(Math.abs(peakBar(high) - barOf(8000))).toBeLessThanOrEqual(3);
    // Uzak çubuklar sessiz kalır (her çubuk bağımsız: tırtıklı görünüm).
    expect(mid[barOf(8000)]!).toBeLessThan(0.15);
    expect(Math.max(...mid)).toBeGreaterThan(0.8);
  });

  it("sessizlikte ve dalga yokken çubuklar sıfır", () => {
    expect(
      barTargetsFromWave(new Uint8Array(3 * WAVE_SAMPLES).fill(128), BANDS).every((v) => v === 0),
    ).toBe(true);
    expect(barTargetsFromWave(null, BANDS).every((v) => v === 0)).toBe(true);
    expect(barTargetsFromWave(new Uint8Array(10), BANDS).every((v) => v === 0)).toBe(true);
  });

  it("dalga yoksa 32 banttan soldan sağa ara değerle", () => {
    const levels = barTargetsFromBands([1, 0], 3);
    expect(levels[0]).toBe(1);
    expect(levels[2]).toBe(0);
    expect(levels[1]).toBeGreaterThan(0);
    expect(levels[1]).toBeLessThan(0.5);
    expect(barTargetsFromBands([], 2)).toEqual([0, 0]);
  });

  it("çubuk hemen yükselir, hızla söner", () => {
    expect(stepBars([0, 1], [1, 0], 1 / 60)).toEqual([1, expect.closeTo(0.86, 1)]);
    let level = [1];
    for (let i = 0; i < 30; i++) level = stepBars(level, [0], 1 / 60);
    expect(level[0]!).toBeLessThan(0.02); // yarım saniyede sönmüş
  });
});
