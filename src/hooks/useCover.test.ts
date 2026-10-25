import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  chosen: new Map<string, string>(),
  albums: new Map<string, string>(),
  embedded: new Map<string, string>(),
}));
vi.mock("../lib/backend", () => ({
  getSongCover: async (path: string) => backend.chosen.get(path) ?? null,
  getAlbumCover: async (album: string, artist: string | null) =>
    backend.albums.get(`${artist}/${album}`) ?? null,
  getTrackCover: async (path: string) => backend.embedded.get(path) ?? null,
}));

import { clearCoverCache, invalidateAlbumArt, invalidateCover, useCover } from "./useCover";

afterEach(() => {
  clearCoverCache();
  backend.chosen.clear();
  backend.albums.clear();
  backend.embedded.clear();
});

describe("useCover", () => {
  it("şarkının kendi kapağı görünür; kullanıcının seçtiği onun yerine geçer, kaldırınca geri gelir", async () => {
    backend.embedded.set("/m/a.flac", "data:icindeki");
    const { result } = renderHook(() => useCover("/m/a.flac"));
    await waitFor(() => expect(result.current).toBe("data:icindeki"));

    backend.chosen.set("/m/a.flac", "data:secilen");
    act(() => invalidateCover("/m/a.flac"));
    await waitFor(() => expect(result.current).toBe("data:secilen"));

    backend.chosen.delete("/m/a.flac");
    act(() => invalidateCover("/m/a.flac"));
    await waitFor(() => expect(result.current).toBe("data:icindeki"));
  });

  it("kapağı olmayan şarkıya seçilen kapak eklenir ve kaldırılabilir", async () => {
    const { result } = renderHook(() => useCover("/m/b.flac"));
    await waitFor(() => expect(result.current).toBeNull());
    backend.chosen.set("/m/b.flac", "data:yeni");
    act(() => invalidateCover("/m/b.flac"));
    await waitFor(() => expect(result.current).toBe("data:yeni"));
    backend.chosen.delete("/m/b.flac");
    act(() => invalidateCover("/m/b.flac"));
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("albüme seçilen kapak şarkının içindekinin yerine geçer; şarkıya seçilen ikisinin de", async () => {
    const kum = { album: "Kum", artist: "Ada" };
    backend.embedded.set("/m/c.flac", "data:icindeki");
    backend.albums.set("Ada/Kum", "data:albume-secilen");
    const { result } = renderHook(() => useCover("/m/c.flac", kum));
    await waitFor(() => expect(result.current).toBe("data:albume-secilen"));

    backend.chosen.set("/m/c.flac", "data:sarkiya-secilen");
    act(() => invalidateCover("/m/c.flac"));
    await waitFor(() => expect(result.current).toBe("data:sarkiya-secilen"));
    backend.chosen.delete("/m/c.flac");
    act(() => invalidateCover("/m/c.flac"));
    await waitFor(() => expect(result.current).toBe("data:albume-secilen"));

    // Albümün kapağı kaldırılınca şarkının içindeki görünür; başka albüm etkilenmez.
    backend.albums.delete("Ada/Kum");
    act(() => invalidateAlbumArt("Kum", "Ada"));
    await waitFor(() => expect(result.current).toBe("data:icindeki"));
  });

  it("albüm etiketi yoksa albüme bakılmaz", async () => {
    backend.embedded.set("/m/d.flac", "data:icindeki");
    const { result } = renderHook(() => useCover("/m/d.flac", null));
    await waitFor(() => expect(result.current).toBe("data:icindeki"));
  });
});
