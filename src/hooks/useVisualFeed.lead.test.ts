import { renderHook } from "@testing-library/react";
import type { VisualFrame } from "../lib/backend";

const backend = vi.hoisted(() => ({ leads: [] as number[] }));

// Vuruş saniyede bir (60 BPM): fazın ilerlemesi doğrudan ileri alınan süredir (saniye).
const frame = {
  positionSecs: 12,
  bands: Array.from({ length: 32 }, () => 0.5),
  rmsDb: [-20, -20],
  peakDb: [-10, -10],
  vuReferenceDb: -16,
  beat: { bpm: 60, index: 0, phase: 0, barBeat: null, meter: null },
  energy: null,
  section: null,
  director: null,
} as unknown as VisualFrame;

vi.mock("../lib/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/backend")>()),
  getVisualFrame: (displayLeadSecs: number) => {
    backend.leads.push(displayLeadSecs);
    return Promise.resolve(frame);
  },
}));

const { displayLeadSecs, useVisualFeed } = await import("./useVisualFeed");

/** Elle sürülen ekran kareleri: damga ve `performance.now()` aynı (geri çağrı vaktinde koşar). */
let callbacks: FrameRequestCallback[] = [];
let clock = 0;
beforeEach(() => {
  callbacks = [];
  backend.leads = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => callbacks.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {
    callbacks = [];
  });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function drive(stamp: number) {
  clock = stamp;
  const due = callbacks;
  callbacks = [];
  for (const cb of due) cb(stamp);
  // İsteğin yanıtı bir sonraki kareden önce işlenir.
  await Promise.resolve();
  await Promise.resolve();
}

describe("görsellerin ekran gecikmesi (ölçülen kare süresi)", () => {
  it("144 Hz ekranda istek bir kare (~6,9 ms) ileriden okur; vuruş karenin ekrana çıktığı ana göre", async () => {
    const ticks: (VisualFrame | null)[] = [];
    const { unmount } = renderHook(() => useVisualFeed(true, (f) => ticks.push(f)));
    const period = 1000 / 144;
    for (let k = 0; k < 40; k++) await drive(1000 + k * period);
    expect(displayLeadSecs()).toBeCloseTo(1 / 144, 9);
    // İlk istekler kare süresi bilinmeden (60 Hz varsayımı); sonrakiler ölçülenle.
    expect(backend.leads.at(-1)).toBeCloseTo(1 / 144, 9);
    expect(backend.leads.every((l) => l > 0 && l <= 1 / 60 + 1e-12)).toBe(true);
    // Yanıt k. karede geldi (veri o karenin damgasında hesaplandı, bir kare ileriden okundu); k+1. kare
    // bir kare sonra ekranda: veri bir kare ileri alınır (sabit 1/60 ile 144 Hz'de ~10 ms erkendi).
    // İstekler en çok saniyede 60 (144 Hz'de iki üç karede bir): yeni istek giden kareyi bul.
    let k = 40;
    for (let sent = backend.leads.length; backend.leads.length === sent; k++)
      await drive(1000 + k * period);
    await drive(1000 + k * period);
    const phase = ticks.at(-1)!.beat!.phase;
    expect(phase).toBeCloseTo(period / 1000, 9);
    unmount();
  });

  it("kare yavaşlayınca (30 kare/sn) ileriden okuma da uzar", async () => {
    const { unmount } = renderHook(() => useVisualFeed(true, () => undefined));
    for (let k = 0; k < 30; k++) await drive(5000 + k * (1000 / 30));
    expect(displayLeadSecs()).toBeCloseTo(1 / 30, 9);
    expect(backend.leads.at(-1)).toBeCloseTo(1 / 30, 9);
    unmount();
  });
});
