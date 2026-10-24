import { SHADER_LEVEL_FLOOR, type ShaderSceneId } from "./shaderScene";

/**
 * Gölgelendirici sahnelerinin GLSL kaynakları. Her sahne yalnızca `vec3 scene(vec2 uv, vec2 p)`
 * yazar: ışığın rengi ve biçimi (arka plan rengi eklenmeden). Ortak gövde ([`fragmentSource`])
 * arka planı ekler, parlaklık çarpanını uygular, durgun titreme gürültüsüyle renk bantlaşmasını
 * önler ve sonucu sınırlar.
 *
 * Değişkenler: `uv` 0..1 ekran konumu, `p` ekranın ortasına göre konum (yükseklik = 1).
 * `uTime` akış saati (vuruşlarla hızlanır, gerilimde yavaşlar), `uTwinkle` kırpışma saati,
 * `uEnergy` bas/orta/tiz (yumuşak; güvenli modda hız sınırlı), `uTension` drop öncesi gerilim, `uBloom` drop açılımı,
 * `uRipple` son ölçü başından beri geçen saniye, `uLow`/`uHigh` bölüm temasının renkleri.
 *
 * Kural (tasarım): sahne parlaklığı doğrudan müziğe bağlamaz. Enerjiler biçimi
 * (dalga boyu, yoğunluk) en fazla birkaç yüzde değiştirir; parlaklık çarpanı ortak gövdededir.
 * Ekranın büyük bir alanını kaplayan yüksek karşıtlıklı, yinelenen desen (halka, şerit) akmaz:
 * parlama penceresinde ortalama parlaklık sabit kalsın diye desenler ince ve düzensizdir.
 */

const PRELUDE = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTwinkle;
uniform vec3 uEnergy;
uniform float uLevel;
uniform float uTension;
uniform float uBloom;
uniform float uRipple;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uBack;
out vec4 outColor;

const float PI = 3.14159265;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

/** Beş katmanlı gürültü (0..1); her katman döndürülür ki ızgara görünmesin. */
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 m = rot(0.5);
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = m * p * 2.02 + 17.1;
    amp *= 0.5;
  }
  return sum / 0.96875;
}

float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise3(p);
    p = p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

/** Gökte seyrek, kırpışan yıldızlar (0..1). */
float stars(vec2 p, float scale) {
  vec2 g = p * scale;
  vec2 cell = floor(g);
  float h = hash12(cell);
  vec2 at = hash22(cell + 7.0) * 0.6 + 0.2;
  float d = length(fract(g) - at);
  float twinkle = 0.75 + 0.25 * sin(uTwinkle * (1.5 + 2.0 * h) + h * 60.0);
  return step(0.965, h) * smoothstep(0.09, 0.0, d) * twinkle * (0.4 + 0.6 * fract(h * 37.0));
}
`;

const SCENES: Record<ShaderSceneId, string> = {
  // Ay, ufukta tema renginde parıltı; denizde ayın yolu dalgaların eğimiyle kırılır. Bas dalgaları
  // büyütür; parıltılar ince ve düzensiz olduğundan geniş bir alanın parlaklığı sabit kalır.
  sea: `
vec3 scene(vec2 uv, vec2 p) {
  float horizon = -0.1;
  vec2 moon = vec2(0.34 * uResolution.x / uResolution.y - 0.25, 0.24);
  vec3 moonLight = mix(uHigh, vec3(1.0), 0.6);
  vec3 col = vec3(0.0);
  if (p.y > horizon) {
    float h = p.y - horizon;
    col += uHigh * 0.09 * exp(-h * 5.0);
    float d = length(p - moon);
    col += vec3(0.86, 0.89, 0.95) * smoothstep(0.066, 0.06, d);
    col += moonLight * (0.09 * exp(-d * 9.0) + 0.03 * exp(-d * 2.5));
    col += vec3(0.85) * stars(p, 70.0) * smoothstep(0.02, 0.3, h) * smoothstep(0.08, 0.2, d);
  } else {
    float depth = horizon - p.y;
    float z = 0.1 / max(depth, 0.003);
    float swell = 0.6 + 0.4 * uEnergy.x + 0.3 * uBloom;
    vec2 w = vec2(p.x * z * 1.4, z * 3.0);
    float waves = fbm(w * 0.9 + vec2(uTime * 0.12, uTime * 0.4));
    float slope = (waves - 0.5) * swell;
    float spread = 0.025 + 0.16 * depth + 0.03 * swell;
    float dx = (p.x - moon.x + slope * 0.25 * (0.2 + depth)) / spread;
    float path = exp(-dx * dx);
    float glint = smoothstep(0.58, 0.85, noise(w * 5.0 + vec2(slope * 3.0, uTime * 0.9)));
    col += moonLight * path * (0.12 + 0.6 * glint) * exp(-depth * 1.0);
    col += mix(uLow, uHigh, 0.5) * 0.06 * smoothstep(0.45, 0.8, waves) * exp(-depth * 1.5);
    col += uHigh * 0.08 * exp(-depth * 18.0);
  }
  return col;
}`,

  // Alan bükmeli gürültüden renkli toz bulutları; gerilimde bulutsu içine çekilir, açılımda
  // genişler. Bulut seyrek yerlerde yıldızları gösterir.
  nebula: `
