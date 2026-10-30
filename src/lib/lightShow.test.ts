import { afterEach, describe, expect, it, vi } from "vitest";
import type { Section } from "./bindings/Section";
import { LIVE_SHEET, cueSheet, type CueMap } from "./cueSheet";
import { countFlashes } from "./flash";
import { createShowDirector } from "./lightRig";
import {
  INTENSITY_PROFILES,
  MAX_BEAMS,
  QUALITY_PROFILES,
  SAFE_BEAM_RATE,
  SAFE_LEVEL_RATE,
  SAFE_MAX_BEAMS,
  SAFE_SWEEP_SPEED,
  beamTotal,
  buildRate,
  chooseQuality,
  createSafeLights,
  keyPalette,
  liveInput,
  loadIntensity,
  lightProxy,
  saveIntensity,
  secondaryKey,
  showCue,
  springStep,
  stepPalette,
  stepSafeLights,
  copyPalette,
  type Intensity,
  type Rgb,
  type ShowOptions,
  type ShowPalette,
} from "./lightShow";

const BAR = (60 / 128) * 4;
const BEAT = BAR / 4;
const at = (bar: number) => bar * BAR;
const sec = (from: number, to: number, energy: number, label: number): Section => ({
  start: at(from),
  end: at(to),
  energy,
  label,
});

/** Giriş, kıta, drop 1 (ölçü 24), kırılma, drop 2 (ölçü 56, son), çıkış. */
const EDM: CueMap = {
  meter: 4,
  grouping: [],
  meterConfidence: 0.9,
  downbeats: Array.from({ length: 80 }, (_, i) => i * BAR),
  sections: [
    sec(0, 8, 0.3, 0),
    sec(8, 24, 0.55, 1),
    sec(24, 40, 0.95, 2),
    sec(40, 48, 0.3, 3),
    sec(48, 56, 0.6, 1),
    sec(56, 72, 1, 2),
    sec(72, 80, 0.2, 4),
  ],
  drops: [at(24), at(56)],
  dropConfidence: [0.9, 0.95],
  energy: Array.from({ length: Math.ceil(at(80)) }, () => 0.5),
};

/** Dropsuz pop (nakaratlar ölçü 16, 40, 64). */
const POP: CueMap = {
  ...EDM,
  sections: [
    sec(0, 16, 0.35, 0),
    sec(16, 32, 0.8, 1),
    sec(32, 40, 0.4, 0),
    sec(40, 56, 0.85, 1),
    sec(56, 64, 0.5, 2),
    sec(64, 80, 0.9, 1),
  ],
  drops: [],
  dropConfidence: [],
};

const HIGH = QUALITY_PROFILES.high;
const opts = (o: Partial<ShowOptions> = {}): ShowOptions => ({
  intensity: "normal",
  safe: false,
  reducedMotion: false,
  ...o,
});

const KEYS: Rgb[] = Array.from({ length: 12 }, (_, i) => [i / 12, 0.5, 1 - i / 12]);
const PALETTE = keyPalette(2, KEYS, { low: [0, 1, 0], high: [1, 0, 1] }, [1, 0.8, 0.5], [1, 1, 1]);

describe("yoğunluk ve kalite", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("Sakin < Normal < Çılgın: ışın, strob, kamera", () => {
    const { calm, normal, wild } = INTENSITY_PROFILES;
    expect(calm.beams).toBeLessThan(normal.beams);
    expect(normal.beams).toBeLessThan(wild.beams);
    expect(calm.strobePerBeat).toBe(0);
    expect(normal.strobePerBeat).toBeLessThan(wild.strobePerBeat);
    expect(calm.camera).toBeLessThan(wild.camera);
  });

  it("yoğunluk kaydedilir; bozuk kayıt ya da erişim hatasında Normal", () => {
    expect(loadIntensity()).toBe("normal");
    saveIntensity("wild");
    expect(loadIntensity()).toBe("wild");
    window.localStorage.setItem("lyraska.lightShowIntensity", "bilinmeyen");
    expect(loadIntensity()).toBe("normal");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(loadIntensity()).toBe("normal");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(() => saveIntensity("calm")).not.toThrow();
  });

  it("kalite katmanı: tümleşik ve yazılımsal Düşük, ayrık kart Yüksek", () => {
    expect(chooseQuality("NVIDIA GeForce RTX 4050 Laptop GPU", false)).toBe("high");
    expect(chooseQuality("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)", false)).toBe("low");
    expect(chooseQuality("Intel(R) UHD Graphics 620", false)).toBe("low");
    expect(chooseQuality("Intel(R) Arc(TM) A770 Graphics", false)).toBe("high");
    expect(chooseQuality("AMD Radeon(TM) Graphics", false)).toBe("low");
    expect(chooseQuality("AMD Radeon RX 7600", false)).toBe("high");
    expect(chooseQuality("ANGLE (Google, SwiftShader Device)", false)).toBe("low");
    expect(chooseQuality("NVIDIA GeForce RTX 4050", true)).toBe("low");
    for (const q of Object.values(QUALITY_PROFILES))
      expect(beamTotal(q)).toBeLessThanOrEqual(MAX_BEAMS);
    expect(QUALITY_PROFILES.low.maxPixels).toBeLessThan(QUALITY_PROFILES.high.maxPixels);
  });
});

