/**
 * Bağımsız inceleme (söz zamanlaması, 127885e): düzenli durum sorgusunun saati isteğin gidişiyle
 * yanıtın gelişinin ortasına bağlanır. Bu dosya o varsayımı modelin kendi sahte çekirdeği yerine
 * başka bir çekirdekle sınar: konum çekirdekte isteğin yolunun SONUNDA okunur (çekirdek meşgul,
 * kilit bekleniyor, tokio işçileri dolu), yanıtın yolu kısadır; ya da sorgu sürerken başka bir komut
 * (sarma) biter. İkisinde de ekrandaki konum gerçek konumun önüne geçer.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "../lib/backend";
import { usePlayer } from "./usePlayer";

const core = vi.hoisted(() => {
  const state = {
    /** Gerçek konum: `since` anında `base` saniye, çalıyorsa gerçek zamanla ilerler. */
    base: 10,
    since: 0,
    calls: 0,
    sent: [] as number[],
    /** Sorgunun istek yolu (çekirdeğin konumu okumasına kadar) ve yanıt yolu (ms). */
    requestLeg: (() => 1) as (call: number) => number,
    responseLeg: (() => 1) as (call: number) => number,
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
    getPlaybackStatus: () => {
      const call = core.calls++;
      core.sent[call] = performance.now();
      return new Promise<PlaybackStatus>((resolve) =>
        setTimeout(() => {
          const position = core.truth(performance.now());
          setTimeout(() => resolve(status(position)), core.responseLeg(call));
        }, core.requestLeg(call)),
      );
    },
    // Sarma 10 ms sürer; bitince çekirdek hedeften çalar.
    seekPlayback: (seconds: number) =>
      new Promise<PlaybackStatus>((resolve) =>
        setTimeout(() => {
          core.base = seconds;
          core.since = performance.now();
          resolve(status(seconds));
        }, 10),
      ),
  };
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function openPlaying() {
  const hook = renderHook(() => usePlayer(["flac"]));
  core.base = 10;
  core.since = performance.now();
  await act(async () => {
    const opened = hook.result.current.openPath(track.path);
    await vi.advanceTimersByTimeAsync(5);
    await opened;
  });
  return hook;
}

describe("inceleme: düzenli sorgunun saati (orta nokta)", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
    core.calls = 0;
    core.sent = [];
    core.requestLeg = () => 1;
    core.responseLeg = () => 1;
  });
  afterEach(() => vi.useRealTimers());

  it("sorgu sürerken biten sarmadan sonra konum ileri kaçmaz", async () => {
    const { result } = await openPlaying();
    // İlk düzenli sorgu yavaş: çekirdek konumu 380 ms sonra (sarmadan sonra) okur, yanıt 10 ms'de gelir.
    core.requestLeg = (call) => (call === 1 ? 380 : 1);
    core.responseLeg = (call) => (call === 1 ? 10 : 1);
    await advance(250);
    expect(core.calls).toBe(2);
    const sent = core.sent[1]!;
    await advance(sent + 300 - performance.now());
    // Kullanıcı sorgu sürerken 40. saniyeye sarar.
    act(() => void result.current.seek(40));
    await advance(sent + 391 - performance.now());
    const error = result.current.positionNow() - core.truth(performance.now());
    // Ortanın (sent + 195) sarmanın bittiği andan (sent + 310) önce olması saati ~115 ms ileri iter.
    expect(Math.abs(error) * 1000, `sapma ${(error * 1000).toFixed(1)} ms`).toBeLessThan(20);
    // Sapma 0,3 sn'den küçük olduğu için sonraki sorgular onu her seferinde yalnızca %25 düzeltir.
    await advance(1000);
    const later = result.current.positionNow() - core.truth(performance.now());
    expect(Math.abs(later) * 1000, `1 sn sonra sapma ${(later * 1000).toFixed(1)} ms`).toBeLessThan(
      20,
    );
  });

  it("konum istek yolunun sonunda okununca (çekirdek meşgul) saat ileri kaymaz", async () => {
    const { result } = await openPlaying();
    // Her sorgu çekirdekte 150 ms bekler (kilit, dolu işçiler), yanıt 2 ms'de gelir.
    core.requestLeg = () => 150;
    core.responseLeg = () => 2;
    await advance(8000);
    const error = result.current.positionNow() - core.truth(performance.now());
    // Eski kural (yanıtın geldiği an) 2 ms geride kalırdı; orta nokta ~74 ms öne geçer.
    expect(Math.abs(error) * 1000, `sapma ${(error * 1000).toFixed(1)} ms`).toBeLessThan(20);
  });
});
