import { blueNoise, BLUE_NOISE_SIZE } from "./blueNoise";
import { linkFullscreenProgram } from "./gl";
import {
  COMPOSITE_SHADER,
  DOWNSAMPLE_SHADER,
  UPSAMPLE_SHADER,
  bloomLevelCount,
  scaledSize,
  type Rgb,
} from "./postProcess";

/**
 * Galeri sahnelerinin son işlem zinciri ekran kartında (hesapları ve gölgelendiricileri
 * `postProcess.ts`). Sahne yarı kayan noktalı (RGBA16F) bir dokuya, tuvalin `scale` katı
 * boyunda çizilir; bloom zinciri yarım çözünürlükten başlar; son geçiş tuvalin tam boyundadır.
 *
 * Dokular ve çerçeve tamponları yalnızca boyut değişince yeniden kurulur: karede bellek ayrılmaz.
 * Ekran kartı kayan noktalı dokuya çizemiyorsa `createPostChain` hata fırlatır; sahne o zaman
 * eski doğrudan çizime döner (`shaderRenderer.ts`).
 */
export interface PostChain {
  /**
   * Sahnenin çerçeve tamponunu bağlar ve görüntü alanını ayarlar. Dönen boyut sahne dokusununkidir
   * (aynı nesne her karede yeniden kullanılır).
   */
  beginScene(canvasWidth: number, canvasHeight: number, scale: number): Size;
  /** Bloom zincirini ve son geçişi tuvale çizer. */
  finish(params: CompositeParams): void;
  dispose(): void;
}

export interface Size {
  width: number;
  height: number;
}

