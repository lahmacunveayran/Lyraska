/**
 * Parlaklık freni (epilepsi güvenliği için son geçiş). Güvenilmeyen bir sahnenin (ör. kullanıcının
 * MilkDrop preseti) çıktısı her karede doku olarak alınır ve ekrana öyle çizilir ki görüntünün
 * her bölgesinin (32×18 hücre) ortalama parlaklığı bir karede en çok `r·dt` değişir:
 * normal modda r = 0,3/sn (saniyede ≤ 1,65 parlama), güvenli modda r = 0,18/sn (≤ 1). Algoritma,
 * kanıtı ve sınırları `flashGuardMath.ts`'te; bu dosya aynısını ekran kartında çalıştırır.
 *
 * Ölçüm ekran kartında kalır (işlemciye okuma yok), her karede beş küçük geçiş:
 *
 * 1. Ölçüm: girdinin blok ortalamaları (256×144, doğrusal RGB) ve önceki gösterilenle parlaklık
 *    farkı. Her piksel bir kez okunur.
 * 2. Hücreler: köşe ağırlıklı farklar, hücrenin payı `α_c` (32×18).
 * 3. Köşeler: köşeye dokunan hücrelerin en küçük payı (33×19).
 * 4. Gösterim: `O(p) = H_b + a(b)·(X(p) − H_b)` hedef çerçeve tamponuna (tam çözünürlük).
 * 5. Durum: gösterilenin blok ortalamaları (ping-pong; bir sonraki karenin `H`'si).
 *
 * Saklama: `EXT_color_buffer_float` varsa değerler R32F dokularda; yoksa RGBA8 dokularda 24 bit
 * sabit noktalı olarak (üç bayt) saklanır. İkisinde de sınır aynıdır (pay `GUARD_SLEW_MARGIN`).
 * Kurulum bir öz denetimle biter: beyaz bir kare siyahtan ancak `r·dt` kadar açılmalı. Fren
 * kurulamazsa `createFlashGuard` `{ ok: false }` döndürür; çağıran güvenilmeyen sahneyi o zaman
 * HİÇ göstermez. Güvenilmeyen sahne ekrana yalnızca `process` üzerinden ulaşır: kendi tuvali
 * görünmez (OffscreenCanvas ya da çerçeve tamponu), görünür tuvale yalnızca fren çizer.
 *
 * Butterchurn kendi WebGL2 bağlamında (kendi tuvali) çizer; çıktısı her karede bu bağlama
 * `processSource` ile doku olarak yüklenir (`texImage2D`). Chromium'da tuvalden dokuya kopya
 * çoğunlukla ekran kartında kalır, ama bağlamlar arası kopya sürücüye göre işlemciden de geçebilir
 * (1080p'de kare başına 8 MB); gerçek cihazda ölçülmeli. Kopyasız yol: sahne aynı bağlamda bir
 * dokuya çizer, `process` o dokuyu alır.
 */

import { linkFullscreenProgram } from "./gl";
import {
  GUARD_BLOCKS_PER_CELL,
  GUARD_COLS,
  GUARD_RATE,
  GUARD_ROWS,
  GUARD_SAFE_RATE,
  frameSlew,
  srgbToLinear,
} from "./flashGuardMath";

/** Değerlerin saklanışı: 32 bit kayan nokta ya da RGBA8'de 24 bit sabit nokta (yedek). */
export type FlashGuardStorage = "float" | "packed";

