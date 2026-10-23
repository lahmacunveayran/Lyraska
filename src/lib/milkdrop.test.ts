import { afterEach, describe, expect, it, vi } from "vitest";
import type { VisualFrame } from "./backend";
import {
  AUTO_BLEND_SECONDS,
  EMPTY_HISTORY,
  GPU_HANG_SECONDS,
  MAX_HISTORY,
  MAX_PRESET_SECONDS,
  MIN_BLEND_SECONDS,
  MIN_PRESET_SECONDS,
  SCHEDULE_START,
  SILENT_LEVELS,
  MAX_SKIPPED,
  WAVEFORM_WINDOW,
  addSkipped,
  audioLevels,
  blameContextLoss,
  blendSeconds,
  clearSkipList,
  historyNext,
  historyPrevious,
  loadSkipList,
  readPending,
  restartSchedule,
  stepSchedule,
  writePending,
  type PresetHistory,
  type ScheduleState,
} from "./milkdrop";

/** Yönetmen notlu bir kare: bölüm, drop açılımı ve ölçü içindeki yer. */
function frame(section: number, release = 0, barPhase = 0.3, director = true): VisualFrame {
  return {
    positionSecs: 0,
    bands: [],
    rmsDb: [-12, -12],
    peakDb: [-3, -3],
    vuReferenceDb: -14,
    beat: null,
    energy: 0.5,
    section,
    director: director
      ? {
          atmosphere: { section, theme: 0, mood: 0.5, warmth: 0.5 },
          rhythm: {
            pulse: 0,
            accent: 0,
            beatPhase: 0,
            barPhase,
            anticipation: 0,
            release,
            barsConfident: true,
          },
          texture: { detail: 0.5, motion: 0.5 },
        }
      : null,
  };
}

/** `seconds` boyunca 60 kare/sn çalar; geçişlerin anlarını (saniye) döndürür. */
function run(
  state: ScheduleState,
  seconds: number,
  at: (t: number) => VisualFrame | null,
  auto = true,
): { state: ScheduleState; switches: { t: number; reason: string }[] } {
  const dt = 1 / 60;
  const switches: { t: number; reason: string }[] = [];
  for (let i = 1; i <= Math.round(seconds / dt); i++) {
    const t = i * dt;
    const step = stepSchedule(state, at(t), dt, auto);
    state = step.state;
    if (step.reason) switches.push({ t, reason: step.reason });
  }
  return { state, switches };
}

describe("dalga biçimi → Butterchurn ses verisi", () => {
  it("üç kanal kopyalanmadan ayrılır", () => {
    const bytes = new Uint8Array(3 * WAVEFORM_WINDOW);
    bytes.fill(10, 0, WAVEFORM_WINDOW);
    bytes.fill(20, WAVEFORM_WINDOW, 2 * WAVEFORM_WINDOW);
    bytes.fill(30, 2 * WAVEFORM_WINDOW);
    const levels = audioLevels(bytes);
    expect(levels.timeByteArray).toHaveLength(WAVEFORM_WINDOW);
    expect(levels.timeByteArrayL).toHaveLength(WAVEFORM_WINDOW);
    expect(levels.timeByteArrayR).toHaveLength(WAVEFORM_WINDOW);
    expect([...new Set(levels.timeByteArray)]).toEqual([10]);
    expect([...new Set(levels.timeByteArrayL)]).toEqual([20]);
    expect([...new Set(levels.timeByteArrayR)]).toEqual([30]);
    expect(levels.timeByteArrayL.buffer).toBe(bytes.buffer);
  });

  it("veri yoksa ya da uzunluğu yanlışsa sessizlik (128)", () => {
    for (const bytes of [null, new Uint8Array(0), new Uint8Array(3 * WAVEFORM_WINDOW - 1)]) {
      const levels = audioLevels(bytes);
      expect(levels).toBe(SILENT_LEVELS);
      for (const channel of Object.values(levels)) {
        expect(channel).toHaveLength(WAVEFORM_WINDOW);
        expect([...new Set(channel)]).toEqual([128]);
      }
    }
  });
});

describe("geçiş süresi", () => {
  it("her geçiş en az 3 sn harmanlanır", () => {
    expect(MIN_BLEND_SECONDS).toBeGreaterThanOrEqual(3);
    expect(blendSeconds(true)).toBeGreaterThanOrEqual(MIN_BLEND_SECONDS);
    expect(blendSeconds(false)).toBeGreaterThanOrEqual(MIN_BLEND_SECONDS);
    expect(blendSeconds(false)).toBe(AUTO_BLEND_SECONDS);
  });
});

