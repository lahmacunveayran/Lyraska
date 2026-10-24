/**
 * "Kendi resmin" sahnesinin saf hesapları: kullanıcının resmi arka planda, ortada şarkıyla oynayan
 * ışık çizgisi, üstünde şarkının adı ve süre.
 *
 * Görünüş proje sahibinin örnek videolarından ölçüldü (docs/arastirma/kendi-resmin/):
 * - Çizgi ekranın tam ortasında; çubuklar yalnızca **aşağı** sarkar (üst kenarları düz bir çizgi).
 *   Sessizlikte her çubuk ekran yüksekliğinin ~%0,33'ü kadar kısa bir çentik: noktalı çizgi.
 * - 200 çubuk kenardan kenara (ilk çubuk sol kenarda, son çubuk sağ kenarda); çubuk ince: aralığın
 *   %32'si. Her çubuk tek bir frekanstır (src-tauri/src/audio/spectrum.rs: 20 Hz – 2 kHz doğrusal).
 * - Çubuğun özü neredeyse beyaz (ışıltı renginin %12'si karışır: örnekte (254, 226, 230)), çevresi
 *   resmin baskın rengiyle parlar. Işıltı, çubuk aralığı genişliğinde bir dikdörtgenin Gauss
 *   bulanıklığıdır (σ = aralığın 0,6'sı); örnekte yatay kesit bu modele %5 içinde uyuyor.
 * - Işık **eklenir** (tuval `mix-blend-mode: plus-lighter`): kırmızı ışıltı koyu kırmızı zemini
 *   parlatır, beyaz tüyün üstünde ise bir şey değiştirmez (örnekte de öyle). Koyu bant ya da
 *   karartma yoktur.
 *
 * Epilepsi güvenliği: resim sabittir. Işık yalnızca eklendiği için (hiçbir piksel kararmaz) her
 * WCAG penceresinin ortalama parlaklığı, çubuksuz resminkiyle onun üstüne çubukların o karede
 * eklediği ışık arasında kalır. Her karede çubukların bütün pencerelerde ekleyebileceği en büyük
 * parlaklık resmin kendi pikselleriyle hesaplanır (`measureLine`, `lightBound`) ve `FLASH_BUDGET`'ı
 * (0,08) geçecekse o karenin çubukları orantılı kısaltılır (`limitExtents`). Böylece herhangi iki
 * kare arasında hiçbir pencerenin ortalaması 0,08'den fazla değişmez: parlama (≥ 0,1) hiç olmaz,
 * saniyede kaç kez olduğu önemsizleşir. Örnek videonun kendisinde bu değişim en çok 0,03–0,05.
 *
 * Tarayıcı renkleri sRGB uzayında toplar ve 1'de keser. Bir kanalın doğrusal ışığı, `p` kadar
 * eklenince en çok `min(p · S(b), H(b))` artar: `H(b) = 1 − lin(b)` kalan pay, `S(b) = H(b) / (1 − b)`
 * eğrinin dışbükeyliğinden (açık zeminde aynı ekleme daha çok ışık demek). İki ışık üst üste
 * binince toplam bu sınırların toplamını geçmez; her çubuğun özü ve ışıltısı ayrı sayılabilir.
 */
import { flashWindow } from "./flash";

/** Çubuk sayısı (soldan sağa bastan tize). */
export const PHOTO_BARS = 200;
/** Çubuğun (özün) genişliğinin çubuk aralığına oranı (örnekte 3,5 / 10,9). */
export const BAR_DUTY = 0.32;
/** Işıltı dikdörtgeninin genişliği ve bulanıklığı (σ), çubuk aralığı cinsinden. */
export const GLOW_WIDTH = 1;
export const GLOW_SIGMA = 0.6;
/**
 * Işıltının parlaklığı: ışıltı renginin bağıl parlaklığı bunu geçerse saydamlığı o oranda azalır
 * (kırmızıda 1, beyazda 0,21). Örneklerde de beyaz ışıltı kırmızıdan sönüktü; ikisinin eklediği
 * parlaklık yakın (ölçülen oran 0,76).
 */
