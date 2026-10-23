import { describe, expect, it } from "vitest";
import { sourcesLabel, splitSources } from "./LibraryPanel";

const source = (id: number, path: string, trackCount: number, single: boolean) => ({
  id,
  path,
  trackCount,
  single,
});

describe("splitSources", () => {
  it("tek tek eklenen şarkıları çekirdeğin bilgisiyle ayırır (her biri ayrı kutucuk olmaz)", () => {
    const { folders, files } = splitSources(
      [
        source(1, "D:\\Müzik", 212, false),
        source(2, "D:\\İndir\\a.MP3", 1, true),
        // Adı ses uzantısıyla biten klasör: çekirdek klasör diyor, klasör kalır.
        source(3, "D:\\Rips\\Albüm.flac", 12, false),
        // Henüz taranmamış tek şarkı: uzantısından tanınır.
        source(4, "/home/ada/b.flac", 0, false),
        source(5, "D:\\Arşiv.2024", 0, false),
      ],
      ["mp3", "flac"],
    );
    expect(folders.map((f) => f.id)).toEqual([1, 3, 5]);
    expect(files.map((f) => f.id)).toEqual([2, 4]);
  });

  it("özet: tek klasör adıyla, birden çoğu sayıyla", () => {
    expect(sourcesLabel([source(1, "D:\\Müzik", 3, false)], 5)).toBe("Müzik klasörü · 5 tek şarkı");
    expect(sourcesLabel([source(1, "D:\\A", 1, false), source(2, "D:\\B", 1, false)], 0)).toBe(
      "2 klasör",
    );
    expect(sourcesLabel([], 1)).toBe("1 tek şarkı");
  });
});
