import { act, render, renderHook, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "../lib/backend";
import { useLivePosition, usePlayer, type PlayerControls } from "./usePlayer";

const backend = vi.hoisted(() => ({
  statusCalls: 0,
  /** İlk yanıttan sonra çekirdek meşgul: durum sorguları yanıtlanmaz (ör. şarkı açılıyor). */
  busy: false,
  /** Verilirse durum sorgusunun yanıtı (IPC gecikmesini taklit etmek için). */
  reply: null as (() => Promise<PlaybackStatus>) | null,
}));

const playing: PlaybackStatus = {
  state: "playing",
  track: {
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
    durationSecs: 200,
  },
  positionSecs: 1,
  underruns: 0,
  error: null,
  bpm: null,
  output: null,
};

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    isDesktop: () => true,
    openTrack: async () => playing.track,
    getPlaybackStatus: () => {
      backend.statusCalls++;
      if (backend.reply) return backend.reply();
      return backend.busy ? new Promise<PlaybackStatus>(() => {}) : Promise.resolve(playing);
    },
  };
});

describe("oynatıcının durum sorgusu", () => {
  afterEach(() => vi.useRealTimers());

  it("çekirdek meşgulken sorgular birikmez: yanıt gelmeden yenisi gönderilmez", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayer(["flac"]));
    await act(async () => {
      await result.current.openPath("C:/Müzik/gece.flac");
    });
    expect(result.current.status.track).not.toBeNull();
    backend.busy = true;
    backend.statusCalls = 0;
    // Çekirdek 3 sn meşgul (şarkı açılırken kilit tutuluyor): her 250 ms'de bir sorgu
    // gönderilseydi 12 istek birikip çekirdeğin iş parçacıklarını bekletirdi.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(backend.statusCalls).toBe(1);
  });
});

describe("oynatma saati (söz zamanlaması)", () => {
  // Önceki test çekirdeği meşgul bırakır (yanıtsız sorgular).
  beforeEach(() => {
    backend.busy = false;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    backend.reply = null;
    backend.busy = false;
  });

  it("düzenli sorgunun konumu isteğin gidişiyle yanıtın gelişinin ortasına bağlanır", async () => {
    // Sorgu ~10 ms sürer, çekirdek konumu yolun ortasında okur. Saat yanıtın geldiği ana bağlansaydı
    // konum ~5 ms geride kalırdı (IPC'nin dönüş yolu) ve sözler o kadar geç görünürdü.
    const { result } = renderHook(() => usePlayer(["flac"]));
    await act(async () => {
      await result.current.openPath("C:/Müzik/gece.flac");
    });
    // Gerçek konum şimdi 50 sn (açılıştakinden çok uzak: saat yumuşak düzeltme yapmadan geçer).
    const origin = performance.now();
    const truth = (at: number) => 50 + (at - origin) / 1000;
    let answered = 0;
    backend.reply = () => {
      const sent = performance.now();
      return new Promise((resolve) =>
        setTimeout(() => {
          answered++;
          resolve({ ...playing, positionSecs: truth((sent + performance.now()) / 2) });
        }, 10),
      );
    };
    // Bir sonraki düzenli sorgu (250 ms'de bir).
    await act(() => vi.waitFor(() => expect(answered).toBe(1), { timeout: 2000, interval: 5 }));
    const at = performance.now();
    expect(Math.abs(result.current.positionNow(at) - truth(at))).toBeLessThan(0.0005);
  });

  it("akıcı konum karenin ekrana çıkacağı an için okunur ve aynı karede yazılır", () => {
    // React'in sıradan güncellemesi kare boyandıktan sonra işlenir: konum bir kare geride kalırdı.
    // Sayfa, geri çağrı döner dönmez boyanır; o anda ekrandaki konum bu karenin konumu olmalı.
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(performance, "now").mockReturnValue(5004);
    const positionNow = vi.fn((at?: number) => (at ?? 0) / 1000);
    const player: Pick<PlayerControls, "status" | "position" | "positionNow"> = {
      status: playing,
      position: 1,
      positionNow,
    };
    function Live() {
      return createElement("p", null, useLivePosition(player).toFixed(3));
    }
    render(createElement(Live));
    // Kare 5000. ms'de başladı, geri çağrı 4 ms sonra koşuyor (önce sahne çizildi): konum, karenin
    // ekrana çıkacağı an (bir kare sonra, 60 Hz; henüz kare ölçülmedi) için okunur.
    frames.at(-1)!(5000);
    expect(positionNow).toHaveBeenLastCalledWith(5000 + 1000 / 60);
    expect(screen.getByText("5.017")).toBeTruthy();
  });
});