export const GLOW_LUMINANCE = 0.2126;
/** Özün rengine karışan ışıltı payı (geri kalanı beyaz). */
export const CORE_TINT = 0.12;
/** Çizginin yüksekliği (ekranın oranı). */
export const LINE_Y = 0.5;
/** Sessizlikte çubuğun boyu (ekran yüksekliğinin oranı; en az 2 piksel). */
export const REST_FRACTION = 0.0033;
/** Çubuğun en büyük boyu (ekran yüksekliğinin oranı): seviye 1. */
export const MAX_EXTENT_FRACTION = 0.45;
/** Bir pencerede izin verilen en büyük ortalama değişim (parlama eşiği 0,1; pay bırakılır). */
export const FLASH_BUDGET = 0.08;
/** Ölçümde ışıltının kuyruğu: σ'nın bu katına kadar sayılır (ötesi ihmal edilecek kadar küçük). */
const TAIL_SIGMAS = 4;
/** Tarayıcının bulanıklığı tam Gauss olmayabilir: ışıltının ışığı bu kadar fazla sayılır. */
const GLOW_TOLERANCE = 1.1;
const ROUNDING = 1 / 255;

export type Rgb = [number, number, number];

/** sRGB bileşeninden doğrusal ışığa (WCAG bağıl parlaklık). */
function linearRaw(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 0..255 tamsayılar için önceden hesaplanmış (resim ölçümü hızlı olsun). */
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => linearRaw(i));

function linear(channel: number): number {
  return Number.isInteger(channel) && channel >= 0 && channel <= 255
    ? LINEAR[channel]!
    : linearRaw(channel);
}

/** WCAG bağıl parlaklık (0..1). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

/** Kalan pay `H(b) = 1 − lin(b)` (b: 0..255). */
const HEADROOM = Float64Array.from({ length: 256 }, (_, i) => 1 - LINEAR[i]!);
/** Eğim sınırı `S(b) = H(b) / (1 − b)`; b = 255'te eğrinin oradaki eğimi. */
const SLOPE = Float64Array.from({ length: 256 }, (_, i) =>
  i < 255 ? HEADROOM[i]! / (1 - i / 255) : 2.4 / 1.055,
);

/**
 * `p` (0..1, sRGB, kanal başına) ışık, en koyusu `dark` en açığı `bright` olabilen zemine eklenince
 * pikselin bağıl parlaklığının en çok artışı: kanal başına `min(p · S(bright), H(dark))` (`S`
 * zeminle artar, `H` azalır).
 */
export function addedLight(p: Rgb, dark: Rgb, bright: Rgb): number {
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const pk = p[k]!;
    if (pk <= 0) continue;
    sum += LUMA[k]! * Math.min(pk * SLOPE[bright[k]!]!, HEADROOM[dark[k]!]!);
  }
  return sum;
}

/** sRGB toplama (tarayıcı gibi, 1'de kesilir) ile pikselin gerçek parlaklık artışı. */
export function exactAddedLight(p: Rgb, background: Rgb): number {
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const b = background[k]! / 255;
    sum += LUMA[k]! * (linearRaw(255 * Math.min(1, b + p[k]!)) - linearRaw(255 * b));
  }
  return sum;
}

/** Çubukların ekrandaki ölçüleri (CSS piksel). */
export interface BarGeometry {
  width: number;
  height: number;
  /** Çubuk aralığı: çubuk ortaları `k · pitch` (ilk sol kenarda, son sağ kenarda). */
  pitch: number;
  /** Özün genişliği. */
  core: number;
  /** Işıltı dikdörtgeninin genişliği ve bulanıklığı (σ). */
  glowWidth: number;
  sigma: number;
  /** Çizginin yüksekliği (çubukların üst kenarı). */
  top: number;
  /** Sessizlikteki ve en büyük boy. */
  rest: number;
  cap: number;
}

export function barGeometry(width: number, height: number): BarGeometry {
  const pitch = width / Math.max(1, PHOTO_BARS - 1);
  return {
    width,
    height,
    pitch,
    core: Math.max(1, BAR_DUTY * pitch),
    glowWidth: GLOW_WIDTH * pitch,
    sigma: Math.max(0.5, GLOW_SIGMA * pitch),
    top: height * LINE_Y,
    rest: Math.max(2, REST_FRACTION * height),
    cap: Math.max(2, MAX_EXTENT_FRACTION * height),
  };
}

/** Işıltı rengi ve saydamlığı, özün rengi. */
export interface BarColors {
  glow: Rgb;
  /** Işıltının saydamlığı (`GLOW_LUMINANCE`). */
  glowAlpha: number;
  core: Rgb;
}

