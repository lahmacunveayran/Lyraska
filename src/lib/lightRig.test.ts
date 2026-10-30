import { describe, expect, it } from "vitest";
import { cueSheet, type CueMap } from "./cueSheet";
import {
  BEAM_FLOATS,
  COUNTDOWN_OFF,
  buildFixtures,
  cameraAt,
  createShowDirector,
  packBeams,
  targetLit,
  type Camera,
} from "./lightRig";
import { MAX_BEAMS, QUALITY_PROFILES, keyPalette, showCue, type ShowOptions } from "./lightShow";
import { hazeNoise, lightShowFragment } from "./lightShowShader";

const BAR = 1.875;
const MAP: CueMap = {
  meter: 4,
  grouping: [],
  meterConfidence: 0.9,
  downbeats: Array.from({ length: 40 }, (_, i) => i * BAR),
  sections: [
    { start: 0, end: 4 * BAR, energy: 0.3, label: 0 },
    { start: 4 * BAR, end: 12 * BAR, energy: 0.6, label: 1 },
    { start: 12 * BAR, end: 16 * BAR, energy: 1, label: 2 },
    { start: 16 * BAR, end: 24 * BAR, energy: 0.3, label: 3 },
  ],
  drops: [12 * BAR],
  dropConfidence: [0.95],
  energy: Array.from({ length: 45 }, () => 0.5),
};
const PALETTE = keyPalette(null, [], { low: [0, 0, 1], high: [1, 0, 0] }, [1, 0.8, 0.5], [1, 1, 1]);
const OPTS: ShowOptions = { intensity: "normal", safe: false, reducedMotion: false };

