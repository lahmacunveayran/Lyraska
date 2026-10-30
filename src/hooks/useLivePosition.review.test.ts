/**
 * Bağımsız inceleme 2 (söz zamanlaması, ac70a61): `useLivePosition`'ın kare saati (FrameClock +
 * displayTime + geri gitmeyen an) kare hızı değişirken. Doğru sonuç denetimin tanımıyla aynı: kare,
 * bir sonraki karenin damgasında ekrana çıkar; o anda ekrandaki konum o anın konumu olmalı.
 * Sahte saat: konum = zaman (positionNow(at) = at / 1000); geri çağrı damgadan 1 ms sonra koşar.
 */
import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "../lib/backend";
import { useLivePosition, type PlayerControls } from "./usePlayer";

const playing = { state: "playing", track: null, positionSecs: 0 } as unknown as PlaybackStatus;

/** Kareleri verilen damgalarla sürer; her kare için (ekrandaki konum − ekrana çıktığı anın konumu) ms. */
function errorsFor(stamps: number[]): number[] {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const player: Pick<PlayerControls, "status" | "position" | "positionNow"> = {
    status: playing,
    position: 0,
    positionNow: (at?: number) => (at ?? clock) / 1000,
  };
  let shown = 0;
  function Live() {
    shown = useLivePosition(player);
    return null;
  }
  render(createElement(Live));
  const errors: number[] = [];
  for (let i = 0; i + 1 < stamps.length; i++) {
    clock = stamps[i]! + 1;
    frames.at(-1)!(stamps[i]!);
    errors.push(shown * 1000 - stamps[i + 1]!);
  }
  return errors;
}

/** `count` kare, `ms` aralıkla, `from`'dan sonra. */
function frames(from: number, count: number, ms: number): number[] {
  return Array.from({ length: count }, (_, i) => from + (i + 1) * ms);
}

describe("inceleme 2: kare hızı değişirken sözlerin anı", () => {
  afterEach(() => vi.restoreAllMocks());

  it("ağır sahneden hafif sahneye geçince (8 → 60 kare/sn) sözler öne kaçmaz, donmaz", () => {
    const slow = frames(1000, 20, 125);
    const fast = frames(slow.at(-1)!, 40, 1000 / 60);
    const errors = errorsFor([...slow, ...fast]).slice(slow.length);
    const worst = errors.reduce((m, e) => (Math.abs(e) > Math.abs(m) ? e : m), 0);
    // Kare süresinin ortancası 8 kare boyunca 125 ms kalır: söz ~108 ms erken, sonra `lastAt` yüzünden
    // ~100 ms donar.
    expect(Math.abs(worst), `en kötü ${worst.toFixed(1)} ms`).toBeLessThan(1000 / 60);
  });

  it("yavaş makinede sürdürünce (kare saati sıfırlanmaz) ilk kareler geç kalmaz", () => {
    // Ekran kartsız makine: kareler 116 ms. Duraklat-sürdür etkiyi yeniden kurar; kare saati
    // sıfırlansaydı ilk ölçümlere kadar 60 Hz varsayılır, söz ~99 ms geç kalırdı. (İlk sürümde bu test
    // her seferinde yeni bileşen kuruyordu: o, programın ilk açılışını sınar; orada kare süresi henüz
    // bilinemez. Düzeltme: aynı bileşende duraklat-sürdür.)
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const paused = { ...playing, state: "paused" } as PlaybackStatus;
    let shown = 0;
    function Live({ status }: { status: PlaybackStatus }) {
      shown = useLivePosition({
        status,
        position: 0,
        positionNow: (at?: number) => (at ?? clock) / 1000,
      });
      return null;
    }
    const view = render(createElement(Live, { status: playing }));
    const before = frames(1000, 12, 116);
    for (const stamp of before) {
      clock = stamp + 1;
      callbacks.at(-1)!(stamp);
    }
    view.rerender(createElement(Live, { status: paused }));
    view.rerender(createElement(Live, { status: playing }));
    const after = frames(before.at(-1)! + 3000, 8, 116);
    const errors: number[] = [];
    for (let i = 0; i + 1 < after.length; i++) {
      clock = after[i]! + 1;
      callbacks.at(-1)!(after[i]!);
      errors.push(shown * 1000 - after[i + 1]!);
    }
    const worst = errors.reduce((m, e) => (Math.abs(e) > Math.abs(m) ? e : m), 0);
    expect(Math.abs(worst), `en kötü ${worst.toFixed(1)} ms`).toBeLessThan(20);
  });

  it("8 kare/sn'den yavaş makinede (kareler 166 ms) sözler sistematik geç kalmaz", () => {
    // MAX_FRAME_MS (125 ms) sınırı: kare 166 ms sürünce an 41 ms erken tahmin edilir, söz o kadar geç.
    // check:scenes bu makinede (yük altında 150–167 ms kareler) "söz saati ortancası 41,6 ms" diye düşer.
    const errors = errorsFor(frames(1000, 40, 166.6)).slice(20);
    const worst = errors.reduce((m, e) => (Math.abs(e) > Math.abs(m) ? e : m), 0);
    expect(Math.abs(worst), `en kötü ${worst.toFixed(1)} ms`).toBeLessThan(20);
  });

  it("60 → 144 Hz geçişinde sapma bir kareyi aşmaz", () => {
    const a = frames(1000, 20, 1000 / 60);
    const b = frames(a.at(-1)!, 40, 1000 / 144);
    const errors = errorsFor([...a, ...b]).slice(a.length);
    const worst = errors.reduce((m, e) => (Math.abs(e) > Math.abs(m) ? e : m), 0);
    expect(Math.abs(worst), `en kötü ${worst.toFixed(1)} ms`).toBeLessThan(1000 / 60);
  });
});
