/**
 * Bağımsız inceleme (Işık Ustası): güvenli modda ve "animasyonları azalt"ta kurgunun sözünü
 * tutmadığı yerler. Her test bir karşı örnektir; şu anki kodda düşer (bulgu), düzeltilince geçer.
 */
import { describe, expect, it } from "vitest";
import type { Section } from "./bindings/Section";
import { cueSheet, shotIndex, type CueMap } from "./cueSheet";
import {
  QUALITY_PROFILES,
  SHOTS,
  keyPalette,
  showCue,
  type Intensity,
  type Rgb,
  type ShowOptions,
} from "./lightShow";
import { createShowDirector, type ShowStep } from "./lightRig";

const BAR = (60 / 128) * 4;
const at = (bar: number) => bar * BAR;
const sec = (from: number, to: number, energy: number, label: number): Section => ({
  start: at(from),
  end: at(to),
  energy,
  label,
});
const map = (sections: Section[], drops: number[] = [], bars = 80): CueMap => ({
  meter: 4,
  grouping: [],
  meterConfidence: 0.9,
  downbeats: Array.from({ length: bars + 1 }, (_, i) => i * BAR),
  sections,
  drops,
  dropConfidence: drops.map(() => 0.95),
  energy: Array.from({ length: Math.ceil(at(bars)) }, () => 0.5),
});

