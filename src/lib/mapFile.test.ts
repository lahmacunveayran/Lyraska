import { describe, expect, it } from "vitest";
import { importedSummary, mapFileName } from "./mapFile";

describe("şarkı haritası dosyası", () => {
  it("dosya adı okunur ve Windows'ta geçerli", () => {
    expect(mapFileName("Sezen Aksu - Gülümse")).toBe("Sezen Aksu - Gülümse.harita.json");
    expect(mapFileName('AC/DC: "Back" <in> Black?')).toBe("AC_DC_ _Back_ _in_ Black_.harita.json");
    expect(mapFileName("  ...  ")).toBe("sarki.harita.json");
    expect(mapFileName("a".repeat(200))).toHaveLength(80 + ".harita.json".length);
    expect(mapFileName("satır\nsonu")).toBe("satır_sonu.harita.json");
  });

  it("özet benzerliği, kaymayı ve kaynağı söyler", () => {
    const base = {
      sourceName: "x.harita.json",
      importedAt: "",
      similarity: 0.874,
      offsetSecs: 0.004,
      source: "analysis" as const,
      beats: 120,
    };
    expect(importedSummary(base)).toBe("benzerlik %87 · 120 vuruş · analizden");
    expect(importedSummary({ ...base, offsetSecs: -2.25, source: "edited" })).toBe(
      "benzerlik %87 · 120 vuruş · zamanlar −2.250 ms kaydırıldı · bir insanın düzelttiği",
    );
  });
});
