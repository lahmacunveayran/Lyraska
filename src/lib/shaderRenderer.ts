import { fitCanvas, linkFullscreenProgram, openScene, retrySetup } from "./gl";
import { createPostChain, type PostChain } from "./postChain";
import {
  RESOLUTION_AT_START,
  bloomParams,
  smoothWarmth,
  stepResolution,
  warmthGains,
  type ResolutionState,
} from "./postProcess";
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
 *
 * Son işlem zinciri (`postChain.ts`, hesapları `postProcess.ts`): ekran kartı kayan noktalı dokuya
 * çizebiliyorsa sahne önce dokuya, kare süresine göre tuvalin %60–100'ü boyunda çizilir
 * (dinamik çözünürlük); bloom, ton eşleme, renk sıcaklığı, titretme ve gren tam boyda eklenir.
 * Çizemiyorsa (ya da `lyraska.scenePost` = `off` ise) eski doğrudan çizim kullanılır. Tuvalde
 * `data-post` hangisinin kullanıldığını, `data-resolution` sahnenin ölçeğini gösterir.
 */
export interface ShaderRenderer {
  /**
   * `dt`: son çizimden beri geçen süre (saniye; palet geçişi için). `post`: son işlemin müzikten
   * ve ayarlardan aldığı değerler (yoksa nötr).
   */
  draw(state: SkyState, look: SceneLook, dt: number, post?: PostInput): void;
  dispose(): void;
}

/** Son işlem zincirinin her karede aldığı değerler. */
export interface PostInput {
  /** Yönetmen'in renk sıcaklığı (0 soğuk … 1 sıcak; 0,5 nötr). */
  warmth: number;
  /** Epilepsi güvenli modu: bloom payı yarıya iner. */
  safe: boolean;
  /** "Animasyonları azalt": gren ve titretme durgun. */
  reducedMotion: boolean;
  /** Müzik çalıyor mu: dinamik çözünürlük yalnızca çalarken ölçer, gren yalnızca çalarken akar. */
  active: boolean;
}

const NEUTRAL_POST: PostInput = { warmth: 0.5, safe: false, reducedMotion: false, active: false };

export interface ShaderRendererOptions {
  /** Son işlem zinciri kullanılsın mı (varsayılan: evet; ekran kartı destekliyorsa). */
  post?: boolean;
}

/** Son işlemi kapatan yerel ayar (karşılaştırma ve sorun giderme için): `"off"`. */
export const POST_STORAGE_KEY = "lyraska.scenePost";