/** Işıltı renginden çubuğun renkleri: öz beyaza yakın (`CORE_TINT`), ışıltı aynı parlaklıkta. */
export function barColors(glow: Rgb): BarColors {
  const lum = relativeLuminance(glow);
  return {
    glow,
    glowAlpha: lum > GLOW_LUMINANCE ? GLOW_LUMINANCE / lum : 1,
    core: coreColor(glow),
  };
}

/** Özün rengi: beyaz, ışıltı renginden `CORE_TINT` kadar. */
export function coreColor([r, g, b]: Rgb): Rgb {
  const mix = (c: number) => Math.round(255 - (255 - c) * CORE_TINT);
  return [mix(r), mix(g), mix(b)];
}

function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

/** `[a, b]` aralığının (1 yükseklikte) Gauss bulanıklığının `x`'teki değeri. */
export function blurredBox(x: number, a: number, b: number, sigma: number): number {
  const k = 1 / (sigma * Math.SQRT2);
  return Math.max(0, Math.min(1, 0.5 * (erf((b - x) * k) - erf((a - x) * k))));
}

/**
 * Ölçülmüş çizgi bölgesi: her çubuğun özünün ve ışıltısının satır satır ekleyebileceği en büyük
 * parlaklık (bağıl parlaklık × CSS piksel², satır satır birikimli).
 */
export interface LineMap {
  geometry: BarGeometry;
  /** Birikimli tabloların ilk satırı ve satır sayısı (CSS piksel satırı). */
  firstRow: number;
  rows: number;
  /** `[k · (rows + 1) + r]`: çubuk `k`'nın `firstRow`'dan `firstRow + r`'ye kadarki toplamı. */
  core: Float64Array;
  glow: Float64Array;
  /** Işıltının bir satırdaki en büyük toplamı (çubuk başına): dikey kuyruklar için. */
  glowRowMax: Float64Array;
  /** Bir çubuğun ışığının yatayda uzandığı yarı genişlik (CSS piksel). */
  reach: number;
}

/**
 * Zemin: `(x, y)` CSS pikselinde kanal başına en koyu ve en açık değer (0..255 tamsayı). Resim
 * bilinmezken 0 ve 255.
 */
export type Background = ((x: number, y: number, dark: Rgb, bright: Rgb) => void) & {
  /** Her yerde aynı: ölçüm tek satırdan yapılır. */
  uniform?: boolean;
};

/** Tek renkli zemin (en koyu `dark`, en açık `bright`). */
export function uniformBackground(dark: Rgb, bright: Rgb): Background {
  const background: Background = (_x, _y, d, b) => {
    for (let k = 0; k < 3; k++) {
      d[k] = dark[k]!;
      b[k] = bright[k]!;
    }
  };
  background.uniform = true;
  return background;
}

/**
 * Ekrandaki gibi kırpılmış resim (`width`×`height` RGBA, CSS piksel başına bir piksel): her
 * pikselin 3×3 komşuluğunun en koyusu ve en açığı (tarayıcının ölçeklemesi ölçümden bir piksel
 * kayabilir).
 */
export function imageBackground(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Background {
  return (x, y, dark, bright) => {
    dark[0] = dark[1] = dark[2] = 255;
    bright[0] = bright[1] = bright[2] = 0;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
        const i = (yy * width + xx) * 4;
        for (let k = 0; k < 3; k++) {
          const v = rgba[i + k] ?? 0;
          if (v < dark[k]!) dark[k] = v;
          if (v > bright[k]!) bright[k] = v;
        }
      }
    }
  };
}

/**
 * `[b, b + P]` aralığında sRGB → doğrusal eğrinin kirişinin eğimi (b: 0..255; 1'de kesilir):
 * toplam eklenen ışık en çok `P` iken eklenen her `p` en çok `p ·` bu kadar ışık verir (eğri
 * dışbükey). `P = 1` (ya da daha büyük) için `SLOPE`.
 */
function chordSlope(P: number): Float64Array {
  return Float64Array.from({ length: 256 }, (_, i) => {
    const b = i / 255;
    const q = Math.min(Math.max(P, 1e-6), 1 - b);
    if (q <= 0) return SLOPE[255]!;
    return (linearRaw(255 * (b + q)) - LINEAR[i]!) / q;
  });
}