export interface FlashGuard {
  readonly storage: FlashGuardStorage;
  /**
   * Bir kare: `input` dokusu (RGBA8, sRGB kodlu, tuval gibi; boyu `width × height`, satır 0 altta)
   * frenden geçirilip `target` çerçeve tamponuna (`null`: tuval) `width × height` olarak çizilir.
   * `dt`: bir önceki gösterilen kareden bu yana geçen gerçek süre (saniye). Çizemezse (bağlam
   * kayıp, kapatılmış) `false` döner; o zaman ekrana güvenilmeyen hiçbir şey gitmemiştir. Bağlam
   * geri gelince fren yeniden kurulur (`createFlashGuard`). Fren karıştırma, makas, derinlik,
   * şablon ve yüz ayıklamayı kapalı bırakır; çerçeve tamponu ve görüntü alanı hedefte kalır.
   */
  process(
    input: WebGLTexture,
    width: number,
    height: number,
    dt: number,
    target?: WebGLFramebuffer | null,
  ): boolean;
  /** Başka bir tuvalin (ör. butterchurn'ün) görüntüsünü yükleyip `process` eder. */
  processSource(
    source: HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    dt: number,
    target?: WebGLFramebuffer | null,
  ): boolean;
  /** Epilepsi güvenli modu (r = 0,18/sn). */
  setSafe(safe: boolean): void;
  /** Gösterilen görüntüyü siyaha döndürür: sahne yeniden yavaşça belirir. */
  reset(): void;
  dispose(): void;
}

export type FlashGuardSetup = { ok: true; guard: FlashGuard } | { ok: false; reason: string };

export interface FlashGuardOptions {
  safe?: boolean;
  /** Yalnızca denetim için: kayan nokta dokular olsa da RGBA8 yedeğini kullan. */
  forcePacked?: boolean;
}

const COLS = GUARD_COLS;
const ROWS = GUARD_ROWS;
const PER_CELL = GUARD_BLOCKS_PER_CELL;
const BLOCKS_X = COLS * PER_CELL;
const BLOCKS_Y = ROWS * PER_CELL;

/**
 * Freni kurar. Kurulamazsa nedeni döner: çağıran güvenilmeyen sahneyi göstermemelidir.
 * Kayan nokta dokularla kurulamazsa RGBA8 yedeği denenir.
 */
