import { describe, expect, it } from "vitest";
import { splitSources } from "./LibraryPanel";

describe("splitSources", () => {
  it("tek tek eklenen şarkılar klasörlerden ayrılır (her biri ayrı kutucuk olmaz)", () => {
    const sources = [
      { id: 1, path: "D:\\Müzik" },
      { id: 2, path: "D:\\İndirilenler\\a.MP3" },
      { id: 3, path: "/home/ada/b.flac" },
      { id: 4, path: "D:\\Arşiv.2024" },
      { id: 5, path: "D:\\Kayıtlar\\not.txt" },
    ];
    const { folders, files } = splitSources(sources, ["mp3", "flac"]);
    expect(folders.map((f) => f.id)).toEqual([1, 4, 5]);
    expect(files.map((f) => f.id)).toEqual([2, 3]);
  });
});
