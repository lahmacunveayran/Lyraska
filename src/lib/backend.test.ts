import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));
vi.mock("@tauri-apps/api/core", () => core);

import { DISPLAY_LEAD_SECS, getVisualSpectrum, getVisualWaveform, WAVEFORM_BYTES } from "./backend";

describe("dalga biçimi köprüsü", () => {
  beforeEach(() => {
    core.invoke.mockReset();
    core.isTauri.mockReturnValue(true);
  });

  it("ham baytları 3 × 1024'lük diziye çevirir", async () => {
    const buffer = new Uint8Array(WAVEFORM_BYTES).fill(128);
    buffer[0] = 255;
    core.invoke.mockResolvedValue(buffer.buffer);
    const waveform = await getVisualWaveform();
    // İstek ekran gecikmesini taşır: verilmezse 60 Hz, verilirse ölçülen kare süresi.
    expect(core.invoke).toHaveBeenCalledWith("visual_waveform", {
      displayLeadSecs: DISPLAY_LEAD_SECS,
    });
    await getVisualWaveform(1 / 144);
    expect(core.invoke).toHaveBeenLastCalledWith("visual_waveform", { displayLeadSecs: 1 / 144 });
    expect(waveform).toBeInstanceOf(Uint8Array);
    expect(waveform?.length).toBe(WAVEFORM_BYTES);
    expect(waveform?.[0]).toBe(255);
    expect(waveform?.[1]).toBe(128);
  });

  it("sayı dizisi gelirse de çevirir", async () => {
    core.invoke.mockResolvedValue(Array<number>(WAVEFORM_BYTES).fill(128));
    expect((await getVisualWaveform())?.every((b) => b === 128)).toBe(true);
  });

  it("boş yanıt (çalan şarkı yok) ve tarayıcı önizlemesi null verir", async () => {
    core.invoke.mockResolvedValue(new ArrayBuffer(0));
    expect(await getVisualWaveform()).toBeNull();
    core.isTauri.mockReturnValue(false);
    expect(await getVisualWaveform()).toBeNull();
  });
});

describe("spektrum çubukları köprüsü", () => {
  beforeEach(() => {
    core.invoke.mockReset();
    core.isTauri.mockReturnValue(true);
  });

  it("beklenen sayıda seviyeyi 0..1'e kırparak verir", async () => {
    core.invoke.mockResolvedValue([0, 0.5, 1.2]);
    expect(await getVisualSpectrum(3)).toEqual([0, 0.5, 1]);
    expect(core.invoke).toHaveBeenCalledWith("visual_spectrum", {
      displayLeadSecs: DISPLAY_LEAD_SECS,
    });
    await getVisualSpectrum(3, 1 / 30);
    expect(core.invoke).toHaveBeenLastCalledWith("visual_spectrum", { displayLeadSecs: 1 / 30 });
  });

  it("boş yanıt, yanlış uzunluk, sayı olmayan değer ve tarayıcı önizlemesi null verir", async () => {
    core.invoke.mockResolvedValue([]);
    expect(await getVisualSpectrum(3)).toBeNull();
    core.invoke.mockResolvedValue([0.1, 0.2]);
    expect(await getVisualSpectrum(3)).toBeNull();
    core.invoke.mockResolvedValue({ state: "idle" });
    expect(await getVisualSpectrum(3)).toBeNull();
    core.invoke.mockResolvedValue([0.1, null, 0.2]);
    expect(await getVisualSpectrum(3)).toBeNull();
    core.isTauri.mockReturnValue(false);
    expect(await getVisualSpectrum(3)).toBeNull();
  });
});
