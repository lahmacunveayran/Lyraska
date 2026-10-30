/**
 * Yeni sahnelerin (sahneler v2) ortak son işlem zincirinin saf hesapları ve gölgelendiricileri
 * (`postChain.ts` ekran kartında çalıştırır). Sıra: sahne kayan noktalı dokuya (doğrusal ışık,
 * sınırsız HDR) çizilir → ışık taşması (bloom; küçülen–büyüyen görüntü zinciri) → pozlama → ton
 * eşleme → renk sıcaklığı → vinyet → mavi gürültü titretmesi ve ince gren.
 *
 * Teknikler (kod özgündür, yalnızca yöntemler alınmıştır): bloom zinciri Jorge Jimenez,
 * "Next Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH 2014; 13 dokunuşlu
 * küçültme, 3×3 çadır büyütme, ilk küçültmede Karis ortalaması); titretme Ulichney'in
 * "void-and-cluster" mavi gürültüsü (`blueNoise.ts`); ton eğrisi en büyük kanal üzerinde, tonu
 * koruyan yumuşak omuz (çok parlak ışık beyaza döner).
 *
 * Zincir ilk kez `sahne-sonislem` dalında galeri sahneleri için yazıldı; galeri sahneleri bugün
 * zincirsiz çizilir (davranışları değişmedi), zinciri yeni sahneler kullanır. Parlaklığın
 * yönetimi (pozlama, bloom payı) sahnenin kurgusundadır: Epilepsi güvenli modunun kuralları da
 * orada, yapının içindedir (bkz. `lightShow.ts`). Zincirin kendisi parlaklık değişimini büyütmez:
 * ton eğrisinin eğimi hiçbir yerde 1'i geçmez, renk sıcaklığı bağıl parlaklığı korur, vinyet sabit,
 * gren ve titretme ±2 kod değeri.
 */

/** Ton eğrisinin doğrusal kaldığı üst sınır (doğrusal ışıkta): bunun altı olduğu gibi kalır. */
export const TONE_KNEE = 0.7;
/** Omuzda tonu korurken beyaza doğru en fazla ağartma payı (parlaklık korunur). */
export const TONE_DESATURATE = 0.35;

/**
 * Ton eğrisi (doğrusal ışık, 0..∞ → 0..1): `TONE_KNEE`'ye kadar birebir, sonra üstel bir omuzla
 * 1'e yaklaşır. Sürekli, eğimi sürekli (dizde 1), tekdüze artan, eğimi ≤ 1, değeri < 1.
 */
export function toneCurve(x: number): number {
  if (!(x > 0)) return 0;
  if (x <= TONE_KNEE) return x;
  const span = 1 - TONE_KNEE;
  return TONE_KNEE + span * (1 - Math.exp(-(x - TONE_KNEE) / span));
}

export type Rgb = [number, number, number];

/** Rec. 709 / sRGB bağıl parlaklık katsayıları. */
export const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

export function luminance([r, g, b]: Rgb): number {
  return LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
}

/**
 * Rengi ton eşler: eğri en büyük kanala uygulanır, kanallar aynı oranda ölçeklenir (renk tonu ve
 * doygunluk korunur). Omuzda sıkıştırılan ölçüde renk, parlaklığı aynı kalarak biraz ağarır
 * (çok parlak doygun ışık beyaza döner gibi; AgX'in davranışına benzer). Sonucun bağıl parlaklığı
 * hiçbir zaman girişinkini aşmaz.
 */
export function toneMap(rgb: Rgb): Rgb {
  const clean = (v: number) => (Number.isNaN(v) ? 0 : Math.max(0, v));
  const r = clean(rgb[0]);
  const g = clean(rgb[1]);
  const b = clean(rgb[2]);
  const peak = Math.max(r, g, b);
  if (!(peak > 0) || !Number.isFinite(peak)) return Number.isFinite(peak) ? [0, 0, 0] : [1, 1, 1];
  const mapped = toneCurve(peak);
  const ratio = mapped / peak;
  const c: Rgb = [r * ratio, g * ratio, b * ratio];
  const y = luminance(c);
  const bleach = TONE_DESATURATE * (1 - ratio);
  return [c[0] + (y - c[0]) * bleach, c[1] + (y - c[1]) * bleach, c[2] + (y - c[2]) * bleach];
}