/** Arayüzün gerçek ton renkleri (`--key-1…12`, global.css). */
const KEY_HEX = [
  "58b5e3",
  "586fe3",
  "8658e3",
  "cc58e3",
  "e358b5",
  "e3586f",
  "e38658",
  "e3cc58",
  "b5e358",
  "6fe358",
  "58e386",
  "58e3cc",
];
const KEYS: Rgb[] = KEY_HEX.map(
  (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb,
);
/** 6B (Camelot 6, kırmızımsı) ana jel; karşıt jel çarkta dört adım ötede (mavi-mor). */
const PALETTE = keyPalette(
  6,
  KEYS,
  { low: [0, 1, 0], high: [1, 0, 1] },
  [1, 0.79, 0.54],
  [0.93, 0.96, 1],
);
const SAFE: ShowOptions = { intensity: "normal", safe: true, reducedMotion: false };

/** Şarkıyı `from`–`to` arasında 60 kare/sn yürütür; her karenin kopyası. */
function run(
  m: CueMap,
  from: number,
  to: number,
  opts: ShowOptions,
): { t: number; step: ShowStep; pos: number[]; spreads: number[] }[] {
  const sheet = cueSheet({ map: m });
  const director = createShowDirector("high");
  const out: { t: number; step: ShowStep; pos: number[]; spreads: number[] }[] = [];
  const dt = 1 / 60;
  for (let i = 0; from + i * dt < to; i++) {
    const t = from + i * dt;
    const step = director.step({
      sheet,
      time: t,
      dt,
      opts,
      live: { bass: 0.5, level: 0.6 },
      bpm: 128,
      palette: PALETTE,
      jump: i === 0,
      easing: false,
    });
    const spreads: number[] = [];
    for (let b = 0; b < step.beamCount; b++) spreads.push(step.beams[b * 12 + 7]!);
    // Yürütücü dizileri her karede yeniden kullanır: karenin kopyası saklanır.
    const copy: ShowStep = {
      ...step,
      cue: { ...step.cue },
      beams: step.beams.slice(),
      fill: [...step.fill],
      back: [...step.back],
    };
    out.push({ t, step: copy, pos: [...step.camera.pos], spreads });
  }
  return out;
}

const camJump = (frames: { pos: number[] }[]) => {
  let worst = 0;
  for (let i = 1; i < frames.length; i++) {
    worst = Math.max(
      worst,
      Math.hypot(...frames[i]!.pos.map((v, k) => v - frames[i - 1]!.pos[k]!)),
    );
  }
  return worst;
};

describe("Işık Ustası, güvenli mod: kamera kesmez (bağımsız inceleme)", () => {
  it("art arda iki bölüm aynı çekimi alınca kamera bölüm sınırında sıçramaz", () => {
    // İkinci bölümün etiketi, ilk bölümle aynı çekimi alacak biçimde seçilir (3 çekim: ~1/3 olasılık).
    // Doruk yok (ilk bölüm en yüksek), çıkış yok (üçüncü bölüm çıkış olur, ikinci değil).
    const base = (label: number) =>
      map([sec(0, 32, 0.9, 0), sec(32, 56, 0.5, label), sec(56, 64, 0.5, 39)], [], 64);
    let found: CueMap | null = null;
    for (let label = 1; label < 39 && !found; label++) {
      const m = base(label);
      const seed = cueSheet({ map: m }).seed;
      if (shotIndex(seed, 0, 0, SHOTS.length) === shotIndex(seed, label, 0, SHOTS.length))
        found = m;
    }
    expect(found).not.toBeNull();
    const sheet = cueSheet({ map: found! });
    expect(sheet.climaxes).toHaveLength(0);
    const frames = run(found!, at(32) - 0.5, at(32) + 0.5, SAFE);
    // Güvenli modda çekimler arası yavaş kayma (SAFE_SHOT_BLEND); bir karede 5 cm'den az.
    expect(camJump(frames), `çekim ${frames.at(-1)!.step.cue.shot}`).toBeLessThan(0.05);
  });

  it("drop açılımı bölüm sınırından hemen önce bitince kayma yarıda kesilmez", () => {
    // Drop ölçü 24'te (bölümün başında), açılım 4 ölçü; sonraki bölüm açılımdan 0,4 sn sonra.
    const m = map(
      [
        sec(0, 24, 0.5, 0),
        { start: at(24), end: at(28) + 0.4, energy: 0.9, label: 1 },
        { start: at(28) + 0.4, end: at(60), energy: 0.5, label: 2 },
        sec(60, 80, 0.9, 1),
      ],
      [at(24), at(64)],
    );
    const frames = run(m, at(28) - 0.5, at(28) + 1.5, SAFE);
    expect(camJump(frames)).toBeLessThan(0.05);
  });

  it("uzun bölümde vinç çekimi sahnenin arkasına dönmez (kamera ışıkların önünde kalır)", () => {
    // Tek bölümlük (doruksuz) şarkı; hangi etiketin vinç aldığı aranır.
    let crane: CueMap | null = null;
    for (let label = 0; label < 40 && !crane; label++) {
      const c = map([sec(0, 64, 0.3, label)], [], 64);
      if (SHOTS[shotIndex(cueSheet({ map: c }).seed, label, 0, SHOTS.length)] === "crane")
        crane = c;
    }
    expect(crane).not.toBeNull();
    for (const intensity of ["normal", "wild"] as Intensity[]) {
      const frames = run(crane!, 0, at(64), { ...SAFE, safe: false, intensity });
      // Arka tavan ışıkları z = −15'te; kamera bunun gerisine geçerse salona arkadan bakar.
      const behind = frames.filter((f) => f.pos[2]! < -15);
      expect(
        behind.length,
        `${intensity}: ${behind[0]?.t.toFixed(1)} sn'de kamera z=${behind[0]?.pos[2]?.toFixed(1)}`,
      ).toBe(0);
    }
  });
});

describe("Işık Ustası, güvenli mod: ışın ve salon ışığı sıçramaz (bağımsız inceleme)", () => {
  const EDM = map(
    [
      sec(0, 8, 0.3, 0),
      sec(8, 24, 0.55, 1),
      sec(24, 40, 0.95, 2),
      sec(40, 48, 0.3, 3),
      sec(48, 56, 0.6, 1),
      sec(56, 72, 1, 2),
      sec(72, 80, 0.2, 4),
    ],
    [at(24), at(56)],
  );

  it("kırılmanın sıcak spotu bölüm bitince bir karede daralıp sönmez", () => {
    // Ölçü 40–48 kırılma (tek sıcak spot: geniş, ×1,3 güç); ölçü 48'de ikinci dropun kurulumu.
    const frames = run(EDM, at(48) - 0.5, at(48) + 0.5, SAFE);
    expect(frames[0]!.step.cue.phase).toBe("breakdown");
    // Spot: arka tavanın ortadaki fikstürü; ışını konumundan bulunur.
    const spot = frames[0]!.spreads.indexOf(Math.max(...frames[0]!.spreads));
    const beams0 = frames[0]!.step.beams;
    const where = [beams0[spot * 12]!, beams0[spot * 12 + 1]!, beams0[spot * 12 + 2]!];
    const find = (f: (typeof frames)[number]) => {
      for (let b = 0; b < f.step.beamCount; b++) {
        const o = b * 12;
        const beams = f.step.beams;
        if (where.every((v, k) => Math.abs(beams[o + k]! - v) < 1e-6)) {
          return { spread: beams[o + 7]!, power: beams[o + 8]! + beams[o + 9]! + beams[o + 10]! };
        }
      }
      return { spread: 0, power: 0 };
    };
    let worstSpread = 0;
    let worstPower = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = find(frames[i - 1]!);
      const b = find(frames[i]!);
      worstSpread = Math.max(worstSpread, Math.abs(a.spread - b.spread) / Math.max(a.spread, 1e-6));
      worstPower = Math.max(worstPower, Math.abs(a.power - b.power) / Math.max(a.power, 1e-6));
    }
    // Güvenli modda ışın genişliği ve gücü kare kare yavaş değişmeli (≤ %5 / kare).
    expect(worstSpread, "spot genişliğinin bir karedeki bağıl değişimi").toBeLessThan(0.05);
    expect(worstPower, "spot gücünün bir karedeki bağıl değişimi").toBeLessThan(0.05);
  });

  it("salonun genel ışığının (fill) rengi bölüm sınırında bir karede değişmez", () => {
    // Ölçü 8: giriş (etiket 0, ana jel) → kıta (etiket 1, ana/karşıt karışımı 0,5).
    const frames = run(EDM, at(8) - 0.5, at(8) + 0.5, SAFE);
    let worst = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!.step.fill;
      const b = frames[i]!.step.fill;
      // Kanalın bağıl değişimi (değerin büyüklüğüne göre).
      for (let k = 0; k < 3; k++) {
        worst = Math.max(worst, Math.abs(a[k]! - b[k]!) / Math.max(a[k]!, b[k]!, 1e-6));
      }
    }
    // Işınların rengi SAFE_COLOR_RATE ile sınırlı (0,5/sn → karede ~%1); salonunki de öyle olmalı.
    expect(worst, "fill kanalının bir karedeki bağıl değişimi").toBeLessThan(0.05);
  });
});

