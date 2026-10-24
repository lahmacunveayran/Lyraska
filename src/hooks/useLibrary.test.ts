import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryStatus, LibraryTrack } from "../lib/backend";
import { useLibrary } from "./useLibrary";

const backend = vi.hoisted(() => ({
  tracks: [] as LibraryTrack[],
  /** Çekirdeğin "kütüphane değişti" olayını dinleyen işlev. */
  changed: null as (() => void) | null,
  unlistened: false,
}));

function song(id: number, title: string): LibraryTrack {
  return {
    id,
    path: `D:/DLP/${title}.mp3`,
    title,
    artist: null,
    album: null,
    albumArtist: null,
    trackNumber: null,
    durationSecs: 200,
    codec: "mp3",
    bpm: null,
    analyzed: true,
    key: null,
  };
}

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  const status = (): LibraryStatus => ({
    ...actual.EMPTY_LIBRARY,
    folders: [{ id: 1, path: "D:/DLP", trackCount: backend.tracks.length, single: false }],
    trackCount: backend.tracks.length,
    analyzed: backend.tracks.length,
  });
  return {
    ...actual,
    isDesktop: () => true,
    getLibraryStatus: () => Promise.resolve(status()),
    searchLibrary: () => Promise.resolve([...backend.tracks]),
    onLibraryChanged: (handler: () => void) => {
      backend.changed = handler;
      return Promise.resolve(() => {
        backend.unlistened = true;
      });
    },
  };
});

describe("kütüphanenin kendiliğinden tazelenmesi", () => {
  it("izlenen klasöre şarkı inince liste kullanıcı bir şey yapmadan tazelenir", async () => {
    backend.tracks = [song(1, "eski")];
    const { result, unmount } = renderHook(() => useLibrary());
    await waitFor(() => expect(result.current.tracks.map((t) => t.title)).toEqual(["eski"]));
    // Tarama sürmüyor, analiz bitmiş: arayüz durumu sormuyor; yalnızca olay haber verir.
    expect(result.current.status.scan.scanning).toBe(false);
    await waitFor(() => expect(backend.changed).not.toBeNull());

    backend.tracks = [song(1, "eski"), song(2, "yeni indirilen")];
    act(() => backend.changed?.());
    await waitFor(() => expect(result.current.status.trackCount).toBe(2));
    await waitFor(() =>
      expect(result.current.tracks.map((t) => t.title)).toEqual(["eski", "yeni indirilen"]),
    );

    // Şarkı sayısı aynı kalsa da (etiket düzenlendi) liste tazelenir.
    backend.tracks = [song(1, "eski"), song(2, "Yeni Adı")];
    act(() => backend.changed?.());
    await waitFor(() =>
      expect(result.current.tracks.map((t) => t.title)).toEqual(["eski", "Yeni Adı"]),
    );

    unmount();
    expect(backend.unlistened).toBe(true);
  });
});
