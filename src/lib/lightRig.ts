/**
 * Işık Ustası'nın ışık düzeni ve kamerası (saf hesap). Kurgunun durumundan (`ShowCue`,
 * `lightShow.ts`) her fikstürün ışınını (çıkış noktası, yönü, genişliği, rengi) ve kameranın
 * konumunu üretir; gölgelendiriciye tek bir `Float32Array` olarak gider (karede bellek ayrılmaz).
 *
 * Dünya: y yukarı, zemin y = 0, sahne −z yönünde, kamera +z tarafında sahneye bakar (metre).
 * Fikstür sıraları: arka tavan (y 7,8, z −15), sahne zemini (y 0,25, z −12), iki yan kule
 * (x ±13), ortada lazer kaynağı. Fikstürler ortadan dışa doğru sıralanır: üç ışın yanınca ortadaki
 * üçü yanar; geri sayımda en son ortadaki kalır.
 */
import { clamp01, type CueSheet } from "./cueSheet";
import {
  INTENSITY_PROFILES,
  MAX_BEAMS,
  QUALITY_PROFILES,
  createSafeLights,
  showCue,
  stepSafeLights,
  type LiveInput,
  type Pattern,
  type Quality,
  type QualityProfile,
  type Rgb,
  type Shot,
  type ShowCue,
  type ShowOptions,
  type ShowPalette,
} from "./lightShow";

export type Vec3 = [number, number, number];

export type FixtureGroup = "back" | "floor" | "side" | "laser";

export interface Fixture {
  group: FixtureGroup;
  pos: Vec3;
  /** Sıradaki yeri (−1 sol … 1 sağ). */
  u: number;
  /** Yanma sırası (0 ilk yanan, ortadaki). */
  rank: number;
  /**
   * Geri sayımdaki sırası: sıranın her yanına eşit dağılmış sekiz fikstür (dışarıdan içeri söner,
   * en son ortadaki kalır); geri sayıma girmeyenler `COUNTDOWN_OFF`.
   */
  countdownRank: number;
  /** Çıkış yarıçapı ve açılma (yarım açının tanjantı). */
  r0: number;
  spread: number;
  /** Işının temel gücü ve lensin parlaması. */
  power: number;
  glow: number;
}

/** Bir ışın gölgelendiriciye 12 sayı olarak gider: konum + r0, yön + açılma, renk + parlama. */
export const BEAM_FLOATS = 12;

/** Geri sayıma girmeyen fikstürün sırası (hiç yanmaz). */
export const COUNTDOWN_OFF = 99;

/** `n` fikstürden eşit aralıklı sekizinin geri sayım sırası (ortadan dışa). */
function countdownRanks(n: number): number[] {
  const out = Array.from({ length: n }, () => COUNTDOWN_OFF);
  const count = Math.min(8, n);
  const picked = Array.from({ length: count }, (_, j) =>
    count === 1 ? 0 : Math.round((j * (n - 1)) / (count - 1)),
  );
  const mid = (n - 1) / 2;
  picked
    .slice()
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || b - a)
    .forEach((i, r) => (out[i] = r));
  return out;
}

function centerRanks(n: number): number[] {
  // Ortadan dışa: orta, sağ, sol, sağ, sol…
  const order: number[] = [];
  const mid = (n - 1) / 2;
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b,
  );
  idx.forEach((i, r) => (order[i] = r));
  return order;
}

/** Kalite katmanına göre fikstürler. */
export function buildFixtures(q: QualityProfile): Fixture[] {
  const out: Fixture[] = [];
  const row = (
    group: FixtureGroup,
    n: number,
    make: (u: number, i: number) => Vec3,
    f: Partial<Fixture>,
  ) => {
    const ranks = centerRanks(n);
    const countdown = countdownRanks(n);
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      out.push({
        group,
        pos: make(u, i),
        u,
        rank: ranks[i]!,
        countdownRank: countdown[i]!,
        r0: 0.12,
        spread: 0.035,
        power: 1,
        glow: 1,
        ...f,
      });
    }
  };
  row("back", q.back, (u) => [u * 10, 6.8, -15], { r0: 0.09, spread: 0.02, power: 1.3 });
  row("floor", q.floor, (u) => [u * 9, 0.25, -12], { r0: 0.08, spread: 0.026, power: 1.15 });
  row(
    "side",
    q.side,
    (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      return [side * 13, 4.5 + (k % 2) * 1.5, -5 - k * 5];
    },
    { r0: 0.09, spread: 0.022, power: 1.15 },
  );
  row("laser", q.laser, (u) => [u * 0.35, 3.2, -16], {
    r0: 0.012,
    spread: 0.0016,
    power: 1.5,
    glow: 0.35,
  });
  return out;
}

