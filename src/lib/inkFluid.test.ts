import { describe, expect, it } from "vitest";
import type { LyricLine, SongMap } from "./backend";
import {
  DROP_COLOR,
  DYE_HALF_LIFE,
  INK_PALETTES,
  MAX_FRAME,
  MAX_STEP,
  VISCOSITY_K,
  buoyancyFor,
  decayFactor,
  dissolveAt,
  energyAt,
  inkEvents,
  inkTheme,
  lineColors,
  plume,
  stepPlan,
  viscosityKeep,
  vortexStreet,
  vorticityFor,
  wordAccent,
  type InkEvent,
} from "./inkFluid";
import { lyricFrame, LYRIC_TAIL } from "./lyrics";

function line(start: number, words: [string, number][]): LyricLine {
  let t = start;
  const timed = words.map(([text, d], k) => {
    const w = { start: t, end: t + d, text: k < words.length - 1 ? `${text} ` : text };
    t += d;
    return w;
  });
  return {
    start,
    end: t,
    text: words.map((w) => w[0]).join(" "),
    translation: null,
    estimated: false,
    uncertain: false,
    words: timed,
  };
}

const lines = [
  line(10, [
    ["Gece", 0.4],
    ["yolunda", 0.6],
    ["yalnız", 1.6],
  ]),
  // Bitişik: önceki satır bu satır başlayınca dumana döner.
  line(12.65, [
    ["Işıklar", 0.5],
    ["akıyor", 1.2],
  ]),
  // Aralı: önceki satır kendi sonunda dumana döner.
  line(17, [["Yol", 0.5]]),
];

const map: SongMap = {
  meter: 4,
  downbeatPhase: 0,
  grouping: [],
  meterConfidence: 0.9,
  downbeats: [10.1, 12, 13.9, 15.8],
  sections: [
    { start: 0, end: 12, energy: 0.4, label: 0 },
    { start: 12, end: 30, energy: 0.9, label: 5 },
  ],
  drops: [12.3, 16],
  dropConfidence: [0.9, 0.2],
  energy: Array.from({ length: 30 }, (_, i) => i / 30),
};

const key = (e: InkEvent) => `${e.kind}@${e.at.toFixed(6)}#${JSON.stringify(e)}`;

describe("akışkanın sabitleri", () => {
  it("sönüm kare hızından bağımsız: her bölünüşte yarılanma süresinde tam yarı", () => {
    for (const fps of [24, 60, 144, 37.3]) {
      let k = 1;
      const steps = Math.round(DYE_HALF_LIFE * fps);
      for (let i = 0; i < steps; i++) k *= decayFactor(DYE_HALF_LIFE, DYE_HALF_LIFE / steps);
      expect(k).toBeCloseTo(0.5, 12);
    }
    expect(decayFactor(1, 0)).toBe(1);
    expect(decayFactor(1, -1)).toBe(1);
  });

  it("adım planı: adımlar en çok 1/60 sn, toplamı geçen süre (en çok 1/20 sn)", () => {
    for (const dt of [0, 1 / 240, 1 / 60, 1 / 59, 1 / 30, 0.05, 0.3]) {
      const { steps, h } = stepPlan(dt);
      expect(h).toBeLessThanOrEqual(MAX_STEP + 1e-12);
      expect(steps * h).toBeCloseTo(Math.min(dt, MAX_FRAME), 12);
    }
    expect(stepPlan(1 / 60).steps).toBe(1);
  });

  it("viskozite: ızgara gürültüsü her adımda 0,2 katına, büyük girdaplar korunur; adım kararlı", () => {
    expect(VISCOSITY_K).toBeLessThan(0.25);
    // Dama tahtası (λ = 2 hücre) iki eksende: 1 − 8k.
    expect(viscosityKeep(2)).toBeCloseTo(1 - 4 * VISCOSITY_K * 2, 12);
    expect(viscosityKeep(2)).toBeCloseTo(0.2, 12);
    expect(viscosityKeep(20, 1)).toBeGreaterThan(0.99);
    expect(viscosityKeep(20, 2)).toBeGreaterThan(0.98);
    // Her dalga boyunda |kalan| ≤ 1 (patlamaz).
    for (let lambda = 2; lambda < 200; lambda += 0.5)
      expect(Math.abs(viscosityKeep(lambda))).toBeLessThanOrEqual(1);
  });

  it("enerji girdabı ve kaldırmayı artırır, sınırlıdır", () => {
    expect(vorticityFor(1)).toBeGreaterThan(vorticityFor(0));
    expect(buoyancyFor(1)).toBeGreaterThan(buoyancyFor(0));
    expect(vorticityFor(5)).toBe(vorticityFor(1));
    expect(buoyancyFor(-3)).toBe(buoyancyFor(0));
  });
});

