import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Animation } from "../lib/animatedImage";

/** Sahte hareketli resimler: `data:` adresinin sonu resmin adıdır ("A", "B"). */
const fake = vi.hoisted(() => ({
  /** Her resmin kare kapatma kayıtları. */
  closed: new Map<string, number>(),
  /** Kapatıldığı anda gösterilen kaynak (gösterildikten sonra mı kapandı). */
  closedWhileShown: new Map<string, unknown>(),
  shown: null as unknown,
  /** Çözme bekletilirse sürdürme işlevleri. */
  hold: new Map<string, () => void>(),
  holding: new Set<string>(),
  revoked: [] as string[],
}));

function animationOf(name: string): Animation {
  const frame = {
    close: () => {
      fake.closed.set(name, (fake.closed.get(name) ?? 0) + 1);
      fake.closedWhileShown.set(name, fake.shown);
    },
  } as unknown as ImageBitmap;
  return { frames: [frame], durations: [100], repetitions: Infinity, width: 4, height: 4 };
}

vi.mock("../lib/animatedImage", () => ({
  dataUrlBytes: (url: string) => ({ type: "image/gif", bytes: new TextEncoder().encode(url) }),
  isAnimated: () => true,
  firstFrameUrl: async (bytes: Uint8Array) => `blob:${new TextDecoder().decode(bytes).slice(-1)}`,
  decodeAnimation: async (bytes: Uint8Array) => {
    const name = new TextDecoder().decode(bytes).slice(-1);
    if (fake.holding.has(name)) await new Promise<void>((done) => fake.hold.set(name, done));
    return { kind: "animation", animation: animationOf(name) };
  },
}));

import { useBackgroundSource, type BackgroundSource } from "./useBackgroundSource";

const nameOf = (source: BackgroundSource) =>
  source.kind === "animated" && source.still ? source.still.slice(-1) : null;

afterEach(() => {
  fake.closed.clear();
  fake.closedWhileShown.clear();
  fake.hold.clear();
  fake.holding.clear();
  fake.revoked.length = 0;
  fake.shown = null;
  vi.restoreAllMocks();
});

function track() {
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
    fake.revoked.push(url);
  });
  return renderHook(
    ({ image }: { image: string }) => {
      const source = useBackgroundSource(image, false);
      fake.shown = nameOf(source);
      return source;
    },
    { initialProps: { image: "data:image/gif;base64,A" } },
  );
}

describe("hareketli arka planın belleği", () => {
  it("resim değişince eskinin kareleri tam bir kez ve yenisi gösterildikten sonra kapanır", async () => {
    const { result, rerender } = track();
    await waitFor(() => expect(nameOf(result.current)).toBe("A"));
    rerender({ image: "data:image/gif;base64,B" });
    await waitFor(() => expect(nameOf(result.current)).toBe("B"));
    await waitFor(() => expect(fake.closed.get("A")).toBe(1));
    expect(fake.closedWhileShown.get("A")).toBe("B");
    expect(fake.revoked).toContain("blob:A");
    expect(fake.closed.get("B")).toBeUndefined();
  });

  it("sahneden çıkınca kareler kapanır, ilk karenin adresi bırakılır", async () => {
    const { result, unmount } = track();
    await waitFor(() => expect(nameOf(result.current)).toBe("A"));
    unmount();
    expect(fake.closed.get("A")).toBe(1);
    expect(fake.revoked).toEqual(["blob:A"]);
  });

  it("çözme sürerken resim değişirse eski çözmenin kareleri kapanır, hiç gösterilmez", async () => {
    fake.holding.add("A");
    const { result, rerender } = track();
    await waitFor(() => expect(fake.hold.has("A")).toBe(true));
    rerender({ image: "data:image/gif;base64,B" });
    await waitFor(() => expect(nameOf(result.current)).toBe("B"));
    await act(async () => fake.hold.get("A")!());
    await waitFor(() => expect(fake.closed.get("A")).toBe(1));
    expect(fake.closedWhileShown.get("A")).toBe("B");
    expect(nameOf(result.current)).toBe("B");
    expect(fake.revoked).toContain("blob:A");
  });
});