/** Yanan ışın sayısından fikstürün yanma oranı (0..1). */
export function fixtureLit(cue: ShowCue, f: Fixture): number {
  const count = cue[f.group];
  const rank = cue.phase === "build" || cue.phase === "gap" ? f.countdownRank : f.rank;
  return clamp01(count - rank);
}

/** Bütün fikstürlerin hedef yanma oranı (yerinde). */
export function targetLit(cue: ShowCue, fixtures: readonly Fixture[], out: Float32Array): void {
  for (let i = 0; i < fixtures.length; i++) out[i] = fixtureLit(cue, fixtures[i]!);
}

function dirFrom(pan: number, tilt: number, out: Vec3): Vec3 {
  const c = Math.cos(tilt);
  out[0] = Math.sin(pan) * c;
  out[1] = Math.sin(tilt);
  out[2] = Math.cos(pan) * c;
  return out;
}

function aimAt(from: Vec3, x: number, y: number, z: number, out: Vec3): Vec3 {
  const dx = x - from[0];
  const dy = y - from[1];
  const dz = z - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  out[0] = dx / len;
  out[1] = dy / len;
  out[2] = dz / len;
  return out;
}

/** Vuruş adımlarının konumları (pan çarpanı, tilt): "tık" diye konum değiştiren hareketli ışıklar. */
const STEP_POSES: [number, number][] = [
  [1, -0.38],
  [-0.6, 0.15],
  [0.35, -0.12],
  [-1, 0.4],
];

/** Fikstürün bir desendeki yönü (birim vektör). */
export function patternDir(
  pattern: Pattern,
  f: Fixture,
  cue: ShowCue,
  t: number,
  seedPhase: number,
  out: Vec3,
): Vec3 {
  const w = t * cue.sweepSpeed;
  const swing = cue.sweep * Math.sin(w + f.u * 2.3 + seedPhase);
  const bob = 0.12 * Math.sin(0.73 * w + f.u * 1.7 + seedPhase * 0.5);
  const stepPose = (k: number): [number, number] => {
    if (cue.step < 0) return [0, 0];
    const a = STEP_POSES[(((cue.step + k) % 4) + 4) % 4]!;
    const b = STEP_POSES[(((cue.step + k - 1) % 4) + 4) % 4]!;
    const e = cue.stepEase;
    return [b[0] + (a[0] - b[0]) * e, b[1] + (a[1] - b[1]) * e];
  };
  const odd = f.rank % 2 === 1 ? 1 : 0;
  switch (f.group) {
    case "back":
      switch (pattern) {
        case "converge":
          // Piramit: ışınlar baştan bir tepede buluşur; tepe doruğa yaklaştıkça iner ve kameraya
          // yaklaşır (gerilim).
          return aimAt(f.pos, 0, 13 - 4.5 * cue.focus, -10 + 3 * cue.focus, out);
        case "burst": {
          const [sp, st] = stepPose(odd);
          return dirFrom(f.u * 0.9 + 0.28 * sp, 0.32 + 0.35 * Math.abs(f.u) + 0.28 * st, out);
        }
        case "chase": {
          const [sp, st] = stepPose(odd * 2);
          return dirFrom(f.u * 0.6 + 0.3 * sp, 0.3 + 0.3 * st, out);
        }
        case "spot":
          // Kırılma: ortada tepeden inen sıcak ışık sütunu (ıslak zeminde yansır); arkada iki
          // soğuk ışın yavaşça tarar.
          if (f.rank === 0) return aimAt(f.pos, 0.8 * Math.sin(w * 0.5), 0, -11.5, out);
          return dirFrom(f.u * 0.9 + swing, 0.5 + bob, out);
        case "rise":
          return dirFrom(f.u * 0.25 + 0.3 * swing, 1.15 + 0.15 * bob, out);
        default:
          // Sakin bölümlerde ışınlar pusun içinde yukarı açılır; çift ölçü öbeğinde seyircinin
          // üstünden zemine doğru tarar (çeşitlilik).
          return cue.sweepDown
            ? dirFrom(f.u * 0.42 + swing, -0.44 + bob, out)
            : dirFrom(f.u * 0.7 + 0.8 * swing, 0.32 + 1.5 * bob, out);
      }
    case "floor":
      switch (pattern) {
        case "converge":
          return aimAt(f.pos, 0, 9, -6, out);
        case "burst": {
          const [sp, st] = stepPose(odd + 1);
          return dirFrom(f.u * 0.6 + 0.25 * sp, 0.75 + 0.25 * st, out);
        }
        case "chase": {
          const [sp, st] = stepPose(odd + 2);
          return dirFrom(f.u * 0.5 + 0.25 * sp, 0.65 + 0.25 * st, out);
        }
        default:
          return dirFrom(f.u * 0.5 + 0.6 * swing, 0.6 + bob, out);
      }
    case "side": {
      const side = f.pos[0] < 0 ? -1 : 1;
      if (pattern === "converge") return aimAt(f.pos, 0, 9, -6, out);
      // Yan kuleler sahnenin üstünde çaprazlanır (seyircinin önünden geçmez).
      const [sp, st] = stepPose(odd);
      return aimAt(f.pos, -side * (3 + 2 * sp) + 3 * swing, 13 + 2 * st + 2 * bob, -10, out);
    }
    case "laser": {
      if (pattern === "burst") {
        // Lazer levhası: seyircinin üstünde yatay yelpaze ("sıvı gökyüzü").
        return dirFrom(f.u * 0.95, 0.06 + 0.05 * Math.sin(w * 1.5 + f.u), out);
      }
      return dirFrom(f.u * 0.6 + 0.5 * swing, 0.25 + 0.3 * Math.sin(w * 0.9 + f.u * 3), out);
    }
  }
}

