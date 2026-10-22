import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));
vi.mock("@tauri-apps/api/core", () => core);

import { getVisualWaveform, WAVEFORM_BYTES } from "./backend";

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
    expect(core.invoke).toHaveBeenCalledWith("visual_waveform");
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