describe("ışık düzeni", () => {
  it("fikstür sayıları kalite katmanında; geri sayıma eşit aralıklı sekiz fikstür girer", () => {
    for (const q of Object.values(QUALITY_PROFILES)) {
      const fixtures = buildFixtures(q);
      expect(fixtures.length).toBe(q.back + q.floor + q.side + q.laser);
      expect(fixtures.length).toBeLessThanOrEqual(MAX_BEAMS);
      const back = fixtures.filter((f) => f.group === "back");
      const inCountdown = back.filter((f) => f.countdownRank !== COUNTDOWN_OFF);
      expect(inCountdown).toHaveLength(8);
      // En uçtakiler ilk söner, en son ortadaki kalır.
      const last = back.find((f) => f.countdownRank === 0)!;
      const first = back.find((f) => f.countdownRank === 7)!;
      expect(Math.abs(last.u)).toBeLessThan(0.2);
      expect(Math.abs(first.u)).toBe(1);
    }
  });

  it("ışınlar birim yönlü, sonlu; yanan fikstür sayısı kadar yazılır", () => {
    const sheet = cueSheet({ map: MAP });
    const fixtures = buildFixtures(QUALITY_PROFILES.high);
    const lit = new Float32Array(fixtures.length);
    const out = new Float32Array(MAX_BEAMS * BEAM_FLOATS);
    for (let t = 0; t < 24 * BAR; t += 0.29) {
      const cue = showCue(sheet, t, OPTS, QUALITY_PROFILES.high);
      targetLit(cue, fixtures, lit);
      const n = packBeams(cue, t, fixtures, lit, PALETTE, sheet.seed, out);
      expect(n).toBe(lit.filter((v) => v > 0.002).length);
      for (let i = 0; i < n; i++) {
        const o = i * BEAM_FLOATS;
        expect(Math.hypot(out[o + 4]!, out[o + 5]!, out[o + 6]!)).toBeCloseTo(1, 4);
        for (let k = 0; k < BEAM_FLOATS; k++) expect(Number.isFinite(out[o + k]!)).toBe(true);
        for (let k = 8; k < 11; k++) expect(out[o + k]!).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("strob çakınca ışınlar beyaza döner", () => {
    const sheet = cueSheet({ map: MAP });
    const fixtures = buildFixtures(QUALITY_PROFILES.high);
    const lit = new Float32Array(fixtures.length);
    const out = new Float32Array(MAX_BEAMS * BEAM_FLOATS);
    const t = 12 * BAR + 0.01;
    // Tam çakma Çılgın'da (Normal'de yumuşak: sahibinin kararı, 30 Ekim).
    const cue = showCue(sheet, t, { ...OPTS, intensity: "wild" }, QUALITY_PROFILES.high);
    expect(cue.strobe).toBeGreaterThan(0.5);
    targetLit(cue, fixtures, lit);
    packBeams(cue, t, fixtures, lit, PALETTE, 0, out);
    // Palet mavi–kırmızı; beyazda üç kanal birbirine yakın.
    const [r, g, b] = [out[8]!, out[9]!, out[10]!];
    expect(Math.min(r, g, b) / Math.max(r, g, b)).toBeGreaterThan(0.7);
  });
});

describe("kamera", () => {
  const sheet = cueSheet({ map: MAP });
  const pose = (t: number, safe: boolean) => {
    const cam: Camera = { pos: [0, 0, 0], target: [0, 0, 0], fov: 0 };
    return cameraAt(showCue(sheet, t, { ...OPTS, safe }, QUALITY_PROFILES.high), t, 1, safe, cam);
  };

  it("varsayılan modda dropta kesme; güvenli modda yavaş kayma", () => {
    const drop = 12 * BAR;
    const jump = (safe: boolean) => {
      const a = pose(drop - 0.01, safe);
      const b = pose(drop + 0.01, safe);
      return Math.hypot(...a.pos.map((v, i) => v - b.pos[i]!));
    };
    expect(jump(false)).toBeGreaterThan(1);
    expect(jump(true)).toBeLessThan(0.05);
  });

  it("güvenli modda kamera bütün şarkı boyunca (bölüm, drop, sarma) karede 1 cm'den az kayar", () => {
    // Kamera kayınca ince parlak ışınlar ekranda hızla yer değiştirir; küçük bölgelerde parlama sayılır
    // (inceleme, 30 Ekim: çekim geçişinde karede 0,13).
    const director = createShowDirector("low");
    let last: number[] | null = null;
    let worst = 0;
    for (let i = 0; i < 60 * 24 * BAR; i++) {
      // 10. saniyede ileri sarma (ok tuşu): kamera da yavaşça yerine kayar.
      const time = i / 60 + (i >= 600 ? 20 : 0);
      const step = director.step({
        sheet,
        time,
        dt: 1 / 60,
        opts: { ...OPTS, safe: true },
        live: { bass: 0.5, level: 0.6 },
        bpm: 128,
        palette: PALETTE,
        jump: i === 0 || i === 600,
        easing: false,
      });
      const pos = [...step.camera.pos];
      if (last) worst = Math.max(worst, Math.hypot(...pos.map((v, k) => v - last![k]!)));
      last = pos;
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("kamera hiçbir zaman zeminin altına inmez", () => {
    for (let t = 0; t < 24 * BAR; t += 0.13) {
      for (const safe of [false, true]) expect(pose(t, safe).pos[1]).toBeGreaterThan(0.3);
    }
  });
});

describe("kare yürütücüsü", () => {
  it("her karede sonlu değerler; güvenli modda düzey hız sınırlı", () => {
    const sheet = cueSheet({ map: MAP });
    for (const safe of [false, true]) {
      const director = createShowDirector("low");
      let last: number | null = null;
      for (let i = 0; i < 60 * 45; i += 3) {
        const step = director.step({
          sheet,
          time: i / 60,
          dt: 3 / 60,
          opts: { ...OPTS, safe },
          live: null,
          bpm: 128,
          palette: PALETTE,
          jump: i === 0,
          easing: false,
        });
        expect(step.beamCount).toBeLessThanOrEqual(MAX_BEAMS);
        for (const v of [...step.fill, ...step.back, step.exposure, step.bloomStrength]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        if (safe && last !== null) {
          expect(Math.abs(step.cue.level - last)).toBeLessThanOrEqual(0.35 * 0.05 + 1e-9);
        }
        last = step.cue.level;
      }
    }
  });
});

describe("gölgelendirici", () => {
  it("pus gürültüsü belirlenimci, döşenebilir, tam aralıkta", () => {
    const size = 64;
    const a = hazeNoise(size);
    expect(hazeNoise(size)).toEqual(a);
    let min = 255;
    let max = 0;
    for (const v of a) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBe(0);
    expect(max).toBe(255);
    // Kenarlar birbirine bağlanır: son sütun ile ilk sütun arasındaki fark, komşu sütunlar
    // arasındaki olağan farktan büyük değil.
    let edge = 0;
    let inner = 0;
    for (let y = 0; y < size; y++) {
      edge += Math.abs(a[(y * size + size - 1) * 2]! - a[y * size * 2]!);
      inner += Math.abs(a[(y * size + 1) * 2]! - a[y * size * 2]!);
    }
    expect(edge).toBeLessThan(inner * 2.5);
  });

  it("kalite katmanına göre derlenir; şablonu bozacak ters tırnak yok", () => {
    const high = lightShowFragment(QUALITY_PROFILES.high);
    const low = lightShowFragment(QUALITY_PROFILES.low);
    for (const src of [high, low]) {
      expect(src.startsWith("#version 300 es")).toBe(true);
      expect(src).not.toContain("`");
      expect(src).toContain(`uniform vec4 uBeams[${(MAX_BEAMS * BEAM_FLOATS) / 4}]`);
      expect(src.match(/void main\(\)/g)).toHaveLength(1);
    }
    expect(high).toContain("#define REFLECTIONS 1");
    expect(low).toContain("#define REFLECTIONS 0");
  });
});

describe("güvenli modda ışınlar sıçramaz", () => {
  it("bütün şarkı boyunca ışın yönü ve rengi karede yavaş değişir", () => {
    const sheet = cueSheet({ map: MAP });
    const director = createShowDirector("high");
    const fixtures = buildFixtures(QUALITY_PROFILES.high);
    let prev = new Map<string, number[]>();
    const dt = 1 / 60;
    let worstTurn = 0;
    for (let i = 0; i * dt < 24 * BAR; i++) {
      const step = director.step({
        sheet,
        time: i * dt,
        dt,
        opts: { ...OPTS, safe: true, intensity: "wild" },
        live: null,
        bpm: 128,
        palette: PALETTE,
        jump: i === 0,
        easing: false,
      });
      const now = new Map<string, number[]>();
      for (let b = 0; b < step.beamCount; b++) {
        const o = b * BEAM_FLOATS;
        const key = `${step.beams[o]},${step.beams[o + 1]},${step.beams[o + 2]}`;
        const dir = [step.beams[o + 4]!, step.beams[o + 5]!, step.beams[o + 6]!];
        const before = prev.get(key);
        if (before)
          worstTurn = Math.max(worstTurn, Math.hypot(...dir.map((v, k) => v - before[k]!)));
        now.set(key, dir);
      }
      prev = now;
    }
    expect(fixtures.length).toBeGreaterThan(0);
    // 60 kare/sn'de karede en çok ~0,6 rad/sn × 1/60 (üç eksenin toplamı).
    expect(worstTurn).toBeLessThan(0.025);
  });
});
