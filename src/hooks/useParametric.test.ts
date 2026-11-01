import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParametricState } from "../lib/backend";
import { DEFAULT_PARAMETRIC, previewParametricState } from "../lib/parametric";

const backend = vi.hoisted(() => ({
  get: vi.fn<() => Promise<ParametricState | null>>(),
}));
vi.mock("../lib/backend", () => ({
  getParametric: () => backend.get(),
  setParametric: async () => null,
  setParametricCompare: async () => null,
  importParametric: async () => null,
  exportParametric: async () => undefined,
  pickParametricFile: async () => null,
  errorMessage: (e: unknown) => String(e),
}));

import { useParametric } from "./useParametric";

/** Çekirdeğin belli bir hızda hesapladığı durum; yükseltme hızı ayırt etmeye yeter. */
const at = (boostDb: number): ParametricState => ({
  ...previewParametricState(DEFAULT_PARAMETRIC, false),
  boostDb,
});

describe("useParametric", () => {
  it("aygıtın hızı değişince eğriyi çekirdekten yeniden alır (eğri o hızda hesaplanır)", async () => {
    backend.get.mockReset();
    backend.get.mockResolvedValueOnce(at(1)).mockResolvedValueOnce(at(2));
    const { result, rerender } = renderHook(({ rate }) => useParametric(rate), {
      initialProps: { rate: undefined as number | undefined },
    });
    await waitFor(() => expect(result.current.state.boostDb).toBe(1));
    rerender({ rate: 44_100 });
    await waitFor(() => expect(result.current.state.boostDb).toBe(2));
    expect(backend.get).toHaveBeenCalledTimes(2);
  });

  it("hız aynı kaldıkça yeniden sormaz", async () => {
    backend.get.mockReset();
    backend.get.mockResolvedValue(at(1));
    const { result, rerender } = renderHook(({ rate }) => useParametric(rate), {
      initialProps: { rate: 48_000 as number | undefined },
    });
    await waitFor(() => expect(result.current.state.boostDb).toBe(1));
    const calls = backend.get.mock.calls.length;
    rerender({ rate: 48_000 });
    rerender({ rate: 48_000 });
    expect(backend.get).toHaveBeenCalledTimes(calls);
  });
});