describe("görsel değiştirme zamanı", () => {
  it("bölüm başında değişir", () => {
    // 20. saniyede yeni bölüm.
    const { switches } = run(SCHEDULE_START, 30, (t) => frame(t < 20 ? 0 : 1));
    expect(switches).toHaveLength(1);
    expect(switches[0]!.reason).toBe("section");
    expect(switches[0]!.t).toBeCloseTo(20, 1);
  });

  it("15 sn dolmadan hiç değişmez (bölümler sık değişse de)", () => {
    // Her 2 saniyede yeni bölüm, ayrıca 5 sn'de bir drop.
    const { switches } = run(SCHEDULE_START, 120, (t) =>
      frame(Math.floor(t / 2), t % 5 < 0.5 ? 1 : 0),
    );
    expect(switches.length).toBeGreaterThan(3);
    let last = 0;
    for (const { t } of switches) {
      expect(t - last).toBeGreaterThanOrEqual(MIN_PRESET_SECONDS - 1e-9);
      last = t;
    }
  });

  it("15 sn dolmadan gelen bölüm başı ertelenir: ilk izinli ölçü başında değişir", () => {
    // 10. saniyede yeni bölüm; ölçü 2 sn (ölçü başları çift saniyelerde).
    const { switches } = run(SCHEDULE_START, 40, (t) => frame(t < 10 ? 0 : 1, 0, (t / 2) % 1));
    expect(switches).toHaveLength(1);
    expect(switches[0]!.reason).toBe("section");
    expect(switches[0]!.t).toBeGreaterThanOrEqual(MIN_PRESET_SECONDS);
    expect(switches[0]!.t).toBeCloseTo(16, 1);
  });

  it("ertelenen geçiş elle değiştirince unutulur", () => {
    let { state } = run(SCHEDULE_START, 10, (t) => frame(t < 5 ? 0 : 1, 0, (t / 2) % 1));
    state = restartSchedule(state);
    const { switches } = run(state, 20, (t) => frame(1, 0, (t / 2) % 1));
    expect(switches).toEqual([]);
  });

  it("drop açılınca değişir", () => {
    const { switches } = run(SCHEDULE_START, 40, (t) => frame(0, t >= 25 && t < 27 ? 1 : 0));
    expect(switches).toEqual([{ t: expect.closeTo(25, 1) as number, reason: "drop" }]);
  });

  it("bölüm uzun sürerse en geç 90 sn sonra ölçü başında değişir", () => {
    // Ölçü 2 sn; bölüm hiç değişmiyor.
    const { switches } = run(SCHEDULE_START, 100, (t) => frame(0, 0, (t / 2) % 1));
    expect(switches).toHaveLength(1);
    expect(switches[0]!.reason).toBe("long");
    expect(switches[0]!.t).toBeGreaterThanOrEqual(MAX_PRESET_SECONDS);
    expect(switches[0]!.t).toBeLessThan(MAX_PRESET_SECONDS + 2.1);
  });

  it("analiz yoksa yalnızca uzun bekleyişten sonra değişir", () => {
    const { switches } = run(SCHEDULE_START, 100, () => frame(0, 0, 0, false));
    expect(switches).toHaveLength(1);
    expect(switches[0]!.t).toBeCloseTo(MAX_PRESET_SECONDS, 1);
  });

  it("duraklatılmışken zaman ilerlemez, değişmez", () => {
    const paused = run(SCHEDULE_START, 200, () => null);
    expect(paused.switches).toEqual([]);
    expect(paused.state.elapsed).toBe(0);
  });

  it("kendiliğinden geçiş kapalıysa hiç değişmez", () => {
    const { switches } = run(SCHEDULE_START, 200, (t) => frame(Math.floor(t / 20)), false);
    expect(switches).toEqual([]);
  });

  it("elle değiştirince bekleme baştan başlar", () => {
    let { state } = run(SCHEDULE_START, 14, () => frame(0));
    state = restartSchedule(state);
    // 14 + 10 = 24. saniyede yeni bölüm: elle değiştirmeden bu yana yalnızca 10 sn geçti.
    const { switches } = run(state, 12, (t) => frame(t < 10 ? 0 : 1));
    expect(switches).toEqual([]);
  });

  it("uzun takılmadan sonra bir karede en fazla 0,25 sn sayılır", () => {
    const step = stepSchedule(SCHEDULE_START, frame(0), 30, true);
    expect(step.state.elapsed).toBeCloseTo(0.25);
    expect(step.reason).toBeNull();
  });
});

