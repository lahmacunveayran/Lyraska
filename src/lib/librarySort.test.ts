import { describe, expect, it } from "vitest";
import type { LibraryTrack } from "./backend";
import {
  DEFAULT_SORT,
  camelotName,
  keyHue,
  keyText,
  nextSort,
  parseCamelot,
  sortTracks,
} from "./librarySort";

function track(id: number, fields: Partial<LibraryTrack>): LibraryTrack {
  return {
    id,
    path: `/m/${id}.flac`,
    title: `Şarkı ${id}`,
    artist: null,
    album: null,
    albumArtist: null,
    trackNumber: null,
    durationSecs: null,
    codec: "flac",
    bpm: null,
    analyzed: false,
    key: null,
    ...fields,
  };
}

const ids = (list: LibraryTrack[]) => list.map((t) => t.id);

describe("Camelot kodu", () => {
  it("sayı ve kipe ayrılır, geçersiz kod reddedilir", () => {
    expect(parseCamelot("8A")).toEqual({ number: 8, minor: true });
    expect(parseCamelot("12B")).toEqual({ number: 12, minor: false });
    for (const bad of ["0A", "13B", "8C", "8", "A8", ""]) expect(parseCamelot(bad)).toBeNull();
  });

  it("Türkçe ada çevrilir (çekirdekteki çarkla aynı)", () => {
    expect(camelotName("8A")).toBe("La minör");
    expect(camelotName("8B")).toBe("Do majör");
    expect(camelotName("9B")).toBe("Sol majör");
    expect(camelotName("5A")).toBe("Do minör");
    expect(camelotName("x")).toBeNull();
  });

  it("ton sütunu: sade ad, DJ görünümünde kod; belirsiz '—', bekleyen boş", () => {
    expect(keyText({ key: "8A", analyzed: true }, false)).toBe("La minör");
    expect(keyText({ key: "8A", analyzed: true }, true)).toBe("8A");
    expect(keyText({ key: null, analyzed: true }, false)).toBe("—");
    expect(keyText({ key: null, analyzed: false }, true)).toBe("");
  });

  it("ton rengi Camelot sayısından", () => {
    expect(keyHue("11B")).toBe(11);
    expect(keyHue(null)).toBeNull();
    expect(keyHue("bozuk")).toBeNull();
  });
});

describe("sortTracks", () => {
  const list = [
    track(1, { title: "şeker", bpm: 128, key: "9A", durationSecs: 200, album: "Zeytin" }),
    track(2, { title: "Çiçek", bpm: null, key: null, durationSecs: 150 }),
    track(3, { title: "Sevgi", bpm: 90, key: "8B", durationSecs: null, album: "Ayva" }),
    track(4, { title: "ılık", bpm: 128, key: "8A", durationSecs: 320, album: "İnci" }),
  ];

  it("varsayılan sıra çekirdeğinkidir; ters yönde yalnızca çevrilir", () => {
    expect(sortTracks(list, DEFAULT_SORT)).toBe(list);
    expect(ids(sortTracks(list, { key: "artist", descending: true }))).toEqual([4, 3, 2, 1]);
  });

  it("başlıklar Türkçe alfabeyle sıralanır (ç, ı, ş doğru yerde)", () => {
    expect(ids(sortTracks(list, { key: "title", descending: false }))).toEqual([2, 4, 3, 1]);
  });

  it("değeri olmayan yön ne olursa olsun sonda kalır, eşitler sırasını korur", () => {
    expect(ids(sortTracks(list, { key: "bpm", descending: false }))).toEqual([3, 1, 4, 2]);
    expect(ids(sortTracks(list, { key: "bpm", descending: true }))).toEqual([1, 4, 3, 2]);
    expect(ids(sortTracks(list, { key: "duration", descending: true }))).toEqual([4, 1, 2, 3]);
    expect(ids(sortTracks(list, { key: "album", descending: false }))).toEqual([3, 4, 1, 2]);
  });

  it("ton Camelot çarkıyla sıralanır: uyumlu tonlar yan yana", () => {
    expect(ids(sortTracks(list, { key: "key", descending: false }))).toEqual([4, 3, 1, 2]);
  });

  it("girişi değiştirmez", () => {
    const before = ids(list);
    sortTracks(list, { key: "title", descending: true });
    expect(ids(list)).toEqual(before);
  });

  it("aynı sütuna tıklamak yönü çevirir, yenisi artan başlar", () => {
    expect(nextSort(DEFAULT_SORT, "artist")).toEqual({ key: "artist", descending: true });
    expect(nextSort({ key: "bpm", descending: true }, "title")).toEqual({
      key: "title",
      descending: false,
    });
  });
});