export interface CompositeParams {
  canvasWidth: number;
  canvasHeight: number;
  /** Bloom payı ve yarıçapı (`bloomParams`). */
  bloomStrength: number;
  spread: number;
  /** Renk sıcaklığı katsayıları (`warmthGains`). */
  warmth: Rgb;
  /** Mavi gürültünün gren için kaydırması (piksel) ve titretmenin zaman evresi (0..1). */
  noiseShiftX: number;
  noiseShiftY: number;
  noisePhase: number;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

/** Ekran kartı yarı kayan noktalı dokuya çizebiliyor mu (eklenti açılır)? */
export function enableFloatTargets(gl: WebGL2RenderingContext): boolean {
  return (
    gl.getExtension("EXT_color_buffer_float") !== null ||
    gl.getExtension("EXT_color_buffer_half_float") !== null
  );
}

export function createPostChain(gl: WebGL2RenderingContext): PostChain {
  if (!enableFloatTargets(gl)) throw new Error("kayan noktalı doku desteklenmiyor");
  const programs: WebGLProgram[] = [];
  const link = (source: string) => {
    const program = linkFullscreenProgram(gl, source);
    programs.push(program);
    return program;
  };
  const targets: Target[] = [];
  let noise: WebGLTexture | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  try {
    const down = link(DOWNSAMPLE_SHADER);
    const up = link(UPSAMPLE_SHADER);
    const composite = link(COMPOSITE_SHADER);
    vao = gl.createVertexArray();
    if (!vao) throw new Error("köşe dizisi oluşturulamadı");
    const loc = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
    const downU = {
      source: loc(down, "uSource"),
      texel: loc(down, "uTexel"),
      target: loc(down, "uTarget"),
      karis: loc(down, "uKaris"),
    };
    const upU = {
      source: loc(up, "uSource"),
      texel: loc(up, "uTexel"),
      target: loc(up, "uTarget"),
    };
    const compU = {
      scene: loc(composite, "uScene"),
      bloom: loc(composite, "uBloom"),
      noise: loc(composite, "uNoise"),
      target: loc(composite, "uTarget"),
      bloomStrength: loc(composite, "uBloomStrength"),
      warmth: loc(composite, "uWarmth"),
      noiseShift: loc(composite, "uNoiseShift"),
      noisePhase: loc(composite, "uNoisePhase"),
    };
    gl.useProgram(down);
    gl.uniform1i(downU.source, 0);
    gl.useProgram(up);
    gl.uniform1i(upU.source, 0);
    gl.useProgram(composite);
    gl.uniform1i(compU.scene, 0);
    gl.uniform1i(compU.bloom, 1);
    gl.uniform1i(compU.noise, 2);

    noise = gl.createTexture();
    if (!noise) throw new Error("gürültü dokusu oluşturulamadı");
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      BLUE_NOISE_SIZE,
      BLUE_NOISE_SIZE,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      blueNoise(),
    );
    setSampling(gl, gl.NEAREST, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);

    const scene = { width: 0, height: 0 };
    const sceneSize: Size = { width: 1, height: 1 };
    let levels = 0;

    const release = () => {
      for (const t of targets) {
        gl.deleteFramebuffer(t.framebuffer);
        gl.deleteTexture(t.texture);
      }
      targets.length = 0;
    };
    /** Sahne dokusu ve bloom seviyeleri (yalnızca boyut değişince). */
    const allocate = (width: number, height: number) => {
      release();
      targets.push(createTarget(gl, width, height));
      levels = bloomLevelCount(width, height);
      let w = width;
      let h = height;
      for (let i = 0; i < levels; i++) {
        w = Math.max(1, Math.floor(w / 2));
        h = Math.max(1, Math.floor(h / 2));
        targets.push(createTarget(gl, w, h));
      }
      scene.width = width;
      scene.height = height;
    };
    // Kurulumda bir kez dene: çerçeve tamponu tamamlanmıyorsa doğrudan çizime dönülür.
    allocate(16, 16);

    const pass = (target: Target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
    };

    return {
      beginScene(canvasWidth, canvasHeight, scale) {
        const { width, height } = scaledSize(canvasWidth, canvasHeight, scale);
        if (width !== scene.width || height !== scene.height) allocate(width, height);
        pass(targets[0]!);
        sceneSize.width = width;
        sceneSize.height = height;
        return sceneSize;
      },
      finish(p) {
        gl.bindVertexArray(vao);
        gl.disable(gl.BLEND);
        // Küçültme: sahne → seviye 1 (Karis ortalamasıyla) → … → en küçük.
        gl.useProgram(down);
        gl.activeTexture(gl.TEXTURE0);
        for (let i = 1; i <= levels; i++) {
          const source = targets[i - 1]!;
          const target = targets[i]!;
          pass(target);
          gl.bindTexture(gl.TEXTURE_2D, source.texture);
          gl.uniform2f(downU.texel, 1 / source.width, 1 / source.height);
          gl.uniform2f(downU.target, target.width, target.height);
          gl.uniform1f(downU.karis, i === 1 ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        // Büyütme: seviye_i ← (1 − s)·seviye_i + s·çadır(seviye_(i+1)) (toplam ağırlık 1).
        gl.useProgram(up);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.CONSTANT_COLOR, gl.ONE_MINUS_CONSTANT_COLOR);
        gl.blendColor(p.spread, p.spread, p.spread, p.spread);
        for (let i = levels - 1; i >= 1; i--) {
          const source = targets[i + 1]!;
          const target = targets[i]!;
          pass(target);
          gl.bindTexture(gl.TEXTURE_2D, source.texture);
          gl.uniform2f(upU.texel, 1 / source.width, 1 / source.height);
          gl.uniform2f(upU.target, target.width, target.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disable(gl.BLEND);
        // Son geçiş: tuvale, tam boyda.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, p.canvasWidth, p.canvasHeight);
        gl.useProgram(composite);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targets[0]!.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, targets[1]!.texture);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, noise);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform2f(compU.target, p.canvasWidth, p.canvasHeight);
        gl.uniform1f(compU.bloomStrength, p.bloomStrength);
        gl.uniform3f(compU.warmth, p.warmth[0], p.warmth[1], p.warmth[2]);
        gl.uniform2f(compU.noiseShift, p.noiseShiftX, p.noiseShiftY);
        gl.uniform1f(compU.noisePhase, p.noisePhase);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose() {
        if (gl.isContextLost()) return;
        release();
        gl.deleteTexture(noise);
        gl.deleteVertexArray(vao);
        for (const program of programs) gl.deleteProgram(program);
      },
    };
  } catch (error) {
    if (!gl.isContextLost()) {
      for (const t of targets) {
        gl.deleteFramebuffer(t.framebuffer);
        gl.deleteTexture(t.texture);
      }
      if (noise) gl.deleteTexture(noise);
      if (vao) gl.deleteVertexArray(vao);
      for (const program of programs) gl.deleteProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    throw error;
  }
}

function setSampling(gl: WebGL2RenderingContext, filter: number, wrap: number) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
}

/** Yarı kayan noktalı doku ve ona çizen çerçeve tamponu; tamamlanmazsa hata fırlatır. */
function createTarget(gl: WebGL2RenderingContext, width: number, height: number): Target {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new Error("ara doku oluşturulamadı");
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
  setSampling(gl, gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error(`ara doku çizilemiyor (durum ${status})`);
  }
  return { texture, framebuffer, width, height };
}
