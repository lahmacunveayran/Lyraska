import { linkFullscreenProgram } from "./gl";
import {
  PRESSURE_ITERATIONS,
  PRESSURE_WARM,
  VISCOSITY_K,
  decayFactor,
  DYE_HALF_LIFE,
  VELOCITY_HALF_LIFE,
  type Rgb,
} from "./inkFluid";

/*
 * "Mürekkep" söz görünümünün akışkanı, ekran kartında (WebGL2, 16 bit kayan nokta dokular).
 * Bir adım (Stam 1999, "Stable Fluids"; Fedkiw–Stam–Jensen 2001 girdap güçlendirme):
 *   1. kuvvetler: kaldırma u_y += dt β ρ, girdap güçlendirme u += dt ε (N × ω)
 *   2. ıraksaklık ∇·u, basınç ∇²p = ∇·u (Jacobi, önceki basınçtan başlayarak), u ← u − ∇p
 *   3. taşıma: hız ve mürekkep yarı Lagrange geri izle, sönümle (yarılanma süresi)
 * Hız hücre/sn biriminde; uv'de yer değiştirme dt·u·(1/ızgara).
 */

const PRECISION = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 o;
`;

const ADVECT = `${PRECISION}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uSimTexel;
uniform float uDt;
uniform float uDecay;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 back = uv - uDt * texture(uVelocity, uv).xy * uSimTexel;
  o = uDecay * texture(uSource, back);
}`;

/** Gauss lekesi: 0 = değer ekler, 1 = dışa (damla), 2 = döndürür (girdap). Uzaklık ekran yüksekliğinde. */
const SPLAT = `${PRECISION}
uniform sampler2D uTarget;
uniform vec2 uTexel;
uniform vec2 uPoint;
uniform vec2 uRadius;
uniform float uAspect;
uniform vec3 uValue;
uniform int uMode;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 d = uv - uPoint;
  d.x *= uAspect;
  vec2 q = d / uRadius;
  float g = exp(-dot(q, q));
  vec3 add = uValue * g;
  if (uMode == 1) add = vec3(q * uValue.x * g, 0.0);
  if (uMode == 2) add = vec3(vec2(-q.y, q.x) * uValue.x * g, 0.0);
  o = texture(uTarget, uv) + vec4(add, 0.0);
}`;

/**
 * Yazının maskesinden mürekkep: dikdörtgenin içinde, kalemin cephesinin gerisinde e^(−(cephe−x)/kuyruk)
 * (kuyruk ≤ 0: bütün dikdörtgen eşit), renk dikdörtgen boyunca A'dan B'ye.
 */
const INJECT = `${PRECISION}
uniform sampler2D uTarget;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform vec4 uRect;
uniform vec2 uOffset;
uniform float uFront;
uniform float uTail;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec4 uSpan;
uniform float uAmount;
uniform float uHot;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 p = uv - uOffset;
  float m = texture(uMask, p).a;
  float inside = step(uRect.x, p.x) * step(p.x, uRect.z) * step(uRect.y, p.y) * step(p.y, uRect.w);
  float behind = uTail <= 0.0 ? 1.0 : (p.x <= uFront ? exp(-(uFront - p.x) / uTail) : 0.0);
  float k = clamp((p.x - uSpan.x) / max(uSpan.y - uSpan.x, 1e-5), 0.0, 1.0);
  vec3 c = mix(uColorA, uColorB, k);
  // Taze mürekkep beyaz-sıcak: kalemin ucunda (ya da dumana dönen yazıda) beyaza yakın, sonra renk.
  // Cephenin ilerisinde üs pozitif olur (taşar): yalnızca gerisinde hesaplanır.
  float fresh = uTail <= 0.0 ? 1.0 : (p.x <= uFront ? exp(-(uFront - p.x) / (0.3 * uTail)) : 0.0);
  c = mix(c, vec3(1.0), clamp(uHot * fresh, 0.0, 1.0));
  o = texture(uTarget, uv) + vec4(c * (m * inside * behind * uAmount), 0.0);
}`;

const BUOYANCY = `${PRECISION}
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform vec2 uTexel;
uniform float uDt;
uniform float uBuoyancy;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 d = texture(uDye, uv).rgb;
  float rho = max(d.r, max(d.g, d.b));
  o = texture(uVelocity, uv) + vec4(0.0, uDt * uBuoyancy * min(rho, 2.0), 0.0, 0.0);
}`;

const CURL = `${PRECISION}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  float l = texture(uVelocity, uv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, uv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVelocity, uv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, uv + vec2(0.0, uTexel.y)).x;
  o = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `${PRECISION}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uEpsilon;
uniform float uDt;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  float l = abs(texture(uCurl, uv - vec2(uTexel.x, 0.0)).x);
  float r = abs(texture(uCurl, uv + vec2(uTexel.x, 0.0)).x);
  float b = abs(texture(uCurl, uv - vec2(0.0, uTexel.y)).x);
  float t = abs(texture(uCurl, uv + vec2(0.0, uTexel.y)).x);
  float w = texture(uCurl, uv).x;
  vec2 grad = 0.5 * vec2(r - l, t - b);
  vec2 n = grad / (length(grad) + 1e-5);
  vec2 force = uEpsilon * w * vec2(n.y, -n.x);
  vec2 v = texture(uVelocity, uv).xy + uDt * force;
  o = vec4(clamp(v, -2000.0, 2000.0), 0.0, 1.0);
}`;