vec3 scene(vec2 uv, vec2 p) {
  float zoom = 1.5 + 0.35 * uTension - 0.3 * uBloom;
  vec2 q = rot(uTime * 0.015) * p * zoom;
  float t = uTime * 0.045;
  vec2 warp = vec2(fbm(q * 1.3 + vec2(t, -t * 0.7)), fbm(q * 1.3 + vec2(5.2 - t * 0.6, 1.3 + t)));
  float n = fbm(q * 1.7 + 2.4 * warp + vec2(0.0, t * 0.5));
  float dust = smoothstep(0.38, 0.92, n);
  vec3 tint = mix(uLow, uHigh, clamp(warp.x * 1.6 - 0.3, 0.0, 1.0));
  vec3 col = tint * dust * (0.34 + 0.06 * uEnergy.y);
  col += mix(tint, vec3(1.0), 0.45) * 0.2 * pow(dust, 3.0) * (0.85 + 0.15 * uEnergy.z);
  col += uHigh * 0.035 * (1.0 - dust) * n;
  col += vec3(0.8, 0.85, 1.0) * stars(p + 3.0, 90.0) * (1.0 - dust);
  return col;
}`,

  // Işık çizgilerinden bir tünel: üç boyutlu gürültü açı ve derinlikte örneklenir (dikişsiz).
  // Merkez uzaktır ve sisli; çizgiler kenara doğru yaklaşır. Halka yok: ışık düzensiz çizgilerde.
  tunnel: `
vec3 scene(vec2 uv, vec2 p) {
  float r = length(p) * (1.0 + 0.04 * uEnergy.x);
  float a = atan(p.y, p.x) + uTime * 0.03;
  float depth = 0.3 / max(r, 0.03);
  float z = depth + uTime * 0.55;
  vec3 at = vec3(cos(a) * 1.6, sin(a) * 1.6, z * 0.45);
  float n = fbm3(at);
  float streak = smoothstep(0.5, 0.9, n);
  float fine = smoothstep(0.62, 0.95, noise3(vec3(cos(a) * 9.0, sin(a) * 9.0, z * 1.4)));
  float near = smoothstep(0.02, 0.4, r) * exp(-r * 0.6);
  vec3 tint = mix(uLow, uHigh, 0.5 + 0.5 * sin(a * 2.0 + depth * 0.2));
  vec3 col = tint * (0.7 * streak + 0.35 * fine + 0.05) * near;
  col += mix(uHigh, vec3(1.0), 0.3) * 0.16 * exp(-r * 6.0) * (1.0 - 0.4 * uTension);
  return col;
}`,

  // Orman kıyısı: ağaçların karanlık silueti, önünde ve arkasında üç katman ateşböceği. Her biri
  // kendi yavaş ritminde (≤ 0,5 Hz) yanıp söner; küçük oldukları için ekranın parlaklığı sabit.
  fireflies: `
float swarm(vec2 p, float scale, float seed, float density) {
  vec2 g = p * scale;
  vec2 cell = floor(g);
  float glow = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      vec2 h = hash22(c + seed);
      if (h.x > density) continue;
      vec2 drift = vec2(sin(uTime * (0.25 + 0.2 * h.y) + h.x * 21.0),
                        cos(uTime * (0.2 + 0.2 * h.x) + h.y * 17.0));
      vec2 at = c + 0.5 + 0.38 * drift;
      float d = length(g - at);
      float blink = smoothstep(0.15, 1.0, 0.5 + 0.5 * sin(uTwinkle * (0.9 + 1.1 * h.y) + h.x * 40.0));
      glow += blink * (exp(-d * d * 60.0) + 0.06 * exp(-d * 4.0));
    }
  }
  return glow;
}

