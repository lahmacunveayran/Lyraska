import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLASSIC_SCENES,
  GALLERY_SCENES,
  SCENES,
  loadScene,
  nextScene,
  saveScene,
  sceneForKey,
  sceneKey,
} from "./scene";

describe("sahneler", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("adları ve 1–9, 0 tuşlarını bilir", () => {
    expect(CLASSIC_SCENES.map((s) => s.name)).toEqual([
      "Gece göğü",
      "Gece otoyolu",
      "VU ibreleri",
      "Spektrum",
      "Gece sürüşü",
    ]);
    expect(GALLERY_SCENES.map((s) => s.name)).toEqual([
      "Gece denizi",
      "Bulutsu",
      "Işık tüneli",
      "Ateşböcekleri",
      "Kaleydoskop",
      "İpek şeritler",
      "Sarmal gökada",
      "Kum tepeleri",
      "Yağmurlu cam",
      "Kristal ağ",
    ]);
    expect(SCENES).toHaveLength(15);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(15);
    expect(["1", "2", "3", "4", "5", "6", "0"].map(sceneForKey)).toEqual([
      "sky",
      "highway",
      "vu",
      "spectrum",
      "drive",
      "sea",
      "kaleido",
    ]);
    // İlk on sahnenin tuşu var ve o tuş o sahneyi seçer; gerisi PageDown/PageUp ile.
    for (const { id } of SCENES.slice(0, 10)) expect(sceneForKey(sceneKey(id)!)).toBe(id);
    for (const { id } of SCENES.slice(10)) expect(sceneKey(id)).toBeNull();
    expect(sceneForKey("a")).toBeNull();
    expect(sceneForKey("12")).toBeNull();
    expect(sceneForKey("")).toBeNull();
  });

  it("sıradaki ve önceki sahne uçlarda başa ve sona döner", () => {
    expect(nextScene("sky", 1)).toBe("highway");
    expect(nextScene("drive", 1)).toBe("sea");
    expect(nextScene("kaleido", 1)).toBe("ribbons");
    expect(nextScene("crystal", 1)).toBe("sky");
    expect(nextScene("sky", -1)).toBe("crystal");
    // Bütün sahneleri bir kez dolaşıp başa döner.
    let scene = SCENES[0]!.id;
    const seen = new Set([scene]);
    for (let i = 1; i < SCENES.length; i++) seen.add((scene = nextScene(scene, 1)));
    expect(seen.size).toBe(SCENES.length);
    expect(nextScene(scene, 1)).toBe(SCENES[0]!.id);
  });

  it("seçimi hatırlar; bozuk kayıt ya da erişim hatasında gece göğüyle başlar", () => {
    expect(loadScene()).toBe("sky");
    saveScene("vu");
    expect(loadScene()).toBe("vu");
    saveScene("spectrum");
    expect(loadScene()).toBe("spectrum");
    saveScene("nebula");
    expect(loadScene()).toBe("nebula");
    window.localStorage.setItem("lyraska.scene", "bilinmeyen");
    expect(loadScene()).toBe("sky");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(loadScene()).toBe("sky");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(() => saveScene("vu")).not.toThrow();
  });
});
