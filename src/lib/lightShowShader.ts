/**
 * Işık Ustası'nın gölgelendiricisi (özgün kod) ve pusun gürültü dokusu.
 *
 * Yöntem: her piksel için bakış ışını. Her ışık ışını (koni) için bakış ışınıyla ışının ekseni
 * arasındaki en yakın nokta kapalı formülle bulunur; pustan saçılan ışık, eksenden uzaklığın Gauss
 * profili × ışının o noktadaki genişliği × bakış ışınının koninin içinden geçtiği yolun uzunluğu
 * (1 / sin α) × ileri saçılma (ışın kameraya doğruysa çok daha parlak) × pusun o noktadaki
 * yoğunluğu ile yaklaşık hesaplanır (ışın yürütme yok: maliyet ışın sayısıyla doğrusal, piksel
 * başına bir yineleme). İnce ışınlar (lazer) piksel boyundan ince olunca enerjisi korunarak
 * genişletilir: kırpışma (aliasing) olmaz.
 *
 * Islak zemin: zemine çarpan bakış ışını aynalanır ve ışınlar aynalanmış ışınla yeniden
 * değerlendirilir (aynı döngüde); su birikintilerinde yansıma keskin, kuru betonda pürüzlü (ışının
 * yansıması genişletilir ve söner). Zemine düşen ışık havuzları (koninin zeminle kesişimi, elips)
 * ve lenslerin yansıması eklenir. Uzak zemin pusta kaybolur.
 *
 * Çıktı doğrusal ışıktır (HDR, sınırsız); bloom, pozlama ve ton eşleme son işlem zincirinde.
 */
import { BEAM_FLOATS } from "./lightRig";
import { MAX_BEAMS, type QualityProfile } from "./lightShow";

/** Pus gürültüsü dokusunun kenarı (piksel; döşenebilir). */
export const NOISE_SIZE = 256;

/**
 * Döşenebilir değer gürültüsü (iki kanal, ayrı tohumlar), birkaç oktavlık fbm, 0..255. Program
 * içinde üretilir (dışarıdan doku yok); belirlenimci.
 */
export function hazeNoise(size = NOISE_SIZE): Uint8Array {
  const out = new Uint8Array(size * size * 2);
  for (let channel = 0; channel < 2; channel++) {
    const field = new Float32Array(size * size);
    let amp = 1;
    let total = 0;
    for (let octave = 0; octave < 5; octave++) {
      const cells = 4 << octave;
      const lattice = new Float32Array(cells * cells);
      let h = 0x2545f491 ^ (channel * 0x9e3779b9) ^ (octave * 0x85ebca6b);
      for (let i = 0; i < lattice.length; i++) {
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        h ^= h >>> 15;
        lattice[i] = (h >>> 0) / 4294967296;
      }
      for (let y = 0; y < size; y++) {
        const fy = (y / size) * cells;
        const y0 = Math.floor(fy);
        const ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells;
          const x0 = Math.floor(fx);
          const tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const at = (ix: number, iy: number) =>
            lattice[(((iy % cells) + cells) % cells) * cells + (((ix % cells) + cells) % cells)]!;
          const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
          const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
          field[y * size + x]! += (a + (b - a) * sy) * amp;
        }
      }
      total += amp;
      amp *= 0.5;
    }
    let min = Infinity;
    let max = -Infinity;
    for (const v of field) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const span = max - min || 1;
    for (let i = 0; i < field.length; i++) {
      out[i * 2 + channel] = Math.round(((field[i]! - min) / span) * 255);
    }
    void total;
  }
  return out;
}

const f = (x: number) => x.toFixed(6);

