import { afterEach, describe, expect, it, vi } from "vitest";

const covers = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("./backend", () => ({
  getAlbumCover: async (album: string) => {
    covers.calls.push(`seçilen:${album}`);
    return null;
  },
  getTrackCover: async (path: string) => {
    covers.calls.push(path);
    return null;
  },
}));

import {
  albumCoverKey,
  cachedAlbumCover,
  clearAlbumCovers,
  albumCoverIndex,
  albumCoverRequest,
  invalidateAlbumCover,
  requestAlbumCover,
  trackCoverRequest,
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

/** Şarkı kapağı okumaları (kullanıcının seçtiği kapağa bakış ayrı sayılır). */
const trackReads = () => covers.calls.filter((c) => !c.startsWith("seçilen:"));

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
    expect(covers.calls).toEqual(["seçilen:Kum", "/m/Kum.flac"]);
    // jsdom'da tuval çizilemez: boş kapak (kart düz zeminle görünür), ama yine akılda.
    expect(got).toEqual(["", ""]);
    expect(cachedAlbumCover(albumCoverKey(album("Kum")))).toBe("");
    requestAlbumCover(album("Kum"), (url) => got.push(url));
    expect(got).toHaveLength(3);
    expect(trackReads()).toHaveLength(1);
  });

  it("ekrandan çıkan kartın sıradaki işi yapılmaz", async () => {
    const got: string[] = [];
    // İki iş aynı anda çalışır; üçüncüsü sırada bekler, kartı ekrandan çıkınca atlanır.
    requestAlbumCover(album("A"), (url) => got.push(`A${url}`));
    requestAlbumCover(album("B"), (url) => got.push(`B${url}`));
    const release = requestAlbumCover(album("C"), (url) => got.push(`C${url}`));
    release();
    await settle();
    expect(trackReads()).toEqual(["/m/A.flac", "/m/B.flac"]);
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
    expect(trackReads()).toEqual(["/m/Yön.flac", "/m/Yön.flac"]);
  });

  it("kullanıcı kapağı seçince ya da kaldırınca kapak yeniden hazırlanır", async () => {
    const key = albumCoverKey(album("Tuz"));
    requestAlbumCover(album("Tuz"), () => undefined);
    await settle();
    expect(cachedAlbumCover(key)).toBe("");
    invalidateAlbumCover("Tuz", "Ada");
    expect(albumCoverKey(album("Tuz"))).not.toBe(key);
    expect(cachedAlbumCover(albumCoverKey(album("Tuz")))).toBeNull();
    // Başka albüm etkilenmez.
    expect(albumCoverKey(album("Kıyı"))).toBe(albumCoverKey(album("Kıyı")));
  });

  it("şarkı satırının kapağı albümün kapağıdır: aynı albümün şarkıları aynı kimliği paylaşır", () => {
    const track = (n: number, over: Record<string, unknown> = {}) => ({
      id: n,
      path: `/m/${n}.flac`,
      title: `Şarkı ${n}`,
      artist: "Ada",
      album: "Kum",
      albumArtist: null,
      trackNumber: n,
      durationSecs: 200,
      codec: "flac",
      bpm: 90 + n,
      analyzed: true,
      key: `${n}A`,
      ...over,
    });
    // Liste çekirdekten albüm sırasıyla gelir: albümün ilk şarkısı kapağın ve tonun kaynağı
    // (çekirdeğin albüm listesindeki gibi).
    const tracks = [track(1), track(2), track(3, { artist: "Konuk", albumArtist: "Ada" })];
    const index = albumCoverIndex(tracks);
    const first = { album: "Kum", artist: "Ada", key: "1A", bpm: 91, coverPath: "/m/1.flac" };
    expect(trackCoverRequest(tracks[1]!, index)).toEqual(first);
    // Albüm sanatçısıyla gruplanır.
    expect(trackCoverRequest(tracks[2]!, index)).toEqual(first);
    // Izgaradaki albümle aynı kimlik: tek kapak işi, tek önbellek.
    expect(albumCoverKey(trackCoverRequest(tracks[1]!, index)!)).toBe(
      albumCoverKey(
        albumCoverRequest({
          name: "Kum",
          artist: "Ada",
          trackCount: 3,
          durationSecs: 600,
          coverPath: "/m/1.flac",
          bpm: 91,
          key: "1A",
        }),
      ),
    );
    // Albüm etiketi yoksa yer tutucu.
    expect(trackCoverRequest(track(1, { album: null }), index)).toBeNull();
    expect(albumCoverIndex([track(1, { album: "" })]).size).toBe(0);
    // Dizinde olmayan albüm: şarkının kendisinden, ton ve tempo olmadan.
    expect(trackCoverRequest(track(4, { album: "Yön" }), index)).toEqual({
      album: "Yön",
      artist: "Ada",
      key: null,
      bpm: null,
      coverPath: "/m/4.flac",
    });
  });
});