/** sRGB kod değerinden doğrusal ışığa (1'in üstünde de aynı formülle sürer: taşan ışık). */
export function srgbToLinear(v: number): number {
  if (!(v > 0)) return 0;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Doğrusal ışıktan sRGB kod değerine (0..1). */
export function linearToSrgb(v: number): number {
  const x = Math.max(0, Math.min(1, v));
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
}

/** Bloom'a giren ışığın eşiği ve yumuşak dizi (doğrusal ışık, en büyük kanal). */
export const BLOOM_THRESHOLD = 0.04;
export const BLOOM_KNEE = 0.04;
/** Bloom zincirindeki en fazla seviye (yarım çözünürlükten başlayarak her biri yarı boyda). */
export const BLOOM_MAX_LEVELS = 6;
/** En küçük seviyenin kısa kenarı en az bu kadar piksel. */
export const BLOOM_MIN_SIZE = 8;

/**
 * Bloom'a giren pay (doğrusal ışık, en büyük kanal `peak` için): eşiğin altında 0, yumuşak bir
 * dizle eşiğin üstünde `peak − eşik`. Tekdüze artar, eğimi ≤ 1, değeri ≤ `peak`.
 */
export function bloomPrefilter(peak: number): number {
  if (!(peak > 0)) return 0;
  const soft = Math.min(Math.max(peak - BLOOM_THRESHOLD + BLOOM_KNEE, 0), 2 * BLOOM_KNEE);
  return Math.max((soft * soft) / (4 * BLOOM_KNEE), peak - BLOOM_THRESHOLD);
}

/** Görüntünün boyutu için bloom seviye sayısı (en az 1). */
export function bloomLevelCount(width: number, height: number): number {
  let w = Math.max(1, Math.floor(width / 2));
  let h = Math.max(1, Math.floor(height / 2));
  let levels = 1;
  while (levels < BLOOM_MAX_LEVELS && Math.min(w, h) / 2 >= BLOOM_MIN_SIZE) {
    w = Math.floor(w / 2);
    h = Math.floor(h / 2);
    levels++;
  }
  return levels;
}

/**
 * Büyütme zincirinin her seviyeye verdiği son ağırlık. Zincir en küçükten başlar; her adımda
 * `seviye_i ← (1 − s)·küçültülmüş_i + s·büyütülmüş_(i+1)` (ekran kartında sabit renkli karışım).
 * Ağırlıklar `(1 − s)·s^i`, sonuncusu `s^(n−1)`: toplamları her `s` için tam 1'dir.
 */
export function bloomLevelWeights(spread: number, levels: number): number[] {
  const s = Math.max(0, Math.min(1, spread));
  const n = Math.max(1, Math.floor(levels));
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? s ** i : (1 - s) * s ** i));
}

/** 13 dokunuşlu küçültmenin beş 2×2 kutusunun ağırlıkları (orta 0,5, köşeler 0,125'er). */
export const DOWNSAMPLE_BOX_WEIGHTS = [0.5, 0.125, 0.125, 0.125, 0.125];
/** 3×3 çadır süzgeci (büyütme): köşe 1, kenar 2, orta 4; toplam 16. */
export const TENT_WEIGHTS = [1, 2, 1, 2, 4, 2, 1, 2, 1].map((w) => w / 16);

/** Renk sıcaklığının en büyük etkisi (kırmızı ve mavi kanalın bağıl değişimi). */
export const WARMTH_STRENGTH = 0.05;
/** Sıcaklığın yumuşatma süresi (saniye): bölüm değişiminde renk yavaşça döner. */
export const WARMTH_SECONDS = 3;

