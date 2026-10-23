import { describe, expect, it } from "vitest";
import type { LibraryTrack } from "./backend";
import { bpmRadius, keyAngle, layoutSky, nearestStar } from "./skyMap";

const track = (id: number, key: string | null, bpm: number | null): LibraryTrack => ({
  id,
  path: `/m/${id}.flac`,
  title: `Şarkı ${id}`,
  artist: null,
  album: null,
  albumArtist: null,
  trackNumber: null,
  durationSecs: 200,
  codec: "flac",
  bpm,
  analyzed: key !== null,
  key,
});

describe("gökyüzü yerleşimi", () => {
  it("tempo dışa doğru artar, sınırlarda kenara yapışır", () => {
    expect(bpmRadius(60)).toBeLessThan(bpmRadius(120));
    expect(bpmRadius(120)).toBeLessThan(bpmRadius(180));
    expect(bpmRadius(30)).toBe(bpmRadius(60));
    expect(bpmRadius(300)).toBe(bpmRadius(190));
  });

  it("uyumlu tonlar komşu açılarda; minör ve majör aynı sayının iki yanında", () => {
    const step = keyAngle(9, true) - keyAngle(8, true);
    expect(step).toBeCloseTo(Math.PI / 6, 9);
    expect(keyAngle(8, false) - keyAngle(8, true)).toBeCloseTo((14 * Math.PI) / 180, 9);
  });

  it("tonu ya da temposu bilinmeyenler yerleşmez, sayılır; yer belirlenimci", () => {
    const tracks = [
      track(1, "8A", 124),
      track(2, null, 120),
      track(3, "9B", null),
      track(4, "x", 90),
    ];
    const a = layoutSky(tracks, 500, 500, 400);
    expect(a.stars.map((s) => s.track.id)).toEqual([1]);
    expect(a.unplaced).toBe(3);
    const b = layoutSky(tracks, 500, 500, 400);
    expect(b.stars[0]!.x).toBe(a.stars[0]!.x);
    expect(a.stars[0]!.hue).toBe(8);
    // Yıldız yarıçapın içinde.
    const s = a.stars[0]!;
    expect(Math.hypot(s.x - 500, s.y - 500)).toBeLessThanOrEqual(400);
  });

  it("en yakın yıldız yalnızca yakınsa bulunur", () => {
    const { stars } = layoutSky([track(1, "8A", 124)], 0, 0, 100);
    const s = stars[0]!;
    expect(nearestStar(stars, s.x + 3, s.y, 8)).toBe(s);
    expect(nearestStar(stars, s.x + 30, s.y, 8)).toBeNull();
  });
});