/** Yaylı karışım (0 → 1, hafif aşmalı): ışınların açılırken hedefi biraz geçip oturması. */
function springMix(x: number): number {
  const t = clamp01(x);
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t) * (1 + 0.15 * Math.sin(t * Math.PI));
}

const tmpA: Vec3 = [0, 0, 0];
const tmpB: Vec3 = [0, 0, 0];

/**
 * Işınları gölgelendiricinin dizisine yazar; yazılan ışın sayısını döndürür. `lit`: fikstür
 * başına yanma oranı (güvenli modda hız sınırlı). Renkler doğrusal ışıktadır; parlaklık (ışık
 * düzeyi, nabız, strob) renge katılır.
 */
/**
 * Güvenli modda ışınların yönü ve rengi de hız sınırlıdır (desen ya da bölüm değişiminde, ölçü
 * başındaki renk değişiminde sıçramaz). Fikstür başına durum; diziler bir kez ayrılır.
 */
export interface BeamEase {
  dirs: Float32Array;
  cols: Float32Array;
  ready: Uint8Array;
}

/** Güvenli modda yönün (radyan/sn, yaklaşık) ve renk kanallarının (1/sn) en yüksek değişim hızı. */
export const SAFE_TURN_RATE = 0.6;
export const SAFE_COLOR_RATE = 0.5;

export function createBeamEase(count: number): BeamEase {
  return {
    dirs: new Float32Array(count * 3),
    cols: new Float32Array(count * 3),
    ready: new Uint8Array(count),
  };
}

function approach(state: Float32Array, at: number, target: number, step: number, snap: boolean) {
  const v = state[at]!;
  state[at] = snap ? target : v + Math.max(-step, Math.min(step, target - v));
}

/**
 * Işınları gölgelendiricinin dizisine yazar; yazılan ışın sayısını döndürür. `lit`: fikstür
 * başına yanma oranı (güvenli modda hız sınırlı). Renkler doğrusal ışıktadır; parlaklık (ışık
 * düzeyi, nabız, strob) renge katılır. `ease` verilirse (güvenli mod) yön ve renk hız sınırlıdır.
 */
