import { readFileSync } from "node:fs";
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
      "Bulutsu",
      "Işık tüneli",
      "Kaleydoskop",
      "İpek şeritler",
      "Sarmal gökada",
      "Yağmurlu cam",
      "Kendi resmin",
      "MilkDrop",
    ]);
    expect(SCENES).toHaveLength(13);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(13);
    expect(["1", "2", "3", "4", "5", "6", "0"].map(sceneForKey)).toEqual([
      "sky",
      "highway",
      "vu",
      "spectrum",
      "drive",
      "nebula",
      "galaxy",
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
    expect(nextScene("drive", 1)).toBe("nebula");
    expect(nextScene("kaleido", 1)).toBe("ribbons");
    expect(nextScene("rain", 1)).toBe("photo");
    expect(nextScene("photo", 1)).toBe("milkdrop");
    expect(nextScene("milkdrop", 1)).toBe("sky");
    expect(nextScene("sky", -1)).toBe("milkdrop");
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

  it("kaldırılan Işık Ustası kayıtlıysa gece göğüyle başlar", () => {
    window.localStorage.setItem("lyraska.scene", "lightshow");
    expect(loadScene()).toBe("sky");
  });

  it("üst çubuk (galeri listesi) çekmecenin üstünde çizilir", () => {
    // Galeri listesi üst çubuğun katmanındadır; üst çubuk çekmecenin altında kalırsa liste açık
    // çekmecenin arkasında görünmez olur (1280×800'de tamamen). Üst çubuğun kutusu çekmeceyle
    // çakışmadığı için onu öne almak başka bir şeyi örtmez.
    const css = readFileSync("src/styles/global.css", "utf8");
    const rule = (selector: string, property: string) => {
      const block = css.slice(css.indexOf(`\n${selector} {`));
      const body = block.slice(0, block.indexOf("}"));
      const value = body.match(new RegExp(`${property}:\\s*(\\d+)`))?.[1];
      expect(value, `${selector} ${property}`).toBeDefined();
      return Number(value);
    };
    expect(rule(".topbar", "z-index")).toBeGreaterThan(rule(".drawer", "z-index"));
    expect(rule(".drawer", "top")).toBeGreaterThan(rule(".topbar", "top") + 50);
  });
});