/** Sahnenin parça gölgelendiricisi (kalite katmanına göre derlenir). */
export function lightShowFragment(q: QualityProfile): string {
  return `#version 300 es
precision highp float;
out vec4 outColor;

#define MAX_BEAMS ${MAX_BEAMS}
#define REFLECTIONS ${q.reflections ? 1 : 0}
#define HAZE_OCTAVES ${q.hazeOctaves}

uniform vec2 uResolution;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uFocal;
uniform float uPixelAngle;
uniform int uBeamCount;
uniform vec4 uBeams[${MAX_BEAMS * (BEAM_FLOATS / 4)}];
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uFill;
uniform vec3 uBack;
uniform float uHaze;

// Pusun büyük bulutları (dünya konumunda, yavaşça sürüklenir).
float haze(vec3 p) {
  vec2 a = vec2(p.x * 0.05 + p.y * 0.03, p.z * 0.05 - p.y * 0.02) + vec2(uTime * 0.012, uTime * 0.005);
  float n = texture(uNoise, a).r;
  return mix(0.35, 1.55, smoothstep(0.15, 0.85, n)) * uHaze;
}

// Salonun genel pusu (bakış ışını boyunca ortalama): düşük frekanslı, yalnızca genel ışık için.
float airHaze(vec3 p) {
  float n = texture(uNoise, p.xz * 0.03 + p.y * 0.02 + vec2(uTime * 0.008, 0.0)).r;
  return mix(0.4, 1.4, n) * uHaze;
}

// Bir ışık ışınının bakış ışını boyunca pustan saçılan ışığı (bkz. dosya başı). Işının içindeki
// duman tutamları ışın boyunca uzanan çizgilerdir: gürültü, ışının kesitindeki konumdan (çok) ve
// ışın boyunca uzaklıktan (az) okunur.
vec3 beamScatter(vec3 o, vec3 d, float tmax, float blur, vec3 A, vec3 dir, float r0, float k,
                 vec3 col, float send, float id) {
  vec3 w = o - A;
  float b = dot(d, dir);
  float dd = dot(d, w);
  float e = dot(dir, w);
  // Bakış ışını ışına neredeyse paralelse en yakın nokta belirsizleşir: sinüs 0,17'nin altına inmez.
  float den = max(1.0 - b * b, 0.03);
  float s = clamp((e - b * dd) / den, 0.0, send);
  float t = clamp(dot(A + dir * s - o, d), 0.0, tmax);
  vec3 pc = o + d * t;
  s = clamp(dot(pc - A, dir), 0.0, send);
  vec3 pb = A + dir * s;
  vec3 diff = pc - pb;
  float dist2 = dot(diff, diff);
  float r = r0 + k * s;
  float rr = max(r, t * uPixelAngle * 1.25) + blur * t;
  float q = dist2 / (rr * rr);
  if (q > 16.0) return vec3(0.0);
  // Işına neredeyse paralel bakışta (kaynağa doğru) saçılma lensin parlamasına ve pusun
  // perdesine bırakılır: en yakın nokta orada belirsiz.
  float g = exp(-q) * smoothstep(0.03, 0.12, 1.0 - b * b);
  // Kameranın hemen yanından geçen ışın ekranı düz bir renkle kaplamasın.
  g *= smoothstep(0.4, 3.5, t);
  float path = min(inversesqrt(den), 5.8);
  float fall = 1.0 / (1.0 + 0.03 * s + 0.001 * s * s);
  float facing = max(-b, 0.0);
  float phase = 0.5 + 1.3 * pow(facing, 8.0) + 0.3 * facing;
  float energy = r / rr;
  // Kesitteki konum (−1..1 civarı): bakış ve ışın eksenine dik doğrultuda.
  vec3 side = cross(d, dir);
  float across = dot(diff, side) * inversesqrt(max(dot(side, side), 1e-6)) / rr;
  float streak = texture(uNoise, vec2(across * 0.11 + id * 0.173, s * 0.012 - uTime * 0.006)).g;
#if HAZE_OCTAVES > 1
  streak = streak * 0.65 + 0.35 * texture(uNoise, vec2(across * 0.31 + id * 0.41, s * 0.05 + uTime * 0.011)).r;
#endif
  float smoke = haze(pb) * mix(0.35, 1.6, smoothstep(0.25, 0.8, streak));
  return col * (1.7 * g * path * fall * phase * energy * smoke / (r + 0.3));
}

// Kamera bir ışının içindeyse: gözün önündeki pus ışıkla dolar (ışın kameraya doğruysa çok).
vec3 beamVeil(vec3 o, vec3 d, vec3 A, vec3 dir, float r0, float k, vec3 col) {
  float sc = dot(o - A, dir);
  if (sc <= 0.0) return vec3(0.0);
  vec3 off = o - A - dir * sc;
  float rc = r0 + k * sc;
  float inside = exp(-dot(off, off) / (rc * rc * 2.0));
  float facing = max(-dot(d, dir), 0.0);
  return col * inside * (0.015 + 0.25 * facing * facing * facing) / (1.0 + 0.02 * sc);
}

// Lensin parlaması: fikstür kameraya doğru bakıyorsa göz kamaştırır.
vec3 lensGlow(vec3 o, vec3 d, float tmax, vec3 A, vec3 dir, float r0, vec3 col, float glow,
              float stretch) {
  vec3 v = A - o;
  float tv = dot(v, d);
  if (tv <= 0.05 || tv > tmax + 1.0) return vec3(0.0);
  vec3 perp = v - d * tv;
  // Islak zeminde lens yansıması dikey çizgiye uzar (stretch > 1).
  vec3 up = vec3(0.0, 1.0, 0.0);
  float vy = dot(perp, up);
  vec3 ph = perp - up * vy;
  float ang2 = (dot(ph, ph) + vy * vy / (stretch * stretch)) / (tv * tv);
  float size = max(r0 / tv, uPixelAngle * 1.8);
  float facing = max(dot(dir, -v / max(length(v), 1e-4)), 0.0);
  float core = exp(-ang2 / (size * size));
  float halo = size * size / (ang2 + size * size * 9.0);
  float bright = glow * (0.6 + 30.0 * pow(facing, 10.0) + 4.0 * facing * facing);
  return col * bright * (core * 4.0 + halo * 0.4) / (1.0 + 0.003 * tv * tv);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / (0.5 * uResolution.y);
  vec3 d = normalize(uCamFwd * uFocal + uCamRight * p.x + uCamUp * p.y);
  vec3 o = uCamPos;

  bool floorHit = d.y < -1e-4;
  float tf = floorHit ? -o.y / d.y : 400.0;
  float tmax = min(tf, 400.0);
  vec3 fp = o + d * tf;

  // Zemin malzemesi: su birikintileri (keskin yansıma) ve pürüzlü beton.
  float puddle = 0.0;
  float rough = 0.0;
  vec3 rd = d;
  float fres = 0.0;
  if (floorHit) {
    float wet = texture(uNoise, fp.xz * 0.045 + 0.37).g;
    puddle = smoothstep(0.48, 0.6, wet);
    float grain = texture(uNoise, fp.xz * 0.9).r;
    rough = mix(0.028, 0.004, puddle) * (0.7 + 0.6 * grain);
    vec2 ripple = (texture(uNoise, fp.xz * 0.21 + vec2(uTime * 0.003, 0.0)).rg - 0.5) * (1.0 - puddle) * 0.035;
    rd = normalize(vec3(d.x + ripple.x, -d.y, d.z + ripple.y));
    float c = 1.0 - max(rd.y, 0.0);
    fres = mix(0.03, 1.0, c * c * c * c * c) * mix(0.35, 1.0, puddle);
  }

  vec3 light = vec3(0.0);
  vec3 refl = vec3(0.0);
  vec3 pools = vec3(0.0);
  for (int i = 0; i < MAX_BEAMS; i++) {
    if (i >= uBeamCount) break;
    vec4 P = uBeams[i * 3];
    vec4 D = uBeams[i * 3 + 1];
    vec4 C = uBeams[i * 3 + 2];
    vec3 A = P.xyz;
    vec3 dir = D.xyz;
    float send = dir.y < -1e-3 ? min(A.y / -dir.y, 90.0) : 90.0;
    float id = float(i);
    light += beamScatter(o, d, tmax, 0.0, A, dir, P.w, D.w, C.rgb, send, id);
    light += beamVeil(o, d, A, dir, P.w, D.w, C.rgb);
    light += lensGlow(o, d, tmax, A, dir, P.w, C.rgb, C.w, 1.0);
    if (floorHit) {
#if REFLECTIONS
      refl += beamScatter(fp, rd, 90.0, rough, A, dir, P.w, D.w, C.rgb, send, id);
#endif
      refl += lensGlow(fp, rd, 200.0, A, dir, P.w, C.rgb, C.w, 1.0 + 14.0 * rough + 3.0 * puddle);
      if (dir.y < -0.02) {
        vec3 H = A + dir * send;
        float rH = P.w + D.w * send;
        vec2 q = fp.xz - H.xz;
        vec2 dh = normalize(dir.xz + vec2(1e-5, 0.0));
        float along = dot(q, dh) * (-dir.y);
        float across = dot(q, vec2(-dh.y, dh.x));
        float d2 = along * along + across * across;
        float pool = exp(-d2 / (rH * rH)) + 0.12 * exp(-d2 / (9.0 * rH * rH));
        pools += C.rgb * pool * (-dir.y) / (rH * rH + 0.2);
      }
    }
  }

  // Salonun pustan yansıyan genel ışığı (uzaklıkla artar) ve sahnenin ardındaki sönük parıltı;
  // zeminin ufukta pusla aynı renge kavuşması için ikisi de bakış uzaklığından.
  float airT = min(tmax, 70.0);
  float air = 1.0 - exp(-airT * ${f(0.03)} * uHaze);
  vec3 hazeAt = o + d * min(airT, 20.0) * 0.6;
  float horizon = exp(-abs(d.y) * 5.0);
  vec3 col = light + (uFill * airHaze(hazeAt) + uBack * horizon) * air;
  if (floorHit) {
    float fog = exp(-tf * ${f(0.025)} * uHaze);
    vec3 surface = pools * 0.9 * (1.0 - 0.6 * puddle) + refl * fres + uFill * 0.03;
    col += surface * fog;
  }
  outColor = vec4(min(col, vec3(64.0)), 1.0);
}`;
}