/**
 * Renk sıcaklığı katsayıları: 0 soğuk … 0,5 nötr … 1 sıcak. Kırmızı ve mavi zıt yönde değişir,
 * sonra üçü birlikte ölçeklenir ki bağıl parlaklık (gri bir yüzeyde) aynı kalsın.
 */
export function warmthGains(warmth: number): Rgb {
  const w = Number.isFinite(warmth) ? Math.max(0, Math.min(1, warmth)) : 0.5;
  const t = (w - 0.5) * 2 * WARMTH_STRENGTH;
  const raw: Rgb = [1 + t, 1, 1 - t];
  const norm = 1 / luminance(raw);
  return [raw[0] * norm, raw[1] * norm, raw[2] * norm];
}

/** Sıcaklığı `WARMTH_SECONDS` içinde hedefe yaklaştırır. */
export function smoothWarmth(current: number, target: number, dt: number): number {
  const goal = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0.5;
  const step = Math.max(0, Math.min(dt, 0.25));
  return current + (goal - current) * (1 - Math.exp(-step / WARMTH_SECONDS));
}

/** Titretmenin genliği (kod değeri; ±yarısı) ve grenin en büyük genliği (±, kod değeri). */
export const DITHER_CODES = 1;
export const GRAIN_CODES = 1.5;

/**
 * Grenin parlaklığa göre genliği (0..1): ara tonlarda en çok, siyahta ve beyazda yok (film greni
 * gibi). Toplam oynama `DITHER_CODES / 2 + GRAIN_CODES` = 2 kod değerini geçmez.
 */
export function grainAmount(luma: number): number {
  const l = Math.max(0, Math.min(1, luma));
  return 4 * l * (1 - l);
}

// ---------------------------------------------------------------------------------------------
// Dinamik çözünürlük: sahne gölgelendiricisi tuvalin %60–100'ünde çizilir; son işlem tam boyda.

export const RESOLUTION_MIN = 0.6;
export const RESOLUTION_MAX = 1;
/** Ölçek bu adımlarla değişir (dokular yalnızca değişince yeniden kurulur). */
export const RESOLUTION_STEP_DOWN = 0.1;
export const RESOLUTION_STEP_UP = 0.05;
/** Kare süresi ekran yenilemesinin bu katını aşarsa yük fazla, bunun altındaysa boşluk var. */
export const RESOLUTION_OVER = 1.2;
export const RESOLUTION_UNDER = 1.08;
/** Düşürmeden önce yükün, yükseltmeden önce boşluğun sürmesi gereken süre (saniye). */
export const RESOLUTION_DOWN_AFTER = 0.75;
export const RESOLUTION_UP_AFTER = 4;
/** Her değişimden sonra bekleme (saniye): ölçek hızlı gidip gelmez. */
export const RESOLUTION_COOLDOWN = 2;
/** Bundan uzun kare aralığı ölçüme girmez (sekme gizli, uyku, boşta seyrek çizim). */
export const RESOLUTION_IGNORE_MS = 250;

/**
 * Yenileme tahmininin yukarı kayma hızı (kare başına pay): çok yavaş, ki sürekli yük altında
 * (ör. 60 Hz ekranda 30 kare) program ekranı 30 Hz sanıp çözünürlüğü yeniden yükseltmesin.
 * Bedeli: 144 Hz'ten 60 Hz ekrana geçince tahmin dakikalar içinde düzelir, bu sürede sahne
 * düşük ölçekte çizilir (yalnızca keskinlik kaybı).
 */
const REFRESH_DRIFT = 0.00005;

export interface ResolutionState {
  scale: number;
  /** Kare süresinin üstel ortalaması (ms). */
  frameMs: number;
  /** Ekran yenileme süresinin tahmini (kare sürelerinin alt zarfı, ms). */
  refreshMs: number;
  over: number;
  under: number;
  cooldown: number;
}

