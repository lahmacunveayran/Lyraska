import { afterEach, describe, expect, it, vi } from "vitest";

const covers = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("./backend", () => ({
  getTrackCover: async (path: string) => {
    covers.calls.push(path);
    return null;
  },
}));

import {
  albumCoverKey,
  cachedAlbumCover,
  clearAlbumCovers,
  requestAlbumCover,
} from "./albumCovers";

const album = (name: string, key: string | null = null, bpm: number | null = null) => ({
  album: name,
  artist: "Ada",
  key,
  bpm,
  coverPath: `/m/${name}.flac`,
});

/** Bekleyen işlerin bitmesi (kuyruk ve `setTimeout(0)` nefesleri). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  clearAlbumCovers();
  covers.calls.length = 0;
});

describe("albüm kapakları", () => {
  it("aynı kapağı bekleyen iki kart için tek iş yapılır; sonuç akılda kalır", async () => {
    const got: string[] = [];
    requestAlbumCover(album("Kum"), (url) => got.push(url));
    requestAlbumCover(album("Kum"), (url) => got.push(url));
    await settle();
    expect(covers.calls).toEqual(["/m/Kum.flac"]);
    // jsdom'da tuval çizilemez: boş kapak (kart düz zeminle görünür), ama yine akılda.
    expect(got).toEqual(["", ""]);
    expect(cachedAlbumCover(albumCoverKey(album("Kum")))).toBe("");
    requestAlbumCover(album("Kum"), (url) => got.push(url));
    expect(got).toHaveLength(3);
    expect(covers.calls).toHaveLength(1);
  });

  it("ekrandan çıkan kartın sıradaki işi yapılmaz", async () => {
    const got: string[] = [];
    // İki iş aynı anda çalışır; üçüncüsü sırada bekler, kartı ekrandan çıkınca atlanır.
    requestAlbumCover(album("A"), (url) => got.push(`A${url}`));
    requestAlbumCover(album("B"), (url) => got.push(`B${url}`));
    const release = requestAlbumCover(album("C"), (url) => got.push(`C${url}`));
    release();
    await settle();
    expect(covers.calls).toEqual(["/m/A.flac", "/m/B.flac"]);
    expect(got.sort()).toEqual(["A", "B"]);
    expect(cachedAlbumCover(albumCoverKey(album("C")))).toBeNull();
  });

  it("ton ya da tempo gelince kapak yeniden istenir (analiz sonradan biter)", async () => {
    expect(albumCoverKey(album("Yön"))).not.toBe(albumCoverKey(album("Yön", "8A", 124)));
    expect(albumCoverKey({ ...album("Yön"), artist: null })).not.toBe(
      albumCoverKey({ ...album("Yön"), artist: "" }),
    );
    requestAlbumCover(album("Yön"), () => undefined);
    await settle();
    requestAlbumCover(album("Yön", "8A", 124), () => undefined);
    await settle();
    expect(covers.calls).toEqual(["/m/Yön.flac", "/m/Yön.flac"]);
  });
});
