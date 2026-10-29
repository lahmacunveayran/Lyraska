import type { BarColors, Rgb } from "./photoScene";

/**
 * "Kendi resmin" sahnesinin parçacıkları: ışık çizgisinin çubuklarından doğan küçük ışık
 * noktaları. Kıvılcım: çizgiden yukarı süzülür, ekranın üst yarısında yavaşça söner. Kar:
 * çubuklardan aşağı dökülür, kısa yol alıp söner. Vuruşta (Görsel Yönetmen'in nabzı) ve basta
 * daha çok doğar; doğdukları yer o an yüksek olan çubukların yakını.
 *
 * Bütün hesap burada ve belirlenimli (tohumlu rastgele); havuz önceden ayrılır, karede bellek
 * ayrılmaz. Epilepsi güvenli modunda ve "animasyonları azalt" açıkken parçacık çizilmez
 * (`particlesShown`): güvenli moddaki parlama sınırı (`measureLine`) parçacıkları hesaba katmaz.
 */

export type ParticleStyle = "sparks" | "snow" | "off";

export const PARTICLE_STYLES: readonly { id: ParticleStyle; name: string }[] = [
  { id: "sparks", name: "Kıvılcım" },
  { id: "snow", name: "Kar" },
  { id: "off", name: "Kapalı" },
];

export const DEFAULT_PARTICLE_STYLE: ParticleStyle = "sparks";
const STORAGE_KEY = "lyraska.photoParticles";

/** Son seçilen parçacık biçimi. Kayıt yoksa ya da okunamazsa Kıvılcım. */
export function loadParticleStyle(): ParticleStyle {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return PARTICLE_STYLES.find((s) => s.id === saved)?.id ?? DEFAULT_PARTICLE_STYLE;
  } catch {
    return DEFAULT_PARTICLE_STYLE;
  }
}

export function saveParticleStyle(style: ParticleStyle): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    /* Kaydedilemezse bir sonraki açılışta Kıvılcım'la başlar. */
  }
}

/** Parçacıklar çizilir mi: Kapalı değilse, güvenli mod ve "animasyonları azalt" kapalıysa. */
export function particlesShown(style: ParticleStyle, safe: boolean, reducedMotion: boolean) {
  return style !== "off" && !safe && !reducedMotion;
}

/** Havuzdaki en çok parçacık. */
export const PARTICLE_POOL = 300;

/** Bir biçimin hareketi. Uzunluklar ekran yüksekliği cinsinden (boydan bağımsız görünüm). */
interface StyleMotion {
  /** Tam enerjide saniyede doğan parçacık (nabızsız). */
  rate: number;
  /** Ömür (sn). */
  life: [number, number];
  /** Dikey hız (yükseklik/sn; eksi yukarı). */
  speed: [number, number];
  /** Yana salınımın hızı (yükseklik/sn). */
  drift: number;
  /** Yarıçap (yükseklik oranı). */
  size: [number, number];
  /** Belirme süresi (sn). */
  fadeIn: number;
}

export const PARTICLE_MOTION: Record<Exclude<ParticleStyle, "off">, StyleMotion> = {
  // Flying High: çizgiden kopan kıvılcımlar ekranın üstüne doğru yavaşça süzülür.
  sparks: {
    rate: 40,
    life: [2.0, 4.0],
    speed: [-0.15, -0.06],
    drift: 0.012,
    size: [0.0012, 0.0025],
    fadeIn: 0.15,
  },
  // Moonlight Shadow: çubuklardan dökülen kar, kısa yol alıp söner.
  snow: {
    rate: 110,
    life: [0.6, 1.4],
    speed: [0.035, 0.08],
    drift: 0.006,
    size: [0.0013, 0.0024],
    fadeIn: 0.06,
  },
};

/** Yarıçapın alt sınırı (CSS piksel): küçük pencerede de görünsün. */
const MIN_RADIUS = 0.7;
/** Sessizken (çalarken) de az da olsa doğum (tam hızın oranı). */
const IDLE_DRIVE = 0.2;
/** Nabzın doğuma katkısı: vuruş anında hız `1 + PULSE_BOOST` katı. */
const PULSE_BOOST = 1.2;
/** Kar çubuğun ucuna yakın doğar: boyunun bu oranından ucuna kadar. */
const SNOW_TIP = 0.85;
/** Bir karede en uzun adım (sn): sekme gizlenip dönünce sıçramasın. */
const MAX_DT = 0.1;