export function packBeams(
  cue: ShowCue,
  t: number,
  fixtures: readonly Fixture[],
  lit: Float32Array,
  palette: ShowPalette,
  seed: number,
  out: Float32Array,
  ease: { state: BeamEase; dt: number; jump: boolean } | null = null,
): number {
  const seedPhase = ((seed % 1000) / 1000) * Math.PI * 2;
  const strobeMul = cue.strobeActive ? 0.1 + 1.5 * cue.strobe : 1;
  const mix = springMix(cue.patternMix);
  const dt = ease ? Math.max(0, Math.min(ease.dt, 0.1)) : 0;
  let n = 0;
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i]!;
    const on = lit[i] ?? 0;
    if (on <= 0.002 && !ease) continue;
    const a = patternDir(cue.patternFrom, f, cue, t, seedPhase, tmpA);
    const b = patternDir(cue.pattern, f, cue, t, seedPhase, tmpB);
    let dx = a[0] + (b[0] - a[0]) * mix;
    let dy = a[1] + (b[1] - a[1]) * mix;
    let dz = a[2] + (b[2] - a[2]) * mix;
    let len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    // Renk: ana ve karşıt jel sırayla; sıcak beyaz payı; lazer karşıt jelde.
    const alt = f.rank % 2 === 1 ? 1 - cue.colorMix : cue.colorMix;
    const gel = f.group === "laser" ? 1 - cue.colorMix * 0.5 : alt;
    const isSpot = cue.pattern === "spot" && f.group === "back" && f.rank === 0;
    const warm = isSpot ? 1 : cue.warmth * 0.5;
    const white = cue.strobeActive ? cue.strobe : 0;
    const color = (k: number) => {
      const c = palette.primary[k]! + (palette.secondary[k]! - palette.primary[k]!) * gel;
      const w = c + (palette.warm[k]! - c) * warm;
      return w + (palette.white[k]! - w) * white;
    };
    let r = color(0);
    let g = color(1);
    let bl = color(2);
    if (ease) {
      const st = ease.state;
      const snap = ease.jump || st.ready[i] === 0;
      st.ready[i] = 1;
      const turn = SAFE_TURN_RATE * dt;
      approach(st.dirs, i * 3, dx, turn, snap);
      approach(st.dirs, i * 3 + 1, dy, turn, snap);
      approach(st.dirs, i * 3 + 2, dz, turn, snap);
      dx = st.dirs[i * 3]!;
      dy = st.dirs[i * 3 + 1]!;
      dz = st.dirs[i * 3 + 2]!;
      len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      const shade = SAFE_COLOR_RATE * dt;
      approach(st.cols, i * 3, r, shade, snap);
      approach(st.cols, i * 3 + 1, g, shade, snap);
      approach(st.cols, i * 3 + 2, bl, shade, snap);
      r = st.cols[i * 3]!;
      g = st.cols[i * 3 + 1]!;
      bl = st.cols[i * 3 + 2]!;
      if (on <= 0.002) continue;
    }
    if (n >= out.length / BEAM_FLOATS) continue;
    // Vuruş adımı varken (drop, yüksek bölüm) fikstürler iki takım: her vuruşta biri vurgulanır
    // (sağ-sol, tek-çift "kovalamaca"); yoksa hepsi birlikte nefes alır.
    const chase = cue.step >= 0 && f.group !== "laser";
    const accent = chase
      ? (f.rank + cue.step) % 2 === 0
        ? cue.pulse
        : 0.2 * cue.pulse
      : cue.pulse;
    const pulse =
      (chase ? 0.55 + 0.9 * accent : 1 + 0.55 * accent * (f.group === "laser" ? 0.5 : 1)) *
      (1 - cue.flicker * (1 - cue.pulse));
    const power = f.power * on * cue.level * pulse * strobeMul * (isSpot ? 1.3 : 1);
    const o = n * BEAM_FLOATS;
    out[o] = f.pos[0];
    out[o + 1] = f.pos[1];
    out[o + 2] = f.pos[2];
    out[o + 3] = f.r0;
    out[o + 4] = dx;
    out[o + 5] = dy;
    out[o + 6] = dz;
    out[o + 7] = isSpot ? 0.055 : f.spread;
    out[o + 8] = r * power;
    out[o + 9] = g * power;
    out[o + 10] = bl * power;
    out[o + 11] = f.glow;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Kamera

export interface Camera {
  pos: Vec3;
  target: Vec3;
  /** Dikey görüş açısı (derece). */
  fov: number;
}