/**
 * Çizgi bölgesini ölçer, her çubuk için her satırda:
 * - Öz: dokunduğu (kenarda yarı kaplanan da) her pikselde zeminin bütün payı `H(en koyu)`: özün
 *   üstüne binen ışıltılar da dahil o piksel bundan fazla parlamaz.
 * - Işıltı: yatay kesit `blurredBox` (pikselin içindeki en büyük değer, `GLOW_TOLERANCE` payı).
 *   Işıltı dikdörtgenleri örtüşmez; bulanıklıkları toplamı bir pikselde 1'i geçmez. Bu yüzden bir
 *   pikseldeki toplam ışıltı en çok `P = glowAlpha · renk`; eklenen her parça o kirişin
 *   eğimiyle (`chordSlope`) sayılır, `H(en koyu)` ile sınırlanır.
 */
export function measureLine(
  background: Background,
  width: number,
  height: number,
  colors: BarColors,
): LineMap {
  const geometry = barGeometry(width, height);
  const { pitch, core, glowWidth, sigma, top, cap } = geometry;
  const tail = TAIL_SIGMAS * sigma;
  const firstRow = Math.max(0, Math.floor(top - tail) - 1);
  const lastRow = Math.min(Math.ceil(height), Math.ceil(top + cap + tail) + 1);
  const rows = Math.max(0, lastRow - firstRow);
  const reach = glowWidth / 2 + tail;
  const coreTable = new Float64Array(PHOTO_BARS * (rows + 1));
  const glowTable = new Float64Array(PHOTO_BARS * (rows + 1));
  const glowRowMax = new Float64Array(PHOTO_BARS);
  const columns = Math.max(0, Math.ceil(width));
  // Zeminin en koyusu ve en açığı, çizgi bölgesinin satırları için bir kez.
  const plane = columns * rows * 3;
  const darkPlane = new Uint8Array(plane);
  const brightPlane = new Uint8Array(plane);
  const dark: Rgb = [0, 0, 0];
  const bright: Rgb = [0, 0, 0];
  // Tek renkli zeminde bütün satırlar aynı: yalnızca ilk satır ölçülür, gerisi kopyalanır.
  const measuredRows = background.uniform ? Math.min(1, rows) : rows;
  for (let r = 0; r < measuredRows; r++) {
    for (let x = 0; x < columns; x++) {
      background(x, firstRow + r, dark, bright);
      const i = (r * columns + x) * 3;
      for (let c = 0; c < 3; c++) {
        darkPlane[i + c] = dark[c]!;
        brightPlane[i + c] = bright[c]!;
      }
    }
  }
  const glowUnit = colors.glow.map((c) => (c / 255) * colors.glowAlpha * GLOW_TOLERANCE);
  // 8 bitlik yuvarlama pikselde bir kez: toplamın üst sınırına bir basamak.
  const slopes = glowUnit.map((u) => chordSlope(u + ROUNDING));
  const [s0, s1, s2] = slopes as [Float64Array, Float64Array, Float64Array];
  const [u0, u1, u2] = glowUnit as [number, number, number];
  const headroom = (i: number) =>
    LUMA[0] * HEADROOM[darkPlane[i]!]! +
    LUMA[1] * HEADROOM[darkPlane[i + 1]!]! +
    LUMA[2] * HEADROOM[darkPlane[i + 2]!]!;
  for (let k = 0; k < PHOTO_BARS; k++) {
    const cx = k * pitch;
    const coreFrom = Math.max(0, Math.floor(cx - core / 2));
    const coreTo = Math.min(columns, Math.ceil(cx + core / 2));
    const from = Math.max(0, Math.floor(cx - reach));
    const to = Math.min(columns, Math.ceil(cx + reach));
    // Işıltının yatay kesiti: pikselin içindeki en büyük değer (ortaya en yakın nokta).
    const profile = new Float64Array(Math.max(0, to - from));
    for (let x = from; x < to; x++) {
      const nearest = Math.max(x, Math.min(x + 1, cx));
      profile[x - from] = blurredBox(nearest, cx - glowWidth / 2, cx + glowWidth / 2, sigma);
    }
    const base = k * (rows + 1);
    let rowMax = 0;
    let coreSum = 0;
    let glowSum = 0;
    for (let r = 0; r < rows; r++) {
      if (r < measuredRows) {
        coreSum = 0;
        glowSum = 0;
      }
      for (let x = from; x < to && r < measuredRows; x++) {
        const i = (r * columns + x) * 3;
        const g = profile[x - from]!;
        glowSum +=
          LUMA[0] * Math.min(u0 * g * s0[brightPlane[i]!]!, HEADROOM[darkPlane[i]!]!) +
          LUMA[1] * Math.min(u1 * g * s1[brightPlane[i + 1]!]!, HEADROOM[darkPlane[i + 1]!]!) +
          LUMA[2] * Math.min(u2 * g * s2[brightPlane[i + 2]!]!, HEADROOM[darkPlane[i + 2]!]!);
        if (x >= coreFrom && x < coreTo) coreSum += headroom(i);
      }
      coreTable[base + r + 1] = coreTable[base + r]! + coreSum;
      glowTable[base + r + 1] = glowTable[base + r]! + glowSum;
      rowMax = Math.max(rowMax, glowSum);
    }
    glowRowMax[k] = rowMax;
  }
  return { geometry, firstRow, rows, core: coreTable, glow: glowTable, glowRowMax, reach };
}

