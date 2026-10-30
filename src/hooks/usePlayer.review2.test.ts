/**
 * Bağımsız inceleme 2 (söz zamanlaması, ac70a61): `replyTime`'ın 40 ms eşiğinin iki yanı. Eşiğin
 * altında konum hâlâ "ortada okundu" sayılır; çekirdek konumu isteğin yolunun sonunda okursa (kısa
 * meşguliyet: kilit, dolu tokio işçisi) saat kalıcı olarak gidiş-dönüşün yarısı kadar öne geçer.
 * Eşiği 1 ms aşan sorguda sapma birden ~0'a düşer (süreksizlik).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "../lib/backend";
import { usePlayer } from "./usePlayer";

const core = vi.hoisted(() => {
  const state = {
    base: 10,
    since: 0,
    requestLeg: 1,
    responseLeg: 1,
    truth(t: number) {
      return state.base + (t - state.since) / 1000;
    },
  };
  return state;
});

const track = {
  path: "C:/Müzik/gece.flac",
  fileName: "gece",
  title: "Gece",
  artist: null,
  album: null,
  albumArtist: null,
  trackNumber: null,
  discNumber: null,
  codec: "flac",
  sampleRate: 44100,
  channels: 2,
  durationSecs: 600,
};

const status = (positionSecs: number): PlaybackStatus => ({
  state: "playing",
  track,
  positionSecs,
  underruns: 0,
  error: null,
  bpm: null,
  output: null,
});

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    isDesktop: () => true,
    openTrack: async () => track,
    getPlaybackStatus: () =>
      new Promise<PlaybackStatus>((resolve) =>
        setTimeout(() => {
          const position = core.truth(performance.now());
          setTimeout(() => resolve(status(position)), core.responseLeg);
        }, core.requestLeg),
      ),
  };
});

/** Bütün sorgular verilen yollarla; 8 sn sonra ekrandaki saatin sapması (ms; + öne geçmiş). */
async function steadyError(requestLeg: number, responseLeg: number) {
  core.requestLeg = 1;
  core.responseLeg = 1;
  const { result, unmount } = renderHook(() => usePlayer(["flac"]));
  core.base = 10;
  core.since = performance.now();
  await act(async () => {
    const opened = result.current.openPath(track.path);
    await vi.advanceTimersByTimeAsync(5);
    await opened;
  });
  core.requestLeg = requestLeg;
  core.responseLeg = responseLeg;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000);
  });
  const error = (result.current.positionNow() - core.truth(performance.now())) * 1000;
  unmount();
  return error;
}

describe("inceleme 2: sorgu saatinin 40 ms eşiği", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
  });
  afterEach(() => vi.useRealTimers());

  it("eşiğin altında, konum yolun sonunda okununca saat öne kaymaz", async () => {
    const below = await steadyError(38, 1); // gidiş-dönüş 39 ms: orta nokta
    const above = await steadyError(40, 1); // 41 ms: yanıtın anı
    // Ölçülen: eşiğin altında ~+18,5 ms (öne), üstünde ~−1 ms; denetimin toleransı 8 ms.
    expect(
      Math.abs(below),
      `39 ms: ${below.toFixed(1)} ms, 41 ms: ${above.toFixed(1)} ms`,
    ).toBeLessThan(8);
  });
});