export const RESOLUTION_AT_START: ResolutionState = {
  scale: RESOLUTION_MAX,
  frameMs: 1000 / 60,
  refreshMs: 1000 / 60,
  over: 0,
  under: 0,
  cooldown: RESOLUTION_COOLDOWN,
};

/**
 * Ölçülen kare süresiyle (ms; iki çizim arası gerçek süre) çözünürlük ölçeğini günceller.
 * Yük `RESOLUTION_DOWN_AFTER` saniye sürerse ölçek bir adım düşer, boşluk `RESOLUTION_UP_AFTER`
 * saniye sürerse yarım adım çıkar; her değişimden sonra `RESOLUTION_COOLDOWN` saniye beklenir
 * (histerezis: eşikler ve süreler farklı, ölçek salınmaz). Ekran yenilemesi kare sürelerinin
 * alt zarfından tahmin edilir (60, 120, 144 Hz…); boşta seyrek çizim ölçüme girmez.
 */
export function stepResolution(prev: ResolutionState, frameMs: number): ResolutionState {
  if (!(frameMs > 0) || frameMs > RESOLUTION_IGNORE_MS) return prev;
  const refreshMs = Math.max(
    1000 / 240,
    Math.min(
      1000 / 30,
      frameMs < prev.refreshMs
        ? prev.refreshMs + (frameMs - prev.refreshMs) * 0.1
        : prev.refreshMs + (frameMs - prev.refreshMs) * REFRESH_DRIFT,
    ),
  );
  const avg = prev.frameMs + (frameMs - prev.frameMs) * 0.1;
  const seconds = frameMs / 1000;
  const cooldown = Math.max(0, prev.cooldown - seconds);
  const over = avg > refreshMs * RESOLUTION_OVER ? prev.over + seconds : 0;
  const under = avg < refreshMs * RESOLUTION_UNDER ? prev.under + seconds : 0;
  let scale = prev.scale;
  if (cooldown === 0 && over >= RESOLUTION_DOWN_AFTER && scale > RESOLUTION_MIN) {
    scale = Math.max(RESOLUTION_MIN, roundStep(scale - RESOLUTION_STEP_DOWN));
  } else if (cooldown === 0 && under >= RESOLUTION_UP_AFTER && scale < RESOLUTION_MAX) {
    scale = Math.min(RESOLUTION_MAX, roundStep(scale + RESOLUTION_STEP_UP));
  }
  const changed = scale !== prev.scale;
  return {
    scale,
    frameMs: avg,
    refreshMs,
    over: changed ? 0 : over,
    under: changed ? 0 : under,
    cooldown: changed ? RESOLUTION_COOLDOWN : cooldown,
  };
}

function roundStep(scale: number): number {
  return Math.round(scale * 20) / 20;
}