/**
 * Bir çubuğun ışıltısının çubuk satırları dışına taşan dikey kütlesi (satır): Gauss kuyrukları
 * iki uçta `σ / √(2π)`'şer, satırın en büyük değeriyle sayıldığından her uçta bir satır fazlası.
 */
export function glowTailRows(sigma: number): number {
  return 2 * (sigma / Math.sqrt(2 * Math.PI) + 1);
}

/**
 * Boyları `extents` (CSS piksel) olan çubukların herhangi bir WCAG penceresinde ekleyebileceği en
 * büyük ortalama parlaklık. Pencereye ışığının bir kısmı bile düşebilen çubuğun bütün ışığı
 * sayılır; çubuk boyu pencere yüksekliğini geçebileceği için bütün satırlar sayılır (ikisi de
 * fazla sayar). Işıltı çubuğun satırlarında tam (dikey bulanıklık içeride ≤ 1), kuyrukları
 * (`glowTailRows`) çubuğun en parlak satırıyla.
 */
export function lightBound(map: LineMap, extents: readonly number[]): number {
  const { geometry, firstRow, rows, reach } = map;
  const { width, height, pitch, top, sigma } = geometry;
  if (rows === 0 || width <= 0 || height <= 0) return 0;
  const tailRows = glowTailRows(sigma);
  const row = (y: number) => Math.max(0, Math.min(rows, y - firstRow));
  const light = new Float64Array(PHOTO_BARS);
  const c0 = row(Math.floor(top));
  for (let k = 0; k < PHOTO_BARS; k++) {
    const e = Math.max(0, extents[k] ?? 0);
    const base = k * (rows + 1);
    const c1 = row(Math.ceil(top + e));
    light[k] =
      map.core[base + c1]! -
      map.core[base + c0]! +
      map.glow[base + c1]! -
      map.glow[base + c0]! +
      tailRows * map.glowRowMax[k]!;
  }
  const win = flashWindow(width, height);
  // Pencereye ışığı düşebilen ardışık çubuk sayısı: ortaları `win.width + 2 · reach` içinde.
  const span = Math.min(PHOTO_BARS, Math.floor((win.width + 2 * reach) / pitch) + 1);
  let sum = 0;
  for (let k = 0; k < span; k++) sum += light[k]!;
  let worst = sum;
  for (let k = span; k < PHOTO_BARS; k++) {
    sum += light[k]! - light[k - span]!;
    worst = Math.max(worst, sum);
  }
  return worst / (win.width * win.height);
}

/**
 * Hedef boylar (`targets`, CSS piksel) bu karede `budget`'ı geçmeyecek biçimde: gerekirse her
 * çubuğun sessizlik boyunun üstündeki kısmı aynı oranda kısaltılır (ikiye bölerek arama). Sessizlik
 * boyları bile geçiyorsa sessizlik boyları.
 */
export function limitExtents(
  map: LineMap,
  targets: readonly number[],
  budget = FLASH_BUDGET,
): number[] {
  const rest = map.geometry.rest;
  const scaled = (s: number) => targets.map((t) => rest + Math.max(0, t - rest) * s);
  if (lightBound(map, targets) <= budget) return [...targets];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (lightBound(map, scaled(mid)) <= budget) lo = mid;
    else hi = mid;
  }
  return scaled(lo);
}

/** Seviyelerden (0..1) hedef boylar: sessizlik boyundan en büyük boya doğrusal. Güvenli modda yarısı. */
export function targetExtents(
  levels: readonly number[],
  geometry: BarGeometry,
  safe: boolean,
): number[] {
  const { rest, cap } = geometry;
  const gain = safe ? 0.5 : 1;
  return levels.map((v) => rest + Math.max(0, Math.min(1, v)) * gain * (cap - rest));
}