/** Çekimin `s` saniyedeki duruşu (`speed`: yoğunluğun kamera katı). */
export function shotPose(shot: Shot, s: number, speed: number, out: Camera): Camera {
  const k = Math.max(0, s) * speed;
  switch (shot) {
    case "low": {
      // Alçak yan çekim: kamera zemine yakın, yana kayar (ışınlarla paralaks); ıslak zemin öne çıkar.
      const x = -3 + Math.min(6, 0.14 * k);
      out.pos = [x, 0.9, 5.5];
      out.target = [x * 0.25 + 1, 4.6, -14];
      out.fov = 62;
      return out;
    }
    case "crane": {
      const a = 0.55 + 0.025 * k;
      out.pos = [Math.sin(a) * 13, 8.2 + 0.6 * Math.sin(0.05 * k), -6 + Math.cos(a) * 13];
      out.target = [0, 1.2, -9];
      out.fov = 56;
      return out;
    }
    case "build": {
      const z = 2 - Math.min(3, 0.15 * k);
      out.pos = [0, 1.1, z];
      out.target = [0, 7, -12];
      out.fov = 64;
      return out;
    }
    case "wide": {
      // Son doruk: geniş salon çekimi, kamera yavaşça yükselir (vinç).
      out.pos = [0.4 * Math.sin(0.09 * k), 1.5 + Math.min(3, 0.12 * k), 10 - Math.min(2, 0.08 * k)];
      out.target = [0, 4.4, -14];
      out.fov = 60;
      return out;
    }
    default: {
      const z = 11 - Math.min(5, 0.1 * k);
      out.pos = [0.6 * Math.sin(0.07 * k), 1.75 + 0.1 * Math.sin(0.11 * k), z];
      out.target = [0, 3.2, -14];
      out.fov = 58;
      return out;
    }
  }
}

const poseA: Camera = { pos: [0, 0, 0], target: [0, 0, 0], fov: 60 };
const poseB: Camera = { pos: [0, 0, 0], target: [0, 0, 0], fov: 60 };

/** Güvenli modda çekimler arası geçiş (sn): kesme yerine yavaş kayma. */
export const SAFE_SHOT_BLEND = 2.5;

/**
 * Kameranın `t` anındaki duruşu: çekim, itiş (beklenti ve yaylı aşma), görüş açısı vuruşu, drop
 * sarsıntısı. Varsayılan modda çekim değişimi kesmedir; güvenli modda önceki çekimden yavaşça
 * kayar.
 */
export function cameraAt(
  cue: ShowCue,
  t: number,
  speed: number,
  safe: boolean,
  out: Camera,
): Camera {
  const s = t - cue.shotStart;
  shotPose(cue.shot, s, speed, poseB);
  let pos = poseB.pos;
  let target = poseB.target;
  let fov = poseB.fov;
  if (safe && s < SAFE_SHOT_BLEND && cue.prevShot !== cue.shot) {
    shotPose(cue.prevShot, t - cue.prevShotStart, speed, poseA);
    const m = clamp01(s / SAFE_SHOT_BLEND);
    const e = m * m * (3 - 2 * m);
    pos = lerp3(poseA.pos, poseB.pos, e);
    target = lerp3(poseA.target, poseB.target, e);
    fov = poseA.fov + (poseB.fov - poseA.fov) * e;
  }
  // İtiş: kameranın bakış yönünde.
  const fx = target[0] - pos[0];
  const fy = target[1] - pos[1];
  const fz = target[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const shake = cue.hit * 0.06;
  out.pos = [
    pos[0] + (fx / fl) * cue.push + shake * Math.sin(t * 53),
    pos[1] + (fy / fl) * cue.push + shake * Math.sin(t * 61 + 1),
    pos[2] + (fz / fl) * cue.push,
  ];
  out.target = [target[0], target[1], target[2]];
  out.fov = fov + cue.fovKick;
  return out;
}

function lerp3(a: Vec3, b: Vec3, m: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];
}

// ---------------------------------------------------------------------------------------------
// Karenin bütünü: kurgu → ışınlar, kamera, son işlem değerleri