const DIVERGENCE = `${PRECISION}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  float l = texture(uVelocity, uv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, uv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, uv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, uv + vec2(0.0, uTexel.y)).y;
  o = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`;

const SCALE = `${PRECISION}
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uScale;
void main() {
  o = uScale * texture(uSource, gl_FragCoord.xy * uTexel);
}`;

/** Jacobi: p = (p_sol + p_sağ + p_alt + p_üst − ∇·u) / 4 (hücre aralığı 1). */
const PRESSURE = `${PRECISION}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  float l = texture(uPressure, uv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, uv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, uv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, uv + vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, uv).x;
  o = vec4(0.25 * (l + r + b + t - div), 0.0, 0.0, 1.0);
}`;

/**
 * u ← u − ∇p, ardından açık viskozite adımı u += k ∇²u (k = ν dt / h², `VISCOSITY_K`): ızgara
 * ölçeğindeki dama tahtası gürültüsü (en yüksek frekans, ∇² özdeğeri −8) her adımda 1 − 8k katına iner,
 * büyük girdaplar (özdeğer ≈ 0) korunur. k < 1/4: kararlı.
 */
const GRADIENT = `${PRECISION}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uViscosity;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  float l = texture(uPressure, uv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, uv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, uv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, uv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture(uVelocity, uv).xy;
  vec2 vl = texture(uVelocity, uv - vec2(uTexel.x, 0.0)).xy;
  vec2 vr = texture(uVelocity, uv + vec2(uTexel.x, 0.0)).xy;
  vec2 vb = texture(uVelocity, uv - vec2(0.0, uTexel.y)).xy;
  vec2 vt = texture(uVelocity, uv + vec2(0.0, uTexel.y)).xy;
  v += uViscosity * (vl + vr + vb + vt - 4.0 * v);
  v -= 0.5 * vec2(r - l, t - b);
  o = vec4(v, 0.0, 1.0);
}`;

/**
 * Işık huzmeleri (hacimsel ışık saçılması, Mitchell, GPU Gems 3 böl. 13): her pikselden ışık kaynağına
 * doğru N örnek yürünür, yoldaki parlak mürekkep (ışığa yakınlığıyla ağırlıklı) azalarak toplanır:
 * L(x) = Σ_i d^i · e(x + i·(L − x)·ρ/N). Söylenen kelimenin ucundaki taze mürekkep dumanın içinden
 * ışınlar saçar. Düşük çözünürlükte hesaplanır, görüntüde dumanın yoğunluğuyla saçılır.
 */
const RAYS = `${PRECISION}
uniform sampler2D uDye;
uniform vec2 uTexel;
uniform vec2 uLight;
uniform float uAspect;
uniform float uReach;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 stepUv = (uLight - uv) * (0.9 / 24.0);
  vec2 p = uv;
  float decay = 1.0;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    p += stepUv;
    vec3 c = texture(uDye, p).rgb;
    vec2 d = p - uLight;
    d.x *= uAspect;
    float near = exp(-dot(d, d) / (uReach * uReach));
    sum += c * near * decay;
    decay *= 0.95;
  }
  o = vec4(sum / 24.0, 1.0);
}`;

