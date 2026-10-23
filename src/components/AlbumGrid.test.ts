import { describe, expect, it } from "vitest";
import { albumLength, isAlbumOf } from "./AlbumGrid";

const track = (artist: string | null, albumArtist: string | null, album = "Derleme") => ({
  id: 1,
  path: "/m/1.flac",
  title: "Bir",
  artist,
  album,
  albumArtist,
  trackNumber: 1,
  durationSecs: 200,
  codec: "flac",
  bpm: null,
  analyzed: false,
  key: null,
});

const album = (artist: string | null, name = "Derleme") => ({
  name,
  artist,
  trackCount: 2,
  durationSecs: 400,
  coverPath: "/m/1.flac",
  bpm: null,
  key: null,
});

describe("çalan albüm", () => {
  it("albüm sanatçısıyla (yoksa sanatçıyla) eşleşir; derlemeler ve sanatçısız albümler doğru", () => {
    // Derleme: şarkının sanatçısı başka, albüm sanatçısı "Çeşitli".
    expect(isAlbumOf(track("Ece", "Çeşitli"), album("Çeşitli"))).toBe(true);
    expect(isAlbumOf(track("Ece", "Çeşitli"), album("Ece"))).toBe(false);
    expect(isAlbumOf(track("Ece", null), album("Ece"))).toBe(true);
    // Sanatçısız albüm, aynı adlı başka sanatçının albümüyle karışmaz.
    expect(isAlbumOf(track("Bora", null), album(null))).toBe(false);
    expect(isAlbumOf(track(null, null), album(null))).toBe(true);
    expect(isAlbumOf(track("Ece", null, "Başka"), album("Ece"))).toBe(false);
  });

  it("albüm süresi dakika, uzunsa saat ve dakika", () => {
    expect(albumLength(400)).toBe("7 dk");
    expect(albumLength(4320)).toBe("1 sa 12 dk");
  });
});