/** Çam sırası: iki sıra üçgen ağaç (yükseklik, sırtın üstünde). */
float pines(float x, float k, float seed) {
  float cell = floor(x * k);
  float f = abs(fract(x * k) - 0.5) / k;
  float h = hash12(vec2(cell, seed));
  return 0.04 + 0.07 * h - f * (2.6 + 1.2 * h);
}

vec3 scene(vec2 uv, vec2 p) {
  vec3 col = uHigh * 0.1 * smoothstep(0.55, -0.15, p.y);
  col += vec3(0.8, 0.85, 1.0) * stars(p, 80.0) * smoothstep(0.0, 0.3, p.y);
  float hill = -0.2 + 0.08 * fbm(vec2(p.x * 1.5, 1.0));
  float ridge = hill + max(0.0, max(pines(p.x, 19.0, 4.0), pines(p.x + 0.031, 13.0, 9.0) - 0.015));
  float tree = smoothstep(ridge + 0.004, ridge - 0.004, p.y);
  float density = 0.32 + 0.12 * uEnergy.y + 0.08 * uBloom;
  vec3 light = mix(uLow, vec3(1.0, 0.92, 0.6), 0.45);
  col += light * 0.5 * swarm(p + vec2(0.0, 0.02), 9.0, 3.0, density) * (1.0 - tree);
  col *= 1.0 - tree;
  col += light * 0.8 * swarm(p, 5.0, 11.0, density);
  col += light * 0.9 * swarm(p - vec2(0.3, 0.0), 3.0, 29.0, density * 0.6);
  return col;
}`,

  // Altı aynalı kaleydoskop: dilim aynalanır, içindeki desen akan bükmeli gürültüdür. Desen yavaş
  // döner; ölçü başında merkezden kenara hafif bir dalga geçer (yalnızca biçim).
  kaleido: `
vec3 scene(vec2 uv, vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x) + uTime * 0.025;
  float sector = PI / 3.0;
  a = mod(a, sector);
  a = abs(a - sector * 0.5);
  float wave = 0.03 * exp(-uRipple * 1.5) * sin(r * 14.0 - uRipple * 6.0);
  vec2 q = (r + wave) * vec2(cos(a), sin(a)) * (2.2 + 0.4 * uTension - 0.3 * uBloom);
  float t = uTime * 0.06;
  vec2 warp = vec2(fbm(q + vec2(t, 0.0)), fbm(q + vec2(3.1, -t)));
  float n = fbm(q * 1.4 + 1.8 * warp);
  float lines = smoothstep(0.08, 0.0, abs(n - 0.55)) * (0.6 + 0.2 * uEnergy.z);
  vec3 tint = mix(uLow, uHigh, clamp(warp.y * 1.5 - 0.25, 0.0, 1.0));
  vec3 col = tint * (0.05 + 0.3 * smoothstep(0.3, 0.85, n) + 0.45 * lines);
  col *= smoothstep(1.1, 0.3, r);
  col += mix(uHigh, vec3(1.0), 0.3) * 0.14 * exp(-r * 6.0);
  return col;
}`,

  // Altı ışık şeridi: alttakiler bası, ortadakiler ortayı, üsttekiler tizi izler (dalga boyu,
  // parlaklık değil). Gerilimde şeritler birbirine yaklaşır, açılımda dalgalar büyür.
  ribbons: `
vec3 scene(vec2 uv, vec2 p) {
  vec3 col = uHigh * 0.04 * (1.0 - abs(p.y));
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float k = fi / 5.0;
    float band = k < 0.3 ? uEnergy.x : (k < 0.7 ? uEnergy.y : uEnergy.z);
    float amp = 0.05 + 0.05 * band + 0.04 * uBloom;
    float y = (k - 0.5) * 0.55 * (1.0 - 0.45 * uTension)
      + amp * sin(p.x * (2.2 + fi * 0.41) + uTime * (0.55 + 0.12 * fi) + fi * 1.7)
      + 0.05 * (noise(vec2(p.x * 1.3 + fi * 3.1, uTime * 0.15)) - 0.5);
    float d = abs(p.y - y);
    float w = 0.006 + 0.004 * band;
    vec3 tint = mix(uLow, uHigh, k);
    col += tint * (0.55 * exp(-d * d / (w * w)) + 0.1 * exp(-d * 30.0));
  }
  return col;
}`,

  // İki kollu sarmal gökada, eğik açıdan. Kollar ve toz birlikte döner; açılımda gökada büyür,
  // gerilimde çekirdeğe toplanır. Yıldızlar kollarda sıklaşır.
  galaxy: `