/**
 * Görüntü: mürekkebin yoğunluk eğiminden ışık (duman hacimli görünür), altın açılı 16 örnekli ışıma,
 * 1 − e^(−k c) ile ton eşleme (yoğun yer beyaza doyar, ince duman rengini gösterir), kenarlarda yumuşak
 * sönüş. Çıktı ön çarpılmış; saydamlık rengin %70'i: duman sahnenin üstünde ışık gibi parlar.
 */
const DISPLAY = `${PRECISION}
uniform sampler2D uDye;
uniform sampler2D uRays;
uniform vec2 uTexel;
uniform vec2 uDyeTexel;
uniform float uGlow;
uniform float uRaysGain;
float density(vec2 uv) {
  vec3 c = texture(uDye, uv).rgb;
  return max(c.r, max(c.g, c.b));
}
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 c = texture(uDye, uv).rgb;
  float dl = density(uv - vec2(uDyeTexel.x, 0.0));
  float dr = density(uv + vec2(uDyeTexel.x, 0.0));
  float db = density(uv - vec2(0.0, uDyeTexel.y));
  float dt = density(uv + vec2(0.0, uDyeTexel.y));
  vec3 n = normalize(vec3(dl - dr, db - dt, 0.3));
  float light = 0.55 + 0.6 * max(dot(n, normalize(vec3(-0.35, 0.6, 0.72))), 0.0);
  // Işıma yalnızca parlak yerden: yumuşak dizli eşik (eşik 0,5, diz 0,4); ince duman sis yapmaz.
  vec3 glow = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float r = (float(i) + 0.5) / 16.0;
    float a = float(i) * 2.39996323;
    float w = exp(-3.0 * r * r);
    vec3 s = texture(uDye, uv + 16.0 * r * vec2(cos(a), sin(a)) * uDyeTexel).rgb;
    float b = max(s.r, max(s.g, s.b));
    float soft = clamp(b - 0.1, 0.0, 0.8);
    soft = soft * soft / 1.6;
    glow += w * s * max(soft, b - 0.5) / max(b, 1e-4);
    total += w;
  }
  glow /= total;
  vec3 rays = texture(uRays, uv).rgb;
  float rho = max(c.r, max(c.g, c.b));
  vec3 col = 1.0 - exp(-(c * light * 2.6 + glow * uGlow + rays * uRaysGain * (0.5 + 3.0 * rho)));
  // Renk bantlaşmasın: piksel başına ±½ basamak titreşim.
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  float edge = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x)
    * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.88, uv.y);
  col *= edge;
  o = vec4(col, 0.7 * max(col.r, max(col.g, col.b)));
}`;

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface Pair {
  read: Target;
  write: Target;
}

type Programs = Record<
  | "advect"
  | "splat"
  | "inject"
  | "buoyancy"
  | "curl"
  | "vorticity"
  | "divergence"
  | "scale"
  | "pressure"
  | "gradient"
  | "rays"
  | "display",
  WebGLProgram
>;

/** Benzetimin boyutları (piksel). */
export interface InkSize {
  sim: [number, number];
  dye: [number, number];
}