function postWanted(option: boolean | undefined): boolean {
  if (option === false) return false;
  try {
    return window.localStorage.getItem(POST_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Altın oran ve R2 dizisinin katsayıları: titretmenin ve grenin kareden kareye kayması. */
const GOLDEN = 0.6180339887;
const R2_X = 0.7548776662;
const R2_Y = 0.569840291;

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
  post: PostChain | null;
}

/**
 * Tuvale sahnenin çizicisini kurar. WebGL2 yoksa ya da gölgelendirici derlenemezse `null` döner
 * (sahne o zaman CSS ile çizilmiş durgun arka planı gösterir); neden hata günlüğüne yazılır.
 */
export function createShaderRenderer(
  canvas: HTMLCanvasElement,
  id: ShaderSceneId,
  options: ShaderRendererOptions = {},
): ShaderRenderer | null {
  const name = SHADER_SCENES.find((s) => s.id === id)?.name ?? id;
  const wantPost = postWanted(options.post);
  const opened = openScene(canvas, name, (gl) => setup(gl, canvas, id, wantPost));
  if (!opened) return null;
  const ctx = opened.gl;
  let resources: Resources | null = opened.resources;
  let lost = false;
  let lookState: LookState = LOOK_AT_REST;
  let resolution: ResolutionState = RESOLUTION_AT_START;
  let warmth = 0.5;
  let lastDrawAt: number | null = null;
  let noiseFrame = 0;

  const onLost = (event: Event) => {
    event.preventDefault(); // geri yüklenebilsin
    lost = true;
  };
  const onRestored = () => {
    resources = retrySetup(canvas, name, () => setup(ctx, canvas, id, wantPost));
    lost = resources === null;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    draw(state, look, dt, input = NEUTRAL_POST) {
      if (lost || !resources) return;
      const { width, height } = fitCanvas(canvas);
      const { program, uniforms, vao, themes, palettes, post } = resources;
      const { from, to, mix } = state.palette;
      const a = themes[from % themes.length] ?? THEME_FALLBACK;
      const b = themes[to % themes.length] ?? THEME_FALLBACK;
      const target: ColorPair =
        look.palette === "theme"
          ? { low: mixColors(a.low, b.low, mix), high: mixColors(a.high, b.high, mix) }
          : palettes[look.palette];
      lookState = stepLook(lookState, state.flowTime, look, target, dt);
      const colors = lookState.fade?.shown ?? target;

      let sceneWidth = width;
      let sceneHeight = height;
      if (post) {
        // Dinamik çözünürlük: yalnızca çalarken, iki çizim arasındaki gerçek süreyle.
        const now = performance.now();
        if (input.active && lastDrawAt !== null) {
          const next = stepResolution(resolution, now - lastDrawAt);
          if (next.scale !== resolution.scale) canvas.dataset.resolution = next.scale.toFixed(2);
          resolution = next;
        }
        lastDrawAt = input.active ? now : null;
        const size = post.beginScene(width, height, resolution.scale);
        sceneWidth = size.width;
        sceneHeight = size.height;
      } else {
        ctx.viewport(0, 0, width, height);
      }
      ctx.useProgram(program);
      ctx.bindVertexArray(vao);
      ctx.uniform2f(uniforms.uResolution, sceneWidth, sceneHeight);
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
      if (!post) return;

      warmth = smoothWarmth(warmth, input.warmth, dt);
      const bloom = bloomParams(state.bloom, input.safe);
      // Gren ve titretme çalarken kareden kareye kayar; "animasyonları azalt"ta durgun.
      if (input.active && !input.reducedMotion) noiseFrame = (noiseFrame + 1) % 4096;
      post.finish({
        canvasWidth: width,
        canvasHeight: height,
        bloomStrength: bloom.strength,
        spread: bloom.spread,
        warmth: warmthGains(warmth),
        noiseShiftX: ((noiseFrame * R2_X) % 1) * 64,
        noiseShiftY: ((noiseFrame * R2_Y) % 1) * 64 + 17,
        noisePhase: (noiseFrame * GOLDEN) % 1,
      });
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (resources && !ctx.isContextLost()) {
        ctx.deleteProgram(resources.program);
        ctx.deleteVertexArray(resources.vao);
        resources.post?.dispose();
      }
      resources = null;
    },
  };
}

/**
 * Gölgelendiriciyi derler ve renkleri yükler; olmazsa nedeni içeren hata fırlatır. Son işlem
 * zinciri kurulamazsa (kayan noktalı doku yok) sessizce doğrudan çizime dönülür.
 */
function setup(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  id: ShaderSceneId,
  wantPost: boolean,
): Resources {
  let post: PostChain | null = null;
  if (wantPost) {
    try {
      post = createPostChain(gl);
    } catch (error) {
      console.warn(`Son işlem kapalı: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  canvas.dataset.post = post ? "on" : "off";
  if (post) canvas.dataset.resolution = RESOLUTION_AT_START.scale.toFixed(2);
  else delete canvas.dataset.resolution;
  let program: WebGLProgram;
  try {
    program = linkFullscreenProgram(gl, fragmentSource(id, post ? "hdr" : "display"));
  } catch (error) {
    post?.dispose();
    throw error;
  }
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
  return { program, vao, uniforms, themes, palettes, post };
}