describe("tondan palet", () => {
  it("karşıt jel çarkta dört adım öte; yeşile düşmez (ana renk yeşil değilse)", () => {
    expect(secondaryKey(1)).toBe(5);
    expect(secondaryKey(2)).toBe(6);
    expect(secondaryKey(5)).toBe(1);
    expect(secondaryKey(7)).toBe(3);
    expect(secondaryKey(10)).toBe(2);
    for (let k = 1; k <= 12; k++) {
      const j = secondaryKey(k);
      expect(j).not.toBe(k);
      if (k < 9 || k > 11) expect(j < 9 || j > 11).toBe(true);
    }
    expect(secondaryKey(13)).toBe(secondaryKey(1));
  });

  it("ton yoksa bölüm temasının renkleri; jel renklerinin en büyük kanalı 1", () => {
    const keyed = keyPalette(3, KEYS, { low: [0, 1, 0], high: [1, 0, 1] }, [1, 1, 1], [1, 1, 1]);
    const none = keyPalette(null, KEYS, { low: [0, 1, 0], high: [1, 0, 1] }, [1, 1, 1], [1, 1, 1]);
    expect(none.primary).toEqual([0, 1, 0]);
    expect(none.secondary).toEqual([1, 0, 1]);
    expect(keyed.primary).not.toEqual(none.primary);
    for (const c of [keyed.primary, keyed.secondary]) expect(Math.max(...c)).toBeCloseTo(1, 9);
  });

  it("palet sıçramaz: kanal başına saniyede en çok 1/2", () => {
    const shown: ShowPalette = copyPalette(PALETTE);
    const target: ShowPalette = { ...PALETTE, primary: [0, 0, 0] };
    stepPalette(shown, target, 1 / 60, false);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(shown.primary[k]! - PALETTE.primary[k]!)).toBeLessThanOrEqual(1 / 120 + 1e-9);
    }
    for (let i = 0; i < 300; i++) stepPalette(shown, target, 1 / 60, false);
    expect(shown.primary).toEqual([0, 0, 0]);
  });
});