/** Önceden ayrılmış parçacık havuzu (diziler hiç büyümez). */
export interface ParticlePool {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly age: Float64Array;
  readonly life: Float64Array;
  readonly radius: Float64Array;
  readonly bright: Float64Array;
  readonly phase: Float64Array;
  readonly alive: Uint8Array;
  /** Çubuk seçimi için birikimli ağırlıklar (çubuk sayısı kadar). */
  readonly cumulative: Float64Array;
  /** Canlı parçacık sayısı. */
  count: number;
  /** Rastgele üretecin durumu (mulberry32). */
  rng: number;
  /** Doğum hızının küsuratı (bir sonraki kareye kalan). */
  carry: number;
  /** Boş yer aramasının başlangıcı. */
  cursor: number;
  /** Hangi biçimle doğdular (biçim değişince havuz boşaltılır). */
  style: ParticleStyle;
}

export function createParticlePool(seed = 1, bars = 200): ParticlePool {
  const f = () => new Float64Array(PARTICLE_POOL);
  return {
    x: f(),
    y: f(),
    vx: f(),
    vy: f(),
    age: f(),
    life: f(),
    radius: f(),
    bright: f(),
    phase: f(),
    alive: new Uint8Array(PARTICLE_POOL),
    cumulative: new Float64Array(bars),
    count: 0,
    rng: seed >>> 0 || 1,
    carry: 0,
    cursor: 0,
    style: DEFAULT_PARTICLE_STYLE,
  };
}

/** 0..1 arası tohumlu rastgele sayı (mulberry32). */
function random(pool: ParticlePool): number {
  pool.rng = (pool.rng + 0x6d2b79f5) >>> 0;
  let t = pool.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function between(pool: ParticlePool, [lo, hi]: [number, number]): number {
  return lo + (hi - lo) * random(pool);
}

/** Bir karenin girdisi: çizilen çubuklar ve müziğin o anı. */
export interface ParticleInput {
  /** Çizilen çubukların boyu (CSS piksel; çizgiden aşağı). */
  extents: ArrayLike<number>;
  /** Ekran (CSS piksel), çizginin yeri, çubuk aralığı, çubuğun en büyük boyu. */
  width: number;
  height: number;
  top: number;
  pitch: number;
  cap: number;
  /** Görsel Yönetmen'in vuruş nabzı (0..1; yoksa 0). */
  pulse: number;
  /** Yeni parçacık doğsun mu (yalnız çalarken). */
  spawn: boolean;
}

/** Çubukların enerjisi (0..1): ortalama boy ve bas (soldaki beşte bir) birlikte. */
export function particleDrive(extents: ArrayLike<number>, cap: number): number {
  const n = extents.length;
  if (n === 0 || !(cap > 0)) return 0;
  const bassBars = Math.max(1, Math.round(n / 5));
  let all = 0;
  let bass = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, Math.max(0, extents[i]! / cap));
    all += v;
    if (i < bassBars) bass += v;
  }
  return Math.min(1, 0.9 * (all / n) + 0.9 * (bass / bassBars));
}

/**
 * Havuzu `dt` saniye ilerletir: yaşlananlar söner, yenileri o anki yüksek çubukların yakınında
 * doğar. Kapalı biçimde ya da biçim değişince havuz boşalır.
 */