export function createFlashGuard(
  gl: WebGL2RenderingContext,
  options: FlashGuardOptions = {},
): FlashGuardSetup {
  if (gl.isContextLost()) return { ok: false, reason: "WebGL2 bağlamı kayıp" };
  const reasons: string[] = [];
  const float = !options.forcePacked && gl.getExtension("EXT_color_buffer_float") !== null;
  for (const storage of float ? (["float", "packed"] as const) : (["packed"] as const)) {
    let guard: FlashGuard | null = null;
    try {
      guard = build(gl, storage, options.safe ?? false);
      selfTest(gl, guard, options.safe ?? false);
      return { ok: true, guard };
    } catch (error) {
      guard?.dispose();
      reasons.push(`${storage}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: false, reason: `parlaklık freni kurulamadı (${reasons.join("; ")})` };
}

/** Ortak gölgelendirici başı: değer okuma/yazma, sRGB, blok sınırları, köşe payı. */
function header(storage: FlashGuardStorage): string {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define PACKED ${storage === "packed" ? 1 : 0}
#define PER_CELL ${PER_CELL}
#define COLS ${COLS}
#define ROWS ${ROWS}
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
uniform ivec2 uSize;
uniform ivec2 uBlocks;

float readValue(sampler2D t, ivec2 p) {
#if PACKED
  uvec3 b = uvec3(texelFetch(t, p, 0).rgb * 255.0 + 0.5);
  return float((b.r << 16) | (b.g << 8) | b.b) / 16777215.0;
#else
  return texelFetch(t, p, 0).r;
#endif
}

vec4 writeValue(float v) {
#if PACKED
  uint x = uint(clamp(v, 0.0, 1.0) * 16777215.0 + 0.5);
  return vec4(float(x >> 16), float((x >> 8) & 255u), float(x & 255u), 255.0) / 255.0;
#else
  return vec4(v, 0.0, 0.0, 1.0);
#endif
}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// Blok i'nin ilk pikseli: floor(i * size / count) (işlemcideki blockEdge ile aynı).
int edgeX(int i) { return (i * uSize.x) / uBlocks.x; }
int edgeY(int i) { return (i * uSize.y) / uBlocks.y; }

// Bloğun payı: hücresinin dört köşesinin çift doğrusal karışımı (bloğun merkezinde).
float blockGain(sampler2D vertices, ivec2 b) {
  ivec2 c = b / PER_CELL;
  vec2 uv = (vec2(b - c * PER_CELL) + 0.5) / float(PER_CELL);
  float a00 = readValue(vertices, c);
  float a10 = readValue(vertices, c + ivec2(1, 0));
  float a01 = readValue(vertices, c + ivec2(0, 1));
  float a11 = readValue(vertices, c + ivec2(1, 1));
  return (1.0 - uv.x) * (1.0 - uv.y) * a00 + uv.x * (1.0 - uv.y) * a10
    + (1.0 - uv.x) * uv.y * a01 + uv.x * uv.y * a11;
}
`;
}

/** 1. Girdinin blok ortalamaları ve önceki gösterilenle parlaklık farkı. */
const MEASURE = `
uniform sampler2D uInput;
uniform sampler2D uHold0;
uniform sampler2D uHold1;
uniform sampler2D uHold2;
layout(location = 0) out vec4 outR;
layout(location = 1) out vec4 outG;
layout(location = 2) out vec4 outB;
layout(location = 3) out vec4 outDelta;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy);
  int x0 = edgeX(b.x);
  int x1 = edgeX(b.x + 1);
  int y0 = edgeY(b.y);
  int y1 = edgeY(b.y + 1);
  vec3 sum = vec3(0.0);
  for (int y = y0; y < y1; y++) {
    for (int x = x0; x < x1; x++) sum += toLinear(texelFetch(uInput, ivec2(x, y), 0).rgb);
  }
  int n = (x1 - x0) * (y1 - y0);
  vec3 mean = n > 0 ? sum / float(n) : vec3(0.0);
  vec3 hold = vec3(readValue(uHold0, b), readValue(uHold1, b), readValue(uHold2, b));
  outR = writeValue(mean.r);
  outG = writeValue(mean.g);
  outB = writeValue(mean.b);
  outDelta = writeValue(0.5 + 0.5 * dot(mean - hold, LUMA));
}`;

/** 2. Hücrenin payı: α_c = min(1, s / Σ_k |E_{c,k}|). */
const CELLS = `
uniform sampler2D uDelta;
uniform float uSlew;
out vec4 outGain;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 e = vec4(0.0);
  float total = 0.0;
  for (int j = 0; j < PER_CELL; j++) {
    int by = c.y * PER_CELL + j;
    float h = float(edgeY(by + 1) - edgeY(by));
    float v = (float(j) + 0.5) / float(PER_CELL);
    for (int i = 0; i < PER_CELL; i++) {
      int bx = c.x * PER_CELL + i;
      float n = h * float(edgeX(bx + 1) - edgeX(bx));
      float u = (float(i) + 0.5) / float(PER_CELL);
      float d = readValue(uDelta, ivec2(bx, by)) * 2.0 - 1.0;
      e += n * d * vec4((1.0 - u) * (1.0 - v), u * (1.0 - v), (1.0 - u) * v, u * v);
      total += n;
    }
  }
  float l1 = total > 0.0 ? (abs(e.x) + abs(e.y) + abs(e.z) + abs(e.w)) / total : 0.0;
  outGain = writeValue(l1 <= uSlew ? 1.0 : uSlew / l1);
}`;

/** 3. Köşenin payı: köşeye dokunan hücrelerin en küçük payı. */
const VERTICES = `
uniform sampler2D uCells;
out vec4 outGain;
void main() {
  ivec2 v = ivec2(gl_FragCoord.xy);
  float a = 1.0;
  for (int dy = -1; dy <= 0; dy++) {
    for (int dx = -1; dx <= 0; dx++) {
      ivec2 c = v + ivec2(dx, dy);
      if (c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS) a = min(a, readValue(uCells, c));
    }
  }
  outGain = writeValue(a);
}`;

/** 4. Gösterim: O(p) = H_b + a(b)·(X(p) − H_b). */
const PRESENT = `
uniform sampler2D uInput;
uniform sampler2D uHold0;
uniform sampler2D uHold1;
uniform sampler2D uHold2;
uniform sampler2D uVertices;
out vec4 outColor;
// Pikselin bloğu: ceil((x + 1) * count / size) - 1 (işlemcideki blockOfPixel ile aynı).
int blockOf(int x, int size, int count) { return ((x + 1) * count + size - 1) / size - 1; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 b = ivec2(blockOf(p.x, uSize.x, uBlocks.x), blockOf(p.y, uSize.y, uBlocks.y));
  float a = blockGain(uVertices, b);
  vec3 x = toLinear(texelFetch(uInput, p, 0).rgb);
  vec3 h = vec3(readValue(uHold0, b), readValue(uHold1, b), readValue(uHold2, b));
  outColor = vec4(toSrgb(h + a * (x - h)), 1.0);
}`;

/** 5. Gösterilenin blok ortalamaları: bir sonraki karenin durumu. */
const HOLD = `
uniform sampler2D uIn0;
uniform sampler2D uIn1;
uniform sampler2D uIn2;
uniform sampler2D uHold0;
uniform sampler2D uHold1;
uniform sampler2D uHold2;
uniform sampler2D uVertices;
layout(location = 0) out vec4 outR;
layout(location = 1) out vec4 outG;
layout(location = 2) out vec4 outB;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy);
  float a = blockGain(uVertices, b);
  vec3 x = vec3(readValue(uIn0, b), readValue(uIn1, b), readValue(uIn2, b));
  vec3 h = vec3(readValue(uHold0, b), readValue(uHold1, b), readValue(uHold2, b));
  vec3 o = h + a * (x - h);
  outR = writeValue(o.r);
  outG = writeValue(o.g);
  outB = writeValue(o.b);
}`;

interface Pass {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

interface Target {
  framebuffer: WebGLFramebuffer;
  textures: WebGLTexture[];
}

/** Kaynakları kurar; olmazsa nedeni içeren hata fırlatır (yarım kalanlar `dispose` ile silinir). */
function build(gl: WebGL2RenderingContext, storage: FlashGuardStorage, safe: boolean): FlashGuard {
  const programs: WebGLProgram[] = [];
  const textures: WebGLTexture[] = [];
  const framebuffers: WebGLFramebuffer[] = [];
  let vao: WebGLVertexArrayObject | null = null;
  let sourceTexture: WebGLTexture | null = null;
  let sourceSize = { width: 0, height: 0 };
  let disposed = false;
  let rate = safe ? GUARD_SAFE_RATE : GUARD_RATE;
  let current = 0;

  const dispose = () => {
    disposed = true;
    if (gl.isContextLost()) return;
    programs.forEach((p) => gl.deleteProgram(p));
    textures.forEach((t) => gl.deleteTexture(t));
    framebuffers.forEach((f) => gl.deleteFramebuffer(f));
    if (vao) gl.deleteVertexArray(vao);
    if (sourceTexture) gl.deleteTexture(sourceTexture);
  };

  try {
    if ((gl.getParameter(gl.MAX_DRAW_BUFFERS) as number) < 4) {
      throw new Error("en az dört çizim hedefi gerekli");
    }
    const pass = (source: string, samplers: string[], uniforms: string[]): Pass => {
      const program = linkFullscreenProgram(gl, header(storage) + source);
      programs.push(program);
      gl.useProgram(program);
      const locations = new Map<string, WebGLUniformLocation>();
      samplers.forEach((name, unit) => {
        const location = gl.getUniformLocation(program, name);
        if (location) gl.uniform1i(location, unit);
      });
      for (const name of ["uSize", "uBlocks", ...uniforms]) {
        const location = gl.getUniformLocation(program, name);
        if (location) locations.set(name, location);
      }
      return { program, uniforms: locations };
    };
    const measure = pass(MEASURE, ["uInput", "uHold0", "uHold1", "uHold2"], []);
    const cells = pass(CELLS, ["uDelta"], ["uSlew"]);
    const vertices = pass(VERTICES, ["uCells"], []);
    const present = pass(PRESENT, ["uInput", "uHold0", "uHold1", "uHold2", "uVertices"], []);
    const hold = pass(
      HOLD,
      ["uIn0", "uIn1", "uIn2", "uHold0", "uHold1", "uHold2", "uVertices"],
      [],
    );
    vao = gl.createVertexArray();
    if (!vao) throw new Error("köşe dizisi oluşturulamadı");

    const valueTexture = (width: number, height: number) => {
      const texture = gl.createTexture();
      if (!texture) throw new Error("doku oluşturulamadı");
      textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (storage === "float") {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
      } else {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      }
      setNearest(gl);
      return texture;
    };
    const target = (width: number, height: number, count: number): Target => {
      const list = Array.from({ length: count }, () => valueTexture(width, height));
      const framebuffer = gl.createFramebuffer();
      if (!framebuffer) throw new Error("çerçeve tamponu oluşturulamadı");
      framebuffers.push(framebuffer);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      const attachments = list.map((texture, i) => {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0 + i,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        return gl.COLOR_ATTACHMENT0 + i;
      });
      gl.drawBuffers(attachments);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`çerçeve tamponu eksik (${status})`);
      }
      return { framebuffer, textures: list };
    };
    const blocks = target(BLOCKS_X, BLOCKS_Y, 4); // R, G, B, parlaklık farkı
    const cellGains = target(COLS, ROWS, 1);
    const vertexGains = target(COLS + 1, ROWS + 1, 1);
    const holds = [target(BLOCKS_X, BLOCKS_Y, 3), target(BLOCKS_X, BLOCKS_Y, 3)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const bindTextures = (list: WebGLTexture[]) => {
      list.forEach((texture, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      });
      gl.activeTexture(gl.TEXTURE0);
    };
    const run = (
      p: Pass,
      to: WebGLFramebuffer | null,
      width: number,
      height: number,
      size: [number, number],
      inputs: WebGLTexture[],
    ) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to);
      gl.viewport(0, 0, width, height);
      gl.useProgram(p.program);
      const sizeLocation = p.uniforms.get("uSize");
      const blocksLocation = p.uniforms.get("uBlocks");
      if (sizeLocation) gl.uniform2i(sizeLocation, size[0], size[1]);
      if (blocksLocation) gl.uniform2i(blocksLocation, BLOCKS_X, BLOCKS_Y);
      bindTextures(inputs);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const clearHolds = () => {
      for (const h of holds) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, h.framebuffer);
        gl.viewport(0, 0, BLOCKS_X, BLOCKS_Y);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    };
    clearHolds();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const process: FlashGuard["process"] = (input, width, height, dt, to = null) => {
      if (disposed || gl.isContextLost()) return false;
      const w = Math.floor(width);
      const h = Math.floor(height);
      if (!(w >= 1 && h >= 1)) return false;
      const size: [number, number] = [w, h];
      const held = holds[current]!;
      const next = holds[1 - current]!;
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(true, true, true, true);
      gl.bindVertexArray(vao);
      run(measure, blocks.framebuffer, BLOCKS_X, BLOCKS_Y, size, [input, ...held.textures]);
      gl.useProgram(cells.program);
      const slew = cells.uniforms.get("uSlew");
      if (slew) gl.uniform1f(slew, frameSlew(rate, dt));
      run(cells, cellGains.framebuffer, COLS, ROWS, size, [blocks.textures[3]!]);
      run(vertices, vertexGains.framebuffer, COLS + 1, ROWS + 1, size, cellGains.textures);
      run(present, to, w, h, size, [input, ...held.textures, vertexGains.textures[0]!]);
      run(hold, next.framebuffer, BLOCKS_X, BLOCKS_Y, size, [
        ...blocks.textures.slice(0, 3),
        ...held.textures,
        vertexGains.textures[0]!,
      ]);
      current = 1 - current;
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, to);
      gl.viewport(0, 0, w, h);
      return true;
    };

    return {
      storage,
      process,
      processSource(source, dt, to = null) {
        if (disposed || gl.isContextLost()) return false;
        const { width, height } = source;
        if (!(width >= 1 && height >= 1)) return false;
        if (!sourceTexture) {
          sourceTexture = gl.createTexture();
          if (!sourceTexture) return false;
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
        // Satır 0 altta olsun (çerçeve tamponu gibi); baytlar olduğu gibi (renk dönüşümü yok).
        // Bağlamın yükleme ayarları sonra eski hâline döner (sahne aynı bağlamı kullanıyor olabilir).
        const unpack = [
          gl.UNPACK_FLIP_Y_WEBGL,
          gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
          gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
        ] as const;
        const saved = unpack.map((name) => gl.getParameter(name) as number | boolean);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        if (sourceSize.width !== width || sourceSize.height !== height) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
          setNearest(gl);
          sourceSize = { width, height };
        } else {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
        }
        unpack.forEach((name, i) => gl.pixelStorei(name, saved[i] ?? 0));
        return process(sourceTexture, width, height, dt, to);
      },
      setSafe(value) {
        rate = value ? GUARD_SAFE_RATE : GUARD_RATE;
      },
      reset() {
        if (disposed || gl.isContextLost()) return;
        clearHolds();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

function setNearest(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/**
 * Öz denetim: siyahtan sonra gelen beyaz kare ancak `r·dt` kadar açılmalı, ardından gelen siyah
 * kare onu geri almalı. Gölgelendiriciler ya da saklama bu sürücüde doğru çalışmıyorsa (ör. her
 * şeyi olduğu gibi geçiriyor ya da hep siyah) fren kurulmuş sayılmaz.
 */
function selfTest(gl: WebGL2RenderingContext, guard: FlashGuard, safe: boolean) {
  const width = BLOCKS_X;
  const height = BLOCKS_Y;
  const input = gl.createTexture();
  const output = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  try {
    if (!input || !output || !framebuffer) throw new Error("öz denetim kaynakları oluşturulamadı");
    const white = new Uint8Array(width * height * 4).fill(255);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, white);
    setNearest(gl);
    gl.bindTexture(gl.TEXTURE_2D, output);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    setNearest(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
    const pixels = new Uint8Array(width * height * 4);
    const meanLuminance = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        sum +=
          0.2126 * srgbToLinear(pixels[i]! / 255) +
          0.7152 * srgbToLinear(pixels[i + 1]! / 255) +
          0.0722 * srgbToLinear(pixels[i + 2]! / 255);
      }
      return sum / (width * height);
    };
    const dt = 1 / 60;
    const slew = frameSlew(GUARD_SAFE_RATE, dt);
    guard.setSafe(true);
    if (!guard.process(input, width, height, dt, framebuffer)) throw new Error("çizilemedi");
    const opened = meanLuminance();
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(width * height * 4),
    );
    guard.process(input, width, height, dt, framebuffer);
    const closed = meanLuminance();
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`WebGL hatası ${error}`);
    // 8 bit yuvarlama payıyla: açılış ~s, kapanış ~0.
    if (!(opened > slew * 0.5 && opened < slew + 0.002)) {
      throw new Error(
        `öz denetim: beyaz kare ${opened.toFixed(5)} açıldı, beklenen ${slew.toFixed(5)}`,
      );
    }
    if (!(closed < 0.001)) throw new Error(`öz denetim: siyah kare ${closed.toFixed(5)} kaldı`);
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(input);
    gl.deleteTexture(output);
    gl.deleteFramebuffer(framebuffer);
    guard.setSafe(safe);
    guard.reset();
  }
}
