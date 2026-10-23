import { describe, expect, it, vi } from "vitest";
import { brokenShaders, resetShaders } from "./milkdropShaders";

/** Butterchurn'ün iç yapısının (`renderer.warpShader`/`compShader`) sahtesi. */
function fakeVisualizer(linked: { warp: boolean; comp: boolean }, lost = false) {
  const programs = { warp: {} as WebGLProgram, comp: {} as WebGLProgram };
  const gl = {
    LINK_STATUS: 0x8b82,
    isContextLost: () => lost,
    getProgramParameter: (program: WebGLProgram) =>
      program === programs.warp ? linked.warp : linked.comp,
  } as unknown as WebGL2RenderingContext;
  const shader = (stage: "warp" | "comp") => ({
    gl,
    shaderProgram: programs[stage],
    updateShader: vi.fn(),
  });
  return { renderer: { warpShader: shader("warp"), compShader: shader("comp") } };
}

describe("MilkDrop gölgelendiricilerinin derlenmesi", () => {
  it("bağlanmış programlar sağlam sayılır", () => {
    expect(brokenShaders(fakeVisualizer({ warp: true, comp: true }))).toEqual([]);
  });

  it("bağlanamayan program bozuk sayılır ve varsayılanla yeniden kurulur", () => {
    const visualizer = fakeVisualizer({ warp: true, comp: false });
    const broken = brokenShaders(visualizer);
    expect(broken).toEqual(["comp"]);
    resetShaders(visualizer, ["comp"]);
    expect(visualizer.renderer.compShader.updateShader).toHaveBeenCalledWith("");
    expect(visualizer.renderer.warpShader.updateShader).not.toHaveBeenCalled();
  });

  it("program hiç yoksa bozuk", () => {
    const visualizer = fakeVisualizer({ warp: true, comp: true });
    (visualizer.renderer.warpShader as { shaderProgram: WebGLProgram | null }).shaderProgram = null;
    expect(brokenShaders(visualizer)).toEqual(["warp"]);
  });

  it("yapı tanınmazsa ya da bağlam kayıpsa dokunulmaz", () => {
    expect(brokenShaders(null)).toBe("unknown");
    expect(brokenShaders({})).toBe("unknown");
    expect(brokenShaders({ renderer: { warpShader: {} } })).toBe("unknown");
    expect(brokenShaders(fakeVisualizer({ warp: false, comp: false }, true))).toBe("unknown");
    expect(() => resetShaders({}, ["warp", "comp"])).not.toThrow();
  });
});
