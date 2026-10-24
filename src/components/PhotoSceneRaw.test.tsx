import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisualFrame } from "../lib/backend";
import type { Animation } from "../lib/animatedImage";

/**
 * "Kendi resmin"in hareketli arka planı, parlaklık freni kurulamadığında: varsayılan modda kareler
 * frensiz bir 2D tuvale çizilir, güvenli modda ilk kare sabit kalır.
 */
const fake = vi.hoisted(() => ({
  source: null as unknown,
  tick: null as ((frame: VisualFrame | null, dt: number) => void) | null,
  drawn: [] as unknown[],
}));

vi.mock("../hooks/useBackgroundSource", () => ({
  useBackgroundSource: () => fake.source,
}));

vi.mock("../hooks/useVisualFeed", () => ({
  useVisualFeed: (_playing: boolean, onTick: (frame: VisualFrame | null, dt: number) => void) => {
    fake.tick = onTick;
  },
}));

vi.mock("../lib/gl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/gl")>();
  return {
    ...actual,
    // Ekran kartı freni kuramıyor.
    getWebGl2: () => null,
    fitCanvas: (canvas: HTMLCanvasElement) => {
      canvas.width = 320;
      canvas.height = 180;
      return { width: 320, height: 180, pixel: 1 };
    },
  };
});

vi.mock("../lib/photoMeasure", () => ({
  measureStill: () => new Promise(() => undefined),
  measureFrames: () => ({
    add: () => undefined,
    cancel: () => undefined,
    finish: () => new Promise(() => undefined),
  }),
}));

import { PhotoScene } from "./PhotoScene";

const FRAMES = [{ id: "kare 1" }, { id: "kare 2" }] as unknown as ImageBitmap[];
const ANIMATION: Animation = {
  frames: FRAMES,
  durations: [100, 100],
  repetitions: Infinity,
  width: 64,
  height: 36,
};

/** 2D bağlam: çizilen kareleri kaydeder, diğer her şey boş. */
function fakeContext(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_target, key) =>
        key === "drawImage" ? (image: unknown) => fake.drawn.push(image) : () => undefined,
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
}

beforeEach(() => {
  fake.source = { kind: "animated", animation: ANIMATION, still: "blob:ilk-kare" };
  fake.tick = null;
  fake.drawn = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) =>
    kind === "2d" ? fakeContext() : null) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Kendi resmin: fren kurulamazsa", () => {
  it("varsayılan modda hareketli resim frensiz oynar", () => {
    const { container } = render(<PhotoScene playing image="data:image/gif;base64,AA==" />);
    const raw = container.querySelector<HTMLCanvasElement>(".photo-scene__motion--raw");
    expect(raw).not.toBeNull();
    expect(raw!.dataset.guard).toBe("off");
    expect(container.querySelector("img.photo-scene__image")).toBeNull();
    act(() => fake.tick?.(null, 1 / 60));
    expect(fake.drawn).toEqual([FRAMES[0]]);
    // Çalarken ikinci kareye geçer.
    act(() => fake.tick?.(null, 0.12));
    expect(fake.drawn).toEqual([FRAMES[0], FRAMES[1]]);
  });

  it("güvenli modda ilk kare sabit; mod değişince geçiş yapılır", () => {
    const { container, rerender } = render(
      <PhotoScene playing safe image="data:image/gif;base64,AA==" />,
    );
    expect(container.querySelector(".photo-scene__motion")).toBeNull();
    expect(container.querySelector("img.photo-scene__image")).toHaveAttribute(
      "src",
      "blob:ilk-kare",
    );
    act(() => fake.tick?.(null, 0.12));
    expect(fake.drawn).toEqual([]);
    // Güvenli mod kapanınca frensiz oynar, açılınca yine ilk kare sabit.
    rerender(<PhotoScene playing image="data:image/gif;base64,AA==" />);
    expect(container.querySelector(".photo-scene__motion--raw")).not.toBeNull();
    act(() => fake.tick?.(null, 1 / 60));
    expect(fake.drawn).toHaveLength(1);
    rerender(<PhotoScene playing safe image="data:image/gif;base64,AA==" />);
    expect(container.querySelector(".photo-scene__motion")).toBeNull();
    expect(container.querySelector("img.photo-scene__image")).toBeInTheDocument();
  });
});
