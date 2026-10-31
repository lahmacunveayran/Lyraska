import { describe, expect, it } from "vitest";
import type { LyricLine } from "./backend";
import {
  graphemes,
  heldGlyph,
  heldStrength,
  lineMotion,
  lineShownAt,
  linkProgress,
  METEOR_GAP,
  meteorLines,
  meteorState,
  PLUCK_RAMP,
  SPRING_OMEGA,
  SPRING_ZETA,
  springOffset,
  starBrightness,
  starHeight,
  STRING_B1,
  STRING_B3,
  STRING_F1,
  STRING_MODES,
  stringShape,
} from "./lyricMotion";

/** Tohumlu, tekrarlanabilir rastgele sayı (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function line(start: number, end: number, text = "söz"): LyricLine {
  return { start, end, text, translation: null, estimated: false, uncertain: false, words: [] };
}

describe("inceleme: yayın kapalı biçimi", () => {
  it("kapalı biçim, denklemin RK4 ile adım adım tümlenmesiyle örtüşür", () => {
    const w = SPRING_OMEGA;
    const z = SPRING_ZETA;
    const random = rng(1);
    for (let trial = 0; trial < 20; trial++) {
      const e0 = (random() - 0.5) * 4;
      let x = e0;
      let v = 0;
      const dt = 1e-4;
      const f = (xx: number, vv: number) => -w * w * xx - 2 * z * w * vv;
      for (let step = 1; step <= 15000; step++) {
        const k1x = v;
        const k1v = f(x, v);
        const k2x = v + (dt / 2) * k1v;
        const k2v = f(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
        const k3x = v + (dt / 2) * k2v;
        const k3v = f(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
        const k4x = v + dt * k3v;
        const k4v = f(x + dt * k3x, v + dt * k3v);
        x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
        v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        if (step % 500 === 0) expect(springOffset(step * dt, e0)).toBeCloseTo(x, 9);
      }
    }
  });

  it("τ = 0'da sürekli ve hızı sıfır; 0,5 sn'de %2'nin altında", () => {
    expect(springOffset(0, 1)).toBe(1);
    expect(springOffset(1e-9, 1)).toBeCloseTo(1, 12);
    const h = 1e-6;
    expect((springOffset(h, 1) - springOffset(0, 1)) / h).toBeCloseTo(0, 3);
    expect(Math.abs(springOffset(0.5, 1))).toBeLessThan(0.02);
  });
});

describe("inceleme: çekilen telin kip çözümü", () => {
  /** Üçgenin Fourier sinüs katsayısı, sayısal tümlemeyle: b_n = 2∫₀¹ f(x) sin(nπx) dx. */
  function triangleCoefficient(n: number, a: number, h: number): number {
    const steps = 20000;
    let sum = 0;
    for (let k = 0; k < steps; k++) {
      const x = (k + 0.5) / steps;
      const f = x < a ? (h * x) / a : (h * (1 - x)) / (1 - a);
      sum += f * Math.sin(n * Math.PI * x);
    }
    return (2 * sum) / steps;
  }

  it("A_n üçgenin Fourier katsayılarıdır (bağımsız sayısal tümlemeyle)", () => {
    const random = rng(2);
    const xs = Array.from({ length: 41 }, (_, k) => k / 40);
    for (let trial = 0; trial < 10; trial++) {
      const at = 0.05 + random() * 0.9;
      const height = 5 + random() * 20;
      const tau = 0.05 + random() * 2;
      const expected = xs.map((x) => {
        let y = 0;
        for (let n = 1; n <= STRING_MODES; n++) {
          y +=
            triangleCoefficient(n, at, height) *
            Math.sin(n * Math.PI * x) *
            Math.cos(2 * Math.PI * n * STRING_F1 * tau) *
            Math.exp(-(STRING_B1 + STRING_B3 * n * n) * tau) *
            (1 - Math.exp(-tau / PLUCK_RAMP));
        }
        return y;
      });
      const got = stringShape([{ at, time: 0, height }], tau, xs);
      // Kod 1e-4 altındaki kipleri atlar: 8 kipte en çok 8e-4 piksel fark.
      got.forEach((y, k) => expect(Math.abs(y - expected[k]!)).toBeLessThan(1e-3));
    }
  });

  it("uçlar sabit, gelecekteki çekiş yok sayılır, çekişler doğrusal toplanır, sıra fark etmez", () => {
    const random = rng(3);
    const xs = Array.from({ length: 96 }, (_, k) => k / 95);
    for (let trial = 0; trial < 50; trial++) {
      const plucks = Array.from({ length: 1 + Math.floor(random() * 6) }, () => ({
        at: random(),
        time: random() * 5,
        height: random() * 20,
      }));
      const t = random() * 6;
      const all = stringShape(plucks, t, xs);
      expect(Math.abs(all[0]!)).toBeLessThan(1e-9);
      expect(Math.abs(all[95]!)).toBeLessThan(1e-9);
      const sum = plucks
        .map((p) => stringShape([p], t, xs))
        .reduce((acc, ys) => acc.map((y, k) => y + ys[k]!));
      all.forEach((y, k) => expect(y).toBeCloseTo(sum[k]!, 9));
      const past = plucks.filter((p) => p.time <= t);
      stringShape(past, t, xs).forEach((y, k) => expect(y).toBeCloseTo(all[k]!, 12));
      // Sarma: aynı t her zaman aynı biçim (geçmişe bağlı durum yok).
      stringShape(plucks, t + 1, xs);
      expect(stringShape(plucks, t, xs)).toEqual(all);
      all.forEach((y) => expect(Number.isFinite(y)).toBe(true));
    }
  });

  it("çekiş anında tel düz başlar (ani sıçrama yok)", () => {
    const xs = [0.25, 0.5, 0.75];
    stringShape([{ at: 0.5, time: 3, height: 20 }], 3, xs).forEach((y) =>
      expect(Math.abs(y)).toBeLessThan(1e-9),
    );
  });
});