/** Ölçekle sahne dokusunun boyutu (en az 1 piksel). */
export function scaledSize(width: number, height: number, scale: number) {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// ---------------------------------------------------------------------------------------------
// Gölgelendiriciler. GLSL metinleri TypeScript şablonunda: yorumlarda ters tırnak kullanılmaz.

const f = (x: number) => x.toFixed(6);

const POST_HEADER = `#version 300 es
precision highp float;
out vec4 outColor;
const vec3 LUMA = vec3(${LUMA.map(f).join(", ")});
`;

/**
 * Küçültme: 13 dokunuşlu süzgeç (beş örtüşen 2×2 kutu). `uKaris` 1 iken (ilk küçültme) yalnızca
 * eşik üstü ışık alınır ve her kutu 1/(1+parlaklık) ağırlığıyla ortalanır: tek piksellik parlak
 * noktalar (yıldız kırpışması) bloom'u kıpırdatmaz.
 */
export const DOWNSAMPLE_SHADER = `${POST_HEADER}
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uTarget;
uniform float uKaris;

vec3 tap(vec2 uv) {
  vec4 texel4 = texture(uSource, uv);
  if (uKaris < 0.5) return texel4.rgb;
  // Sahnenin müzikten bağımsız (en sönük çarpanlı) hâli: alfa kanalındaki oran.
  vec3 c = texel4.rgb * clamp(texel4.a, 0.0, 1.0);
  // İlk küçültme: yalnızca eşiğin üstündeki ışık bloom'a girer (yumuşak diz).
  float peak = max(c.r, max(c.g, c.b));
  float soft = clamp(peak - ${f(BLOOM_THRESHOLD - BLOOM_KNEE)}, 0.0, ${f(2 * BLOOM_KNEE)});
  float pass = max(soft * soft / ${f(4 * BLOOM_KNEE)}, peak - ${f(BLOOM_THRESHOLD)});
  return c * (pass / max(peak, 1e-5));
}

float karis(vec3 c) {
  return mix(1.0, 1.0 / (1.0 + dot(c, LUMA)), uKaris);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec2 t = uTexel;
  vec3 a = tap(uv + t * vec2(-2.0, 2.0));
  vec3 b = tap(uv + t * vec2(0.0, 2.0));
  vec3 c = tap(uv + t * vec2(2.0, 2.0));
  vec3 d = tap(uv + t * vec2(-2.0, 0.0));
  vec3 e = tap(uv);
  vec3 f = tap(uv + t * vec2(2.0, 0.0));
  vec3 g = tap(uv + t * vec2(-2.0, -2.0));
  vec3 h = tap(uv + t * vec2(0.0, -2.0));
  vec3 i = tap(uv + t * vec2(2.0, -2.0));
  vec3 j = tap(uv + t * vec2(-1.0, 1.0));
  vec3 k = tap(uv + t * vec2(1.0, 1.0));
  vec3 l = tap(uv + t * vec2(-1.0, -1.0));
  vec3 m = tap(uv + t * vec2(1.0, -1.0));
  vec3 box0 = (j + k + l + m) * 0.25;
  vec3 box1 = (a + b + d + e) * 0.25;
  vec3 box2 = (b + c + e + f) * 0.25;
  vec3 box3 = (d + e + g + h) * 0.25;
  vec3 box4 = (e + f + h + i) * 0.25;
  float w0 = ${f(DOWNSAMPLE_BOX_WEIGHTS[0]!)} * karis(box0);
  float w1 = ${f(DOWNSAMPLE_BOX_WEIGHTS[1]!)} * karis(box1);
  float w2 = ${f(DOWNSAMPLE_BOX_WEIGHTS[2]!)} * karis(box2);
  float w3 = ${f(DOWNSAMPLE_BOX_WEIGHTS[3]!)} * karis(box3);
  float w4 = ${f(DOWNSAMPLE_BOX_WEIGHTS[4]!)} * karis(box4);
  vec3 sum = box0 * w0 + box1 * w1 + box2 * w2 + box3 * w3 + box4 * w4;
  outColor = vec4(sum / (w0 + w1 + w2 + w3 + w4), 1.0);
}`;

/** Büyütme: 3×3 çadır süzgeci; sonuç sabit renkli karışımla bir üst seviyeye katılır. */
export const UPSAMPLE_SHADER = `${POST_HEADER}
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uTarget;

void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec2 t = uTexel;
  vec3 sum = texture(uSource, uv).rgb * 4.0;
  sum += (texture(uSource, uv + vec2(t.x, 0.0)).rgb + texture(uSource, uv - vec2(t.x, 0.0)).rgb
    + texture(uSource, uv + vec2(0.0, t.y)).rgb + texture(uSource, uv - vec2(0.0, t.y)).rgb) * 2.0;
  sum += texture(uSource, uv + t).rgb + texture(uSource, uv - t).rgb
    + texture(uSource, uv + vec2(t.x, -t.y)).rgb + texture(uSource, uv + vec2(-t.x, t.y)).rgb;
  outColor = vec4(sum / 16.0, 1.0);
}`;

/**
 * Vinyetin kenardaki en büyük kararması (0..1): görüntünün köşesinde ışık bu kadar azalır. Sabittir
 * (müzikle değişmez); bakışı ortaya toplar.
 */
export const VIGNETTE_MAX = 0.6;

/**
 * Vinyet katsayısı: görüntünün ortasında 1, köşesinde `1 − amount`. `x`, `y`: ortadan uzaklık
 * (−1..1, kısa kenara göre değil, her eksen kendi yarı boyuna göre).
 */
export function vignette(x: number, y: number, amount: number): number {
  const a = Math.max(0, Math.min(VIGNETTE_MAX, Number.isFinite(amount) ? amount : 0));
  const r2 = Math.min(1, (x * x + y * y) / 2);
  return 1 - a * r2 * r2;
}

/**
 * Son geçiş (tuvalin tam boyunda): sahne ve bloom karışır, pozlamayla çarpılır, ton eşlenir,
 * sıcaklık ve vinyet uygulanır, sRGB'ye çevrilir; mavi gürültüyle titretilir ve ince gren eklenir.
 */
export const COMPOSITE_SHADER = `${POST_HEADER}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uNoise;
uniform vec2 uTarget;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform vec3 uWarmth;
uniform vec2 uNoiseShift;
uniform float uNoisePhase;

float toneCurve(float x) {
  if (x <= ${f(TONE_KNEE)}) return max(x, 0.0);
  float span = ${f(1 - TONE_KNEE)};
  return ${f(TONE_KNEE)} + span * (1.0 - exp(-(x - ${f(TONE_KNEE)}) / span));
}

vec3 toneMap(vec3 c) {
  c = max(c, vec3(0.0));
  float peak = max(c.r, max(c.g, c.b));
  if (peak <= 0.0) return vec3(0.0);
  float ratio = toneCurve(peak) / peak;
  c *= ratio;
  float y = dot(c, LUMA);
  return mix(c, vec3(y), ${f(TONE_DESATURATE)} * (1.0 - ratio));
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float blue(vec2 shift) {
  ivec2 at = ivec2(mod(gl_FragCoord.xy + shift, 64.0));
  return fract(texelFetch(uNoise, at, 0).r + uNoisePhase);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uTarget;
  vec3 scene = texture(uScene, uv).rgb;
  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 light = toneMap((scene + bloom * uBloomStrength) * uExposure);
  // Sıcaklık bağıl parlaklığı korur; ton eşlemeden sonra uygulanır ki parlak noktalar kaymasın.
  vec2 v = uv * 2.0 - 1.0;
  float r2 = min(1.0, dot(v, v) * 0.5);
  light = clamp(light * uWarmth * (1.0 - uVignette * r2 * r2), 0.0, 1.0);
  vec3 col = toSrgb(light);
  float luma = dot(col, LUMA);
  float dither = (blue(vec2(0.0)) - 0.5) * ${f(DITHER_CODES)};
  float grain = (blue(uNoiseShift) - 0.5) * 2.0 * ${f(GRAIN_CODES)} * 4.0 * luma * (1.0 - luma);
  col += (dither + grain) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/**
 * Sahne dokusunun boyu: tuval önce en fazla `maxPixels` piksele indirilir (ekranın piksel
 * yoğunluğundan bağımsız; 1440p ya da 4K dizüstünde de sahnenin yükü aynı kalır), sonra dinamik
 * çözünürlüğün ölçeğiyle küçültülür. En-boy oranı korunur.
 */
export function sceneTargetSize(width: number, height: number, maxPixels: number, scale: number) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cap = Math.min(1, Math.sqrt(Math.max(1, maxPixels) / (w * h)));
  const s = Number.isFinite(scale) ? Math.max(0.1, Math.min(1, scale)) : 1;
  return scaledSize(w, h, cap * s);
}
