import { describe, expect, it } from "vitest";
import { createGpuTimer } from "./gpuTimer";

/** Sahte WebGL2: sorgu sonuçları elle verilir. */
function fakeGl(withExtension: boolean) {
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const state = {
    disjoint: false,
    results: new Map<object, number>(),
    begun: 0,
    ended: 0,
    deleted: 0,
  };
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => (withExtension ? ext : null),
    createQuery: () => ({}),
    deleteQuery: () => state.deleted++,
    beginQuery: () => state.begun++,
    endQuery: () => state.ended++,
    isContextLost: () => false,
    getParameter: (p: number) => (p === ext.GPU_DISJOINT_EXT ? state.disjoint : null),
    getQueryParameter: (q: object, p: number) =>
      p === 1 ? state.results.has(q) : (state.results.get(q) ?? 0),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, state, queries: gl };
}

describe("ekran kartı süresi", () => {
  it("eklenti yoksa ölçmez", () => {
    expect(createGpuTimer(fakeGl(false).gl)).toBeNull();
  });

  it("gecikmeli gelen sonuçların ortalamasını tutar, disjoint ölçümü atar", () => {
    const made: object[] = [];
    const fake = fakeGl(true);
    const create = fake.queries.createQuery;
    (fake.queries as { createQuery: () => object }).createQuery = () => {
      const q = create();
      made.push(q);
      return q;
    };
    const timer = createGpuTimer(fake.gl)!;
    expect(timer.averageMs).toBeNull();
    timer.begin();
    timer.end();
    // Sonuç henüz yok: ortalama yok.
    timer.begin();
    timer.end();
    expect(timer.averageMs).toBeNull();
    fake.state.results.set(made[0]!, 4e6); // 4 ms
    timer.begin();
    timer.end();
    expect(timer.averageMs).toBeCloseTo(4, 9);
    // Disjoint: atılır, ortalama değişmez.
    fake.state.disjoint = true;
    fake.state.results.set(made[1]!, 40e6);
    timer.begin();
    timer.end();
    expect(timer.averageMs).toBeCloseTo(4, 9);
    expect(fake.state.begun).toBe(fake.state.ended);
    timer.dispose();
    expect(fake.state.deleted).toBe(4);
  });
});