describe("inceleme: yıldızların parlaklığı", () => {
  it("pırıltının zaman ortalaması oturmuş parlaklığı (0,55) değiştirmez", () => {
    for (const seed of [0.3, 2, 5.4, 11.2]) {
      let sum = 0;
      const n = 400000;
      const T = 4000; // uzun süre: iki ilgisiz frekans
      for (let k = 0; k < n; k++) {
        const t = 100 + (k / n) * T;
        sum += starBrightness(100, t, seed);
      }
      expect(sum / n).toBeCloseTo(0.55, 3);
    }
  });

  it("τ < 0 sıfır, her an sonlu ve negatif değil", () => {
    const random = rng(4);
    for (let k = 0; k < 2000; k++) {
      const tau = (random() - 0.2) * 10;
      const value = starBrightness(tau, random() * 300, random() * 10);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      if (tau < 0) expect(value).toBe(0);
    }
  });

  it("yıldız yüksekliği 0,25..1 em arasında ve kararlı", () => {
    const random = rng(5);
    for (let k = 0; k < 500; k++) {
      const text = Array.from({ length: 1 + Math.floor(random() * 8) }, () =>
        String.fromCodePoint(0x41 + Math.floor(random() * 0x2000)),
      ).join("");
      const h = starHeight(text, k);
      expect(h).toBeGreaterThanOrEqual(0.25);
      expect(h).toBeLessThan(1);
      expect(starHeight(text, k)).toBe(h);
    }
  });

  it("takımyıldız çizgisi 0'dan 1'e tekdüze artar", () => {
    let last = 0;
    for (let tau = -0.1; tau < 1; tau += 0.001) {
      const u = linkProgress(tau, 0.2);
      expect(u).toBeGreaterThanOrEqual(last - 1e-12);
      expect(u).toBeLessThanOrEqual(1);
      last = u;
    }
    expect(linkProgress(1, 0.2)).toBe(1);
  });
});

