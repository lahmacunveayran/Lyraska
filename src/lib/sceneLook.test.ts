import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countFlashes } from "./flash";
import { SCENE_CLOCK_PERIOD, SHADER_TIME_LIMIT, foldTime } from "./sceneClock";
import {
  DEFAULT_SCENE_LOOK,
  FIXED_PALETTES,
  LOOK_AT_REST,
  PALETTE_FADE_SECONDS,
  SCENE_PALETTES,
  advanceSceneClock,
  clampSpeed,
  defaultLooks,
  formatSpeed,
  loadSceneLooks,
  sanitizeLook,
  sanitizeLooks,
  saveSceneLooks,
  stepLook,
  stepPaletteFade,
  type ColorPair,
  type PaletteFade,
  type ScenePalette,
} from "./sceneLook";
import { SHADER_MAX_WINDOW_LUMINANCE, SHADER_SCENES, sceneLevel } from "./shaderScene";
import { SKY_AT_REST, SKY_THEMES, parseHexColor, stepSky, type DirectorInput } from "./sky";

const DT = 1 / 60;
type Rgb = [number, number, number];

// Testler depo kökünde çalışır.
const CSS = readFileSync("src/styles/global.css", "utf8");

function cssColor(name: string): Rgb {
  const hex = CSS.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  expect(hex, `${name} global.css'te yok`).toBeDefined();
  return parseHexColor(hex ?? "", [0, 0, 0]);
}

function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const pair = (prefix: string): ColorPair => ({
  low: cssColor(`${prefix}-low`),
  high: cssColor(`${prefix}-high`),
});
const THEMES = Array.from({ length: SKY_THEMES }, (_, i) => pair(`--sky-theme-${i}`));
const PALETTES = Object.fromEntries(
  FIXED_PALETTES.map((id) => [id, pair(`--scene-palette-${id}`)]),
) as Record<Exclude<ScenePalette, "theme">, ColorPair>;
const colorsOf = (palette: ScenePalette): ColorPair =>
  palette === "theme" ? THEMES[0]! : PALETTES[palette];

const maxChannelStep = (a: ColorPair, b: ColorPair) =>
  Math.max(
    ...[0, 1, 2].flatMap((i) => [a.low[i]! - b.low[i]!, a.high[i]! - b.high[i]!]).map(Math.abs),
  );

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("galeri sahnesinin görünümü", () => {
  it("hız sınırlanır, sayı değilse olağan hız", () => {
    expect(clampSpeed(1)).toBe(1);
    expect(clampSpeed(0.1)).toBe(0.5);
    expect(clampSpeed(7)).toBe(2);
    expect(clampSpeed(1.234)).toBe(1.23);
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(clampSpeed(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampSpeed("2")).toBe(1);
    expect(clampSpeed(null)).toBe(1);
    expect(formatSpeed(1.25)).toBe("1,25×");
    expect(formatSpeed(0.5)).toBe("0,5×");
    expect(formatSpeed(2)).toBe("2×");
  });

  it("paletler: bölüm teması ve dört özgün palet, adlar Türkçe", () => {
    expect(SCENE_PALETTES.map((p) => p.id)).toEqual(["theme", "ice", "ember", "forest", "rose"]);
    expect(SCENE_PALETTES.map((p) => p.name)).toEqual([
      "Bölüm teması",
      "Buz",
      "Kor",
      "Orman",
      "Gül",
    ]);
  });

  it("sabit paletler gece göğü temalarından parlak değil (tasarım tavanı onlarda da geçerli)", () => {
    const maxLow = Math.max(...THEMES.map((t) => luminance(t.low)));
    const maxHigh = Math.max(...THEMES.map((t) => luminance(t.high)));
    for (const id of FIXED_PALETTES) {
      expect(luminance(PALETTES[id].low), id).toBeLessThanOrEqual(maxLow);
      expect(luminance(PALETTES[id].high), id).toBeLessThanOrEqual(maxHigh);
      // Çok koyu da değil: sahne görünür kalır.
      expect(luminance(PALETTES[id].low), id).toBeGreaterThan(0.3);
    }
  });

  it("kayıttaki görünümler doğrulanır: bozuk kayıt olağan görünüme döner, hız sınırlanır", () => {
    expect(sanitizeLook({ speed: 9, palette: "ice" })).toEqual({ speed: 2, palette: "ice" });
    expect(sanitizeLook({ speed: 1.5, palette: "neon" })).toBeNull();
    expect(sanitizeLook("ice")).toBeNull();
    expect(sanitizeLook(null)).toBeNull();
    expect(sanitizeLook({ palette: "rose" })).toEqual({ speed: 1, palette: "rose" });

    const looks = sanitizeLooks({
      version: 1,
      looks: {
        sea: { speed: 0.6, palette: "ice" },
        nebula: { speed: "hızlı", palette: "ember" },
        tunnel: { speed: 1.5, palette: "bilinmeyen" },
        sky: { speed: 2, palette: "rose" }, // galeri sahnesi değil
      },
    });
    expect(looks.sea).toEqual({ speed: 0.6, palette: "ice" });
    expect(looks.nebula).toEqual({ speed: 1, palette: "ember" });
    expect(looks.tunnel).toEqual(DEFAULT_SCENE_LOOK);
    expect(Object.keys(looks).sort()).toEqual(SHADER_SCENES.map((s) => s.id).sort());
    for (const bad of [null, 5, "x", [], { looks: 3 }, { looks: null }]) {
      expect(sanitizeLooks(bad)).toEqual(defaultLooks());
    }
  });

  it("görünümler kaydedilir ve okunur; depo bozuksa ya da erişilemezse olağan görünüm", () => {
    expect(loadSceneLooks()).toEqual(defaultLooks());
    const looks = { ...defaultLooks(), rain: { speed: 1.7, palette: "rose" as const } };
    saveSceneLooks(looks);
    expect(JSON.parse(window.localStorage.getItem("lyraska.sceneLooks") ?? "")).toMatchObject({
      version: 1,
    });
    expect(loadSceneLooks()).toEqual(looks);

    window.localStorage.setItem("lyraska.sceneLooks", "{bozuk json");
    expect(loadSceneLooks()).toEqual(defaultLooks());

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("depo kapalı");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("depo dolu");
    });
    expect(loadSceneLooks()).toEqual(defaultLooks());
    expect(() => saveSceneLooks(looks)).not.toThrow();
  });
});

