import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  get: (): Promise<boolean> => Promise.resolve(false),
}));
vi.mock("../lib/backend", () => ({
  getVisualSafe: () => backend.get(),
  setVisualSafe: async (on: boolean) => on,
  errorMessage: (e: unknown) => String(e),
}));

import { useVisualSafe } from "./useVisualSafe";

describe("useVisualSafe", () => {
  it("ayar okunana dek yüklenmemiş sayılır; okununca yüklenmiş ve kayıtlı değerde", async () => {
    let resolve: (on: boolean) => void = () => {};
    backend.get = () => new Promise((r) => (resolve = r));
    const { result } = renderHook(() => useVisualSafe());
    expect(result.current.loaded).toBe(false);
    resolve(true);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.safe).toBe(true);
  });

  it("ayar okunamazsa da yüklenmiş sayılır (uyarı sonsuza dek gizli kalmasın)", async () => {
    backend.get = () => Promise.reject(new Error("okunamadı"));
    const { result } = renderHook(() => useVisualSafe());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.safe).toBe(false);
    expect(result.current.error).toContain("okunamadı");
  });
});