export interface ShowStepInput {
  sheet: CueSheet;
  time: number;
  dt: number;
  opts: ShowOptions;
  live: LiveInput | null;
  /** Ölçü başı yoksa vuruş ızgarası için tempo. */
  bpm: number;
  palette: ShowPalette;
  /** Sarma ya da şarkı değişimi: hız sınırlı değerler hemen yerine oturur. */
  jump: boolean;
  /** Harita yeni geldi (canlı moddan kurguya geçiş): değerler birkaç saniye hız sınırlı geçer. */
  easing: boolean;
}

export interface ShowStep {
  cue: ShowCue;
  camera: Camera;
  beams: Float32Array;
  beamCount: number;
  fill: Rgb;
  back: Rgb;
  haze: number;
  hazeTime: number;
  exposure: number;
  bloomStrength: number;
  bloomSpread: number;
  vignette: number;
}

export interface ShowDirector {
  step(input: ShowStepInput): ShowStep;
}

/** Pusun sürüklenme hızı (sn/sn): müzik durunca da yavaşça kıpırdar. */
const HAZE_DRIFT = 1;

/**
 * Şovun kare kare yürütücüsü: kurguyu (`showCue`) ışınlara ve kameraya çevirir. Kurgu mutlak
 * zamanın saf fonksiyonudur; burada tutulan durum yalnızca güvenli modun (ve canlı moddan kurguya
 * geçişin) hız sınırlı ışık düzeyi ve pusun saati. Diziler bir kez ayrılır.
 */
export function createShowDirector(quality: Quality): ShowDirector {
  const profile = QUALITY_PROFILES[quality];
  const fixtures = buildFixtures(profile);
  const lit = new Float32Array(fixtures.length);
  const safe = createSafeLights(fixtures.length);
  const beamEase = createBeamEase(fixtures.length);
  const beams = new Float32Array(MAX_BEAMS * BEAM_FLOATS);
  const camera: Camera = { pos: [0, 1.7, 10], target: [0, 4, -14], fov: 58 };
  const fill: Rgb = [0, 0, 0];
  const back: Rgb = [0, 0, 0];
  let hazeTime = 0;
  let first = true;
  return {
    step(input) {
      const { sheet, time, opts, palette } = input;
      const cue = showCue(sheet, time, opts, profile, input.live, input.bpm);
      targetLit(cue, fixtures, lit);
      const limited = opts.safe || input.easing;
      let level = cue.level;
      let fillLevel = cue.fill;
      if (limited) {
        stepSafeLights(safe, cue.level, cue.fill, lit, input.dt, input.jump || first);
        level = safe.level;
        fillLevel = safe.fill;
        cue.level = level;
        cue.fill = fillLevel;
      } else {
        // Hız sınırı yokken de durum güncel kalsın (güvenli mod açılınca sıçramasın).
        stepSafeLights(safe, cue.level, cue.fill, lit, input.dt, true);
      }
      // Güvenli modda yön ve renk de hız sınırlı; değilse durum yalnızca güncel tutulur.
      const beamCount = packBeams(
        cue,
        time,
        fixtures,
        limited ? safe.beams : lit,
        palette,
        sheet.seed,
        beams,
        { state: beamEase, dt: input.dt, jump: !opts.safe || input.jump || first },
      );
      first = false;
      cameraAt(cue, time, INTENSITY_PROFILES[opts.intensity].camera, opts.safe, camera);
      hazeTime +=
        Math.max(0, Math.min(input.dt, 0.25)) * HAZE_DRIFT * (opts.reducedMotion ? 0.4 : 1);

      const strobe = cue.strobeActive ? cue.strobe : 0;
      const gel = (k: number) =>
        palette.primary[k]! + (palette.secondary[k]! - palette.primary[k]!) * cue.colorMix;
      for (let k = 0; k < 3; k++) {
        const warm = gel(k) + (palette.warm[k]! - gel(k)) * cue.warmth * 0.6;
        fill[k] = warm * fillLevel * level * 0.14 + palette.white[k]! * strobe * 0.05;
        back[k] = gel(k) * 0.018 * Math.min(1.5, level);
      }
      return {
        cue,
        camera,
        beams,
        beamCount,
        fill,
        back,
        haze: 1,
        hazeTime,
        exposure: 1,
        bloomStrength: opts.safe ? 0.3 : 0.3 + 0.3 * cue.hit + 0.1 * strobe,
        bloomSpread: Math.min(0.92, 0.62 + 0.25 * cue.hit),
        vignette: 0.42,
      };
    },
  };
}