describe("Işık Ustası, animasyonları azalt: kamera durur (bağımsız inceleme)", () => {
  it("dropta kamera sarsılmaz (azaltılmış harekette sarsıntı yok)", () => {
    const m = map([sec(0, 24, 0.5, 0), sec(24, 40, 0.95, 1), sec(40, 80, 0.5, 2)], [at(24)]);
    const frames = run(m, at(24), at(24) + 1, {
      intensity: "wild",
      safe: false,
      reducedMotion: true,
    });
    const xs = frames.map((f) => f.pos[0]!);
    expect(Math.max(...xs) - Math.min(...xs), "dropun ilk saniyesinde yatay sarsıntı").toBeLessThan(
      0.01,
    );
  });
});

describe("Işık Ustası: belgeyle davranış (bağımsız inceleme, düşük önem)", () => {
  it("güvenli modda boşluk 'yarıya' kararır (belge), neredeyse tam karanlığa değil", () => {
    const m = map([sec(0, 24, 0.5, 0), sec(24, 40, 0.95, 1), sec(40, 80, 0.5, 2)], [at(24)]);
    const sheet = cueSheet({ map: m });
    const gap = sheet.climaxes[0]!.gapStart + 0.01;
    const cue = showCue(sheet, gap, SAFE, QUALITY_PROFILES.high);
    expect(cue.phase).toBe("gap");
    // lightShow.ts: "boşlukta karartma yarıya ve 1,5 sn'de" → hedef düzey ≥ 0,5 olmalı.
    expect(cue.level, "güvenli modda boşluğun hedef düzeyi").toBeGreaterThanOrEqual(0.5);
  });

  it("pusun saati 4096 sn'de sararken pus deseni sıçramaz", () => {
    // Gölgelendiricideki pus/çizgi doku kaydırma katsayıları (lightShowShader.ts, uTime ile çarpılan).
    const rates = [0.012, 0.005, 0.008, 0.006, 0.011, 0.003];
    // `uTime % 4096`: sarma anında doku koordinatı rate × 4096 kadar geri atlar; tam sayı değilse
    // tekrarlanan doku bir karede kayar (68 dakikalık kesintisiz çalmada bir kez).
    const jumps = rates.map((r) => (r * 4096) % 1).filter((f) => f > 1e-3 && f < 0.999);
    expect(jumps, "sarmada sıçrayan doku katmanlarının kesirleri").toEqual([]);
  });
});