describe("önceki / sonraki geçmişi", () => {
  /** Sıradaki rastgele sayılar. */
  const sequence = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length]!;
  };

  it("sonraki yeni bir görsel seçer, önceki geri döner, sonra ileri gider", () => {
    let history: PresetHistory = EMPTY_HISTORY;
    const random = sequence(0, 0.5, 0.99);
    const picks: number[] = [];
    for (let i = 0; i < 3; i++) {
      const step = historyNext(history, 10, random)!;
      history = step.history;
      picks.push(step.index);
    }
    expect(new Set(picks).size).toBe(3);
    const back = historyPrevious(history)!;
    expect(back.index).toBe(picks[1]);
    const back2 = historyPrevious(back.history)!;
    expect(back2.index).toBe(picks[0]);
    expect(historyPrevious(back2.history)).toBeNull();
    const forward = historyNext(back2.history, 10, () => 0)!;
    expect(forward.index).toBe(picks[1]);
  });

  it("yakın zamanda gösterilenleri tekrar seçmez", () => {
    let history: PresetHistory = EMPTY_HISTORY;
    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      const step = historyNext(history, 9, () => 0)!;
      history = step.history;
      seen.push(step.index);
    }
    expect(new Set(seen).size).toBe(9);
  });

  it("tek görselde hep o, boş listede hiç", () => {
    expect(historyNext(EMPTY_HISTORY, 0)).toBeNull();
    let history = EMPTY_HISTORY;
    for (let i = 0; i < 3; i++) {
      const step = historyNext(history, 1)!;
      expect(step.index).toBe(0);
      history = step.history;
    }
  });

  it("kaçınılacak görseller (atlananlar, açılamayanlar) hiç seçilmez", () => {
    for (let r = 0; r < 1; r += 0.1) {
      expect(historyNext(EMPTY_HISTORY, 3, () => r, new Set([1]))!.index).not.toBe(1);
    }
    // Hepsinden kaçınılıyorsa hiçbiri: zorla seçilmez.
    expect(historyNext(EMPTY_HISTORY, 1, () => 0.5, new Set([0]))).toBeNull();
    expect(historyNext(EMPTY_HISTORY, 2, () => 0.5, new Set([0, 1]))).toBeNull();
    // Geçmişte ileride duran görsel sonradan kaçınılacak olduysa oraya gidilmez.
    const history: PresetHistory = { visited: [0, 1], position: 0 };
    expect(historyNext(history, 3, () => 0, new Set([1]))!.index).toBe(2);
  });

  it("liste küçülünce geçmişteki geçersiz sıralar atlanır; geçmiş sınırlıdır", () => {
    const history: PresetHistory = { visited: [7, 8], position: 0 };
    const step = historyNext(history, 5, () => 0)!;
    expect(step.index).toBeLessThan(5);
    let long: PresetHistory = EMPTY_HISTORY;
    for (let i = 0; i < MAX_HISTORY + 20; i++) long = historyNext(long, 1000)!.history;
    expect(long.visited).toHaveLength(MAX_HISTORY);
    expect(long.position).toBe(MAX_HISTORY - 1);
  });

  it("bozuk rastgele sayıda da listedeki bir görsel seçilir", () => {
    for (const r of [NaN, -1, 1, 2, Infinity]) {
      const { index } = historyNext(EMPTY_HISTORY, 4, () => r)!;
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
    }
  });
});

describe("donma işareti ve atlananlar listesi", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("bağlam kaybı yalnızca görsel açılırken ya da açıldıktan sonraki 10 sn içinde suçlanır", () => {
    expect(GPU_HANG_SECONDS).toBe(10);
    expect(blameContextLoss(null, 5000)).toBe(false);
    expect(blameContextLoss(1000, 1000)).toBe(true);
    expect(blameContextLoss(1000, 11_000)).toBe(true);
    expect(blameContextLoss(1000, 11_001)).toBe(false);
    // Saat geri gittiyse (olmamalı) suçlanmaz.
    expect(blameContextLoss(5000, 4000)).toBe(false);
  });

  it("işaret yazılır, okunur, silinir", () => {
    expect(readPending()).toBeNull();
    writePending("C:/Görseller/a.milk");
    expect(readPending()).toBe("C:/Görseller/a.milk");
    writePending(null);
    expect(readPending()).toBeNull();
  });

  it("atlananlar kalıcıdır, tekrarsız ve sınırlıdır", () => {
    expect(loadSkipList()).toEqual([]);
    addSkipped("a");
    addSkipped("b");
    addSkipped("a");
    // Yeniden eklenen sona geçer (en yenisi en son; sınır aşılınca en eskisi düşer).
    expect(loadSkipList()).toEqual(["b", "a"]);
    for (let i = 0; i < MAX_SKIPPED + 10; i++) addSkipped(`x${i}`);
    const list = loadSkipList();
    expect(list).toHaveLength(MAX_SKIPPED);
    expect(list[list.length - 1]).toBe(`x${MAX_SKIPPED + 9}`);
    clearSkipList();
    expect(loadSkipList()).toEqual([]);
  });

  it("bozuk kayıt ya da depoya erişilemezse boş liste; hata fırlatmaz", () => {
    window.localStorage.setItem("lyraska.milkdrop.skipped", "{bozuk");
    expect(loadSkipList()).toEqual([]);
    window.localStorage.setItem("lyraska.milkdrop.skipped", JSON.stringify(["a", 3, null, "b"]));
    expect(loadSkipList()).toEqual(["a", "b"]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("erişim yok");
    });
    expect(loadSkipList()).toEqual([]);
    expect(readPending()).toBeNull();
    expect(() => addSkipped("a")).not.toThrow();
    expect(() => writePending("a")).not.toThrow();
  });
});