describe("zaman çizelgesi", () => {
  it("her olay kare hızı ne olursa olsun tam bir kez (yarı açık aralıklar)", () => {
    const whole = inkEvents(lines, { map }, 9, 20).map(key).sort();
    expect(whole.length).toBeGreaterThan(8);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let run = 0; run < 30; run++) {
      const parts: string[] = [];
      let t = 9;
      while (t < 20) {
        // Bazen olayın tam anında biten kare (sınır iki kez sayılmamalı).
        const next =
          random() < 0.2 ? Math.min(20, Math.ceil(t * 10 + 1e-9) / 10) : t + random() / 8;
        parts.push(...inkEvents(lines, { map }, t, Math.min(next, 20)).map(key));
        t = Math.min(next, 20);
      }
      expect(parts.sort()).toEqual(whole);
    }
    expect(inkEvents(lines, { map }, 12, 12)).toEqual([]);
    expect(inkEvents(lines, { map }, 13, 12)).toEqual([]);
  });

  it("satır, ekrandan kalktığı anda dumana döner (lyricFrame ile aynı kural)", () => {
    const lyrics = { source: "file" as const, synced: true, lines, auto: null };
    // Bitişik: sıradaki başlayınca; o ana dek satır tam görünür.
    expect(dissolveAt(lines, 0)).toBe(12.65);
    expect(lyricFrame(lyrics, 12.65 - 1e-6)).toMatchObject({ line: lines[0], opacity: 1 });
    expect(lyricFrame(lyrics, 12.65).line).toBe(lines[1]);
    // Aralı: satırın sonunda (yazı LYRIC_TAIL içinde sönerken duman devralır).
    expect(dissolveAt(lines, 1)).toBe(lines[1]!.end);
    expect(lyricFrame(lyrics, lines[1]!.end).opacity).toBe(1);
    expect(lyricFrame(lyrics, lines[1]!.end + LYRIC_TAIL).line).toBeNull();
    // Aynı anda dumana dönme, yeni satırın ilk damlasından önce gelir (maske sırası).
    const at = inkEvents(lines, { map }, 12.6, 12.7);
    expect(at.findIndex((e) => e.kind === "dissolve")).toBeLessThan(
      at.findIndex((e) => e.kind === "onset"),
    );
  });

  it("müzik olayları harita saatinde; güvenilmez ölçü ve drop sayılmaz", () => {
    const shifted = inkEvents(lines, { map }, 9, 20, 0.5);
    // Harita saati = söz saati + 0,5: 12 sn'lik ölçü başı söz saatinde 11,5'te.
    expect(shifted.filter((e) => e.kind === "breath").map((e) => e.at)).toEqual([
      9.6, 11.5, 13.4, 15.3,
    ]);
    expect(shifted.filter((e) => e.kind === "drop").map((e) => e.at)).toEqual([11.8]);
    const unsure = inkEvents(lines, { map: { ...map, meterConfidence: 0.2 } }, 9, 20);
    expect(unsure.some((e) => e.kind === "breath")).toBe(false);
    const none = inkEvents(lines, { map: null }, 9, 20);
    expect(none.some((e) => e.kind === "breath" || e.kind === "drop")).toBe(false);
    expect(none.filter((e) => e.kind === "onset")).toHaveLength(6);
  });

  it("enerji saniyede bir değerin ara değeri; tema bölümden", () => {
    expect(energyAt(map, 3)).toBeCloseTo(0.1, 12);
    expect(energyAt(map, 3.5)).toBeCloseTo(3.5 / 30, 12);
    expect(energyAt(map, 1000)).toBeCloseTo(29 / 30, 12);
    expect(energyAt(null, 3)).toBe(0.6);
    expect(energyAt(map, Number.NaN)).toBe(0.6);
    expect(inkTheme(map, 5)).toBe(0);
    expect(inkTheme(map, 20)).toBe(1);
    expect(inkTheme(null, 20)).toBe(0);
  });

  it("uzun hece güçlü damla", () => {
    expect(wordAccent(0)).toBeCloseTo(0.35, 12);
    expect(wordAccent(0.45)).toBeLessThan(wordAccent(0.9));
    expect(wordAccent(3)).toBe(1);
  });
});

