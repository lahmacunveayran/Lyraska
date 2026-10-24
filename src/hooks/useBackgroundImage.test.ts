import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBackgroundImage } from "./useBackgroundImage";

const backend = vi.hoisted(() => ({
  current: "data:image/png;base64,ESKI" as string | null,
  release: null as (() => void) | null,
}));

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    // Yeni resim geç gelir: arada eski resim görünmeli.
    getBackgroundImage: () =>
      new Promise<string | null>((resolve) => {
        const value = backend.current;
        if (backend.release === null) resolve(value);
        else backend.release = () => resolve(value);
      }),
    pickImage: async () => "C:/Resimler/yeni.png",
    setBackgroundImage: async () => {
      backend.current = "data:image/png;base64,YENI";
      backend.release = () => {};
    },
    clearBackgroundImage: async () => {},
  };
});

describe("arka plan resmi", () => {
  it("yeni resim yüklenirken eski resim yerinde kalır (araya karanlık girmez)", async () => {
    const { result } = renderHook(() => useBackgroundImage(true));
    await waitFor(() => expect(result.current.url).toBe("data:image/png;base64,ESKI"));
    await act(async () => {
      await result.current.choose();
    });
    // Yanıt henüz gelmedi: eski resim görünür, `undefined` (yükleniyor) değil.
    expect(result.current.url).toBe("data:image/png;base64,ESKI");
    await act(async () => backend.release?.());
    await waitFor(() => expect(result.current.url).toBe("data:image/png;base64,YENI"));
  });

  it("sahneden çıkınca resim bırakılır", async () => {
    backend.release = null;
    const { result, rerender } = renderHook(({ on }) => useBackgroundImage(on), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current.url).toBeTruthy());
    rerender({ on: false });
    expect(result.current.url).toBeUndefined();
  });
});