describe("kurgu: şarkının evreleri", () => {
  const sheet = cueSheet({ map: EDM });
  const cue = (t: number, o: Partial<ShowOptions> = {}) => showCue(sheet, t, opts(o), HIGH);

  it("giriş sakin; kurulumda her ölçüde bir ışın söner (8 → 1); boşlukta karanlık; dropta patlama", () => {
    expect(cue(at(2)).phase).toBe("calm");
    const counts: number[] = [];
    for (let bar = 16; bar < 24; bar++) {
      const c = cue(at(bar) + 0.1);
      expect(c.phase).toBe("build");
      counts.push(c.back);
    }
    expect(counts).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    const gap = cue(at(24) - BEAT / 2);
    expect(gap.phase).toBe("gap");
    expect(gap.level).toBeLessThan(0.1);
    const drop = cue(at(24) + 0.01);
    expect(drop.phase).toBe("drop");
    expect(drop.back + drop.floor + drop.laser).toBeGreaterThan(20);
    // Normal'de drop flaşı yumuşak (sahibinin kararı, 30 Ekim); tam flaş Çılgın'da.
    expect(drop.hit).toBeGreaterThan(0.5);
    expect(cue(at(24) + 0.01, { intensity: "wild" }).hit).toBeGreaterThan(1);
    expect(drop.level).toBeGreaterThan(1.4);
    // Kurulumda çakma doruğa yaklaştıkça hızlanır.
    expect([8, 4, 2, 1].map(buildRate)).toEqual([1, 2, 4, 8]);
  });

  it("strob vuruşa kilitli (mutlak zaman), yoğunluğa göre; Sakin'de strob yok", () => {
    for (let k = 0; k < 8; k++) {
      const onBeat = cue(at(24) + k * BEAT + 0.01);
      const offBeat = cue(at(24) + k * BEAT + BEAT * 0.4);
      expect(onBeat.strobeActive).toBe(true);
      // Normal'de çakma yumuşak (tam çakma Çılgın'da).
      expect(onBeat.strobe).toBeGreaterThan(0.3);
      expect(onBeat.strobe).toBeLessThan(0.5);
      expect(cue(at(24) + k * BEAT + 0.01, { intensity: "wild" }).strobe).toBeGreaterThan(0.5);
      expect(offBeat.strobe).toBe(0);
    }
    // Normal: vuruşta iki çakma; Çılgın: dört.
    expect(cue(at(24) + BEAT * 0.55).strobe).toBeGreaterThan(0.3);
    expect(cue(at(24) + BEAT * 0.3, { intensity: "wild" }).strobe).toBeGreaterThan(0.5);
    expect(cue(at(24) + BEAT * 0.3).strobe).toBe(0);
    // Normal'de strob iki ölçü sürer.
    expect(cue(at(26) + 0.01).strobeActive).toBe(false);
    for (let k = 0; k < 8; k++)
      expect(cue(at(24) + k * BEAT + 0.01, { intensity: "calm" }).strobe).toBe(0);
  });

  it("Normal'de drop flaşı yumuşak: dropun ilk ölçüsünün en parlak anı Çılgın'ınkinin yarısı kadar", () => {
    // Sahibinin kararı (30 Ekim): Normal'de drop flaşı yumuşar, tam flaş Çılgın'da.
    const peak = (intensity: Intensity) => {
      let max = 0;
      for (let t = 0; t < 4 * BEAT; t += 1 / 120) {
        max = Math.max(max, lightProxy(cue(at(24) + t, { intensity })));
      }
      return max;
    };
    const [calm, normal, wild] = (["calm", "normal", "wild"] as Intensity[]).map(peak);
    expect(normal).toBeLessThan(0.6 * wild!);
    expect(normal).toBeGreaterThan(calm!);
  });

  it("kırılma, yüksek bölüm, çıkış; son doruk geniş çekim", () => {
    expect(cue(at(44)).phase).toBe("breakdown");
    expect(cue(at(30)).phase).toBe("high");
    expect(cue(at(78)).phase).toBe("outro");
    expect(cue(at(56) + 0.5).shot).toBe("wide");
    expect(cue(at(24) + 0.5).shot).toBe("low");
    expect(cue(at(20)).shot).toBe("build");
  });

  it("aynı an her zaman aynı kurgu (sarma, kare kaybı): saf fonksiyon", () => {
    const times = [at(3), at(20) + 0.3, at(24) + 0.2, at(44), at(60)];
    const first = times.map((t) => cue(t));
    const shuffled = [...times]
      .reverse()
      .map((t) => cue(t))
      .reverse();
    expect(shuffled).toEqual(first);
  });

  it("dropu olmayan şarkıda doruk nakaratın girişi; boşluk yarı karanlık", () => {
    const pop = cueSheet({ map: POP });
    const c = (t: number) => showCue(pop, t, opts(), HIGH);
    expect(c(at(12) + 0.1).phase).toBe("build");
    const gap = c(at(16) - BEAT / 2);
    expect(gap.phase).toBe("gap");
    expect(gap.level).toBeGreaterThan(0.4);
    expect(c(at(16) + 0.05).phase).toBe("drop");
    expect(c(at(16) + 0.05).climax).toBeLessThan(1);
  });

  it("harita yokken canlı mod: ses düzeyiyle ışık, strob yok", () => {
    const quiet = showCue(LIVE_SHEET, 5, opts(), HIGH, { bass: 0, level: 0.1 });
    const loud = showCue(LIVE_SHEET, 5, opts(), HIGH, { bass: 1, level: 1 });
    expect(quiet.phase).toBe("live");
    expect(loud.back + loud.floor).toBeGreaterThan(quiet.back + quiet.floor);
    expect(loud.level).toBeGreaterThan(quiet.level);
    expect(loud.strobe).toBe(0);
  });

  it("animasyonları azalt: kamera sabit, strob yok", () => {
    for (const t of [at(20), at(24) + 0.01, at(30), at(44)]) {
      const c = cue(t, { reducedMotion: true });
      expect(c.shot).toBe("foh");
      expect(c.strobe).toBe(0);
      expect(c.push).toBe(0);
      expect(c.step).toBe(-1);
    }
  });

  it("kamera dropta ileri atılır, aşar ve oturur", () => {
    let peak = 0;
    for (let s = 0; s < 3; s += 0.01) peak = Math.max(peak, springStep(s));
    expect(peak).toBeGreaterThan(1.02);
    expect(springStep(0)).toBe(0);
    expect(springStep(6)).toBeCloseTo(1, 3);
  });
});

