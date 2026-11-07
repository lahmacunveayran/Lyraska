import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SongMap } from "../lib/backend";

const backend = vi.hoisted(() => ({ calls: 0, map: null as SongMap | null }));
vi.mock("../lib/backend", () => ({
  getSongMap: async () => {
    backend.calls += 1;
    return backend.map;
  },
}));

import { useSongMap } from "./useSongMap";

function map(meter: number): SongMap {
  return {
    meter,
    downbeatPhase: 0,
    grouping: [],
    meterConfidence: 1,
    downbeats: [],
    sections: [],
    drops: [],
    dropConfidence: [],
    energy: [],
  };
}

afterEach(() => {
  backend.calls = 0;
  backend.map = null;
});

describe("useSongMap", () => {
  it("ritim yenilenince (sürüm artınca) harita yeniden istenir", async () => {
    backend.map = map(4);
    const { result, rerender } = renderHook(({ revision }) => useSongMap("/m/a.flac", revision), {
      initialProps: { revision: 0 },
    });
    await waitFor(() => expect(result.current?.meter).toBe(4));
    expect(backend.calls).toBe(1);

    // Ritim modeli ölçüyü 3 buldu: çekirdeğin sayacı arttı.
    backend.map = map(3);
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current?.meter).toBe(3));
    expect(backend.calls).toBe(2);
  });
});
