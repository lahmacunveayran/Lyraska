import { describe, expect, it } from "vitest";
import { FLASH_DELTA, countFlashes } from "./flash";
import {
  SHADER_LEVEL_FLOOR,
  SHADER_MAX_WINDOW_LUMINANCE,
  SHADER_SCENES,
  isShaderScene,
  sceneGain,
  sceneLevel,
  sceneWindowLuminance,
} from "./shaderScene";
import { fragmentSource } from "./shaderSources";
import { SKY_AT_REST, stepSky, type DirectorInput } from "./sky";

const DT = 1 / 60;
const CALM: DirectorInput = {
  mood: 0,
  theme: 0,
  pulse: 0,
  accent: 0,
  anticipation: 0,
  release: 0,
};

describe("gölgelendirici sahneleri", () => {
  it("altı sahne; adları ve kimlikleri tekil", () => {
    expect(SHADER_SCENES.map((s) => s.id)).toEqual([
      "nebula",
      "tunnel",
      "kaleido",
      "ribbons",
      "galaxy",
      "rain",
    ]);
    expect(new Set(SHADER_SCENES.map((s) => s.name)).size).toBe(SHADER_SCENES.length);
    expect(isShaderScene("nebula")).toBe(true);
    expect(isShaderScene("sky")).toBe(false);
    expect(isShaderScene("bilinmeyen")).toBe(false);
  });

  it("parlaklık çarpanı sessizde en düşük, tam seste ve açılımda en yüksek", () => {
    expect(sceneLevel({ energies: [0, 0, 0], bloom: 0 })).toBeCloseTo(0, 10);
    expect(sceneLevel({ energies: [1, 1, 1], bloom: 1 })).toBeCloseTo(1, 10);
    expect(sceneGain(0)).toBeCloseTo(SHADER_LEVEL_FLOOR, 10);
    expect(sceneGain(1)).toBeCloseTo(1, 10);
    // Bozuk değerde çökmez, sınırın dışına çıkmaz.
    expect(sceneLevel({ energies: [Number.NaN, 0, 0], bloom: 0 })).toBe(0);
    expect(sceneLevel({ energies: [5, 5, 5], bloom: 5 })).toBe(1);
    // Tekdüze artar: enerji ya da açılım arttıkça çarpan azalmaz.
    let last = -1;
    for (let e = 0; e <= 1.0001; e += 0.05) {
      const level = sceneLevel({ energies: [e, e, e], bloom: e });
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it("sessizden tam sese parlaklık farkı parlama eşiğinin altında (tasarım)", () => {
    const silent = sceneWindowLuminance({ energies: [0, 0, 0], bloom: 0 });
    const full = sceneWindowLuminance({ energies: [1, 1, 1], bloom: 1 });
    expect(full - silent).toBeCloseTo(SHADER_MAX_WINDOW_LUMINANCE * (1 - SHADER_LEVEL_FLOOR), 10);
    expect(full - silent).toBeLessThan(FLASH_DELTA);
  });

  it("güvenli modda en kötü durumda bile saniyede 3'ten fazla parlamaz", () => {
    // Bantlar ve Yönetmen'in bütün değerleri aynı anda tam ölçekle gidip geliyor.
    for (const safe of [true]) {
      for (const hz of [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 20, 30]) {
        let s = SKY_AT_REST;
        const luminance: number[] = [];
        const levels: number[] = [];
        let flips = 0;
        for (let i = 0; i < 600; i++) {
          const on = Math.floor(i * DT * hz * 2) % 2 === 0;
          const director: DirectorInput = on
            ? { mood: 1, theme: flips++, pulse: 1, accent: 1, anticipation: 0, release: 1 }
            : { ...CALM, anticipation: 1 };
          s = stepSky(s, on ? [1, 1, 1] : [0, 0, 0], DT, false, director, safe);
          luminance.push(sceneWindowLuminance(s));
          levels.push(sceneLevel(s));
        }
        expect(countFlashes(luminance), `${hz} Hz, güvenli: ${safe}`).toBe(0);
        // Senaryo gerçekten uçlara gidiyor: yavaş değişimde çarpan aralığının çoğunu gezer.
        if (hz <= 0.5) {
          const after = levels.slice(120);
          expect(Math.max(...after) - Math.min(...after), `${hz} Hz`).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it("her sahnenin gölgelendiricisi tam: tek giriş, ortak gövde, nabız değişkeni yok (tasarım)", () => {
    for (const { id } of SHADER_SCENES) {
      const source = fragmentSource(id);
      expect(source.startsWith("#version 300 es"), id).toBe(true);
      expect(source.match(/vec3 scene\(vec2 uv, vec2 p\)/g), id).toHaveLength(1);
      expect(source.match(/void main\(\)/g), id).toHaveLength(1);
      expect(source, id).toContain("uLevel");
      // Tasarım: parlaklık yalnızca yumuşak değerlere bağlanır; anlık vuruş seviyesi
      // gölgelendiriciye hiç gitmez.
      expect(source, id).not.toMatch(/uPulse|uBeat/);
    }
  });
});
