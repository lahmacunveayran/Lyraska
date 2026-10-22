/**
 * YALNIZCA DENETİM İÇİN: parlaklık freninin gerçek tarayıcıda zamana bağlı parlama ölçümü.
 * Bilerek parlayan bir deseni (saniyede 10 kez siyah ↔ beyaz) frenden geçirir ve ekrandaki
 * görüntünün en kötü WCAG penceresindeki parlamaları sayar.
 *
 * Bu dosya programa girmez: hiçbir uygulama dosyası onu içe aktarmaz (`sceneCheck.test.ts`
 * denetler), Vite derlemesi yalnızca `index.html`'den ulaşılanı paketler. Onu yalnızca
 * `scripts/check-scenes.mjs` ayrı bir paket olarak derleyip boş bir denetim sayfasında çalıştırır;
 * kullanıcı bu desene hiçbir yoldan ulaşamaz.
 *
 * Desen ayrı bir WebGL2 tuvalinde çizilir ve her karede frenin bağlamına doku olarak yüklenir:
 * butterchurn'ün çıktısı da böyle gelir (`processSource`). Zaman sanaldır: her kare 1/60 sn.
 *
 * Gerçek MilkDrop sahnesinin ölçümü için [`screenWindows`] ve [`flashRate`]: denetim, programın
 * kendi sayfasında her karede sahnenin görünen tuvalini (frenli) ve Butterchurn'ün görünmeyen
 * tuvalini (frensiz) okur, parlamaları aynı yöntemle sayar.
 */

import { flashWindow, windowMeans, worstWindowFlashes } from "./flash";
import { createFlashGuard, type FlashGuard } from "./flashGuard";
import { linkFullscreenProgram } from "./gl";
import { srgbToLinear } from "./flashGuardMath";

export interface FlashCheckCase {
  id: string;
  label: string;
  /** Tam ekran ya da hücrelere hizasız tek bir dikdörtgen bölge. */
  pattern: "full" | "region";
  /** Desenin parlama hızı (siyah ↔ beyaz çifti / saniye). */
  hz: number;
  /** `none`: frensiz (ölçümün parlamayı gördüğünü kanıtlayan denetim), yoksa frenin saklaması. */
  guard: "none" | "float" | "packed";
  safe?: boolean;
  seconds: number;
  /** Beklenen: saniyedeki parlama en çok / en az. */
  maxPerSecond?: number;
  minPerSecond?: number;
}

export interface FlashCheckResult {
  id: string;
  label: string;
  /** Frenin gerçekte kullandığı saklama (frensizde `null`). */
  storage: string | null;
  flashesPerSecond: number;
  /** Bir karede en kötü pencere ortalamasının en büyük değişimi. */
  maxStep: number;
  /** Kare başına ortalama süre (yükleme + fren + okuma), ms; yazılımsal çizimde temsilî değil. */
  frameMs: number;
  error: string | null;
}

/** Denetlenen durumlar. Frenli her durum saniyede ≤ 3 (güvenli modda ≤ 1) parlamalı. */
export const FLASH_CHECK_CASES: FlashCheckCase[] = [
  {
    id: "control-full",
    label: "Frensiz, tam ekran 10 Hz (denetim)",
    pattern: "full",
    hz: 10,
    guard: "none",
    seconds: 3,
    minPerSecond: 8,
  },
  {
    id: "control-region",
    label: "Frensiz, bölge 10 Hz (denetim)",
    pattern: "region",
    hz: 10,
    guard: "none",
    seconds: 3,
    minPerSecond: 8,
  },
  {
    id: "full-10",
    label: "Frenli, tam ekran 10 Hz",
    pattern: "full",
    hz: 10,
    guard: "float",
    seconds: 4,
    maxPerSecond: 3,
  },
  {
    id: "region-10",
    label: "Frenli, bölge 10 Hz",
    pattern: "region",
    hz: 10,
    guard: "float",
    seconds: 4,
    maxPerSecond: 3,
  },
  {
    id: "full-1",
    label: "Frenli, tam ekran 1 Hz",
    pattern: "full",
    hz: 1,
    guard: "float",
    seconds: 6,
    maxPerSecond: 3,
  },
  {
    id: "safe-1",
    label: "Frenli (güvenli mod), tam ekran 1 Hz",
    pattern: "full",
    hz: 1,
    guard: "float",
    safe: true,
    seconds: 6,
    maxPerSecond: 1,
  },
  {
    id: "packed-10",
    label: "Frenli (RGBA8 yedeği), tam ekran 10 Hz",
    pattern: "full",
    hz: 10,
    guard: "packed",
    seconds: 4,
    maxPerSecond: 3,
  },
  {
    id: "packed-1",
    label: "Frenli (RGBA8 yedeği), tam ekran 1 Hz",
    pattern: "full",
    hz: 1,
    guard: "packed",
    seconds: 6,
    maxPerSecond: 3,
  },
];

const DT = 1 / 60;
/** Pencereler bu adımla, hücrelere (10 piksel) hizasız ölçülür. */
const WINDOW_STEP = 4;

