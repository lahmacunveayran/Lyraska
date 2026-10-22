import { fitCanvas, linkFullscreenProgram, openScene, retrySetup } from "./gl";
import { foldTime } from "./sceneClock";
import {
  FIXED_PALETTES,
  LOOK_AT_REST,
  stepLook,
  type ColorPair,
  type FixedPalette,
  type LookState,
  type SceneLook,
} from "./sceneLook";
import { SHADER_SCENES, sceneLevel, type ShaderSceneId } from "./shaderScene";
import { fragmentSource } from "./shaderSources";
import { SKY_THEMES, mixColors, parseHexColor, skyClocks, type SkyState } from "./sky";

/**
 * Gölgelendirici sahnelerinin (galeri) ortak WebGL2 çizicisi: sahnenin parça gölgelendiricisini
 * derler, her karede gece göğünün durumundan değişkenleri gönderir. Renkler gece göğüyle aynı
 * bölüm temalarından (`--sky-theme-N-low/high`) ya da seçili sabit paletten
 * (`--scene-palette-<id>-low/high`), arka plan `--sky-zenith`'ten okunur.
 *
 * Görünüm (`SceneLook`): gölgelendiriciye akış saati yerine sahnenin kendi saati gider (hız
 * katıyla ilerler); palet değişince renkler karışarak geçer (`stepLook`). Parlaklık çarpanı
 * (`sceneLevel`) görünümden bağımsızdır.
 */
export interface ShaderRenderer {
  /** `dt`: son çizimden beri geçen süre (saniye; palet geçişi için). */
  draw(state: SkyState, look: SceneLook, dt: number): void;
  dispose(): void;
}

/** Tema ya da palet renkleri okunamazsa: tema 0'ın renkleri. */
const THEME_FALLBACK: ColorPair = {
  low: [0.27, 0.94, 0.65],
  high: [0.49, 0.36, 1],
};
const BACK_FALLBACK: [number, number, number] = [0.01, 0.016, 0.043];

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
  themes: ColorPair[];
  palettes: Record<FixedPalette, ColorPair>;
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
  let lookState: LookState = LOOK_AT_REST;

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
    draw(state, look, dt) {
      if (lost || !resources) return;
      const { width, height } = fitCanvas(canvas);
      const { program, uniforms, vao, themes, palettes } = resources;
      const { from, to, mix } = state.palette;
      const a = themes[from % themes.length] ?? THEME_FALLBACK;
      const b = themes[to % themes.length] ?? THEME_FALLBACK;
      const target: ColorPair =
        look.palette === "theme"
          ? { low: mixColors(a.low, b.low, mix), high: mixColors(a.high, b.high, mix) }
          : palettes[look.palette];
      lookState = stepLook(lookState, state.flowTime, look, target, dt);
      const colors = lookState.fade?.shown ?? target;

      ctx.viewport(0, 0, width, height);
      ctx.useProgram(program);
      ctx.bindVertexArray(vao);
      ctx.uniform2f(uniforms.uResolution, width, height);
      ctx.uniform1f(uniforms.uTime, foldTime(lookState.clock));
      // Kırpışma saati hızla ölçeklenmez (bkz. `sceneLook.ts`).
      ctx.uniform1f(uniforms.uTwinkle, skyClocks(state).twinkle);
      ctx.uniform3f(uniforms.uEnergy, ...state.energies);
      ctx.uniform1f(uniforms.uLevel, sceneLevel(state));
      ctx.uniform1f(uniforms.uTension, state.tension);
      ctx.uniform1f(uniforms.uBloom, state.bloom);
      ctx.uniform1f(uniforms.uRipple, state.rippleTime);
      ctx.uniform3f(uniforms.uLow, ...colors.low);
      ctx.uniform3f(uniforms.uHigh, ...colors.high);
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
  const colorPair = (prefix: string): ColorPair => ({
    low: parseHexColor(style.getPropertyValue(`${prefix}-low`), THEME_FALLBACK.low),
    high: parseHexColor(style.getPropertyValue(`${prefix}-high`), THEME_FALLBACK.high),
  });
  const themes = Array.from({ length: SKY_THEMES }, (_, i) => colorPair(`--sky-theme-${i}`));
  const palettes = Object.fromEntries(
    FIXED_PALETTES.map((p) => [p, colorPair(`--scene-palette-${p}`)]),
  ) as Record<FixedPalette, ColorPair>;
  return { program, vao, uniforms, themes, palettes };
}