/** Güvenli modda pencere başına değişim payı da yarısı. */
export function flashBudget(safe: boolean): number {
  return safe ? FLASH_BUDGET / 2 : FLASH_BUDGET;
}

/** Çubuğun ekrandaki dikdörtgeni. */
export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Çubukların özleri: ortaları `k · pitch`, üst kenarları çizgide, boyları `extents`. */
export function coreRects(extents: readonly number[], geometry: BarGeometry): BarRect[] {
  const { pitch, core, top } = geometry;
  return extents.map((e, k) => ({ x: k * pitch - core / 2, y: top, width: core, height: e }));
}

/** Işıltı dikdörtgenleri (bulanıklaştırılarak çizilir): çubuk aralığı genişliğinde. */
export function glowRects(extents: readonly number[], geometry: BarGeometry): BarRect[] {
  const { pitch, glowWidth, top } = geometry;
  return extents.map((e, k) => ({
    x: k * pitch - glowWidth / 2,
    y: top,
    width: glowWidth,
    height: e,
  }));
}

/** RGB → ton (0..1), renklilik (en büyük − en küçük, 0..1). */
function hueChroma(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, d / 255];
}

/** Ton (0..1), doygunluk, parlaklık 1 → RGB. */
function fromHsv(h: number, s: number): Rgb {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

/** Resimden renk bulunamazsa (resim yok) çizginin rengi: programın vurgu yeşili. */
export const DEFAULT_ACCENT: Rgb = [70, 240, 166];

/**
 * Resmin baskın rengi (RGBA pikseller, küçültülmüş resimden). Her pikselin tonu renkliliğiyle
 * (en büyük − en küçük bileşen) ağırlıklı bir yön; yönlerin ortalaması baskın tonu verir.
 * Ortalamanın uzunluğunun ortalama renkliliğe oranı (tutarlılık) resmin tek bir renge mi
 * boyandığını söyler: kırmızı resimde 0,99, çok renkli açık resimde 0,28. Renk o tonun kendisidir,
 * parlaklığı tam (ışık): tek renkli resimde saf ton, çok renkli ya da renksiz resimde beyaz.
 * Örnekteki kırmızı çubukların ışıltısı da saf kırmızıydı (doygunluk ≈ 0,97); resmin kendi
 * kırmızısı koyu (doygunluk 0,76) olduğundan onu parlatmak pembe verirdi.
 */
export function dominantColor(rgba: ArrayLike<number>): Rgb {
  let x = 0;
  let y = 0;
  let chroma = 0;
  let count = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = (rgba[i + 3] ?? 255) / 255;
    const [h, c] = hueChroma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    x += Math.cos(h * 2 * Math.PI) * c * alpha;
    y += Math.sin(h * 2 * Math.PI) * c * alpha;
    chroma += c * alpha;
    count += alpha;
  }
  if (count === 0) return [255, 255, 255];
  const coherence = chroma > 0 ? Math.hypot(x, y) / chroma : 0;
  // Tutarlılık 0,5'in altında beyaz, 0,9'un üstünde saf ton; renksiz resimde (ortalama
  // renklilik 0,08'in altı) beyaza doğru.
  const saturation =
    Math.max(0, Math.min(1, (coherence - 0.5) / 0.4)) *
    Math.max(0, Math.min(1, chroma / count / 0.08));
  const hue = (Math.atan2(y, x) / (2 * Math.PI) + 1) % 1;
  return fromHsv(hue, saturation);
}

/** Türkçeye özgü harfler: şarkının adında ya da sanatçısında biri varsa Türkçe kuralı. */
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/** Yazılardan biri Türkçeye özgü harf içeriyor mu (büyük harfe çevirme kuralı için). */
export function isTurkishText(...texts: readonly (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && TURKISH_LETTERS.test(t));
}

/**
 * Yazının büyük harflisi: `turkish` ise Türkçe kuralıyla (i → İ, ı → I), değilse İngilizce
 * kuralıyla. Kural şarkının adı ve sanatçısı birlikte bakılarak seçilir (`isTurkishText`):
 * "Kelimeler" tek başına Türkçe harf taşımaz, ama sanatçısı "Şebnem Ferah" ise "KELİMELER".
 */
export function displayUpper(text: string, turkish = isTurkishText(text)): string {
  return text.toLocaleUpperCase(turkish ? "tr" : "en");
}

/** Süre "00:25" biçiminde; bir saati geçince "1:02:05". */
export function clockText(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}
