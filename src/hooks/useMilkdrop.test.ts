import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MilkdropFolder } from "../lib/backend";

const fake = vi.hoisted(() => ({
  folder: null as MilkdropFolder | null,
  picked: null as string | null,
  chosen: null as MilkdropFolder | null,
}));

vi.mock("../lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/backend")>();
  return {
    ...actual,
    getMilkdropFolder: async () => fake.folder ?? actual.NO_MILKDROP_FOLDER,
    pickMilkdropFolder: async () => fake.picked,
    setMilkdropFolder: async () => fake.chosen ?? actual.NO_MILKDROP_FOLDER,
  };
});

import { useMilkdrop } from "./useMilkdrop";

const PENDING_KEY = "lyraska.milkdrop.pending";
const SKIP_KEY = "lyraska.milkdrop.skipped";

const folder = (name: string, files: string[]): MilkdropFolder => ({
  folder: `C:/${name}`,
  presets: files.map((f) => ({ name: f, path: `C:/${name}/${f}.milk` })),
  truncated: false,
  error: null,
});

beforeEach(() => {
  fake.folder = null;
  fake.picked = null;
  fake.chosen = null;
  window.localStorage.clear();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMilkdrop", () => {
  it("çalarken klasör seçilince çalan görsel çökmüş sanılıp atlanmaz", async () => {
    fake.folder = folder("A", ["ayna", "bulut"]);
    const { result } = renderHook(() => useMilkdrop(true));
    await waitFor(() => expect(result.current.request).not.toBeNull());
    const playing = result.current.request!;
    // Sahne görseli açtı: "şu an açık" işareti çaldığı sürece durur.
    window.localStorage.setItem(PENDING_KEY, playing.entry.path);
    act(() => result.current.loaded(playing.serial, playing.entry.name, false));

    fake.picked = "C:/B";
    fake.chosen = folder("B", ["çiy"]);
    await act(() => result.current.chooseFolder());
    expect(window.localStorage.getItem(SKIP_KEY)).toBeNull();
    expect(result.current.notice).toBeNull();
    expect(result.current.request?.entry.path).toBe("C:/B/çiy.milk");
  });

  it("önceki açılışın çökme işareti ilk liste klasör seçiminden gelse de okunur", async () => {
    window.localStorage.setItem(PENDING_KEY, "C:/B/çiy.milk");
    const { result } = renderHook(() => useMilkdrop(false));
    fake.picked = "C:/B";
    fake.chosen = folder("B", ["çiy", "duman"]);
    await act(() => result.current.chooseFolder());
    expect(JSON.parse(window.localStorage.getItem(SKIP_KEY)!)).toEqual(["C:/B/çiy.milk"]);
    expect(result.current.notice).toBe(
      '"çiy" önceki açılışta çalarken program kapandı; atlananlara eklendi.',
    );
    expect(result.current.request?.entry.path).toBe("C:/B/duman.milk");
  });

  it("sonraki görsel açılırken çizimde hata veren görsel bu oturumda yeniden seçilmez", async () => {
    fake.folder = folder("A", ["ayna", "bulut"]);
    const { result } = renderHook(() => useMilkdrop(true));
    await waitFor(() => expect(result.current.request).not.toBeNull());
    const first = result.current.request!;
    expect(first.entry.path).toBe("C:/A/ayna.milk");
    act(() => result.current.loaded(first.serial, first.entry.name, false));

    act(() => result.current.next());
    const second = result.current.request!;
    // İkincisi açılırken hâlâ çizilen ilk görsel hata verir: istek eskimiş olsa da görsel kötüdür.
    act(() => result.current.failed(first.serial, "çizilirken hata verdi"));
    act(() => result.current.loaded(second.serial, second.entry.name, false));

    act(() => result.current.next());
    expect(result.current.request?.entry.path).not.toBe(first.entry.path);
    // Kalıcı atlananlara girmez (yalnızca bu oturum).
    expect(window.localStorage.getItem(SKIP_KEY)).toBeNull();
  });
});
