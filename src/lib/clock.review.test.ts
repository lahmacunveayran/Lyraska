/**
 * Bağımsız inceleme (söz zamanlaması, 127885e): karenin anı (ilk sürümde `frameTime`, şimdi
 * `displayTime`) gerçek Chromium'un kare damgalarıyla.
 *
 * Damgalar başsız Chromium 153'te ölçüldü (/opt/pw-browsers/chromium, 60 Hz): aynı karede sözlerden
 * önce koşan bir sahne geri çağrısı 0–90 ms iş yapıyor (yavaş makinede ağır sahne, MilkDrop). Her
 * satır [rAF damgası, sözlerin geri çağrısındaki performance.now()] (ms). 300 karenin 266'sında
 * damga bir önceki karenin `now`'undan eskiydi; `frameTime` 63 kez geri gitti (en çok 16,5 ms).
 */
import { describe, expect, it } from "vitest";
import { displayTime } from "./clock";

const CHROMIUM_FRAMES: [stamp: number, now: number][] = [
  [706.6, 777],
  [773.2, 851.3],
  [839.9, 873.6],
  [873.2, 907.8],
];

describe("inceleme: frameTime gerçek kare damgalarıyla", () => {
  it("ardışık karelerde söz zamanı geri gitmez", () => {
    const times = CHROMIUM_FRAMES.map(([stamp, now]) => displayTime(stamp, now, 1000 / 60));
    for (let i = 1; i < times.length; i++) {
      // 773,2 → 851,3 penceredışı (78 ms): şimdiki an; sonraki kare 839,9 damgasını kullanır.
      expect(times[i]!, `kare ${i}: ${times[i - 1]} → ${times[i]}`).toBeGreaterThanOrEqual(
        times[i - 1]!,
      );
    }
  });

  it("kare, geri çağrının koştuğu andan önce ekrana çıkamaz", () => {
    // `lyricTime` ekrana çıkışı damga + 1/60 sayar. Sözlerin geri çağrısı damgadan 33,7 ms sonra
    // koşuyorsa kare en erken o anda (çoğunlukla bir vsync sonra) görünür: söz ≥ 17 ms geç kalır.
    for (const [stamp, now] of CHROMIUM_FRAMES) {
      const shownAt = displayTime(stamp, now, 1000 / 60);
      expect(shownAt, `damga ${stamp}, now ${now}`).toBeGreaterThanOrEqual(now);
    }
  });
});