describe("sahnenin kendi saati", () => {
  it("olağan hızda akış saatini izler, hız katı kadar hızlı ya da yavaş ilerler", () => {
    for (const speed of [0.5, 1, 1.5, 2]) {
      let clock = advanceSceneClock(0, null, 3, speed);
      expect(clock).toBe(3); // ilk karede akış saatinden başlar
      let flow = 3;
      for (let i = 0; i < 120; i++) {
        const next = flow + 0.01 + 0.02 * (i % 3);
        clock = advanceSceneClock(clock, flow, next, speed);
        flow = next;
      }
      expect(clock - 3).toBeCloseTo((flow - 3) * speed, 9);
    }
  });

  it("akış saati sarılınca kendi saat sıçramaz; kendi saati sarılınca da görüntü sürekli", () => {
    // Akış saati periyodun sonunda sıfıra sarılır: artış modüloyla alınır.
    const before = SCENE_CLOCK_PERIOD - 0.004;
    const after = 0.006;
    expect(advanceSceneClock(500, before, after, 1)).toBeCloseTo(500.01, 9);
    expect(advanceSceneClock(500, before, after, 2)).toBeCloseTo(500.02, 9);

    // Uzun süre en yüksek hızda: gölgelendiriciye giden değer kare başına küçük adımlarla ilerler,
    // her iki sarılmada da (akış ve kendi saat) sıçramaz.
    const step = 0.03; // en hızlı akış (~1,8/sn) × 60 kare
    let flow = SCENE_CLOCK_PERIOD - 50 * step;
    let clock = SCENE_CLOCK_PERIOD - 30 * step * 2;
    let last = foldTime(clock);
    let wrapped = 0;
    for (let i = 0; i < 200; i++) {
      const nextFlow = (flow + step) % SCENE_CLOCK_PERIOD;
      const nextClock = advanceSceneClock(clock, flow, nextFlow, 2);
      if (nextClock < clock) wrapped++;
      const shown = foldTime(nextClock);
      expect(Math.abs(shown - last)).toBeLessThanOrEqual(2 * step + 1e-6);
      expect(shown).toBeLessThanOrEqual(SHADER_TIME_LIMIT);
      last = shown;
      flow = nextFlow;
      clock = nextClock;
    }
    expect(wrapped).toBe(1);
  });

  it("bozuk değerde çökmez, geri giden akışta ilerlemez", () => {
    expect(advanceSceneClock(5, 2, Number.NaN, 1)).toBe(5);
    expect(advanceSceneClock(Number.NaN, 2, 3, 1)).toBe(3);
    expect(advanceSceneClock(5, 3, 2.999, 2)).toBe(5);
    expect(advanceSceneClock(5, 2, 3, Number.NaN)).toBe(6);
  });

  it("hız parlaklığa dokunmaz: her hızda parlaklık çarpanı aynı, yalnızca saat farklı", () => {
    const director: DirectorInput = {
      mood: 0.8,
      theme: 1,
      pulse: 0.7,
      accent: 0,
      anticipation: 0,
      release: 0,
    };
    const run = (speed: number) => {
      let sky = SKY_AT_REST;
      let look = LOOK_AT_REST;
      const levels: number[] = [];
      let first = Number.NaN;
      for (let i = 0; i < 600; i++) {
        const on = Math.floor(i / 20) % 2 === 0;
        sky = stepSky(sky, on ? [1, 0.8, 0.6] : [0.1, 0.1, 0.1], DT, false, director, false);
        look = stepLook(look, sky.flowTime, { speed, palette: "theme" }, THEMES[0]!, DT);
        levels.push(sceneLevel(sky));
        if (i === 0) first = sky.flowTime; // ilk karede saat akıştan başlar
      }
      return { levels, clock: look.clock, flow: sky.flowTime, first };
    };
    const normal = run(1);
    expect(normal.clock).toBeCloseTo(normal.flow, 6);
    for (const speed of [0.5, 2]) {
      const other = run(speed);
      expect(other.levels).toEqual(normal.levels);
      expect(other.clock).toBeCloseTo(normal.first + (normal.flow - normal.first) * speed, 6);
    }
  });
});

