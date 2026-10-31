import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Lyrics } from "../lib/backend";
import { useLyrics } from "./useLyrics";

/** Sahte çekirdek: şarkının kendi sözleri ve kullanıcının düzenlediği metin. */
const core = vi.hoisted(() => ({
  own: "[00:01.00]Dosyadaki satır",
  user: null as string | null,
  saved: [] as [string, string][],
  onAligned: null as ((path: string) => void) | null,
  reads: 0,
}));

function parse(text: string, source: Lyrics["source"]): Lyrics {
  return {
    source,
    synced: text.startsWith("["),
    lines: [
      {
        start: 1,
        end: 2,
        text: text.replace(/^\[[^\]]*\]/, ""),
        translation: null,
        words: [],
        estimated: true,
        uncertain: false,
      },
    ],
    auto: null,
  };
}

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    getTrackLyrics: async () => {
      core.reads += 1;
      return core.user ? parse(core.user, "user") : parse(core.own, "file");
    },
    onLyricsAligned: async (handler: (path: string) => void) => {
      core.onAligned = handler;
      return () => {
        core.onAligned = null;
      };
    },
    getTrackLyricsText: async () =>
      core.user ? { source: "user", text: core.user } : { source: "file", text: core.own },
    saveTrackLyrics: async (path: string, text: string) => {
      core.saved.push([path, text]);
      core.user = text.trim() ? text : null;
    },
    clearTrackLyrics: async () => {
      core.user = null;
    },
  };
});

describe("useLyrics: düzenlenen sözler", () => {
  it("kaydedince sözler yeniden okunur; kaldırınca şarkının kendi sözlerine dönülür", async () => {
    const { result } = renderHook(() => useLyrics("C:/Müzik/gece.flac"));
    await waitFor(() => expect(result.current.lyrics?.source).toBe("file"));
    expect(await result.current.loadText()).toEqual({ source: "file", text: core.own });

    await act(() => result.current.saveText("[00:03.00]Benim satırım"));
    expect(core.saved).toEqual([["C:/Müzik/gece.flac", "[00:03.00]Benim satırım"]]);
    await waitFor(() => expect(result.current.lyrics?.source).toBe("user"));
    expect(result.current.lyrics?.lines[0]?.text).toBe("Benim satırım");
    expect((await result.current.loadText())?.text).toBe("[00:03.00]Benim satırım");

    await act(() => result.current.clearText());
    await waitFor(() => expect(result.current.lyrics?.source).toBe("file"));
  });

  it("şarkı yokken bir şey yapmaz", async () => {
    core.saved = [];
    const { result } = renderHook(() => useLyrics(null));
    expect(await result.current.loadText()).toBeNull();
    await act(() => result.current.saveText("x"));
    expect(core.saved).toEqual([]);
  });
});

describe("useLyrics: arka planda zamanlanan sözler", () => {
  it("çalan şarkının sözü zamanlanınca yeniden okunur, başka şarkınınki okunmaz", async () => {
    core.user = null;
    core.own = "Zamansız satır";
    const { result, unmount } = renderHook(() => useLyrics("C:/Müzik/zamansiz.flac"));
    await waitFor(() => expect(result.current.lyrics?.synced).toBe(false));
    await waitFor(() => expect(core.onAligned).not.toBeNull());
    const reads = core.reads;

    act(() => core.onAligned?.("C:/Müzik/baska.flac"));
    await new Promise((r) => setTimeout(r, 20));
    expect(core.reads).toBe(reads);

    core.own = "[00:01.00]Zamanlı satır";
    act(() => core.onAligned?.("C:/Müzik/zamansiz.flac"));
    await waitFor(() => expect(result.current.lyrics?.synced).toBe(true));
    expect(core.reads).toBe(reads + 1);

    unmount();
    expect(core.onAligned).toBeNull();
  });
});