/** Yazının maskesinin bir parçası (uv, maske dokusunda; alt sol 0). */
export interface MaskRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class InkRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs: Programs;
  private readonly uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private readonly mask: WebGLTexture;
  private velocity!: Pair;
  private dye!: Pair;
  private pressure!: Pair;
  private divergence!: Target;
  private curl!: Target;
  private rays!: Target;
  private size: InkSize = { sim: [1, 1], dye: [1, 1] };

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    if (!gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("ekran kartı kayan noktalı dokuya çizemiyor (EXT_color_buffer_float yok)");
    }
    const link = (source: string) => linkFullscreenProgram(gl, source);
    this.programs = {
      advect: link(ADVECT),
      splat: link(SPLAT),
      inject: link(INJECT),
      buoyancy: link(BUOYANCY),
      curl: link(CURL),
      vorticity: link(VORTICITY),
      divergence: link(DIVERGENCE),
      scale: link(SCALE),
      pressure: link(PRESSURE),
      gradient: link(GRADIENT),
      rays: link(RAYS),
      display: link(DISPLAY),
    };
    const mask = gl.createTexture();
    if (!mask) throw new Error("doku oluşturulamadı");
    this.mask = mask;
    gl.bindTexture(gl.TEXTURE_2D, mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.allocate(this.size);
  }

  /** Boyut değişince dokular yeniden ayrılır (akışkan temizlenir). */
  resize(size: InkSize): void {
    const same =
      size.sim[0] === this.size.sim[0] &&
      size.sim[1] === this.size.sim[1] &&
      size.dye[0] === this.size.dye[0] &&
      size.dye[1] === this.size.dye[1];
    if (same) return;
    this.release();
    this.allocate(size);
  }

  /** Akışkanı temizler (sarma: geçmiş bilinmez). */
  clear(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    for (const t of this.targets()) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  /** Yazının maskesi (satırın harfleri; tuvalin alfa kanalı) dokuya yüklenir. */
  setMask(source: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  /**
   * Maskeden mürekkep: `rect` içinde, kalemin cephesinin (`front`, uv) gerisinde `tail` ile azalan
   * (tail ≤ 0: eşit). `offset`: maskenin bu karedeki kayması (uv; satırın yay hareketi).
   */
  inject(options: {
    rect: MaskRect;
    span: [number, number];
    front: number;
    tail: number;
    colors: [Rgb, Rgb];
    amount: number;
    offset: [number, number];
    /** Beyaz-sıcaklık (0..1): kalemin ucunda ya da tail ≤ 0'da bütün dikdörtgende. */
    hot?: number;
  }): void {
    const { rect, span, colors } = options;
    const p = this.use("inject", this.dye.write);
    this.texture(p, "uTarget", 0, this.dye.read.texture);
    this.texture(p, "uMask", 1, this.mask);
    this.set(p, "uRect", (l) => this.gl.uniform4f(l, rect.x0, rect.y0, rect.x1, rect.y1));
    this.set(p, "uSpan", (l) => this.gl.uniform4f(l, span[0], span[1], 0, 0));
    this.set(p, "uOffset", (l) => this.gl.uniform2f(l, options.offset[0], options.offset[1]));
    this.set(p, "uFront", (l) => this.gl.uniform1f(l, options.front));
    this.set(p, "uTail", (l) => this.gl.uniform1f(l, options.tail));
    this.set(p, "uColorA", (l) => this.gl.uniform3f(l, ...colors[0]));
    this.set(p, "uColorB", (l) => this.gl.uniform3f(l, ...colors[1]));
    this.set(p, "uAmount", (l) => this.gl.uniform1f(l, options.amount));
    this.set(p, "uHot", (l) => this.gl.uniform1f(l, options.hot ?? 0));
    this.draw(this.dye);
  }

  /**
   * Hıza Gauss lekesi (uv nokta; yarıçap ekran yüksekliği biriminde, x ve y ayrı): `push` sabit hız
   * (hücre/sn), `radial` dışa, `swirl` döndürür (büyüklük hücre/sn).
   */
  impulse(
    kind: "push" | "radial" | "swirl",
    point: [number, number],
    radius: [number, number],
    value: [number, number],
  ): void {
    const p = this.use("splat", this.velocity.write);
    this.texture(p, "uTarget", 0, this.velocity.read.texture);
    this.set(p, "uPoint", (l) => this.gl.uniform2f(l, point[0], point[1]));
    this.set(p, "uRadius", (l) => this.gl.uniform2f(l, radius[0], radius[1]));
    this.set(p, "uAspect", (l) => this.gl.uniform1f(l, this.size.sim[0] / this.size.sim[1]));
    this.set(p, "uValue", (l) => this.gl.uniform3f(l, value[0], value[1], 0));
    this.set(p, "uMode", (l) =>
      this.gl.uniform1i(l, kind === "push" ? 0 : kind === "radial" ? 1 : 2),
    );
    this.draw(this.velocity);
  }

  /** Akışkanı `dt` saniye ilerletir (bkz. dosya başı). */
  step(dt: number, epsilon: number, buoyancy: number): void {
    if (dt <= 0) return;
    const gl = this.gl;
    const simTexel: [number, number] = [1 / this.size.sim[0], 1 / this.size.sim[1]];

    let p = this.use("buoyancy", this.velocity.write);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    this.texture(p, "uDye", 1, this.dye.read.texture);
    this.set(p, "uDt", (l) => gl.uniform1f(l, dt));
    this.set(p, "uBuoyancy", (l) => gl.uniform1f(l, buoyancy));
    this.draw(this.velocity);

    p = this.use("curl", this.curl);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    p = this.use("vorticity", this.velocity.write);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    this.texture(p, "uCurl", 1, this.curl.texture);
    this.set(p, "uEpsilon", (l) => gl.uniform1f(l, epsilon));
    this.set(p, "uDt", (l) => gl.uniform1f(l, dt));
    this.draw(this.velocity);

    this.project();

    p = this.use("advect", this.velocity.write);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    this.texture(p, "uSource", 1, this.velocity.read.texture);
    this.set(p, "uSimTexel", (l) => gl.uniform2f(l, simTexel[0], simTexel[1]));
    this.set(p, "uDt", (l) => gl.uniform1f(l, dt));
    this.set(p, "uDecay", (l) => gl.uniform1f(l, decayFactor(VELOCITY_HALF_LIFE, dt)));
    this.draw(this.velocity);

    p = this.use("advect", this.dye.write);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    this.texture(p, "uSource", 1, this.dye.read.texture);
    this.set(p, "uSimTexel", (l) => gl.uniform2f(l, simTexel[0], simTexel[1]));
    this.set(p, "uDt", (l) => gl.uniform1f(l, dt));
    this.set(p, "uDecay", (l) => gl.uniform1f(l, decayFactor(DYE_HALF_LIFE, dt)));
    this.draw(this.dye);
  }

  /** Hızı ıraksaksız yapar: ∇·u, ∇²p = ∇·u (Jacobi), u ← u − ∇p. */
  project(iterations = PRESSURE_ITERATIONS): void {
    const gl = this.gl;
    let p = this.use("divergence", this.divergence);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Önceki karenin basıncından başla (yakınsamayı hızlandırır, akış kareler arasında sürekli).
    p = this.use("scale", this.pressure.write);
    this.texture(p, "uSource", 0, this.pressure.read.texture);
    this.set(p, "uScale", (l) => gl.uniform1f(l, PRESSURE_WARM));
    this.draw(this.pressure);

    p = this.use("pressure", this.pressure.write);
    this.texture(p, "uDivergence", 1, this.divergence.texture);
    for (let i = 0; i < iterations; i++) {
      this.use("pressure", this.pressure.write);
      this.texture(p, "uPressure", 0, this.pressure.read.texture);
      this.draw(this.pressure);
    }

    p = this.use("gradient", this.velocity.write);
    this.texture(p, "uPressure", 0, this.pressure.read.texture);
    this.texture(p, "uVelocity", 1, this.velocity.read.texture);
    this.set(p, "uViscosity", (l) => gl.uniform1f(l, VISCOSITY_K));
    this.draw(this.velocity);
  }

  /**
   * Mürekkebi tuvale çizer (ön çarpılmış saydamlık). `light`: ışık huzmelerinin kaynağı (uv) ve gücü
   * (0: huzme yok).
   */
  render(
    width: number,
    height: number,
    glow: number,
    light: { point: [number, number]; strength: number; reach: number },
  ): void {
    const gl = this.gl;
    if (light.strength > 0) {
      const rp = this.use("rays", this.rays);
      this.texture(rp, "uDye", 0, this.dye.read.texture);
      this.set(rp, "uLight", (l) => gl.uniform2f(l, light.point[0], light.point[1]));
      this.set(rp, "uAspect", (l) => gl.uniform1f(l, this.size.dye[0] / this.size.dye[1]));
      this.set(rp, "uReach", (l) => gl.uniform1f(l, light.reach));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    const p = this.programs.display;
    gl.useProgram(p);
    this.set(p, "uTexel", (l) => gl.uniform2f(l, 1 / width, 1 / height));
    this.set(p, "uDyeTexel", (l) => gl.uniform2f(l, 1 / this.size.dye[0], 1 / this.size.dye[1]));
    this.set(p, "uGlow", (l) => gl.uniform1f(l, glow));
    this.set(p, "uRaysGain", (l) => gl.uniform1f(l, 16 * light.strength));
    this.texture(p, "uDye", 0, this.dye.read.texture);
    this.texture(p, "uRays", 1, this.rays.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Denetim için: hız alanının ıraksaklığının kare ortalamasının kökü (hücre/sn/hücre). Okuma ekran
   * kartını bekletir; yalnızca ölçümde çağrılır.
   */
  divergenceRms(): number {
    const gl = this.gl;
    const p = this.use("divergence", this.divergence);
    this.texture(p, "uVelocity", 0, this.velocity.read.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const [w, h] = this.size.sim;
    const data = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);
    let sum = 0;
    // Kenar hücreleri dışarıda: açık sınırda ıraksaklık serbesttir.
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) sum += data[(y * w + x) * 4]! ** 2;
    return Math.sqrt(sum / Math.max(1, (w - 2) * (h - 2)));
  }

  /** Denetim için: mürekkebin toplamı ve sonlu olmayan değer var mı. */
  dyeStats(): { total: number; finite: boolean } {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.read.framebuffer);
    const [w, h] = this.size.dye;
    const data = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);
    let total = 0;
    let finite = true;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i]! + data[i + 1]! + data[i + 2]!;
      if (!Number.isFinite(v)) finite = false;
      else total += v;
    }
    return { total, finite };
  }

  dispose(): void {
    this.release();
    this.gl.deleteTexture(this.mask);
    for (const p of Object.values(this.programs)) this.gl.deleteProgram(p);
  }

  // ---------- iç işler ----------

  private allocate(size: InkSize): void {
    this.size = size;
    const [sw, sh] = size.sim;
    const [dw, dh] = size.dye;
    this.velocity = this.pair(sw, sh);
    this.pressure = this.pair(sw, sh);
    this.dye = this.pair(dw, dh);
    this.divergence = this.target(sw, sh);
    this.curl = this.target(sw, sh);
    this.rays = this.target(Math.max(8, Math.round(dw / 3)), Math.max(8, Math.round(dh / 3)));
    this.clear();
  }

  private targets(): Target[] {
    return [
      this.velocity.read,
      this.velocity.write,
      this.pressure.read,
      this.pressure.write,
      this.dye.read,
      this.dye.write,
      this.divergence,
      this.curl,
      this.rays,
    ];
  }

  private release(): void {
    for (const t of this.targets()) {
      this.gl.deleteTexture(t.texture);
      this.gl.deleteFramebuffer(t.framebuffer);
    }
  }

  private pair(width: number, height: number): Pair {
    return { read: this.target(width, height), write: this.target(width, height) };
  }

  private target(width: number, height: number): Target {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("doku oluşturulamadı");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("ekran kartı akışkan dokusuna çizemiyor");
    }
    return { texture, framebuffer, width, height };
  }

  /** Programı seçer, hedefe bağlar, `uTexel`'i hedefin pikseline ayarlar. */
  private use(name: keyof Programs, target: Target): WebGLProgram {
    const gl = this.gl;
    const p = this.programs[name];
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    this.set(p, "uTexel", (l) => gl.uniform2f(l, 1 / target.width, 1 / target.height));
    return p;
  }

  /** Çift hedefe çizer ve okunanla yazılanı değiştirir. */
  private draw(pair: Pair): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    const read = pair.read;
    pair.read = pair.write;
    pair.write = read;
  }

  private texture(p: WebGLProgram, name: string, unit: number, texture: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.set(p, name, (l) => gl.uniform1i(l, unit));
  }

  private set(
    p: WebGLProgram,
    name: string,
    apply: (location: WebGLUniformLocation) => void,
  ): void {
    let table = this.uniforms.get(p);
    if (!table) {
      table = new Map();
      this.uniforms.set(p, table);
    }
    let location = table.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(p, name);
      table.set(name, location);
    }
    if (location) apply(location);
  }
}
