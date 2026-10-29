import { blueNoise } from "./blueNoise";
import { fitCanvas, isSoftwareGl, linkFullscreenProgram, openScene, retrySetup } from "./gl";
import { createGpuTimer, type GpuTimer } from "./gpuTimer";
import type { Camera } from "./lightRig";
import { QUALITY_PROFILES, type Quality } from "./lightShow";
import { NOISE_SIZE, hazeNoise, lightShowFragment } from "./lightShowShader";
import { createPostChain, type PostChain } from "./postChain";
import {
  RESOLUTION_AT_START,
  sceneTargetSize,
  stepResolution,
  type ResolutionState,
  type Rgb,
} from "./postProcess";

/**
 * Işık Ustası'nın WebGL2 çizicisi: sahne gölgelendiricisi (`lightShowShader.ts`) son işlem
 * zincirinin kayan noktalı dokusuna, kalite katmanının piksel sınırı × dinamik çözünürlük boyunda
 * çizilir; bloom, pozlama, ton eşleme, vinyet ve titretme tuval boyunda (`postChain.ts`).
 * Ekran kartı kayan noktalı dokuya çizemiyorsa sahne açılmaz (neden günlüğe yazılır).
 *
 * Tuvalde: `data-post` (son işlem), `data-quality` (katman), `data-resolution` (dinamik ölçek).
 */
export interface LightShowFrame {
  camera: Camera;
  /** Işınlar (`packBeams`) ve sayısı. */
  beams: Float32Array;
  beamCount: number;
  /** Salonun genel ışığı ve sahnenin ardındaki parıltı (doğrusal ışık). */
  fill: Rgb;
  back: Rgb;
  haze: number;
  /** Pusun sürüklenme saati (sn). */
  hazeTime: number;
  exposure: number;
  bloomStrength: number;
  bloomSpread: number;
  vignette: number;
  /** Müzik çalıyor mu: dinamik çözünürlük yalnızca çalarken ölçer, gren yalnızca çalarken akar. */
  active: boolean;
  reducedMotion: boolean;
}

export interface LightShowRenderer {
  readonly quality: Quality;
  draw(frame: LightShowFrame): void;
  /** Geliştirici göstergesi: ekran kartı süresi (ms; ölçülemiyorsa `null`), sahne ölçeği. */
  stats(): { gpuMs: number | null; scale: number; width: number; height: number };
  dispose(): void;
}

const NAME = "Işık Ustası";
const GOLDEN = 0.6180339887;
const R2_X = 0.7548776662;
const R2_Y = 0.569840291;

type UniformName =
  | "uResolution"
  | "uCamPos"
  | "uCamRight"
  | "uCamUp"
  | "uCamFwd"
  | "uFocal"
  | "uPixelAngle"
  | "uBeamCount"
  | "uBeams"
  | "uNoise"
  | "uTime"
  | "uFill"
  | "uBack"
  | "uHaze";

const UNIFORMS: UniformName[] = [
  "uResolution",
  "uCamPos",
  "uCamRight",
  "uCamUp",
  "uCamFwd",
  "uFocal",
  "uPixelAngle",
  "uBeamCount",
  "uBeams",
  "uNoise",
  "uTime",
  "uFill",
  "uBack",
  "uHaze",
];

interface Resources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  noise: WebGLTexture;
  uniforms: Record<UniformName, WebGLUniformLocation | null>;
  post: PostChain;
  timer: GpuTimer | null;
}

/**
 * Çiziciyi kurar; WebGL2 ya da kayan noktalı doku yoksa, gölgelendirici derlenemezse `null`
 * (neden günlüğe yazılır, sahne durgun arka planı gösterir).
 */