describe("palet geçişi", () => {
  it("ilk karede seçili paletle başlar; değişince 1 saniyede karışarak geçer, sıçramaz", () => {
    let fade = stepPaletteFade(null, "theme", THEMES[0]!, DT);
    expect(fade.shown).toEqual(THEMES[0]);
    let frames = 0;
    let last = fade.shown;
    let biggest = 0;
    while (frames < 120) {
      fade = stepPaletteFade(fade, "ember", PALETTES.ember, DT);
      biggest = Math.max(biggest, maxChannelStep(fade.shown, last));
      last = fade.shown;
      frames++;
      if (fade.mix >= 1) break;
    }
    expect(frames).toBe(Math.round(PALETTE_FADE_SECONDS / DT));
    expect(fade.shown.low.map((v) => +v.toFixed(9))).toEqual(
      PALETTES.ember.low.map((v) => +v.toFixed(9)),
    );
    // 60 karede her renk kanalı kare başına en fazla 1/60 değişir.
    expect(biggest).toBeLessThanOrEqual(DT / PALETTE_FADE_SECONDS + 1e-9);
    expect(biggest).toBeGreaterThan(0);
  });

  it("geçiş yarıda değişirse o an görünen renklerden devam eder", () => {
    let fade: PaletteFade = stepPaletteFade(null, "ice", PALETTES.ice, DT);
    for (let i = 0; i < 25; i++) fade = stepPaletteFade(fade, "rose", PALETTES.rose, DT);
    const middle = fade.shown;
    fade = stepPaletteFade(fade, "forest", PALETTES.forest, DT);
    expect(fade.from).toEqual(middle);
    expect(maxChannelStep(fade.shown, middle)).toBeLessThanOrEqual(DT + 1e-9);
    // Sekme/uyku sonrası uzun aralıkta da en fazla çeyrek saniyelik adım.
    const jumped = stepPaletteFade(fade, "forest", PALETTES.forest, 10);
    expect(jumped.mix).toBeCloseTo(fade.mix + 0.25, 9);
  });

  it("paletler arasında hızlı gidip gelmek parlama üretmez (tasarım: renkler karışarak geçer)", () => {
    // Sahnenin en kötü penceredeki parlaklığı renklerin parlaklığıyla orantılı varsayılır; en
    // parlak tema `SHADER_MAX_WINDOW_LUMINANCE`'a karşılık gelir.
    const brightest = Math.max(...THEMES.map((t) => luminance(t.low)));
    const order: ScenePalette[] = ["theme", "rose", "forest", "ember", "ice"];
    for (const hz of [0.5, 1, 2, 3, 5, 10, 30]) {
      for (const [a, b] of order.flatMap((x) => order.map((y) => [x, y] as const))) {
        if (a === b) continue;
        let fade: PaletteFade | null = null;
        const series: number[] = [];
        for (let i = 0; i < 300; i++) {
          const palette = Math.floor(i * DT * hz * 2) % 2 === 0 ? a : b;
          fade = stepPaletteFade(fade, palette, colorsOf(palette), DT);
          series.push((SHADER_MAX_WINDOW_LUMINANCE * luminance(fade.shown.low)) / brightest);
        }
        expect(countFlashes(series), `${a} ↔ ${b}, ${hz} Hz`).toBe(0);
      }
    }
  });

  it("görünüm durumunda palet ve saat birlikte ilerler", () => {
    let look = LOOK_AT_REST;
    look = stepLook(look, 1, { speed: 2, palette: "ice" }, PALETTES.ice, DT);
    expect(look.clock).toBe(1);
    expect(look.fade?.shown).toEqual(PALETTES.ice);
    look = stepLook(look, 1.5, { speed: 2, palette: "rose" }, PALETTES.rose, DT);
    expect(look.clock).toBeCloseTo(2, 9);
    expect(look.fade?.palette).toBe("rose");
    expect(look.fade?.mix).toBeCloseTo(DT, 9);
  });
});
