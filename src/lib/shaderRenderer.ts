import { fitCanvas, linkFullscreenProgram, openScene, retrySetup } from "./gl";
import { SHADER_SCENES, sceneLevel, type ShaderSceneId } from "./shaderScene";
import { fragmentSource } from "./shaderSources";
import { SKY_THEMES, mixColors, parseHexColor, skyClocks, type SkyState } from "./sky";

/**
 * Gölgelendirici sahnelerinin (galeri) ortak WebGL2 çizicisi: sahnenin parça gölgelendiricisini
 * derler, her karede gece göğünün durumundan değişkenleri gönderir. Renkler gece göğüyle aynı
 * bölüm temalarından (`--sky-theme-N-low/high`), arka plan `--sky-zenith`'ten okunur.
 */
export interface ShaderRenderer {
  draw(state: SkyState): void;
  dispose(): void;
}

type Rgb = [number, number, number];

/** Tema renkleri okunamazsa: tema 0'ın renkleri. */
const THEME_FALLBACK: { low: Rgb; high: Rgb } = {
  low: [0.27, 0.94, 0.65],
  high: [0.49, 0.36, 1],
};
const BACK_FALLBACK: Rgb = [0.01, 0.016, 0.043];

type UniformName =
  | "uResolution"
  | "uTime"
  | "uTwinkle"
  | "uEnergy"
  | "uLevel"
  | "uTension"
  | "uBloom"
  | "uRipple"
  | "uLow"
  | "uHigh"
  | "uBack";

const UNIFORMS: UniformName[] = [
  "uResolution",
  "uTime",
  "uTwinkle",
  "uEnergy",
  "uLevel",
  "uTension",
  "uBloom",
  "uRipple",
  "uLow",
  "uHigh",
  "uBack",
];

interface Resources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uniforms: Record<UniformName, WebGLUniformLocation | null>;
  themes: { low: Rgb; high: Rgb }[];
}

/**
 * Tuvale sahnenin çizicisini kurar. WebGL2 yoksa ya da gölgelendirici derlenemezse `null` döner
 * (sahne o zaman CSS ile çizilmiş durgun arka planı gösterir); neden hata günlüğüne yazılır.
 */
export function createShaderRenderer(
  canvas: HTMLCanvasElement,
  id: ShaderSceneId,
): ShaderRenderer | null {
  const name = SHADER_SCENES.find((s) => s.id === id)?.name ?? id;
  const opened = openScene(canvas, name, (gl) => setup(gl, canvas, id));
  if (!opened) return null;
  const ctx = opened.gl;
  let resources: Resources | null = opened.resources;
  let lost = false;

  const onLost = (event: Event) => {
    event.preventDefault(); // geri yüklenebilsin
    lost = true;
  };
  const onRestored = () => {
    resources = retrySetup(canvas, name, () => setup(ctx, canvas, id));
    lost = resources === null;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    draw(state) {
      if (lost || !resources) return;
      const { width, height } = fitCanvas(canvas);
      const { program, uniforms, vao, themes } = resources;
      ctx.viewport(0, 0, width, height);
      ctx.useProgram(program);
      ctx.bindVertexArray(vao);
      ctx.uniform2f(uniforms.uResolution, width, height);
      const clocks = skyClocks(state);
      ctx.uniform1f(uniforms.uTime, clocks.flow);
      ctx.uniform1f(uniforms.uTwinkle, clocks.twinkle);
      ctx.uniform3f(uniforms.uEnergy, ...state.energies);
      ctx.uniform1f(uniforms.uLevel, sceneLevel(state));
      ctx.uniform1f(uniforms.uTension, state.tension);
      ctx.uniform1f(uniforms.uBloom, state.bloom);
      ctx.uniform1f(uniforms.uRipple, state.rippleTime);
      const { from, to, mix } = state.palette;
      const a = themes[from % themes.length] ?? THEME_FALLBACK;
      const b = themes[to % themes.length] ?? THEME_FALLBACK;
      ctx.uniform3f(uniforms.uLow, ...mixColors(a.low, b.low, mix));
      ctx.uniform3f(uniforms.uHigh, ...mixColors(a.high, b.high, mix));
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (resources && !ctx.isContextLost()) {
        ctx.deleteProgram(resources.program);
        ctx.deleteVertexArray(resources.vao);
      }
      resources = null;
    },
  };
}

/** Gölgelendiriciyi derler ve renkleri yükler; olmazsa nedeni içeren hata fırlatır. */
function setup(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, id: ShaderSceneId) {
  const program = linkFullscreenProgram(gl, fragmentSource(id));
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("köşe dizisi oluşturulamadı");
  const uniforms = Object.fromEntries(
    UNIFORMS.map((u) => [u, gl.getUniformLocation(program, u)]),
  ) as Record<UniformName, WebGLUniformLocation | null>;

  gl.useProgram(program);
  const style = window.getComputedStyle(canvas);
  gl.uniform3f(
    uniforms.uBack,
    ...parseHexColor(style.getPropertyValue("--sky-zenith"), BACK_FALLBACK),
  );
  const themes = Array.from({ length: SKY_THEMES }, (_, i) => ({
    low: parseHexColor(style.getPropertyValue(`--sky-theme-${i}-low`), THEME_FALLBACK.low),
    high: parseHexColor(style.getPropertyValue(`--sky-theme-${i}-high`), THEME_FALLBACK.high),
  }));
  return { program, vao, uniforms, themes };
}