const COPY_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uInput;
out vec4 outColor;
void main() { outColor = texelFetch(uInput, ivec2(gl_FragCoord.xy), 0); }`;

/** Denetimi çalıştırır (`width × height` ekranlık tuvallerde). */
export async function runFlashGuardCheck(
  cases: FlashCheckCase[] = FLASH_CHECK_CASES,
  width = 320,
  height = 180,
): Promise<FlashCheckResult[]> {
  const results: FlashCheckResult[] = [];
  for (const c of cases) {
    try {
      results.push(runCase(c, width, height));
    } catch (error) {
      results.push({
        id: c.id,
        label: c.label,
        storage: null,
        flashesPerSecond: 0,
        maxStep: 0,
        frameMs: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Tarayıcı bir nefes alsın (bağlamlar kapanır).
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return results;
}

function runCase(c: FlashCheckCase, width: number, height: number): FlashCheckResult {
  const attributes: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  };
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const source = sourceCanvas.getContext("webgl2", attributes);
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = width;
  screenCanvas.height = height;
  const screen = screenCanvas.getContext("webgl2", attributes);
  if (!source || !screen) throw new Error("WebGL2 açılamadı");

  let guard: FlashGuard | null = null;
  let copy: { program: WebGLProgram; texture: WebGLTexture; vao: WebGLVertexArrayObject } | null =
    null;
  try {
    if (c.guard === "none") {
      const program = linkFullscreenProgram(screen, COPY_SHADER);
      const texture = screen.createTexture();
      const vao = screen.createVertexArray();
      if (!texture || !vao) throw new Error("kopya kaynakları oluşturulamadı");
      copy = { program, texture, vao };
    } else {
      const setup = createFlashGuard(screen, {
        safe: c.safe ?? false,
        forcePacked: c.guard === "packed",
      });
      if (!setup.ok) throw new Error(setup.reason);
      guard = setup.guard;
    }

    const win = flashWindow(width, height);
    const pixels = new Uint8Array(width * height * 4);
    const luminance = new Float64Array(width * height);
    const decode = SRGB_DECODE;
    const frames: Float64Array[] = [];
    const count = Math.round(c.seconds / DT);
    const started = performance.now();
    for (let i = 0; i < count; i++) {
      drawPattern(source, c, i, width, height);
      if (guard) {
        if (!guard.processSource(sourceCanvas, DT)) throw new Error("fren çizemedi");
      } else if (copy) {
        drawCopy(screen, copy, sourceCanvas, width, height);
      }
      screen.readPixels(0, 0, width, height, screen.RGBA, screen.UNSIGNED_BYTE, pixels);
      toLuminance(pixels, luminance, decode);
      frames.push(windowMeans(luminance, width, height, win, WINDOW_STEP));
    }
    const frameMs = (performance.now() - started) / count;
    const { flashes, maxStep } = worstWindowFlashes(frames);
    return {
      id: c.id,
      label: c.label,
      storage: guard?.storage ?? null,
      flashesPerSecond: flashes / c.seconds,
      maxStep,
      frameMs,
      error: null,
    };
  } finally {
    guard?.dispose();
    if (copy) {
      screen.deleteProgram(copy.program);
      screen.deleteTexture(copy.texture);
      screen.deleteVertexArray(copy.vao);
    }
    source.getExtension("WEBGL_lose_context")?.loseContext();
    screen.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** 8 bit sRGB pikselleri (RGBA) bağıl parlaklığa çevirir. */
function toLuminance(pixels: Uint8Array, luminance: Float64Array, decode: readonly number[]) {
  for (let p = 0; p < luminance.length; p++) {
    luminance[p] =
      0.2126 * decode[pixels[p * 4]!]! +
      0.7152 * decode[pixels[p * 4 + 1]!]! +
      0.0722 * decode[pixels[p * 4 + 2]!]!;
  }
}

const SRGB_DECODE = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

/**
 * Bağlamın ekrandaki görüntüsü (varsayılan çerçeve tamponu) için WCAG pencerelerinin ortalama
 * parlaklıkları (4 piksel adımla). Bağlamın bağlı çerçeve tamponu geri yüklenir. Görüntünün
 * kare bittikten sonra da okunabilmesi için bağlam `preserveDrawingBuffer` ile açılmış olmalı
 * (denetim `getContext`'e bunu ekler).
 */
export function screenWindows(gl: WebGL2RenderingContext): Float64Array {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
  const luminance = new Float64Array(width * height);
  toLuminance(pixels, luminance, SRGB_DECODE);
  return windowMeans(luminance, width, height, flashWindow(width, height), WINDOW_STEP);
}

/** Karelerin pencere ortalamalarından saniyedeki parlama ve bir karede en büyük değişim. */
export function flashRate(
  frames: readonly Float64Array[],
  seconds: number,
): { flashesPerSecond: number; maxStep: number } {
  const { flashes, maxStep } = worstWindowFlashes(frames);
  return { flashesPerSecond: flashes / seconds, maxStep };
}

/** Deseni kaynak tuvale çizer: `i`. kare, açık yarım periyotta beyaz. */
function drawPattern(
  gl: WebGL2RenderingContext,
  c: FlashCheckCase,
  i: number,
  width: number,
  height: number,
) {
  const on = Math.floor(i * DT * c.hz * 2) % 2 === 0 ? 1 : 0;
  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, width, height);
  if (c.pattern === "full") {
    gl.clearColor(on, on, on, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // WCAG penceresi büyüklüğünde, hücre sınırlarına (10 piksel) denk gelmeyen bir bölge.
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    Math.round(width * 0.3) + 3,
    Math.round(height * 0.25) + 3,
    Math.round(width * 0.34),
    Math.round(height * 0.45),
  );
  gl.clearColor(on, on, on, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
}

/** Frensiz denetim: aynı yükleme yolu, görüntü olduğu gibi kopyalanır. */
function drawCopy(
  gl: WebGL2RenderingContext,
  copy: { program: WebGLProgram; texture: WebGLTexture; vao: WebGLVertexArrayObject },
  source: HTMLCanvasElement,
  width: number,
  height: number,
) {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, copy.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.useProgram(copy.program);
  gl.bindVertexArray(copy.vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
