import { afterEach, describe, expect, it, vi } from "vitest";
import { SPEED_MAX, SPEED_MIN, isScenePalette } from "./sceneLook";
import {
  BUILT_IN_PRESETS,
  MAX_PRESET_NAME,
  MAX_USER_PRESETS,
  cleanPresetName,
  createUserPreset,
  loadUserPresets,
  presetSceneName,
  sanitizePreset,
  sanitizePresets,
  saveUserPresets,
  type ScenePreset,
} from "./scenePreset";
import { isShaderScene } from "./shaderScene";

const userPreset = (id: string, extra: Partial<ScenePreset> = {}): ScenePreset => ({
  id,
  name: `Ayar ${id}`,
  scene: "nebula",
  speed: 1,
  palette: "theme",
  builtIn: false,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("hazır ayarlar", () => {
  it("programla gelenler geçerli, kimlikleri ve adları tekil", () => {
    expect(BUILT_IN_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(BUILT_IN_PRESETS.map((p) => p.id)).size).toBe(BUILT_IN_PRESETS.length);
    expect(new Set(BUILT_IN_PRESETS.map((p) => p.name)).size).toBe(BUILT_IN_PRESETS.length);
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.builtIn).toBe(true);
      expect(isShaderScene(preset.scene)).toBe(true);
      expect(isScenePalette(preset.palette)).toBe(true);
      expect(preset.speed).toBeGreaterThanOrEqual(SPEED_MIN);
      expect(preset.speed).toBeLessThanOrEqual(SPEED_MAX);
      expect(sanitizePreset(preset)).toEqual({ ...preset, builtIn: false });
    }
    expect(BUILT_IN_PRESETS.find((p) => p.id === "embers")).toMatchObject({
      name: "Kor ateşi",
      scene: "nebula",
      speed: 0.8,
      palette: "ember",
    });
    expect(presetSceneName(BUILT_IN_PRESETS[0]!)).toBe("Bulutsu");
  });

  it("ad temizlenir: boşluklar, uzunluk sınırı (Türkçe harfler bölünmez)", () => {
    expect(cleanPresetName("  Gece   yarısı \n mavisi ")).toBe("Gece yarısı mavisi");
    expect(cleanPresetName("   ")).toBe("");
    const long = "ğüşıöç".repeat(20);
    expect([...cleanPresetName(long)]).toHaveLength(MAX_PRESET_NAME);
    expect(cleanPresetName("🌙".repeat(50))).toBe("🌙".repeat(MAX_PRESET_NAME));
  });

  it("kayıttan okunan bozuk, bilinmeyen ve yinelenen hazır ayarlar atlanır; hız sınırlanır", () => {
    const presets = sanitizePresets({
      version: 1,
      presets: [
        { id: "a", name: "Hızlı", scene: "tunnel", speed: 9, palette: "ember" },
        { id: "b", name: "Bilinmeyen sahne", scene: "disko", speed: 1, palette: "ice" },
        { id: "c", name: "Bilinmeyen palet", scene: "nebula", speed: 1, palette: "neon" },
        { id: "d", name: "   ", scene: "nebula", speed: 1, palette: "ice" },
        { id: "a", name: "Aynı kimlik", scene: "nebula", speed: 1, palette: "ice" },
        { id: "embers", name: "Programınkiyle aynı", scene: "nebula", speed: 1, palette: "ice" },
        { id: 7, name: "Sayı kimlik", scene: "nebula", speed: 1, palette: "ice" },
        { id: "e", name: "Yavaş", scene: "rain", speed: "yavaş", palette: "rose", builtIn: true },
        null,
        "metin",
      ],
    });
    expect(presets).toEqual([
      { id: "a", name: "Hızlı", scene: "tunnel", speed: 2, palette: "ember", builtIn: false },
      { id: "e", name: "Yavaş", scene: "rain", speed: 1, palette: "rose", builtIn: false },
    ]);
    for (const bad of [null, 3, "x", [], { presets: "x" }, { presets: null }]) {
      expect(sanitizePresets(bad)).toEqual([]);
    }
    // En fazla `MAX_USER_PRESETS`.
    const many = Array.from({ length: MAX_USER_PRESETS + 20 }, (_, i) => userPreset(`u${i}`));
    expect(sanitizePresets({ presets: many })).toHaveLength(MAX_USER_PRESETS);
  });

  it("kaydedilir ve okunur; depo bozuksa ya da erişilemezse boş liste, çökmez", () => {
    expect(loadUserPresets()).toEqual([]);
    const mine = [userPreset("u1", { palette: "forest", speed: 0.7 }), userPreset("u2")];
    saveUserPresets([...BUILT_IN_PRESETS, ...mine]);
    const stored = JSON.parse(window.localStorage.getItem("lyraska.scenePresets") ?? "");
    expect(stored.version).toBe(1);
    // Programla gelenler ve `builtIn` alanı yazılmaz.
    expect(stored.presets).toHaveLength(2);
    expect(stored.presets[0]).not.toHaveProperty("builtIn");
    expect(loadUserPresets()).toEqual(mine);

    window.localStorage.setItem("lyraska.scenePresets", "[[bozuk");
    expect(loadUserPresets()).toEqual([]);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("depo kapalı");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("depo dolu");
    });
    expect(loadUserPresets()).toEqual([]);
    expect(() => saveUserPresets(mine)).not.toThrow();
  });

  it("yeni hazır ayar: tekil kimlik, temiz ad; boş adda ve sınırda oluşturulmaz", () => {
    const look = { speed: 1.4, palette: "rose" as const };
    const first = createUserPreset(" Benim  ayarım ", "rain", look, [], 1000);
    expect(first).toEqual({
      id: "user-rs",
      name: "Benim ayarım",
      scene: "rain",
      speed: 1.4,
      palette: "rose",
      builtIn: false,
    });
    const second = createUserPreset("İkinci", "nebula", look, [first!], 1000);
    expect(second?.id).toBe("user-rs-1");
    expect(createUserPreset("   ", "nebula", look, [])).toBeNull();
    const full = Array.from({ length: MAX_USER_PRESETS }, (_, i) => userPreset(`u${i}`));
    expect(createUserPreset("Fazla", "nebula", look, [...BUILT_IN_PRESETS, ...full])).toBeNull();
    // Bozuk görünüm sınırlanır.
    expect(createUserPreset("Uç", "nebula", { speed: 50, palette: "ice" }, [])?.speed).toBe(2);
  });
});
