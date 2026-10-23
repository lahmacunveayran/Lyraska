import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  CrossfeedState,
  EqState,
  MilkdropFolder,
  MilkdropPreset,
  ParametricState,
} from "./backend";
import { createFlashGuard } from "./flashGuard";
import { SCENES } from "./scene";

/**
 * Sahne denetiminin (`scripts/check-scenes.mjs`) sahte çekirdeği, arayüzün beklediği verinin
 * bütün alanlarını döndürmeli: eksik bir alan arayüzü çökertir, sahne hiç çizilmez (0.0.29'da
 * yeni bas alanlarıyla oldu). Aşağıdaki tam örnek üretilen tipe bağlıdır: Rust'a yeni bir alan
 * eklenince bu dosya derlenmez, sahte çekirdek de birlikte güncellenir.
 */
const FULL_EQ_STATE: EqState = {
  enabled: true,
  gainsDb: [],
  bassDb: 0,
  smallSpeaker: false,
  bassDepth: 0,
  bassPunch: 0,
  maxBassDb: 18,
  bandsHz: [],
  maxGainDb: 12,
  preampDb: 0,
  curveHz: [],
  curveDb: [],
};

const FULL_PARAMETRIC_STATE: ParametricState = {
  settings: { enabled: true, bands: [], design: "matched" },
  comparing: false,
  curveHz: [],
  curveDb: [],
  bandCurvesDb: [],
  boostDb: 0,
  loudnessDb: 0,
  maxBands: 20,
  maxGainDb: 24,
  minQ: 0.1,
  maxQ: 30,
};

const FULL_MILKDROP_FOLDER: MilkdropFolder = {
  folder: null,
  presets: [],
  truncated: false,
  error: null,
};

const FULL_MILKDROP_PRESET: Omit<MilkdropPreset, "preset"> & { preset: null } = {
  name: "",
  simplified: false,
  preset: null,
};

const FULL_CROSSFEED_STATE: CrossfeedState = {
  settings: { enabled: false, cutoffHz: 700, levelDb: 6 },
  presets: [],
  delayUs: 227,
  curveHz: [],
  nearDb: [],
  farDb: [],
};

/** Sahte çekirdekte bir komutun döndürdüğü nesnenin metni. */
function fakeResponse(command: string): string {
  // Testler depo kökünde çalışır.
  const script = readFileSync("scripts/check-scenes.mjs", "utf8");
  const start = script.indexOf(`case "${command}": return {`);
  expect(start, `sahte çekirdekte "${command}" yok`).toBeGreaterThan(0);
  return script.slice(start, script.indexOf("};", start));
}

describe("sahne denetiminin sahte çekirdeği", () => {
  it("parametrik ekolayzer durumunun bütün alanlarını döndürür", () => {
    const response = fakeResponse("parametric_get");
    for (const field of Object.keys(FULL_PARAMETRIC_STATE)) {
      expect(response, `"${field}" eksik`).toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it("MilkDrop klasörünün ve görselinin bütün alanlarını döndürür", () => {
    const folder = fakeResponse("milkdrop_list");
    for (const field of Object.keys(FULL_MILKDROP_FOLDER)) {
      expect(folder, `"${field}" eksik`).toMatch(new RegExp(`\\b${field}:`));
    }
    const preset = fakeResponse("milkdrop_load");
    for (const field of Object.keys(FULL_MILKDROP_PRESET)) {
      expect(preset, `"${field}" eksik`).toMatch(new RegExp(`\\b${field}:`));
    }
    // Deneme preseti Rust ayrıştırıcısının çıktısıdır (elle yazılmış JSON değil).
    expect(preset).toMatch(/JSON\.stringify\(MILKDROP_PRESETS\[milk\]\.preset\)/);
  });

  it("crossfeed durumunun bütün alanlarını döndürür", () => {
    const response = fakeResponse("crossfeed_get");
    for (const field of Object.keys(FULL_CROSSFEED_STATE)) {
      expect(response, `"${field}" eksik`).toMatch(new RegExp(`\\b${field}:`));
    }
  });

  it("ekolayzer durumunun bütün alanlarını döndürür", () => {
    const response = fakeResponse("equalizer_get");
    for (const field of Object.keys(FULL_EQ_STATE)) {
      expect(response, `"${field}" eksik`).toMatch(new RegExp(`\\b${field}:`));
    }
  });
});

describe("parlaklık freninin denetim deseni", () => {
  it("programa girmez: hiçbir uygulama dosyası denetim modülünü içe aktarmaz", () => {
    // Bilerek parlayan desen yalnızca `scripts/check-scenes.mjs`'in ayrı paketinde çalışır.
    const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith("flashGuardCheck.ts"),
    );
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      expect(readFileSync(`src/${file}`, "utf8"), file).not.toMatch(/flashGuardCheck/);
    }
    expect(readFileSync("index.html", "utf8")).not.toMatch(/flashGuardCheck/);
  });

  it("fren kurulamazsa nedeni döner (çağıran sahneyi göstermez)", () => {
    const lost = { isContextLost: () => true } as unknown as WebGL2RenderingContext;
    const setup = createFlashGuard(lost);
    expect(setup.ok).toBe(false);
    if (!setup.ok) expect(setup.reason).toMatch(/kayıp/);
  });
});

describe("sahne denetiminin sahne listesi", () => {
  it("programdaki her sahne tarayıcıda denetlenir (yeni sahne parlama ölçümünden kaçamaz)", () => {
    const script = readFileSync("scripts/check-scenes.mjs", "utf8");
    const start = script.indexOf("const SCENES = [");
    const end = script.indexOf("];", script.indexOf("const ALL_SCENES = ["));
    expect(start).toBeGreaterThan(0);
    const region = script.slice(start, end);
    const checked = new Set(
      [...region.matchAll(/\bid: "(\w+)"|^\s*\["(\w+)", "/gm)].map((m) => m[1] ?? m[2]),
    );
    expect([...checked].sort()).toEqual(SCENES.map((s) => s.id).sort());
  });
});