describe("Epilepsi güvenli modu (sahnenin kendi yorumu)", () => {
  const sheet = cueSheet({ map: EDM });

  it("strob, çakma, vuruş adımı yok; en fazla 8 ışın; yavaş süpürme", () => {
    for (let t = 0; t < at(80); t += 0.37) {
      const c = showCue(sheet, t, opts({ safe: true, intensity: "wild" }), HIGH);
      expect(c.strobe).toBe(0);
      expect(c.strobeActive).toBe(false);
      expect(c.flicker).toBe(0);
      expect(c.hit).toBe(0);
      expect(c.step).toBe(-1);
      expect(c.back + c.floor + c.side + c.laser).toBeLessThanOrEqual(SAFE_MAX_BEAMS + 1e-9);
      expect(c.sweepSpeed).toBeLessThanOrEqual(SAFE_SWEEP_SPEED);
    }
  });

  it("hız sınırı: düzey ve ışınlar yavaş değişir; sarmada hemen oturur", () => {
    const s = createSafeLights(2);
    const target = new Float32Array([1, 0]);
    stepSafeLights(s, 1, 1, target, 1 / 60, false);
    expect(s.level).toBeCloseTo(SAFE_LEVEL_RATE / 60, 9);
    expect(s.beams[0]).toBeCloseTo(SAFE_BEAM_RATE / 60, 6);
    // Uzun kare aralığı da tek adımda en çok 0,1 sn sayılır.
    stepSafeLights(s, 1, 1, target, 5, false);
    expect(s.level).toBeLessThan(0.05);
    stepSafeLights(s, 0.3, 0.2, target, 1 / 60, true);
    expect(s.level).toBe(0.3);
    expect(s.beams[0]).toBe(1);
  });

  /**
   * Bütün şarkı 60 kare/sn yürütülür; ekranın parlaklığının vekili ışınların ve salonun ışığının
   * toplamıdır. Parlama eşiği vekilin şarkıdaki en büyük değerinin %10'u (gerçek ekranda eşik
   * mutlak %10'dur; bu daha sıkı). Güvenli modda hiçbir 1 sn'lik pencerede 1'den fazla parlama
   * olmaz; varsayılan modda dropta strob gerçekten çakar (sınır yalnızca güvenli modda).
   */
  const proxySeries = (map: CueMap, o: Partial<ShowOptions>) => {
    const s = cueSheet({ map });
    const director = createShowDirector("high");
    const values: number[] = [];
    const dt = 1 / 60;
    for (let i = 0; i * dt < at(80); i++) {
      const step = director.step({
        sheet: s,
        time: i * dt,
        dt,
        opts: opts(o),
        live: { bass: 0.5 + 0.5 * Math.sin(i * 0.9), level: 0.7 },
        bpm: 128,
        palette: PALETTE,
        jump: i === 0,
        easing: false,
      });
      let light = 0;
      for (let b = 0; b < step.beamCount; b++) {
        const o2 = b * 12 + 8;
        light +=
          0.2126 * step.beams[o2]! + 0.7152 * step.beams[o2 + 1]! + 0.0722 * step.beams[o2 + 2]!;
      }
      light += 40 * (0.2126 * step.fill[0] + 0.7152 * step.fill[1] + 0.0722 * step.fill[2]);
      values.push(light);
    }
    return values;
  };
  const worstPerSecond = (values: number[]) => {
    const max = Math.max(...values);
    const scaled = values.map((v) => (v / max) * 1);
    let worst = 0;
    for (let start = 0; start + 60 <= scaled.length; start += 15) {
      worst = Math.max(worst, countFlashes(scaled.slice(start, start + 60)));
    }
    return worst;
  };

  it("güvenli modda hiçbir saniyede 1'den fazla parlama yok (drop'lu ve dropsuz şarkı)", () => {
    for (const map of [EDM, POP]) {
      for (const intensity of ["normal", "wild"] as Intensity[]) {
        expect(worstPerSecond(proxySeries(map, { safe: true, intensity }))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("varsayılan modda dropta strob çakar (ışık şovu frenlenmez)", () => {
    expect(worstPerSecond(proxySeries(EDM, { intensity: "normal" }))).toBeGreaterThanOrEqual(2);
  });
});

describe("canlı mod girdisi", () => {
  it("bas ilk dört banttan, düzey etkin seviyeden", () => {
    expect(liveInput([1, 1, 1, 1, 0, 0], [-6, -60]).bass).toBe(1);
    expect(liveInput([], [-60, -60])).toEqual({ bass: 0, level: 0 });
    expect(liveInput([0.5], [Number.NaN]).level).toBe(0);
    expect(liveInput([0.5], [-6]).level).toBe(1);
  });
});