vec3 scene(vec2 uv, vec2 p) {
  vec2 q = rot(0.45) * p;
  q.y *= 2.1;
  q *= 0.7 / (1.0 + 0.2 * uBloom - 0.15 * uTension);
  float spin = uTime * 0.12;
  vec2 s = rot(spin) * q;
  float r = length(s);
  float a = atan(s.y, s.x);
  float arm = pow(max(0.5 + 0.5 * cos(2.0 * a - 5.0 * log(r + 0.02)), 0.0), 2.5);
  float dust = fbm(s * 5.0 + 3.0);
  float disc = exp(-r * 2.6);
  float body = disc * (0.25 + 0.75 * arm) * (0.5 + 0.5 * dust);
  vec3 tint = mix(uHigh, uLow, clamp(r * 1.6, 0.0, 1.0));
  vec3 col = tint * 0.8 * body;
  col += mix(uHigh, vec3(1.0), 0.6) * 0.6 * exp(-r * 12.0);
  vec2 g = s * 55.0;
  vec2 cell = floor(g);
  float h = hash12(cell);
  float d = length(fract(g) - (hash22(cell + 5.0) * 0.6 + 0.2));
  col += mix(uLow, vec3(1.0), 0.6) * step(1.0 - 0.12 * arm * disc * 3.0, h)
    * smoothstep(0.12, 0.0, d) * 0.5;
  col += vec3(0.75, 0.8, 1.0) * stars(p + 9.0, 80.0) * (1.0 - disc);
  return col;
}`,

  // Ay ışığında kum tepeleri: arkadan öne dört katman. Sırta yakın yüzler ay ışığını alır,
  // aşağısı gölgede. Rüzgâr sırtlardan ince kum savurur (bas rüzgârı güçlendirir; yalnızca biçim).
  dunes: `
float dune(float x, float seed) {
  float n = fbm(vec2(x * 0.9 + seed, seed * 1.7));
  float c = 2.0 * noise(vec2(x * 1.6 + seed * 3.0, seed)) - 1.0;
  float ridge = 1.0 - sqrt(c * c + 0.004);
  return 0.6 * n + 0.4 * ridge * ridge;
}

vec3 scene(vec2 uv, vec2 p) {
  vec2 moon = vec2(-0.45, 0.3);
  float dm = length(p - moon);
  vec3 col = uHigh * 0.08 * smoothstep(0.5, -0.2, p.y);
  col += vec3(0.95, 0.93, 0.85) * smoothstep(0.05, 0.045, dm) + uHigh * 0.06 * exp(-dm * 5.0);
  col += vec3(0.8, 0.85, 1.0) * stars(p, 75.0) * smoothstep(-0.1, 0.3, p.y);
  float wind = 0.5 + 0.5 * uEnergy.x;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float scale = 1.0 + fi * 0.6;
    float x = p.x * scale + uTime * 0.01 * (fi + 1.0);
    float h = -0.02 - fi * 0.12 + 0.16 * dune(x, fi * 7.3) / scale;
    if (p.y < h) {
      float e = 0.002;
      float slope = (dune(x + e, fi * 7.3) - dune(x - e, fi * 7.3)) / (2.0 * e);
      float below = h - p.y;
      // Yandan bakışta yüzeyin eğimi belirsiz: ışık sırta yakın yerde güçlü, aşağı indikçe söner;
      // eğim yalnızca hafif bir ton farkı verir (sert eğim ışığı dikey şeritlere bölerdi).
      float lit = 0.22 + 0.4 * exp(-below * 14.0) + 0.08 * clamp(-slope * 0.25, -1.0, 1.0);
      lit *= 0.9 + 0.1 * noise(vec2(x * 30.0 + p.y * 80.0, p.y * 10.0));
      float haze = 1.0 - fi * 0.2;
      vec3 sand = mix(vec3(0.03, 0.03, 0.045), mix(uLow, vec3(0.9, 0.8, 0.65), 0.6) * 0.32, lit);
      col = sand * haze + uHigh * 0.02 * (1.0 - haze);
      float crest = exp(-below * 60.0);
      float drift = smoothstep(0.55, 0.9, noise(vec2(x * 40.0 - uTime * 2.0 * wind, p.y * 120.0)));
      col += mix(uLow, vec3(1.0), 0.5) * 0.12 * crest * drift * wind;
    }
  }
  return col;
}`,

  // Yağmurlu bir camın ardında bulanık şehir ışıkları (iki katman). Camda duran damlalar
  // ardındaki ışığı ters çevirir; ara sıra bir damla süzülür. Işıklar vuruşlarla değil, akış
  // saatiyle yavaşça kayar.
  rain: `
