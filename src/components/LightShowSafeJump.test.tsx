/**
 * Bağımsız inceleme (Işık Ustası): güvenli modda "sarma" sayılan her konum sıçraması ışıkları hız
 * sınırı olmadan hedefe oturtur (`jump`). Kullanıcı ← / → tuşunu basılı tutunca (tuş yinelemesi
 * ~30/sn, her basış 5 sn) ya da çekirdek bir karede `null` verince (analiz o ana yetişmedi) bu
 * sıçrama saniyede birçok kez olur: güvenli modda parlaklık artık yavaş değişmez.
 *
 * Gerçek bileşen kullanılır (LightShowScene → createShowDirector → stepSafeLights); yalnızca
 * görsel veri döngüsü ve WebGL çizici sahtedir. Parlaklık vekili `lightShow.test.ts`'tekinin
 * aynısı (ışınların bağıl parlaklığı + 40 × salonun ışığı), eğrinin en büyük değerine bölünür.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SongMap, VisualFrame } from "../lib/backend";
import type { Section } from "../lib/bindings/Section";
import { countFlashes } from "../lib/flash";
import type { LightShowFrame } from "../lib/lightShowRenderer";

const fake = vi.hoisted(() => ({
  tick: null as ((frame: VisualFrame | null, dt: number) => void) | null,
  lights: [] as number[],
}));

vi.mock("../hooks/useVisualFeed", () => ({
  useVisualFeed: (_playing: boolean, onTick: (frame: VisualFrame | null, dt: number) => void) => {
    fake.tick = onTick;
  },
}));

vi.mock("../lib/lightShowRenderer", () => ({
  createLightShowRenderer: () => ({
    quality: "high",
    draw(frame: LightShowFrame) {
      let light = 0;
      for (let b = 0; b < frame.beamCount; b++) {
        const o = b * 12 + 8;
        light +=
          0.2126 * frame.beams[o]! + 0.7152 * frame.beams[o + 1]! + 0.0722 * frame.beams[o + 2]!;
      }
      light += 40 * (0.2126 * frame.fill[0] + 0.7152 * frame.fill[1] + 0.0722 * frame.fill[2]);
      fake.lights.push(light);
    },
    stats: () => ({ gpuMs: null, scale: 1, width: 1, height: 1 }),
    dispose: () => undefined,
  }),
}));

const { LightShowScene } = await import("./LightShowScene");

const BAR = (60 / 128) * 4;
const at = (bar: number) => bar * BAR;
const sec = (from: number, to: number, energy: number, label: number): Section => ({
  start: at(from),
  end: at(to),
  energy,
  label,
});
/** `lightShow.test.ts`'teki EDM haritası: giriş, kıta, drop 1, kırılma, drop 2, çıkış. */
const EDM: SongMap = {
  meter: 4,
  downbeatPhase: 0,
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

const frameAt = (positionSecs: number): VisualFrame => ({
  positionSecs,
  bands: Array.from({ length: 32 }, () => 0.4),
  rmsDb: [-14, -14],
  peakDb: [-6, -6],
  vuReferenceDb: null,
  beat: null,
  energy: null,
  section: null,
  director: null,
});

/** En kötü 1 sn'lik penceredeki parlama sayısı (60 kare/sn; eğri en büyüğüne bölünür). */
function worstPerSecond(values: number[]): number {
  const max = Math.max(...values);
  const scaled = values.map((v) => v / max);
  let worst = 0;
  for (let start = 0; start + 60 <= scaled.length; start += 5) {
    worst = Math.max(worst, countFlashes(scaled.slice(start, start + 60)));
  }
  return worst;
}

function play(positions: (number | null)[]): number[] {
  fake.lights = [];
  const dt = 1 / 60;
  for (const p of positions) fake.tick!(p === null ? null : frameAt(p), dt);
  return fake.lights.slice();
}

describe("Işık Ustası, güvenli mod: sarma ve boş kare (bağımsız inceleme)", () => {
  it("→ tuşu basılı tutulunca (30 basış/sn × 5 sn) saniyede 1'den fazla parlama olmaz", () => {
    render(<LightShowScene playing safe songMap={EDM} intensity="normal" />);
    // Şarkı 20 sn normal çalar (ışıklar kurguya oturur), sonra tuş basılı tutulur.
    const positions: number[] = [];
    let t = 0;
    for (let i = 0; i < 20 * 60; i++) positions.push((t += 1 / 60));
    for (let i = 0; i < 6 * 60 && t < at(78); i++) {
      t += 1 / 60;
      if (i % 2 === 0) t += 5;
      positions.push(t);
    }
    // Denetim: tuşa basmadan aynı süre çalınca sınır tutuyor (hata sarmadan geliyor).
    const calm: number[] = [];
    for (let i = 0; i < positions.length; i++) calm.push((i + 1) / 60);
    expect(worstPerSecond(play(calm))).toBeLessThanOrEqual(1);
    render(<LightShowScene playing safe songMap={EDM} intensity="normal" />);
    const lights = play(positions);
    const worst = worstPerSecond(lights);
    expect(worst, `en kötü saniyede ${worst} parlama`).toBeLessThanOrEqual(1);
  });

  it("çalarken tek bir boş kare (analiz yetişmedi) dropun girişinde ışığı bir karede sıçratmaz", () => {
    render(<LightShowScene playing safe songMap={EDM} intensity="wild" />);
    const positions: (number | null)[] = [];
    const dt = 1 / 60;
    // Dropa 4 sn kala başlanır; dropun 0,3 sn sonrasında çekirdek bir kare `null` verir.
    for (let t = at(24) - 4; t < at(24) + 2; t += dt) {
      positions.push(Math.abs(t - (at(24) + 0.3)) < dt / 2 ? null : t);
    }
    const worstStepOf = (lights: number[]) => {
      let worst = 0;
      const max = Math.max(...lights);
      for (let i = 1; i < lights.length; i++) {
        worst = Math.max(worst, Math.abs(lights[i]! - lights[i - 1]!) / max);
      }
      return worst;
    };
    // Denetim: boş kare olmadan aynı aralıkta karede değişim küçük.
    expect(worstStepOf(play(positions.map((p, i) => p ?? positions[i - 1]! + dt)))).toBeLessThan(
      0.05,
    );
    render(<LightShowScene playing safe songMap={EDM} intensity="wild" />);
    const worstStep = worstStepOf(play(positions));
    // Hız sınırlı düzeyle bir karede (1/60 sn) değişim çok küçüktür; 0,05 bunun ~10 katı.
    expect(worstStep, `bir karede bağıl değişim ${worstStep.toFixed(3)}`).toBeLessThan(0.05);
  });
});