describe("inceleme: uzun hece", () => {
  it("her harfin dalgası kelime içinde tamamlanır; u = 0 ve u = 1'de yükselme yok", () => {
    for (let n = 1; n <= 30; n++) {
      for (let i = 0; i < n; i++) {
        expect(heldGlyph(i, n, 0, 1).lift).toBe(0);
        expect(heldGlyph(i, n, 1, 1).lift).toBe(0);
        expect(heldGlyph(i, n, 1, 1).progress).toBe(1);
        let lastProgress = 0;
        for (let u = 0; u <= 1; u += 0.01) {
          const g = heldGlyph(i, n, u, 1);
          expect(g.lift).toBeLessThanOrEqual(0);
          expect(g.lift).toBeGreaterThanOrEqual(-0.08);
          expect(g.progress).toBeGreaterThanOrEqual(lastProgress);
          lastProgress = g.progress;
        }
      }
    }
  });

  it("güç süreyle tekdüze, 0,8 sn altında sıfır, 2 sn'de tam", () => {
    expect(heldStrength(0.79)).toBe(0);
    expect(heldStrength(0)).toBe(0);
    expect(heldStrength(2)).toBe(1);
    expect(heldStrength(-1)).toBe(0);
  });

  it("Türkçe ve birleşik harfler bölünmez; birleşince metnin aynısı", () => {
    for (const text of ["İstanbul ", "ığüşöç", "i̇ ", "éclair", "👩‍👩‍👧 ", "ŞARKI"]) {
      expect(graphemes(text).join("")).toBe(text);
    }
    expect(graphemes("i̇")).toHaveLength(1);
  });
});

describe("inceleme: satır hareketi ve meteor", () => {
  it("meteorlar arasında en az METEOR_GAP; ilk satır seçilir", () => {
    const random = rng(6);
    for (let trial = 0; trial < 100; trial++) {
      let t = random() * 3;
      const lines = Array.from({ length: 1 + Math.floor(random() * 30) }, () => {
        const start = t + random() * 2;
        const end = start + random() * 3;
        t = end;
        return line(start, end);
      });
      const chosen = [...meteorLines(lines)].sort((a, b) => a - b);
      expect(chosen[0]).toBe(0);
      for (let k = 1; k < chosen.length; k++) {
        expect(
          lineShownAt(lines, chosen[k]!) - lineShownAt(lines, chosen[k - 1]!),
        ).toBeGreaterThanOrEqual(METEOR_GAP);
      }
    }
  });

  it("meteor süresi dışında yok, içinde sonlu ve yazıdan sönük", () => {
    expect(meteorState(-0.01)).toBeNull();
    expect(meteorState(0.76)).toBeNull();
    for (let tau = 0; tau <= 0.75; tau += 0.01) {
      const m = meteorState(tau)!;
      expect(m.opacity).toBeLessThanOrEqual(0.85);
      expect(m.travel).toBeGreaterThanOrEqual(0);
      expect(m.travel).toBeLessThan(1);
    }
  });

  it("hayalet yalnızca hemen ardından gelen satırda ve 0,28 sn içinde; yay sonlu", () => {
    const lines = [line(1, 2), line(2.1, 3), line(5, 6)];
    expect(lineMotion(lines, lines[1]!, 2.15).ghost?.line).toBe(lines[0]);
    expect(lineMotion(lines, lines[1]!, 2.5).ghost).toBeNull();
    expect(lineMotion(lines, lines[2]!, 5).ghost).toBeNull();
    for (let t = 0; t < 7; t += 0.013) {
      for (const l of lines) {
        const m = lineMotion(lines, l, t);
        expect(Number.isFinite(m.y)).toBe(true);
        expect(Number.isFinite(m.scale)).toBe(true);
      }
    }
  });
});