vec3 bokeh(vec2 p) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = 4.0 + 3.0 * float(layer);
    vec2 g = p * scale + vec2(uTime * 0.05 * (1.0 + float(layer)), float(layer) * 7.0);
    vec2 cell = floor(g);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 c = cell + vec2(float(x), float(y));
        vec2 h = hash22(c + float(layer) * 13.0);
        if (h.y > 0.55) continue;
        float d = length(g - c - h);
        float radius = 0.28 + 0.2 * hash12(c + 3.0);
        float disc = smoothstep(radius, radius - 0.06, d);
        vec3 tint = mix(uLow, uHigh, hash12(c + 9.0));
        col += tint * disc * (0.16 + 0.2 * hash12(c + 21.0));
      }
    }
  }
  return col * smoothstep(0.6, -0.4, p.y);
}

vec3 scene(vec2 uv, vec2 p) {
  vec3 col = bokeh(p) + uHigh * 0.04;
  vec2 g = p * vec2(18.0, 12.0);
  vec2 cell = floor(g);
  vec2 h = hash22(cell + 41.0);
  float fall = fract(uTime * 0.04 * (0.5 + h.x) + h.y);
  vec2 at = vec2(h.x * 0.6 + 0.2, mix(0.85, 0.15, h.y > 0.85 ? fall : 0.5) + (h.y - 0.5) * 0.3);
  vec2 off = (fract(g) - at) * vec2(1.0, 1.5);
  float d = length(off);
  float drop = smoothstep(0.2, 0.17, d) * step(0.35, h.y);
  vec3 seen = bokeh(p - off * 0.12) * 1.3 + uHigh * 0.05;
  col = mix(col, seen, drop);
  col += vec3(0.9) * 0.25 * drop * smoothstep(0.08, 0.0, length(off - vec2(-0.06, 0.07)));
  col *= 1.0 - 0.35 * drop * smoothstep(0.12, 0.2, d);
  return col;
}`,

  // Kristal ağ: hücre çekirdekleri yavaşça kıpırdar; hücre kenarları ince, iki hücrenin uzaklık
  // farkından (F2 − F1) hesaplanır. Ölçü başında kenar boyunca bir kıpırtı geçer (biçim).
  crystal: `
vec3 scene(vec2 uv, vec2 p) {
  vec2 g = p * (5.0 + 0.8 * uTension - 0.6 * uBloom);
  vec2 cell = floor(g);
  float f1 = 9.0;
  float f2 = 9.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      vec2 h = hash22(c);
      vec2 at = c + 0.5 + 0.4 * sin(uTime * 0.25 + 6.2831 * h);
      float d = length(g - at);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash12(c + 2.0);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  float edge = f2 - f1;
  float ripple = 1.0 + 0.4 * exp(-uRipple * 2.0) * sin(f1 * 9.0 - uRipple * 8.0);
  float line = exp(-edge * edge * 260.0 / ripple);
  vec3 tint = mix(uLow, uHigh, id);
  vec3 col = tint * (0.06 + 0.07 * (1.0 - f1)) + mix(tint, vec3(1.0), 0.3) * 0.38 * line;
  col *= 0.75 + 0.25 * fbm(p * 2.0 + uTime * 0.03);
  return col;
}`,
};

const MAIN = `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 light = max(scene(uv, p), vec3(0.0));
  float gain = ${SHADER_LEVEL_FLOOR.toFixed(4)} + ${(1 - SHADER_LEVEL_FLOOR).toFixed(4)} * uLevel;
  vec3 col = uBack + light * gain;
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** Sahnenin tam parça gölgelendiricisi. */
export function fragmentSource(id: ShaderSceneId): string {
  return `${PRELUDE}\n${SCENES[id]}\n${MAIN}`;
}