export function createLightShowRenderer(
  canvas: HTMLCanvasElement,
  pickQuality: (gpu: string, software: boolean) => Quality,
): LightShowRenderer | null {
  let quality: Quality = "high";
  const opened = openScene(canvas, NAME, (gl) => {
    quality = pickQuality(canvas.dataset.gpu ?? "", isSoftwareGl(canvas));
    return setup(gl, quality);
  });
  if (!opened) return null;
  const gl = opened.gl;
  let resources: Resources | null = opened.resources;
  let lost = false;
  let resolution: ResolutionState = RESOLUTION_AT_START;
  let lastDrawAt: number | null = null;
  let noiseFrame = 0;
  const size = { width: 1, height: 1 };
  canvas.dataset.post = "on";
  canvas.dataset.quality = quality;
  canvas.dataset.resolution = resolution.scale.toFixed(2);

  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    resources = retrySetup(canvas, NAME, () => setup(gl, quality));
    lost = resources === null;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    get quality() {
      return quality;
    },
    draw(frame) {
      if (lost || !resources) return;
      const { program, vao, noise, uniforms: u, post, timer } = resources;
      const canvasSize = fitCanvas(canvas);
      const now = performance.now();
      if (frame.active && lastDrawAt !== null) {
        const next = stepResolution(resolution, now - lastDrawAt);
        if (next.scale !== resolution.scale) canvas.dataset.resolution = next.scale.toFixed(2);
        resolution = next;
      }
      lastDrawAt = frame.active ? now : null;
      const target = sceneTargetSize(
        canvasSize.width,
        canvasSize.height,
        QUALITY_PROFILES[quality].maxPixels,
        resolution.scale,
      );
      timer?.begin();
      const scene = post.beginScene(target.width, target.height);
      size.width = scene.width;
      size.height = scene.height;

      const cam = frame.camera;
      const fwd = normalize(sub(cam.target, cam.pos));
      const right = normalize(cross(fwd, [0, 1, 0]));
      const up = cross(right, fwd);
      const tanHalf = Math.tan(((cam.fov * Math.PI) / 180) * 0.5);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, noise);
      gl.uniform2f(u.uResolution, scene.width, scene.height);
      gl.uniform3f(u.uCamPos, cam.pos[0], cam.pos[1], cam.pos[2]);
      gl.uniform3f(u.uCamRight, right[0], right[1], right[2]);
      gl.uniform3f(u.uCamUp, up[0], up[1], up[2]);
      gl.uniform3f(u.uCamFwd, fwd[0], fwd[1], fwd[2]);
      gl.uniform1f(u.uFocal, 1 / tanHalf);
      gl.uniform1f(u.uPixelAngle, (2 * tanHalf) / scene.height);
      gl.uniform1i(u.uBeamCount, frame.beamCount);
      if (frame.beamCount > 0) gl.uniform4fv(u.uBeams, frame.beams, 0, frame.beamCount * 12);
      gl.uniform1f(u.uTime, frame.hazeTime % 4096);
      gl.uniform3f(u.uFill, frame.fill[0], frame.fill[1], frame.fill[2]);
      gl.uniform3f(u.uBack, frame.back[0], frame.back[1], frame.back[2]);
      gl.uniform1f(u.uHaze, frame.haze);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (frame.active && !frame.reducedMotion) noiseFrame = (noiseFrame + 1) % 4096;
      post.finish({
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
        bloomStrength: frame.bloomStrength,
        spread: frame.bloomSpread,
        exposure: frame.exposure,
        vignette: frame.vignette,
        warmth: [1, 1, 1],
        noiseShiftX: ((noiseFrame * R2_X) % 1) * 64,
        noiseShiftY: ((noiseFrame * R2_Y) % 1) * 64 + 17,
        noisePhase: (noiseFrame * GOLDEN) % 1,
      });
      timer?.end();
    },
    stats() {
      return {
        gpuMs: resources?.timer?.averageMs ?? null,
        scale: resolution.scale,
        width: size.width,
        height: size.height,
      };
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (resources && !gl.isContextLost()) {
        gl.deleteProgram(resources.program);
        gl.deleteVertexArray(resources.vao);
        gl.deleteTexture(resources.noise);
        resources.post.dispose();
        resources.timer?.dispose();
      }
      resources = null;
    },
  };
}

function setup(gl: WebGL2RenderingContext, quality: Quality): Resources {
  const post = createPostChain(gl);
  let program: WebGLProgram;
  try {
    program = linkFullscreenProgram(gl, lightShowFragment(QUALITY_PROFILES[quality]));
  } catch (error) {
    post.dispose();
    throw error;
  }
  const vao = gl.createVertexArray();
  const noise = gl.createTexture();
  if (!vao || !noise) throw new Error("köşe dizisi ya da doku oluşturulamadı");
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, noise);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RG8,
    NOISE_SIZE,
    NOISE_SIZE,
    0,
    gl.RG,
    gl.UNSIGNED_BYTE,
    hazeNoise(NOISE_SIZE),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  const uniforms = Object.fromEntries(
    UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<UniformName, WebGLUniformLocation | null>;
  gl.useProgram(program);
  gl.uniform1i(uniforms.uNoise, 0);
  // Mavi gürültü son işlem zincirinde; burada yalnızca önceden üretilsin (ilk karede takılmasın).
  blueNoise();
  return { program, vao, noise, uniforms, post, timer: createGpuTimer(gl) };
}

type V3 = [number, number, number];
function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