export function stepParticles(
  pool: ParticlePool,
  style: ParticleStyle,
  input: ParticleInput,
  dtSeconds: number,
): void {
  if (style !== pool.style) {
    pool.alive.fill(0);
    pool.count = 0;
    pool.carry = 0;
    pool.style = style;
  }
  if (style === "off") return;
  const motion = PARTICLE_MOTION[style];
  const dt = Math.max(0, Math.min(MAX_DT, dtSeconds));
  const { height } = input;
  const drift = motion.drift * height;

  // Yaşayanlar.
  let count = 0;
  for (let i = 0; i < PARTICLE_POOL; i++) {
    if (!pool.alive[i]) continue;
    const age = pool.age[i]! + dt;
    if (age >= pool.life[i]!) {
      pool.alive[i] = 0;
      continue;
    }
    pool.age[i] = age;
    const sway = Math.sin(pool.phase[i]! + age * 2.1);
    pool.x[i] = pool.x[i]! + (pool.vx[i]! + drift * sway) * dt;
    pool.y[i] = pool.y[i]! + pool.vy[i]! * dt;
    count++;
  }
  pool.count = count;

  if (!input.spawn || dt === 0 || input.width <= 0 || height <= 0) {
    pool.carry = 0;
    return;
  }

  // Doğum hızı: enerji (ortalama ve bas) ve nabız.
  const energy = particleDrive(input.extents, input.cap);
  const pulse = Math.min(1, Math.max(0, input.pulse));
  const rate = motion.rate * (IDLE_DRIVE + (1 - IDLE_DRIVE) * energy) * (1 + PULSE_BOOST * pulse);
  pool.carry += rate * dt;
  let born = Math.floor(pool.carry);
  pool.carry -= born;
  if (born === 0) return;

  // Çubuk seçimi: boyuyla orantılı (yüksek çubuklar daha sık, ama bütün çizgi boyunca).
  const bars = Math.min(input.extents.length, pool.cumulative.length);
  let total = 0;
  for (let k = 0; k < bars; k++) {
    const e = Math.max(0, input.extents[k]!);
    total += e + 1e-6;
    pool.cumulative[k] = total;
  }
  if (bars === 0) return;

  while (born > 0) {
    born--;
    const slot = freeSlot(pool);
    if (slot < 0) {
      pool.carry = 0;
      break;
    }
    const target = random(pool) * total;
    let lo = 0;
    let hi = bars - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pool.cumulative[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    const extent = Math.max(0, input.extents[lo]!);
    pool.x[slot] = lo * input.pitch + (random(pool) - 0.5) * input.pitch;
    // Kıvılcım çizginin hemen üstünden kopar; kar çubuğun ucundan dökülür (çubuğun içinde
    // doğsaydı parlak çubukta görünmezdi).
    pool.y[slot] =
      style === "sparks"
        ? input.top - 2 * random(pool)
        : input.top + extent * (SNOW_TIP + (1 - SNOW_TIP) * random(pool));
    pool.vx[slot] = (random(pool) - 0.5) * drift;
    pool.vy[slot] = between(pool, motion.speed) * height;
    pool.age[slot] = 0;
    pool.life[slot] = between(pool, motion.life);
    pool.radius[slot] = Math.max(MIN_RADIUS, between(pool, motion.size) * height);
    pool.bright[slot] = 0.65 + 0.35 * random(pool);
    pool.phase[slot] = random(pool) * 2 * Math.PI;
    pool.alive[slot] = 1;
    pool.count++;
  }
}

function freeSlot(pool: ParticlePool): number {
  for (let n = 0; n < PARTICLE_POOL; n++) {
    const i = (pool.cursor + n) % PARTICLE_POOL;
    if (!pool.alive[i]) {
      pool.cursor = (i + 1) % PARTICLE_POOL;
      return i;
    }
  }
  return -1;
}

/** Parçacığın o anki saydamlığı (0..1): yumuşak belirir, ömrünün son %45'inde söner. */
export function particleAlpha(pool: ParticlePool, i: number): number {
  if (!pool.alive[i] || pool.style === "off") return 0;
  const age = pool.age[i]!;
  const life = pool.life[i]!;
  const fadeIn = PARTICLE_MOTION[pool.style].fadeIn;
  const rise = Math.min(1, age / fadeIn);
  const left = (life - age) / (0.45 * life);
  const fall = Math.min(1, Math.max(0, left));
  return pool.bright[i]! * rise * fall * fall;
}

/** Parçacığın rengi: çubuğun ışıltı rengi, yarı yarıya beyaza açılmış (öz ile ışıltı arası). */
export function particleColor(colors: BarColors): Rgb {
  const [r, g, b] = colors.glow;
  const lift = (c: number) => Math.round(c + (255 - c) * 0.45);
  return [lift(r), lift(g), lift(b)];
}