describe("girdaplar", () => {
  /** Girdap çiftinin (Gauss çekirdekli) bir noktadaki hızı: v = Σ γ (−q_y, q_x) e^(−|q|²). */
  function velocity(
    vortices: { x: number; y: number; gamma: number; size: number }[],
    x: number,
    y: number,
  ) {
    let vx = 0;
    let vy = 0;
    for (const v of vortices) {
      const qx = (x - v.x) / v.size;
      const qy = (y - v.y) / v.size;
      const g = Math.exp(-(qx * qx + qy * qy));
      vx += v.gamma * -qy * g;
      vy += v.gamma * qx * g;
    }
    return [vx, vy] as const;
  }

  it("damla: zıt dönen çift, aradan akış yukarı fışkırır, toplam dolaşım sıfır", () => {
    const pair = plume(0.7);
    expect(pair.reduce((s, v) => s + v.gamma, 0)).toBe(0);
    // y ekseni yukarı: çiftin ortasında hız yukarı, yanlarda aşağı (mantar).
    const [mx, my] = velocity(pair, 0.5, 0);
    expect(Math.abs(mx)).toBeLessThan(1e-12);
    expect(my).toBeGreaterThan(0);
    expect(velocity(pair, 0.5 - 0.7, 0)[1]).toBeLessThan(0);
    expect(velocity(pair, 0.5 + 0.7, 0)[1]).toBeLessThan(0);
  });

  it("dumana dönme: yönleri sırayla değişen, toplam dolaşımı sıfır, satırın içinde, tohumlu", () => {
    for (const [text, width, font] of [
      ["Gece yolunda yalnız gidiyorum", 900, 50],
      ["Yol", 80, 50],
      ["İğne ipliğe", 400, 26],
    ] as const) {
      const street = vortexStreet(text, width, font);
      expect(street.length % 2).toBe(0);
      expect(street.length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(street.reduce((s, v) => s + v.gamma, 0))).toBeLessThan(1e-12);
      street.forEach((v, i) => {
        if (i > 0) expect(Math.sign(v.gamma)).not.toBe(Math.sign(street[i - 1]!.gamma));
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(1);
        expect(v.size).toBeGreaterThan(0.2);
        expect(v.size).toBeLessThan(0.65);
      });
      expect(vortexStreet(text, width, font)).toEqual(street);
    }
    expect(vortexStreet("a", 900, 50)).not.toEqual(vortexStreet("b", 900, 50));
  });
});

describe("renk", () => {
  it("her bölüm temasının iki rengi var; satırdan satıra yön değişir; değerler 0..1", () => {
    expect(INK_PALETTES).toHaveLength(4);
    for (const pair of INK_PALETTES)
      for (const c of pair) for (const x of c) expect(x).toBeGreaterThanOrEqual(0);
    expect(lineColors(1, 0)).toEqual(INK_PALETTES[1]);
    expect(lineColors(1, 1)).toEqual([INK_PALETTES[1]![1], INK_PALETTES[1]![0]]);
    expect(lineColors(5, 0)).toEqual(INK_PALETTES[1]);
    expect(lineColors(-1, 0)).toEqual(INK_PALETTES[3]);
    expect(Math.min(...DROP_COLOR)).toBeGreaterThan(0.8);
  });
});
