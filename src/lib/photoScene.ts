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
import { FLASH_DELTA, flashWindow } from "./flash";
import {
  GUARD_BLOCKS_PER_CELL,
  GUARD_COLS,
  GUARD_MAX_DT,
  GUARD_ROWS,
  RED_FLASH_SCALE,
  SRGB_HALF_STEP_LUMINANCE,
  guardRates,
} from "./flashGuardMath";

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

/** sRGB → doğrusal eğrinin eğimi (sRGB birimi başına), 0..255 tamsayılarda (artan). */
const SLOPE_AT = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return (c <= 0.03928 ? 1 / 12.92 : (2.4 / 1.055) * ((c + 0.055) / 1.055) ** 1.4) / 255;
});

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

/**
 * Işıltının tuval süzgeci. Tuvalin dönüşümü (`setTransform(ratio, …)`) süzgecin uzunluklarını
 * ölçeklemez (HTML tuval tanımı; Chromium da böyle): σ CSS pikselinden cihaz pikseline elle
 * çevrilir. Parlama sınırı (`measureLine`, `flashBounds`) σ'yı CSS pikselinde varsayar.
 */
export function glowFilter(sigma: number, ratio: number): string {
  return `blur(${sigma * ratio}px)`;
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
 * Kırmızı parlama (WCAG 2.3.1; Trace Center / PEAT tanımı). Pikselin kırmızı değeri doğrusal
 * bileşenlerle doygun kırmızıda (`R / (R + G + B) ≥ 0,8`) `320 · (R − G − B)`, değilse 0
 * ("kapılı" tanım); WCAG'nin çalışma tanımında değer `320 · max(0, R − G − B)`, doygunluk yalnızca
 * geçişin sayılıp sayılmayacağına bakar ("sürekli" tanım). Bir WCAG penceresinde ortalama 20'den
 * fazla değişmemeli. Sınır ikisini birden kapsar.
 */
export const RED_SCALE = 320;
export const RED_FLASH = 20;
/** Pencere başına kırmızı değişim payı (parlaklıktaki gibi eşiğin %80'i); güvenli modda yarısı. */
export const RED_BUDGET = 0.8 * RED_FLASH;
/** Payın artış ve azalış arasındaki bölüşümünün sınırları (her biri en az %10). */
export const RED_SPLIT_MIN = 0.1;
/** Doygun kırmızı eşiği (`R / (R + G + B)`). */
const SATURATION = 0.8;
/** Kayan nokta karşılaştırmalarında doygunluk sınırının payı. */
const EDGE = 1e-9;

/** Pikselin kırmızı değeri: kapılı (`gated`) ya da sürekli tanım. */
export function redValue([r, g, b]: Rgb, gated = true): number {
  const R = linear(r);
  const G = linear(g);
  const B = linear(b);
  if (!gated) return RED_SCALE * Math.max(0, R - G - B);
  const sum = R + G + B;
  return sum > 0 && R >= SATURATION * sum ? RED_SCALE * (R - G - B) : 0;
}

/**
 * Bir ölçüm pikselinde ekrana gelebilecek renklerin özeti: kanal başına en koyu ve en açık değer
 * (0..255 tamsayı) ve doğrusal ışıkta `L = R − G − B`'nin en büyüğü, `Q = R/4 − G − B`'nin en
 * küçüğü ve en büyüğü (`Q ≥ 0` doygun kırmızı demek). Tek renkte ikisi aynı; hareketli resimde
 * karelerin (ve frenin karıştırdığı ara renklerin) hepsini kapsar.
 */
export interface PixelColors {
  dark: Rgb;
  bright: Rgb;
  lmax: number;
  qmin: number;
  qmax: number;
}

export function pixelColors(): PixelColors {
  return { dark: [0, 0, 0], bright: [0, 0, 0], lmax: 0, qmin: 0, qmax: 0 };
}

/** Kanal kanal `[dark, bright]` kutusundaki her rengi kapsayan özet. */
export function boxColors(dark: Rgb, bright: Rgb, out: PixelColors): PixelColors {
  for (let k = 0; k < 3; k++) {
    out.dark[k] = dark[k]!;
    out.bright[k] = bright[k]!;
  }
  out.lmax = LINEAR[bright[0]]! - LINEAR[dark[1]]! - LINEAR[dark[2]]!;
  out.qmin = LINEAR[dark[0]]! / 4 - LINEAR[bright[1]]! - LINEAR[bright[2]]!;
  out.qmax = LINEAR[bright[0]]! / 4 - LINEAR[dark[1]]! - LINEAR[dark[2]]!;
  return out;
}

/** Tek bir rengin özeti. */
export function solidColors(r: number, g: number, b: number, out: PixelColors): PixelColors {
  out.dark[0] = out.bright[0] = r;
  out.dark[1] = out.bright[1] = g;
  out.dark[2] = out.bright[2] = b;
  const R = LINEAR[r]!;
  const G = LINEAR[g]!;
  const B = LINEAR[b]!;
  out.lmax = R - G - B;
  out.qmin = out.qmax = R / 4 - G - B;
  return out;
}

/**
 * Zemin: `(x, y)` ölçüm pikselinin renkleri (komşuluksuz). Ekrandaki piksel tarayıcının
 * ölçeklemesi yüzünden ölçümden bir piksel kayabilir: `measureLine` her pikselin 3×3
 * komşuluğuna bakar (tek renkli zeminde gerekmez).
 */
export interface Background {
  pixel(x: number, y: number, out: PixelColors): void;
  /** Her yerde aynı: ölçüm tek satırdan yapılır. */
  uniform?: boolean;
}

/** Tek renkli zemin (kanal başına en koyu `dark`, en açık `bright`). */
export function uniformBackground(dark: Rgb, bright: Rgb): Background {
  return { pixel: (_x, _y, out) => void boxColors(dark, bright, out), uniform: true };
}

/** Ekrandaki gibi kırpılmış resim (`width`×`height` RGBA, CSS piksel başına bir piksel). */
export function imageBackground(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Background {
  return {
    pixel(x, y, out) {
      const xx = Math.max(0, Math.min(width - 1, x));
      const yy = Math.max(0, Math.min(height - 1, y));
      const i = (yy * width + xx) * 4;
      solidColors(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0, out);
    },
  };
}

/**
 * Çizgi bölgesinin satırları `[firstRow, lastRow)` (ölçüm pikseli): çubukların en büyük boyu ve
 * ışıltının kuyrukları. `measureLine` zemini bunların bir satır üstünden bir satır altına kadar okur.
 */
export function lineRows(width: number, height: number): { firstRow: number; lastRow: number } {
  const { sigma, top, cap } = barGeometry(width, height);
  const tail = TAIL_SIGMAS * sigma;
  return {
    firstRow: Math.max(0, Math.floor(top - tail) - 1),
    lastRow: Math.min(Math.ceil(height), Math.ceil(top + cap + tail) + 1),
  };
}

/**
 * Ekrandaki 8 bitlik yuvarlamanın doğrusal ışıkta en büyük payları: kanal başına yarım basamak
 * (sRGB eğrisinin en dik yeri), `L = R − G − B` için üçünün toplamı, `Q = R/4 − G − B` için
 * `1/4 + 2` katı; frenin 16 bitlik durumu için küçük bir ek.
 */
const DISPLAY_HALF_STEP = (0.5 / 255) * (2.4 / 1.055) + 1e-5;

/**
 * Hareketli resmin karelerinin zarfı (ölçüm pikseli başına): kanal başına en koyu ve en açık
 * değer, doğrusal `L` ve `Q`'nun uçları. Parlaklık freni gösterilen görüntüyü önceki gösterilenle
 * yeni karenin doğrusal ışıkta karışımı olarak çizer (ilk kare doğrudan): ekrandaki her renk
 * karelerin renklerinin dışbükey zarfındadır; `L` ve `Q` doğrusal olduğundan uçları karelerin
 * uçlarıdır. Ekranın 8 bitlik yuvarlaması için kanallar birer basamak, `L` ve `Q` payla genişler.
 */
export class FrameEnvelope {
  readonly width: number;
  readonly height: number;
  /** Saklanan satırlar `[from, to)`. */
  readonly from: number;
  readonly to: number;
  private readonly dark: Uint8Array;
  private readonly bright: Uint8Array;
  private readonly lmax: Float64Array;
  private readonly qmin: Float64Array;
  private readonly qmax: Float64Array;
  frames = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const { firstRow, lastRow } = lineRows(width, height);
    this.from = Math.max(0, firstRow - 1);
    this.to = Math.min(height, lastRow + 1);
    const n = width * Math.max(0, this.to - this.from);
    this.dark = new Uint8Array(n * 3).fill(255);
    this.bright = new Uint8Array(n * 3);
    this.lmax = new Float64Array(n).fill(-Infinity);
    this.qmin = new Float64Array(n).fill(Infinity);
    this.qmax = new Float64Array(n).fill(-Infinity);
  }

  /** Bir kare: `rgba` saklanan satırların (`from`'dan `to`'ya) RGBA pikselleri. */
  add(rgba: ArrayLike<number>): void {
    const n = this.width * (this.to - this.from);
    for (let p = 0; p < n; p++) {
      const r = rgba[p * 4] ?? 0;
      const g = rgba[p * 4 + 1] ?? 0;
      const b = rgba[p * 4 + 2] ?? 0;
      const i = p * 3;
      if (r < this.dark[i]!) this.dark[i] = r;
      if (g < this.dark[i + 1]!) this.dark[i + 1] = g;
      if (b < this.dark[i + 2]!) this.dark[i + 2] = b;
      if (r > this.bright[i]!) this.bright[i] = r;
      if (g > this.bright[i + 1]!) this.bright[i + 1] = g;
      if (b > this.bright[i + 2]!) this.bright[i + 2] = b;
      const R = LINEAR[r]!;
      const G = LINEAR[g]!;
      const B = LINEAR[b]!;
      const L = R - G - B;
      const Q = R / 4 - G - B;
      if (L > this.lmax[p]!) this.lmax[p] = L;
      if (Q < this.qmin[p]!) this.qmin[p] = Q;
      if (Q > this.qmax[p]!) this.qmax[p] = Q;
    }
    this.frames += 1;
  }

  /** Zarfın zemini (`measureLine` için). */
  background(): Background {
    const { width, from, to } = this;
    return {
      pixel: (x, y, out) => {
        const xx = Math.max(0, Math.min(width - 1, x));
        const yy = Math.max(from, Math.min(to - 1, y)) - from;
        const p = yy * width + xx;
        for (let k = 0; k < 3; k++) {
          out.dark[k] = Math.max(0, this.dark[p * 3 + k]! - 1);
          out.bright[k] = Math.min(255, this.bright[p * 3 + k]! + 1);
        }
        out.lmax = this.lmax[p]! + 3 * DISPLAY_HALF_STEP;
        out.qmin = this.qmin[p]! - 2.25 * DISPLAY_HALF_STEP;
        out.qmax = this.qmax[p]! + 2.25 * DISPLAY_HALF_STEP;
      },
    };
  }
}

/**
 * Kırmızı ölçünün bir yönündeki (artış ya da azalış) sınır tabloları. Her sütun bir şeride (en
 * yakın çubuğun `[k · pitch ± pitch / 2]` aralığı) aittir; şeridin her satırında, pikselin
 * ışıltısı en çok `RED_LEVELS[l] · T` iken o satırın piksellerinin en büyük değişimlerinin toplamı.
 */
export interface RedTables {
  /**
   * `[(m · RED_LEVELS.length + l) · (rows + 1) + r]`: şerit m, düzey l, satır satır birikimli;
   * `glow` yalnız ışıltıyla (şeridin çubuğu o satırda değilken), `withCore` öz de varken. 32 bit
   * saklanır: farkın yuvarlama hatası en çok `2⁻²² ·` büyük değer (`flashBounds` ekler).
   */
  glow: Float32Array;
  withCore: Float32Array;
  /** Şeridin tam öz sütunlarında, kaplaması bilinmeyen (yarı) satırın en büyük toplamı, düzey başına. */
  any: Float64Array;
  /**
   * Şeridin dikey kuyrukları (çizginin üstü ve en uzun komşunun ucunun altı), en uzun komşunun
   * boy adımına göre: `[m · (TAIL_STEPS + 1) + ⌈e⌉]` (sonuncusu daha uzun bütün boylar).
   */
  tail: Float64Array;
}

/** Şeritlere ışığı düşen çubuklar ve her birinin şeritteki en büyük ışıltısı. */
interface Bands {
  /** Şerit m'nin komşuları `list[start[m] .. start[m + 1])`. */
  start: Int32Array;
  list: Int32Array;
  /** Komşu çubuğun şeridin sütunlarındaki en büyük ışıltısı (`GLOW_TOLERANCE` dahil). */
  tau: Float64Array;
  /** Şeridin sütunlarında bütün çubukların toplam ışıltısının en büyüğü. */
  total: Float64Array;
}

/**
 * Ölçülmüş çizgi bölgesi: her çubuğun özünün ve ışıltısının satır satır ekleyebileceği en büyük
 * parlaklık (bağıl parlaklık × CSS piksel², satır satır birikimli) ve şerit şerit kırmızı ölçünün
 * en büyük artışı ve azalışı.
 */
export interface LineMap {
  geometry: BarGeometry;
  /** Birikimli tabloların ilk satırı ve satır sayısı (CSS piksel satırı). */
  firstRow: number;
  rows: number;
  /** `[k · (rows + 1) + r]`: çubuk `k`'nın `firstRow`'dan `firstRow + r`'ye kadarki toplamı. */
  core: Float64Array;
  glow: Float64Array;
  /** Işıltının 1'de kesilmeden (doğrusal) üst sınırı, `glow` gibi birikimli: kısa çubukta. */
  glowLinear: Float64Array;
  /**
   * Işıltının çubuk satırları dışına taşan dikey kuyrukları: `[k · (TAIL_STEPS + 1) + ⌈e⌉]`
   * (çubuk boyu e; sonuncusu daha uzun bütün boylar).
   */
  glowTail: Float64Array;
  /** Bir çubuğun ışığının yatayda uzandığı yarı genişlik (CSS piksel). */
  reach: number;
  /** En büyük toplam ışıltı `T` (bir pikselde bütün çubuklar en büyük boydayken). */
  tauMax: number;
  /** Işıltının en parlak kanalı (sRGB, 0..255; τ = 1 için). */
  maxGlow: number;
  bands: Bands;
  redIncrease: RedTables;
  redDecrease: RedTables;
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

/** `v` (0..255, kesirli) değerinin doğrusal ışığı: yukarı ve aşağı yuvarlanmış (sınır için). */
function linearUp(v: number): number {
  return v >= 255 ? 1 : v <= 0 ? 0 : LINEAR[Math.ceil(v)]!;
}
function linearDown(v: number): number {
  return v >= 255 ? 1 : v <= 0 ? 0 : LINEAR[Math.floor(v)]!;
}

/**
 * `[d, b]` aralığındaki bir tamsayı kanala `a` (sRGB, 0..255) eklenince doğrusal ışığın en büyük
 * artışı. Artış `c + a ≤ 255`'e kadar artar (eğri dışbükey), sonra azalır (1'de kesilir): en
 * büyüğü `255 − a`'ya en yakın iki tamsayıdan birinde.
 */
function increaseMax(d: number, b: number, a: number): number {
  if (a <= 0) return 0;
  if (d === b) return linearUp(d + a) - LINEAR[d]!;
  const c1 = Math.max(d, Math.min(b, Math.floor(255 - a)));
  const c2 = Math.min(b, c1 + 1);
  return Math.max(linearUp(c1 + a) - LINEAR[c1]!, linearUp(c2 + a) - LINEAR[c2]!);
}

/** `increaseMax`'in tersi: en küçük artış (tek tepeli olduğu için uçlardan birinde). */
function increaseMin(d: number, b: number, a: number): number {
  if (a <= 0) return 0;
  const low = linearDown(d + a) - LINEAR[d]!;
  return d === b ? low : Math.min(low, linearDown(b + a) - LINEAR[b]!);
}

/** `redChange`'in sonucu (bellek ayırmadan): kırmızı değerin en büyük artışı ve azalışı. */
const change = { increase: 0, decrease: 0 };

/**
 * Renkleri `c` olabilen bir piksele kanal başına `[lo, hi]` (sRGB, 0..255) ışık eklenince kırmızı
 * değerin (iki tanımda da) en büyük artışı ve azalışı, `RED_SCALE` biriminde. Eklemeden sonra kanal
 * `min(255, b + a)`; doğrusal artışlar `[ΔR, ΔG, ΔB]` kanal başına `increaseMin`/`increaseMax`
 * arasında. `L` ve `Q` doğrusal olduğundan:
 * - Sürekli değer `max(0, L)`, 1-Lipschitz: artış ≤ `max(0, ΔR⁺ − ΔG⁻ − ΔB⁻)`, azalış ≤
 *   `max(0, ΔG⁺ + ΔB⁺ − ΔR⁻)` (ve önceki değerden fazla değil). Doygun kalan pikselde kapılı değer
 *   de aynı.
 * - Doygun olmayan renk doygun olabiliyorsa (`Q + ΔR⁺/4 − ΔG⁻ − ΔB⁻ ≥ 0`) kapılı değer 0'dan
 *   `L + ΔR⁺ − ΔG⁻ − ΔB⁻`'ye sıçrayabilir; doygun renk doygunluğunu yitirebiliyorsa
 *   (`Q + ΔR⁻/4 − ΔG⁺ − ΔB⁺ < 0`) değeri bütünüyle (`L`) gidebilir. Renk kümesi dışbükey sayılır
 *   (hareketli resimde fren doğrusal ışıkta karıştırır): doygunluk sınırını aşan kümede sınır `Q = 0`.
 */
function redChange(c: PixelColors, lo: Rgb, hi: Rgb): typeof change {
  const { dark, bright } = c;
  const rHi = increaseMax(dark[0], bright[0], hi[0]);
  const gHi = increaseMax(dark[1], bright[1], hi[1]);
  const bHi = increaseMax(dark[2], bright[2], hi[2]);
  const rLo = increaseMin(dark[0], bright[0], lo[0]);
  const gLo = increaseMin(dark[1], bright[1], lo[1]);
  const bLo = increaseMin(dark[2], bright[2], lo[2]);
  const before = Math.max(0, c.lmax);
  let increase = Math.max(0, rHi - gLo - bLo);
  let decrease = Math.min(before, Math.max(0, gHi + bHi - rLo));
  // Doygun olmayan bir renk (kümenin doygun olmayan kısmının en büyük Q'su) doygunlaşabilir mi.
  if (c.qmin < EDGE && Math.min(0, c.qmax) + rHi / 4 - gLo - bLo >= -EDGE) {
    increase = Math.max(increase, c.lmax + rHi - gLo - bLo);
  }
  // Doygun bir renk (kümenin doygun kısmının en küçük Q'su) doygunluğunu yitirebilir mi.
  if (c.qmax > -EDGE && Math.max(0, c.qmin) + rLo / 4 - gHi - bHi < EDGE) decrease = before;
  change.increase = RED_SCALE * increase;
  change.decrease = RED_SCALE * decrease;
  return change;
}

/** Gauss bulanıklığı: yüksekliği `e` olan kutunun kenarından `d` dışarıdaki en büyük değeri (üst sınır). */
function boxTail(d: number, e: number, sigma: number): number {
  const k = 1 / (sigma * Math.SQRT2);
  return Math.min(1, 0.5 * (erf((d + e) * k) - erf(d * k)) + 1e-6);
}

/** Yüksekliği `e` olan kutunun bulanıklığının en büyük değeri (ortasında; üst sınır). */
function boxPeak(e: number, sigma: number): number {
  return Math.min(1, erf(e / (2 * sigma * Math.SQRT2)) + 1e-6);
}

/**
 * Kırmızı ölçünün ışıltı düzeyleri: pikselin ışıltısı en çok bu oran × `T` iken en büyük değişim
 * (kısa çubuğun ve kuyruğun ışıltısı sönük).
 */
const RED_LEVELS = [
  1 / 256,
  1 / 64,
  1 / 32,
  1 / 16,
  0.1,
  0.15,
  0.2,
  0.26,
  0.33,
  0.42,
  0.52,
  0.65,
  0.8,
  1,
];
const LEVELS = RED_LEVELS.length;
/** Ölçüm pikseli başına alanlar: ışıltı ve yarı öz düzey başına, tam öz (artış, azalış). */
const FIELD_GLOW = 0;
/**
 * Özün kapladığı pay `κ`'nın dörtte birlik aralıkları (yarı kaplanan sütun ve satır) ve
 * bunlarda kaba ışıltı düzeyleri (`RED_LEVELS` oranları): `[(b · KAPPA_LEVELS + c) · 2 + yön]`.
 * Kaplama aralıklara bölünür, çünkü özün kırmızı, yeşil ve mavi katkısı aynı `κ` ile birlikte artar.
 */
const KAPPA_BINS = 4;
const KAPPA_LEVELS = [0.3, 0.6, 1];
const FIELD_KAPPA = 2 * LEVELS;
const FIELD_CORE = FIELD_KAPPA + 2 * KAPPA_BINS * KAPPA_LEVELS.length;
const FIELDS = FIELD_CORE + 2;
/** İnce düzeyin kaba karşılığı (en küçük yeten). */
const COARSE = RED_LEVELS.map((f) => KAPPA_LEVELS.findIndex((c) => c >= f));
/** Kırmızı kuyrukların çubuk boyu adımları (CSS piksel; sonuncusu daha uzun bütün boylar). */
const TAIL_STEPS = 48;

/** Toplam ışıltısı en çok `tau` olan pikselin düzeyi (`T`'nin oranı olarak en küçük yeten). */
function redLevel(tau: number, tauMax: number): number {
  for (let l = 0; l < LEVELS - 1; l++) if (RED_LEVELS[l]! * tauMax >= tau) return l;
  return LEVELS - 1;
}

/**
 * Çizgi bölgesini ölçer.
 *
 * Parlaklık, her çubuk için her satırda:
 * - Öz: dokunduğu (kenarda yarı kaplanan da) her pikselde zeminin bütün payı `H(en koyu)`: özün
 *   üstüne binen ışıltılar da dahil o piksel bundan fazla parlamaz.
 * - Işıltı: yatay kesit `blurredBox` (pikselin içindeki en büyük değer, `GLOW_TOLERANCE` payı).
 *   Işıltı dikdörtgenleri örtüşmez; bulanıklıkları toplamı bir pikselde 1'i geçmez. Bu yüzden bir
 *   pikseldeki toplam ışıltı en çok `P = glowAlpha · renk`; eklenen her parça o kirişin
 *   eğimiyle (`chordSlope`) sayılır, `H(en koyu)` ile sınırlanır.
 *
 * Kırmızı ölçü (artış ve azalış ayrı; `redChange`), her piksel için bir kez: bütün ışıltıların
 * rengi aynı, bir piksele gelen ışıltı `τ · u` (`u` ışıltı rengi × saydamlık, `τ` toplam miktar,
 * en çok `T`). Her düzey `l` için `τ ≤ RED_LEVELS[l] · T` iken en büyük değişim; özün tam
 * kapladığı sütunda öz de (kaplama `[0,98, 1]`, çubuk o satırdaysa öz oradadır; değilse yalnız
 * ışıltı), yarı kapladığı sütunda kaplama `[0, 1]`. Her pikselde 3×3 komşuluğun en kötüsü (ekrandaki
 * renk komşulardan biri). Şerit şerit toplanır; bir karede şeridin her satırının düzeyi o satıra
 * ışığı düşebilen çubukların boylarından bulunur (`flashBounds`).
 */
export function measureLine(
  background: Background,
  width: number,
  height: number,
  colors: BarColors,
): LineMap {
  const geometry = barGeometry(width, height);
  const { pitch, core, glowWidth, sigma } = geometry;
  const tail = TAIL_SIGMAS * sigma;
  const { firstRow, lastRow } = lineRows(width, height);
  const rows = Math.max(0, lastRow - firstRow);
  const reach = glowWidth / 2 + tail;
  const columns = Math.max(0, Math.ceil(width));
  const imageRows = Math.max(1, Math.ceil(height));
  const uniform = background.uniform === true;
  // Tek renkli zeminde bütün satırlar aynı: yalnızca ilk satır ölçülür, gerisi kopyalanır.
  const measuredRows = uniform ? Math.min(1, rows) : rows;
  const stride = rows + 1;
  const coreTable = new Float64Array(PHOTO_BARS * stride);
  const glowTable = new Float64Array(PHOTO_BARS * stride);
  const glowLinTable = new Float64Array(PHOTO_BARS * stride);

  // Çubukların sütunları ve ışıltının yatay kesiti; sütunların şeridi ve öz kaplaması.
  const bars: {
    coreFrom: number;
    coreTo: number;
    from: number;
    to: number;
    profile: Float64Array;
  }[] = [];
  const tauTotal = new Float64Array(columns);
  const band = new Int32Array(columns);
  // 2: tek bir çubuğun özü tam kaplıyor; 1: yarı ya da birden çok çubuk; 0: öz yok.
  const coreKind = new Uint8Array(columns);
  const kappaFrom = new Uint8Array(columns);
  const kappaTo = new Uint8Array(columns);
  for (let x = 0; x < columns; x++) {
    band[x] = Math.max(0, Math.min(PHOTO_BARS - 1, Math.round((x + 0.5) / pitch)));
  }
  for (let k = 0; k < PHOTO_BARS; k++) {
    const cx = k * pitch;
    const from = Math.max(0, Math.floor(cx - reach));
    const to = Math.min(columns, Math.ceil(cx + reach));
    const profile = new Float64Array(Math.max(0, to - from));
    for (let x = from; x < to; x++) {
      const nearest = Math.max(x, Math.min(x + 1, cx));
      const g = blurredBox(nearest, cx - glowWidth / 2, cx + glowWidth / 2, sigma);
      profile[x - from] = g;
    }
    const coreFrom = Math.max(0, Math.floor(cx - core / 2));
    const coreTo = Math.min(columns, Math.ceil(cx + core / 2));
    for (let x = coreFrom; x < coreTo; x++) {
      const full = x >= cx - core / 2 && x + 1 <= cx + core / 2;
      const covered = Math.min(x + 1, cx + core / 2) - Math.max(x, cx - core / 2);
      if (coreKind[x] === 0) {
        coreKind[x] = full ? 2 : 1;
        // Kaplama aralıkları: ölçülen kaplama ± 0,02 (tarayıcının kenar yumuşatması).
        kappaFrom[x] = Math.max(0, Math.floor((covered - 0.02) * KAPPA_BINS));
        kappaTo[x] = Math.min(KAPPA_BINS - 1, Math.floor((covered + 0.02) * KAPPA_BINS));
      } else {
        coreKind[x] = 1;
        kappaFrom[x] = 0;
        kappaTo[x] = KAPPA_BINS - 1;
      }
    }
    bars.push({ coreFrom, coreTo, from, to, profile });
  }
  // Pikseldeki toplam ışıltı: bütün çubukların bulanıklıklarının toplamının piksel içindeki en
  // büyüğü (9 noktada; aradaki artış en çok eğimin 1/16 piksellik payı, eğim ≤ 2 / (σ√(2π))).
  const margin = 2 / (sigma * Math.sqrt(2 * Math.PI)) / 16 + 1e-5;
  for (let x = 0; x < columns; x++) {
    let best = 0;
    for (let i = 0; i <= 8; i++) {
      const t = x + i / 8;
      let sum = 0;
      for (
        let k = Math.max(0, Math.floor((t - reach) / pitch));
        k <= Math.min(PHOTO_BARS - 1, Math.ceil((t + reach) / pitch));
        k++
      ) {
        const cx = k * pitch;
        sum += blurredBox(t, cx - glowWidth / 2, cx + glowWidth / 2, sigma);
      }
      best = Math.max(best, sum);
    }
    tauTotal[x] = GLOW_TOLERANCE * Math.min(1, best + margin);
  }
  let tauMax = 1e-9;
  for (let x = 0; x < columns; x++) tauMax = Math.max(tauMax, tauTotal[x]!);

  // Şeritlerin komşuları: şeridin sütunlarına ışığı düşen çubuklar ve en büyük ışıltıları.
  const start = new Int32Array(PHOTO_BARS + 1);
  const list: number[] = [];
  const tauList: number[] = [];
  const bandTotal = new Float64Array(PHOTO_BARS);
  for (let m = 0; m < PHOTO_BARS; m++) {
    start[m] = list.length;
    let x0 = columns;
    let x1 = 0;
    for (let x = 0; x < columns; x++) {
      if (band[x] === m) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x + 1);
        bandTotal[m] = Math.max(bandTotal[m]!, tauTotal[x]!);
      }
    }
    for (let k = 0; k < PHOTO_BARS; k++) {
      const { from, to, profile } = bars[k]!;
      let best = 0;
      for (let x = Math.max(x0, from); x < Math.min(x1, to); x++) {
        best = Math.max(best, GLOW_TOLERANCE * profile[x - from]!);
      }
      if (best > 0) {
        list.push(k);
        tauList.push(best);
      }
    }
  }
  start[PHOTO_BARS] = list.length;

  // Parlaklık: ışıltının birimi (tarayıcının bulanıklığı için `GLOW_TOLERANCE` payıyla) ve kiriş
  // eğimleri; 8 bitlik yuvarlama pikselde bir kez: toplamın üst sınırına bir basamak.
  const glowUnit = colors.glow.map((c) => (c / 255) * colors.glowAlpha * GLOW_TOLERANCE);
  const slopes = glowUnit.map((u) => chordSlope(u + ROUNDING));
  const [s0, s1, s2] = slopes as [Float64Array, Float64Array, Float64Array];
  const [u0, u1, u2] = glowUnit as [number, number, number];

  // Kırmızı: düzeylerde eklenen ışık (sRGB, 0..255). Işıltı düzey aralığının alt ucunda yarım
  // basamak aşağı, üst ucunda yukarı yuvarlanır (en yakına yuvarlamada küçük değer en çok iki
  // katına çıkar); öz `[0,98, 1]` ya da `[0, 1]` kaplamayla, üstüne en çok `T` ışıltı.
  const glowSrgb = colors.glow.map((c) => c * colors.glowAlpha) as Rgb;
  const coreSrgb = colors.core;
  const scale = (v: Rgb, f: number) => v.map((c) => c * f) as Rgb;
  const none: Rgb = [0, 0, 0];
  // Kipler: eklenen ışık `a0 + t1 · d1 + t2 · d2` (t ∈ [0, 1]; ± 0,5 yuvarlama): ışıltı düzeyleri,
  // kaplama aralıkları × kaba düzeyler, tam öz.
  const modes: { a0: Rgb; d1: Rgb; d2: Rgb }[] = [
    ...RED_LEVELS.map((f, l) => {
      const f0 = l === 0 ? 0 : RED_LEVELS[l - 1]!;
      return { a0: scale(glowSrgb, f0 * tauMax), d1: scale(glowSrgb, (f - f0) * tauMax), d2: none };
    }),
  ];
  for (let b = 0; b < KAPPA_BINS; b++) {
    for (const f of KAPPA_LEVELS) {
      modes.push({
        a0: scale(coreSrgb, b / KAPPA_BINS),
        d1: scale(coreSrgb, 1 / KAPPA_BINS),
        d2: scale(glowSrgb, f * tauMax),
      });
    }
  }
  modes.push({ a0: scale(coreSrgb, 0.98), d1: scale(coreSrgb, 0.02), d2: scale(glowSrgb, tauMax) });
  const lohi = modes.map(({ a0, d1, d2 }) => {
    const top = a0.map((v, i) => v + d1[i]! + d2[i]!);
    return {
      lo: a0.map((v) => Math.max(0, v - 0.5)) as Rgb,
      hi: top.map((v) => (v > 0 ? v + 0.5 : 0)) as Rgb,
    };
  });
  // Tek renkli pikseller için tablolar (kip, kanal, değer c): kipin uçlarında artış, yolun
  // başlangıcında artış ve eklenen ışık boyunca eğimin üst ve alt sınırı (sRGB birimi başına).
  // Üç kanalın eklenen ışığı aynıysa (beyaz ışıltı ya da öz) tuvalin yuvarlaması da aynıdır:
  // eklenen ışık bir tamsayı `n ∈ [n0, n1]`, yol `(1, 1, 1)` yönünde.
  const PIECES = 2;
  const SEGMENTS = 2 * PIECES;
  // Düz tablo: kip q, kanal k: `[yukarı, aşağı, başlangıç↑, başlangıç↓, eğim⁺ × SEGMENTS,
  // eğim⁻ × SEGMENTS]`, her biri 256 değer.
  const ENTRIES = 4 + 2 * SEGMENTS;
  const perChannel = ENTRIES * 256;
  const perMode = 3 * perChannel;
  const solidTable = new Float64Array(modes.length * perMode);
  const directions = new Float64Array(modes.length * SEGMENTS * 3);
  modes.forEach(({ a0, d1, d2 }, q) => {
    const { lo, hi } = lohi[q]!;
    const same = (v: Rgb) => Math.abs(v[0] - v[1]) < 1e-9 && Math.abs(v[0] - v[2]) < 1e-9;
    const equal = same(a0) && same(d1) && same(d2);
    const n0 = Math.max(0, Math.ceil(a0[0] - 0.5));
    const n1 = Math.floor(a0[0] + d1[0] + d2[0] + 0.5);
    // Yol parçaları: başlangıçtan d1, sonra d2 boyunca, her biri PIECES parça (eşit kanallarda
    // tek yön, iki yarısı boş). Parçanın kanal başına konum aralığı (yuvarlama payıyla) eğimlerin
    // sınırlarını verir.
    const segments: { d: Rgb; from: Rgb; to: Rgb }[] = [];
    const pushPath = (start: Rgb, d: Rgb, pad: number) => {
      for (let j = 0; j < PIECES; j++) {
        segments.push({
          d: scale(d, 1 / PIECES),
          from: start.map((v, k) => Math.max(0, v + (d[k]! * j) / PIECES - pad)) as Rgb,
          to: start.map((v, k) => v + (d[k]! * (j + 1)) / PIECES + pad) as Rgb,
        });
      }
    };
    if (equal) {
      const n = n1 - n0;
      pushPath([n0, n0, n0], [n, n, n], 0);
      pushPath([n1, n1, n1], none, 0);
    } else {
      pushPath(a0, d1, 0.5);
      pushPath(a0.map((v, k) => v + d1[k]!) as Rgb, d2, 0.5);
    }
    segments.forEach((sg, i) => directions.set(sg.d, (q * SEGMENTS + i) * 3));
    for (let k = 0; k < 3; k++) {
      const base = q * perMode + k * perChannel;
      for (let c = 0; c < 256; c++) {
        const exact = LINEAR[Math.min(255, c + n0)]! - LINEAR[c]!;
        solidTable[base + c] = increaseMax(c, c, hi[k]!);
        solidTable[base + 256 + c] = increaseMin(c, c, lo[k]!);
        solidTable[base + 512 + c] = equal
          ? exact
          : hi[k]! > 0
            ? linearUp(c + a0[k]! + 0.5) - LINEAR[c]!
            : 0;
        solidTable[base + 768 + c] = equal ? exact : increaseMin(c, c, lo[k]!);
        segments.forEach((sg, i) => {
          solidTable[base + (4 + i) * 256 + c] =
            sg.to[k]! > 0 ? SLOPE_AT[Math.min(255, Math.ceil(c + sg.to[k]!))]! : 0;
          solidTable[base + (4 + SEGMENTS + i) * 256 + c] =
            c + sg.to[k]! >= 255 ? 0 : SLOPE_AT[Math.max(0, Math.floor(c + sg.from[k]!))]!;
        });
      }
    }
  });
  /**
   * `redChange`'in tek renkli piksel için sürümü: aynı ayrık sınırlar, ayrıca eklenen ışığın yolu
   * boyunca (kırmızı, yeşil ve mavi aynı `t` ile birlikte artar) ortalama değer kuramı: `ΔL ≤
   * ΔL(başlangıç) + Σ_parça max(0, d_R·eğim⁺_R − d_G·eğim⁻_G − d_B·eğim⁻_B)`. İkisinin küçüğü
   * alınır (azalış ve doygunluk ölçüsü `Q` için de).
   */
  const solidChange = (mode: number, r: number, g: number, b: number, L: number, Q: number) => {
    const R = mode * perMode + r;
    const G = mode * perMode + perChannel + g;
    const B = mode * perMode + 2 * perChannel + b;
    const rHi = solidTable[R]!;
    const gHi = solidTable[G]!;
    const bHi = solidTable[B]!;
    const rLo = solidTable[R + 256]!;
    const gLo = solidTable[G + 256]!;
    const bLo = solidTable[B + 256]!;
    let alongL = 0;
    let againstL = 0;
    let alongQ = 0;
    let againstQ = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      const o = (mode * SEGMENTS + i) * 3;
      const dR = directions[o]!;
      const dG = directions[o + 1]!;
      const dB = directions[o + 2]!;
      if (dR === 0 && dG === 0 && dB === 0) continue;
      const sRmax = dR * solidTable[R + (4 + i) * 256]!;
      const sRmin = dR * solidTable[R + (4 + SEGMENTS + i) * 256]!;
      const sGmax = dG * solidTable[G + (4 + i) * 256]!;
      const sGmin = dG * solidTable[G + (4 + SEGMENTS + i) * 256]!;
      const sBmax = dB * solidTable[B + (4 + i) * 256]!;
      const sBmin = dB * solidTable[B + (4 + SEGMENTS + i) * 256]!;
      alongL += Math.max(0, sRmax - sGmin - sBmin);
      againstL += Math.max(0, sGmax + sBmax - sRmin);
      alongQ += Math.max(0, sRmax / 4 - sGmin - sBmin);
      againstQ += Math.max(0, sGmax + sBmax - sRmin / 4);
    }
    const rS = solidTable[R + 512]!;
    const gS = solidTable[G + 768]!;
    const bS = solidTable[B + 768]!;
    const rT = solidTable[R + 768]!;
    const gT = solidTable[G + 512]!;
    const bT = solidTable[B + 512]!;
    const lMax = Math.min(rHi - gLo - bLo, rS - gS - bS + alongL);
    const lMin = Math.max(rLo - gHi - bHi, rT - gT - bT - againstL);
    const qMax = Math.min(rHi / 4 - gLo - bLo, rS / 4 - gS - bS + alongQ);
    const qMin = Math.max(rLo / 4 - gHi - bHi, rT / 4 - gT - bT - againstQ);
    const before = Math.max(0, L);
    let increase = Math.max(0, lMax);
    let decrease = Math.min(before, Math.max(0, -lMin));
    if (Q < EDGE && Q + qMax >= -EDGE) increase = Math.max(increase, L + lMax);
    if (Q > -EDGE && Math.max(0, Q) + qMin < EDGE) decrease = before;
    change.increase = RED_SCALE * increase;
    change.decrease = RED_SCALE * decrease;
    return change;
  };

  // Ölçüm pikselleri satır satır, son üç satır bir halkada.
  const ring = Array.from({ length: 3 }, () => ({
    y: -1,
    dark: new Uint8Array(columns * 3),
    bright: new Uint8Array(columns * 3),
    red: new Float64Array(columns * FIELDS),
    active: new Uint8Array(columns),
    // Yatay 3'lü komşuluğun en kötüsü (kırmızı alanlar) ve etkinliği.
    wide: new Float64Array(columns * FIELDS),
    wideActive: new Uint8Array(columns),
  }));
  const px = pixelColors();
  const measureSource = (y: number) => {
    const slot = ring[y % 3]!;
    if (slot.y === y) return slot;
    slot.y = y;
    const red = slot.red;
    for (let x = 0; x < columns; x++) {
      background.pixel(x, y, px);
      for (let c = 0; c < 3; c++) {
        slot.dark[x * 3 + c] = px.dark[c]!;
        slot.bright[x * 3 + c] = px.bright[c]!;
      }
      const o = x * FIELDS;
      // Hiçbir ekleme kırmızı değer veremiyorsa (L hep ≤ 0): değişim yok.
      if (px.lmax + increaseMax(px.dark[0], px.bright[0], lohi[modes.length - 1]!.hi[0]) <= 0) {
        red.fill(0, o, o + FIELDS);
        slot.active[x] = 0;
        continue;
      }
      slot.active[x] = 1;
      let inc = 0;
      let dec = 0;
      const pr = px.dark[0];
      const pg = px.dark[1];
      const pb = px.dark[2];
      const solid =
        pr === px.bright[0] && pg === px.bright[1] && pb === px.bright[2] && px.qmin === px.qmax;
      for (let l = 0; l < LEVELS; l++) {
        const r = solid
          ? solidChange(l, pr, pg, pb, px.lmax, px.qmin)
          : redChange(px, lohi[l]!.lo, lohi[l]!.hi);
        inc = Math.max(inc, r.increase);
        dec = Math.max(dec, r.decrease);
        red[o + FIELD_GLOW + 2 * l] = inc;
        red[o + FIELD_GLOW + 2 * l + 1] = dec;
      }
      for (let q = 0; q < KAPPA_BINS * KAPPA_LEVELS.length; q++) {
        const r = solid
          ? solidChange(LEVELS + q, pr, pg, pb, px.lmax, px.qmin)
          : redChange(px, lohi[LEVELS + q]!.lo, lohi[LEVELS + q]!.hi);
        red[o + FIELD_KAPPA + 2 * q] = r.increase;
        red[o + FIELD_KAPPA + 2 * q + 1] = r.decrease;
      }
      const r = solid
        ? solidChange(modes.length - 1, pr, pg, pb, px.lmax, px.qmin)
        : redChange(px, lohi[modes.length - 1]!.lo, lohi[modes.length - 1]!.hi);
      red[o + FIELD_CORE] = r.increase;
      red[o + FIELD_CORE + 1] = r.decrease;
    }
    for (let x = 0; x < columns; x++) {
      const a = uniform ? x : Math.max(0, x - 1);
      const b = uniform ? x : Math.min(columns - 1, x + 1);
      const on = slot.active[a]! | slot.active[x]! | slot.active[b]!;
      slot.wideActive[x] = on;
      const o = x * FIELDS;
      if (on === 0) {
        slot.wide.fill(0, o, o + FIELDS);
        continue;
      }
      const pa = a * FIELDS;
      const pb = b * FIELDS;
      for (let f = 0; f < FIELDS; f++) {
        slot.wide[o + f] = Math.max(red[pa + f]!, red[o + f]!, red[pb + f]!);
      }
    }
    return slot;
  };

  // Bölgenin bir satırı: 3×3 komşuluğun en koyusu/en açığı ve kırmızıda en kötüsü.
  const darkRow = new Uint8Array(columns * 3);
  const brightRow = new Uint8Array(columns * 3);
  const vDark = new Uint8Array(columns * 3);
  const vBright = new Uint8Array(columns * 3);
  const vRed = new Float64Array(columns * FIELDS);
  const vActive = new Uint8Array(columns);
  // Şeritlerin bu satırdaki toplamları: `[(yön · şerit + m) · düzey + l]`.
  const unionRow = new Float64Array(2 * PHOTO_BARS * LEVELS);
  const coreRow = new Float64Array(2 * PHOTO_BARS * LEVELS);
  const anyRow = new Float64Array(2 * PHOTO_BARS * LEVELS);
  const buildRow = (y: number) => {
    const sources = uniform
      ? [measureSource(y)]
      : [y - 1, y, y + 1].filter((v) => v >= 0 && v < imageRows).map(measureSource);
    vDark.fill(255);
    vBright.fill(0);
    vRed.fill(0);
    vActive.fill(0);
    for (const s of sources) {
      for (let x = 0; x < columns; x++) vActive[x] = vActive[x]! | s.wideActive[x]!;
      for (let i = 0; i < columns * 3; i++) {
        if (s.dark[i]! < vDark[i]!) vDark[i] = s.dark[i]!;
        if (s.bright[i]! > vBright[i]!) vBright[i] = s.bright[i]!;
      }
      const src = s.wide;
      for (let x = 0; x < columns; x++) {
        if (s.wideActive[x] === 0) continue;
        for (let i = x * FIELDS; i < (x + 1) * FIELDS; i++)
          if (src[i]! > vRed[i]!) vRed[i] = src[i]!;
      }
    }
    unionRow.fill(0);
    coreRow.fill(0);
    anyRow.fill(0);
    for (let x = 0; x < columns; x++) {
      const a = uniform ? x : Math.max(0, x - 1);
      const b = uniform ? x : Math.min(columns - 1, x + 1);
      for (let c = 0; c < 3; c++) {
        let d = 255;
        let e = 0;
        for (let xx = a; xx <= b; xx++) {
          d = Math.min(d, vDark[xx * 3 + c]!);
          e = Math.max(e, vBright[xx * 3 + c]!);
        }
        darkRow[x * 3 + c] = d;
        brightRow[x * 3 + c] = e;
      }
      // Kırmızı: 3×3'ün en kötüsü (yatayda), şeritlere.
      if (vActive[x] === 0) continue;
      const hRed = vRed.subarray(x * FIELDS, (x + 1) * FIELDS);
      const kind = coreKind[x]!;
      const m = band[x]!;
      for (let dir = 0; dir < 2; dir++) {
        const coreValue = kind === 2 ? hRed[FIELD_CORE + dir]! : 0;
        const u = (dir * PHOTO_BARS + m) * LEVELS;
        for (let l = 0; l < LEVELS; l++) {
          const glow = hRed[FIELD_GLOW + 2 * l + dir]!;
          unionRow[u + l]! += glow;
          if (kind === 0) {
            coreRow[u + l]! += glow;
            continue;
          }
          // Kaplama aralıklarında (kaba düzey): yarı sütunun içi `[kappaFrom, kappaTo]`, ilk ve
          // son satır (kaplama 0'dan başlar) `[0, kappaTo]`.
          const c = COARSE[l]!;
          let inside = 0;
          let edge = 0;
          for (let b = 0; b <= kappaTo[x]!; b++) {
            const v = hRed[FIELD_KAPPA + 2 * (b * KAPPA_LEVELS.length + c) + dir]!;
            edge = Math.max(edge, v);
            if (b >= kappaFrom[x]!) inside = Math.max(inside, v);
          }
          coreRow[u + l]! += kind === 1 ? inside : Math.max(glow, coreValue);
          anyRow[u + l]! += edge;
        }
      }
    }
  };

  const inc: RedTables = {
    glow: new Float32Array(PHOTO_BARS * LEVELS * stride),
    withCore: new Float32Array(PHOTO_BARS * LEVELS * stride),
    any: new Float64Array(PHOTO_BARS * LEVELS),
    tail: new Float64Array(PHOTO_BARS * (TAIL_STEPS + 1)),
  };
  const dec: RedTables = {
    glow: new Float32Array(PHOTO_BARS * LEVELS * stride),
    withCore: new Float32Array(PHOTO_BARS * LEVELS * stride),
    any: new Float64Array(PHOTO_BARS * LEVELS),
    tail: new Float64Array(PHOTO_BARS * (TAIL_STEPS + 1)),
  };
  const headroom = (i: number) =>
    LUMA[0] * HEADROOM[darkRow[i]!]! +
    LUMA[1] * HEADROOM[darkRow[i + 1]!]! +
    LUMA[2] * HEADROOM[darkRow[i + 2]!]!;
  // Parlaklığın satır toplamları (tek renkli zeminde ilk satırdan sonra aynı kalır).
  const coreSums = new Float64Array(PHOTO_BARS);
  const glowRunning = new Float64Array(2 * PHOTO_BARS * LEVELS);
  const coreRunning = new Float64Array(2 * PHOTO_BARS * LEVELS);
  const glowSums = new Float64Array(PHOTO_BARS);
  const linSums = new Float64Array(PHOTO_BARS);
  for (let r = 0; r < rows; r++) {
    if (r < measuredRows) {
      buildRow(firstRow + r);
      for (let k = 0; k < PHOTO_BARS; k++) {
        const { coreFrom, coreTo, from, to, profile } = bars[k]!;
        let coreSum = 0;
        let glowSum = 0;
        let linSum = 0;
        for (let x = from; x < to; x++) {
          const i = x * 3;
          const g = profile[x - from]!;
          const lr = u0 * g * s0[brightRow[i]!]!;
          const lg = u1 * g * s1[brightRow[i + 1]!]!;
          const lb = u2 * g * s2[brightRow[i + 2]!]!;
          glowSum +=
            LUMA[0] * Math.min(lr, HEADROOM[darkRow[i]!]!) +
            LUMA[1] * Math.min(lg, HEADROOM[darkRow[i + 1]!]!) +
            LUMA[2] * Math.min(lb, HEADROOM[darkRow[i + 2]!]!);
          linSum += LUMA[0] * lr + LUMA[1] * lg + LUMA[2] * lb;
          if (x >= coreFrom && x < coreTo) coreSum += headroom(i);
        }
        coreSums[k] = coreSum;
        glowSums[k] = glowSum;
        linSums[k] = linSum;
      }
      for (const [dir, t] of [
        [0, inc],
        [1, dec],
      ] as const) {
        for (let i = 0; i < PHOTO_BARS * LEVELS; i++) {
          t.any[i] = Math.max(t.any[i]!, anyRow[dir * PHOTO_BARS * LEVELS + i]!);
        }
      }
    }
    for (let k = 0; k < PHOTO_BARS; k++) {
      const at = k * stride + r;
      coreTable[at + 1] = coreTable[at]! + coreSums[k]!;
      glowTable[at + 1] = glowTable[at]! + glowSums[k]!;
      glowLinTable[at + 1] = glowLinTable[at]! + linSums[k]!;
    }
    for (const [dir, t] of [
      [0, inc],
      [1, dec],
    ] as const) {
      for (let i = 0; i < PHOTO_BARS * LEVELS; i++) {
        const at = i * stride + r;
        const j = dir * PHOTO_BARS * LEVELS + i;
        glowRunning[j]! += unionRow[j]!;
        coreRunning[j]! += coreRow[j]!;
        t.glow[at + 1] = glowRunning[j]!;
        t.withCore[at + 1] = coreRunning[j]!;
      }
    }
  }
  // Dikey kuyruklar (parlaklık): çizginin üstündeki ve çubuğun ucunun altındaki gerçek satırlar,
  // çubuk boyuna göre. Satır y'de ışıltı kenardan d uzakta en çok `boxTail(d, e)` kadar; pikselin
  // katkısı hem tam ışıltıdakini hem de doğrusal sınır × kuyruğu geçmez. Boy adımı i: e ∈ (i−1, i];
  // son adım (uzun çubuk): ucun altındaki satır her yerde olabilir, aşağısının en büyükleri.
  // Kırmızı kuyruklar (şerit başına, en uzun komşunun boy adımına göre): kuyruk satırında
  // pikselin ışıltısı en çok `boxTail(d, e_max) · min(Σ τ_k, T_m)` (her komşunun ucu en uzununkinden
  // uzak değil, kutusu ondan kısa). Satırlar yukarıdaki gibi gerçek satırlar.
  const glowSrgbMax = Math.max(...glowSrgb);
  const redTail = (t: RedTables, m: number, scale: number) => {
    const level = (y: number, v: number) => {
      const r = y - firstRow;
      if (r < 0 || r >= rows || v * scale * glowSrgbMax < 0.5) return 0;
      const at = (m * LEVELS + redLevel(v * scale, tauMax)) * stride + r;
      return t.glow[at + 1]! - t.glow[at]! + 2 ** -22 * t.glow[at + 1]!;
    };
    for (let i = 0; i <= TAIL_STEPS; i++) {
      const e = i === TAIL_STEPS ? Infinity : i;
      let sum = 0;
      for (let j = 0; j <= tailRowsRed; j++) {
        sum += level(topRowRed - 1 - j, boxTail(Math.max(0, top0 - (topRowRed - j)), e, sigma));
      }
      if (i < TAIL_STEPS) {
        for (let y = Math.ceil(top0 + Math.max(0, i - 1)); y - (top0 + i) <= tailRowsRed; y++) {
          sum += level(y, boxTail(Math.max(0, y - (top0 + i)), e, sigma));
        }
      } else {
        // Uzun çubuk: ucun altındaki satır her yerde olabilir; her uzaklık için aşağısının en büyüğü.
        const r0 = Math.max(0, Math.min(rows, Math.ceil(top0 + TAIL_STEPS - 1) - firstRow));
        for (let d = 0; d <= tailRowsRed; d++) {
          const v = boxTail(d, e, sigma);
          if (v * scale * glowSrgbMax < 0.5) break;
          const l = redLevel(v * scale, tauMax);
          let best = 0;
          for (let r = r0; r < rows; r++) {
            const at = (m * LEVELS + l) * stride + r;
            best = Math.max(best, t.glow[at + 1]! - t.glow[at]! + 2 ** -22 * t.glow[at + 1]!);
          }
          sum += best;
        }
      }
      t.tail[m * (TAIL_STEPS + 1) + i] = sum;
    }
  };
  const top0 = barGeometry(width, height).top;
  const topRowRed = Math.floor(top0);
  const tailRowsRed = Math.ceil(TAIL_SIGMAS * sigma) + 1;
  for (let m = 0; m < PHOTO_BARS; m++) {
    let sumTau = 0;
    for (let i = start[m]!; i < start[m + 1]!; i++) sumTau += tauList[i]!;
    const scale = Math.min(sumTau, bandTotal[m]!);
    redTail(inc, m, scale);
    redTail(dec, m, scale);
  }

  const glowTail = new Float64Array(PHOTO_BARS * (TAIL_STEPS + 1));
  const top = barGeometry(width, height).top;
  const topRow = Math.floor(top);
  const tailRows = Math.ceil(TAIL_SIGMAS * sigma) + 1;
  const rowValue = (t: Float64Array, k: number, r: number) =>
    r < 0 || r >= rows ? 0 : t[k * stride + r + 1]! - t[k * stride + r]!;
  const longStart = Math.ceil(top + TAIL_STEPS - 1) - firstRow;
  for (let k = 0; k < PHOTO_BARS; k++) {
    const suffixG = new Float64Array(rows + 1);
    const suffixL = new Float64Array(rows + 1);
    for (let r = rows - 1; r >= 0; r--) {
      suffixG[r] = Math.max(suffixG[r + 1]!, rowValue(glowTable, k, r));
      suffixL[r] = Math.max(suffixL[r + 1]!, rowValue(glowLinTable, k, r));
    }
    for (let i = 0; i <= TAIL_STEPS; i++) {
      const e = i === TAIL_STEPS ? Infinity : i;
      let sum = 0;
      for (let j = 0; j <= tailRows; j++) {
        const r = topRow - 1 - j - firstRow;
        const v = boxTail(Math.max(0, top - (topRow - j)), e, sigma);
        sum += Math.min(rowValue(glowTable, k, r), v * rowValue(glowLinTable, k, r));
      }
      if (i < TAIL_STEPS) {
        for (let y = Math.ceil(top + Math.max(0, i - 1)); y - (top + i) <= tailRows; y++) {
          const v = boxTail(Math.max(0, y - (top + i)), e, sigma);
          const r = y - firstRow;
          sum += Math.min(rowValue(glowTable, k, r), v * rowValue(glowLinTable, k, r));
        }
      } else {
        const r0 = Math.max(0, Math.min(rows, longStart));
        for (let d = 0; d <= tailRows; d++) {
          sum += Math.min(suffixG[r0]!, boxTail(d, e, sigma) * suffixL[r0]!);
        }
      }
      glowTail[k * (TAIL_STEPS + 1) + i] = sum;
    }
  }
  return {
    geometry,
    firstRow,
    rows,
    core: coreTable,
    glow: glowTable,
    glowLinear: glowLinTable,
    glowTail,
    reach,
    tauMax,
    maxGlow: Math.max(...glowSrgb),
    bands: {
      start,
      list: Int32Array.from(list),
      tau: Float64Array.from(tauList),
      total: bandTotal,
    },
    redIncrease: inc,
    redDecrease: dec,
  };
}

/** Çubuk başına ışık dizisinden en kötü WCAG penceresinin ortalaması (parlaklık). */
function worstWindow(map: LineMap, light: Float64Array): number {
  const { geometry, reach } = map;
  const { width, height, pitch } = geometry;
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

/** Boyları `extents` olan çubukların sınırları: parlaklık, kırmızı artış ve azalış. */
export interface FlashBounds {
  luminance: number;
  redIncrease: number;
  redDecrease: number;
}

const lightScratch = new Float64Array(PHOTO_BARS);
const prefixIncrease = new Float64Array(PHOTO_BARS + 1);
const prefixDecrease = new Float64Array(PHOTO_BARS + 1);
const barExtent = new Float64Array(PHOTO_BARS);
const barStep = new Int32Array(PHOTO_BARS);
const barPeak = new Float64Array(PHOTO_BARS);
const sortedExtent = new Float64Array(PHOTO_BARS);
const sortedTau = new Float64Array(PHOTO_BARS);
const sortedStep = new Int32Array(PHOTO_BARS);
const sortedPeak = new Float64Array(PHOTO_BARS);
/** `boxTail(d, e)` tablosu (σ'ya göre; son ölçülen σ için). */
let tailTable: { sigma: number; rows: number; values: Float64Array } | null = null;

function tails(sigma: number) {
  if (tailTable && tailTable.sigma === sigma) return tailTable;
  const rows = Math.ceil(TAIL_SIGMAS * sigma) + 2;
  const values = new Float64Array((rows + 1) * (TAIL_STEPS + 1));
  for (let d = 0; d <= rows; d++) {
    for (let e = 0; e <= TAIL_STEPS; e++) {
      values[d * (TAIL_STEPS + 1) + e] = boxTail(d, e === TAIL_STEPS ? Infinity : e, sigma);
    }
  }
  tailTable = { sigma, rows, values };
  return tailTable;
}

/**
 * Boyları `extents` (CSS piksel) olan çubukların herhangi bir WCAG penceresinde ekleyebileceği en
 * büyük ortalama parlaklık ve kırmızı değerin en büyük artışı ve azalışı (çubuksuz resme göre).
 *
 * Parlaklık: pencereye ışığının bir kısmı bile düşebilen çubuğun bütün ışığı sayılır; çubuk boyu
 * pencere yüksekliğini geçebileceği için bütün satırlar sayılır (ikisi de fazla sayar). Işıltı
 * çubuğun satırlarında tam (dikey bulanıklık içeride ≤ 1), kuyrukları ayrı (`glowTail`).
 *
 * Kırmızı: pencerenin dokunduğu her şerit, her satırında bir kez sayılır. Satırın pikseline gelen
 * ışıltı en çok `Σ_k τ_k · v_k` (`τ_k` çubuk k'nın şeritteki en büyük ışıltısı, `v_k` dikey değeri:
 * çubuğun içinde `boxPeak(e_k)`, dışında kenara uzaklığıyla `boxTail`) ve en çok `max v · T_m`
 * (`T_m` şeritteki en büyük toplam ışıltı); o düzeyin tablosu okunur. Komşuların boylarına göre
 * satırlar parçalara bölünür, kuyruklar satır satır.
 */
export function flashBounds(
  map: LineMap,
  extents: readonly number[],
  luminanceOnly = false,
): FlashBounds {
  const { geometry, firstRow, rows, bands, tauMax } = map;
  const { width, height, top, sigma, pitch } = geometry;
  if (rows === 0 || width <= 0 || height <= 0) {
    return { luminance: 0, redIncrease: 0, redDecrease: 0 };
  }
  const stride = rows + 1;
  const row = (y: number) => Math.max(0, Math.min(rows, y - firstRow));
  const c0 = row(Math.floor(top));
  const light = lightScratch;
  for (let k = 0; k < PHOTO_BARS; k++) {
    const e = Math.max(0, extents[k] ?? 0);
    const base = k * stride;
    const c1 = row(Math.ceil(top + e));
    // Kısa çubuğun ışıltısı sönük: en çok `boxPeak(e)` × doğrusal sınır.
    light[k] =
      map.core[base + c1]! -
      map.core[base + c0]! +
      Math.min(
        map.glow[base + c1]! - map.glow[base + c0]!,
        boxPeak(e, sigma) * (map.glowLinear[base + c1]! - map.glowLinear[base + c0]!),
      ) +
      map.glowTail[k * (TAIL_STEPS + 1) + Math.min(TAIL_STEPS, Math.ceil(e))]!;
  }
  const luminance = worstWindow(map, light);
  if (luminanceOnly) return { luminance, redIncrease: 0, redDecrease: 0 };

  const table = tails(sigma);
  // Çizgi bir piksel satırına denk geliyorsa ilk satır tam kaplanır; yalnız son satır yarım.
  const partialRows = Number.isInteger(top) ? 1 : 2;
  const T1 = TAIL_STEPS + 1;
  // Şerit m'nin satırları `[r0, r1)` düzey l'de (artış, azalış); `core`: şeridin çubuğu orada.
  let incSum = 0;
  let decSum = 0;
  const FLOAT32 = 2 ** -22;
  const addRows = (m: number, l: number, r0: number, r1: number, core: boolean) => {
    if (r1 <= r0) return;
    const at = (m * LEVELS + l) * stride;
    const inc = core ? map.redIncrease.withCore : map.redIncrease.glow;
    const dec = core ? map.redDecrease.withCore : map.redDecrease.glow;
    incSum += inc[at + r1]! - inc[at + r0]! + FLOAT32 * inc[at + r1]!;
    decSum += dec[at + r1]! - dec[at + r0]! + FLOAT32 * dec[at + r1]!;
  };
  prefixIncrease[0] = 0;
  prefixDecrease[0] = 0;
  // Çubuk başına boy, kuyruk adımı ve ışıltının dikey tepesi (bir kez).
  for (let k = 0; k < PHOTO_BARS; k++) {
    const e = Math.max(0, extents[k] ?? 0);
    barExtent[k] = e;
    barStep[k] = Math.min(TAIL_STEPS, Math.ceil(e));
    barPeak[k] = boxPeak(e, sigma);
  }
  const values = table.values;
  const maxDistance = table.rows;
  for (let m = 0; m < PHOTO_BARS; m++) {
    incSum = 0;
    decSum = 0;
    const from = bands.start[m]!;
    const n = bands.start[m + 1]! - from;
    const total = bands.total[m]!;
    // Komşular boylarına göre (artan) sıralı, düz dizilerde.
    for (let i = 0; i < n; i++) {
      const k = bands.list[from + i]!;
      const e = barExtent[k]!;
      let j = i;
      while (j > 0 && sortedExtent[j - 1]! > e) {
        sortedExtent[j] = sortedExtent[j - 1]!;
        sortedTau[j] = sortedTau[j - 1]!;
        sortedStep[j] = sortedStep[j - 1]!;
        sortedPeak[j] = sortedPeak[j - 1]!;
        j--;
      }
      sortedExtent[j] = e;
      sortedTau[j] = bands.tau[from + i]!;
      sortedStep[j] = barStep[k]!;
      sortedPeak[j] = barPeak[k]!;
    }
    const own = barExtent[m]!;
    // Çubukların içi: parça parça (her parçada boyu parçayı kapsayanlar içeride, kısalar bitmiş).
    let previous = 0;
    let rowFrom = c0;
    let firstLevel = -1;
    for (let i = 0; i < n; i++) {
      const e = sortedExtent[i]!;
      const rowTo = row(Math.ceil(top + e));
      if (rowTo > rowFrom) {
        let tau = 0;
        let vMax = 0;
        for (let q = 0; q < n; q++) {
          const v =
            q >= i
              ? sortedPeak[q]!
              : values[
                  Math.min(maxDistance, Math.floor(previous - sortedExtent[q]!)) * T1 +
                    sortedStep[q]!
                ]!;
          tau += sortedTau[q]! * v;
          if (v > vMax) vMax = v;
        }
        const l = redLevel(Math.min(tau, vMax * total), tauMax);
        if (firstLevel < 0) firstLevel = l;
        addRows(m, l, rowFrom, rowTo, own >= e);
        rowFrom = rowTo;
      }
      previous = e;
    }
    // Kuyruklar (en uzun komşunun boyuna göre, ölçümde hesaplanmış).
    const tailStep = Math.min(TAIL_STEPS, Math.ceil(n > 0 ? sortedExtent[n - 1]! : 0));
    incSum += map.redIncrease.tail[m * T1 + tailStep]!;
    decSum += map.redDecrease.tail[m * T1 + tailStep]!;
    // Tam öz sütunlarında kaplaması bilinmeyen ilk ve son satır (en parlak parçanın düzeyinde).
    if (firstLevel >= 0) {
      incSum += partialRows * map.redIncrease.any[m * LEVELS + firstLevel]!;
      decSum += partialRows * map.redDecrease.any[m * LEVELS + firstLevel]!;
    }
    prefixIncrease[m + 1] = prefixIncrease[m]! + incSum;
    prefixDecrease[m + 1] = prefixDecrease[m]! + decSum;
  }
  // Pencereler: her tamsayı konumda, dokunduğu şeritlerin toplamı.
  const win = flashWindow(width, height);
  const bandOf = (x: number) =>
    Math.max(0, Math.min(PHOTO_BARS - 1, Math.round((x + 0.5) / pitch)));
  let redIncrease = 0;
  let redDecrease = 0;
  let lastBands = -1;
  for (let x0 = 0; x0 + win.width <= Math.ceil(width); x0++) {
    const m0 = bandOf(x0);
    const m1 = bandOf(x0 + win.width - 1);
    const key = m0 * PHOTO_BARS + m1;
    if (key === lastBands) continue;
    lastBands = key;
    redIncrease = Math.max(redIncrease, prefixIncrease[m1 + 1]! - prefixIncrease[m0]!);
    redDecrease = Math.max(redDecrease, prefixDecrease[m1 + 1]! - prefixDecrease[m0]!);
  }
  const area = win.width * win.height;
  return { luminance, redIncrease: redIncrease / area, redDecrease: redDecrease / area };
}

/**
 * Boyları `extents` (CSS piksel) olan çubukların herhangi bir WCAG penceresinde ekleyebileceği en
 * büyük ortalama parlaklık (`flashBounds`).
 */
export function lightBound(map: LineMap, extents: readonly number[]): number {
  return flashBounds(map, extents).luminance;
}

/**
 * Bir karenin payları: parlaklık (pencere ortalamasının çubuksuz resme göre en büyük artışı) ve
 * kırmızı ölçünün en büyük artışı ve azalışı. Herhangi iki kare arasında pencerenin kırmızı
 * değeri en çok `redIncrease + redDecrease` değişir (biri çubuksuzdan yukarı, öbürü aşağı).
 */
export interface FlashBudgets {
  luminance: number;
  redIncrease: number;
  redDecrease: number;
}

/**
 * Hedef boylar (`targets`, CSS piksel) bu karede payları geçmeyecek biçimde: gerekirse her çubuğun
 * sessizlik boyunun üstündeki kısmı aynı oranda kısaltılır (ikiye bölerek arama). Sessizlik
 * boyları bile geçiyorsa sessizlik boyları. Pay bir sayıysa yalnızca parlaklık.
 */
export function limitExtents(
  map: LineMap,
  targets: readonly number[],
  budget: number | FlashBudgets = FLASH_BUDGET,
): number[] {
  const budgets: FlashBudgets =
    typeof budget === "number"
      ? { luminance: budget, redIncrease: Infinity, redDecrease: Infinity }
      : budget;
  // Sınırların paylarına oranının en büyüğü: ≤ 1 ise sığar. Oran ölçekle artar (her sınır
  // çubuk boylarıyla artar).
  const ratio = (extents: readonly number[]) => {
    const b = flashBounds(map, extents, budgets.redIncrease === Infinity);
    const part = (value: number, budget: number) =>
      budget === Infinity ? 0 : budget > 0 ? value / budget : value > 0 ? Infinity : 0;
    return Math.max(
      part(b.luminance, budgets.luminance),
      part(b.redIncrease, budgets.redIncrease),
      part(b.redDecrease, budgets.redDecrease),
    );
  };
  const rest = map.geometry.rest;
  const scaled = (s: number) => targets.map((t) => rest + Math.max(0, t - rest) * s);
  let hi = 1;
  let rHi = ratio(targets);
  if (rHi <= 1) return [...targets];
  let lo = 0;
  let rLo = ratio(scaled(0));
  if (rLo > 1) return scaled(0);
  // Doğrusal ara değerle daraltma (Illinois): sığan en büyük ölçeğe birkaç ölçümde yaklaşır;
  // sonuç her zaman sığdığı ölçülmüş `lo`.
  let side = 0;
  for (let i = 0; i < 8 && hi - lo > 1 / 512; i++) {
    const t = Number.isFinite(rHi) ? (1 - rLo) / (rHi - rLo) : 0.5;
    const s = lo + (hi - lo) * Math.min(0.95, Math.max(0.05, t));
    const r = ratio(scaled(s));
    if (r <= 1) {
      lo = s;
      rLo = r;
      if (side === 1) rHi = 1 + (rHi - 1) / 2;
      side = 1;
    } else {
      hi = s;
      rHi = r;
      if (side === -1) rLo = 1 - (1 - rLo) / 2;
      side = -1;
    }
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

/**
 * Kırmızı payın artışa düşen oranı: bütün çubuklar en büyük boydayken artış ve azalış sınırlarının
 * oranı (`[RED_SPLIT_MIN, 1 − RED_SPLIT_MIN]`). Resim değişmedikçe aynı kalmalı (bkz.
 * `flashBudgets`).
 */
export function redSplit(map: LineMap): number {
  const full = new Array<number>(PHOTO_BARS).fill(map.geometry.cap);
  const { redIncrease, redDecrease } = flashBounds(map, full);
  const total = redIncrease + redDecrease;
  const split = total > 0 ? redIncrease / total : 0.5;
  return Math.max(RED_SPLIT_MIN, Math.min(1 - RED_SPLIT_MIN, split));
}

/**
 * Karenin payları. Kırmızı pay (`RED_BUDGET`, güvenli modda yarısı) artış ve azalışa `split`
 * oranında bölünür; `split` bilinmezken (resim ölçülmeden) ikisi de en küçük pay
 * (`RED_SPLIT_MIN`). Böylece bölüşüm, güvenli mod ya da ölçüm değişse de herhangi iki karenin
 * artışıyla azalışının toplamı `RED_BUDGET`'ı geçmez (aynı resimde `split` sabit kalır).
 */
export function flashBudgets(safe: boolean, split: number | null): FlashBudgets {
  const red = safe ? RED_BUDGET / 2 : RED_BUDGET;
  const s = split ?? null;
  return {
    luminance: flashBudget(safe),
    redIncrease: red * (s === null ? RED_SPLIT_MIN : s),
    redDecrease: red * (s === null ? RED_SPLIT_MIN : 1 - s),
  };
}

/**
 * Bir WCAG penceresine dokunan frendeki blokların piksel sayısının pencereninkine oranı (`N⁺/N`,
 * `flashGuardMath.ts` 8. adım), `width × height` tuvalde.
 */
export function windowExcess(width: number, height: number): number {
  const win = flashWindow(width, height);
  const bw = Math.ceil(width / (GUARD_COLS * GUARD_BLOCKS_PER_CELL));
  const bh = Math.ceil(height / (GUARD_ROWS * GUARD_BLOCKS_PER_CELL));
  return ((win.width + 2 * bw) * (win.height + 2 * bh)) / (win.width * win.height);
}

/**
 * Hareketli arka planda karenin payları. Arka plan parlaklık freninden geçer (kırmızı kanalıyla):
 * bir pencerenin arka plan ortalaması T saniyede en çok `ρ · T` yol alır (`ρ = r_p · N⁺/N ·
 * (1 + GUARD_MAX_DT)`; kırmızıda `320 · r_r · …`), ekranın 8 biti onu en çok `ε` saptırır. Çubuklar
 * her karede çubuksuz arka plana göre `[−D, I]` (parlaklıkta `[0, a]`) bandında. Bir değişim
 * (eşik `Δ`: 0,1 ya da 20) sayılması için arka planın son değişimden beri en az
 * `Δ − (bant + 2ε)` yol alması gerekir; 1 saniyedeki değişim sayısı `N ≤ 1 + ρ / (Δ − bant − 2ε)`.
 * Bant `N ≤ 7` (saniyede ≤ 3 parlama; güvenli modda `N ≤ 3`, ≤ 1 parlama) olacak biçimde, %90
 * payla seçilir; güvenli modda ayrıca normalin yarısını geçmez.
 */
export function animatedBudgets(
  safe: boolean,
  split: number | null,
  width: number,
  height: number,
): FlashBudgets {
  const excess = windowExcess(width, height);
  const band = (mode: boolean) => {
    const rates = guardRates(mode, true);
    const changes = mode ? 2 : 6;
    const time = 1 + GUARD_MAX_DT;
    const eps = SRGB_HALF_STEP_LUMINANCE;
    const luminance = 0.9 * (FLASH_DELTA - 2 * eps - (rates.pattern * excess * time) / changes);
    const red =
      0.9 *
      (RED_FLASH -
        2 * RED_FLASH_SCALE * 3 * eps -
        (RED_FLASH_SCALE * rates.red * excess * time) / changes);
    return { luminance: Math.max(0, luminance), red: Math.max(0, red) };
  };
  const normal = band(false);
  const chosen = safe ? band(true) : normal;
  const luminance = Math.min(flashBudget(safe), chosen.luminance, safe ? normal.luminance / 2 : 1);
  const red = Math.min(chosen.red, safe ? normal.red / 2 : Infinity);
  const s = split ?? null;
  return {
    luminance,
    redIncrease: red * (s === null ? RED_SPLIT_MIN : s),
    redDecrease: red * (s === null ? RED_SPLIT_MIN : 1 - s),
  };
}

/** Hareketli arka planı ekrana getiren fren (`FlashGuard`'ın kullanılan kısmı). */
export interface MotionGuard {
  primeSource(source: OffscreenCanvas | HTMLCanvasElement): boolean;
  processSource(
    source: OffscreenCanvas | HTMLCanvasElement,
    dt: number,
    target?: null,
    reuse?: boolean,
  ): boolean;
}

/**
 * Hareketli arka planın bir ekran karesi. `changed`: resmin karesi ya da tuvalin boyu değişti.
 * Fren yalnızca Epilepsi güvenli modunda (proje sahibinin kararı, 24 Ekim 2026): o modda fren her
 * karede ilerler, ama doku yalnızca kare değişince yüklenir (`reuse`). Mod kapalıyken kare olduğu
 * gibi çizilir (`primeSource`) ve kare değişmedikçe yeniden yüklenmez: WebGL tuvali son çizilen
 * kareyi gösterir. `state.raw`: ekranda frensiz kare var mı (mod kapanınca frenli görüntü bir kez
 * frensize döner). Çizilemezse `false`.
 */
export function presentMotion(
  guard: MotionGuard,
  frame: OffscreenCanvas | HTMLCanvasElement,
  state: { primed: boolean; raw: boolean },
  changed: boolean,
  safe: boolean,
  dt: number,
): boolean {
  if (state.primed && safe) {
    state.raw = false;
    return guard.processSource(frame, dt, null, !changed);
  }
  if (state.primed && state.raw && !changed) return true;
  state.primed = guard.primeSource(frame);
  state.raw = state.primed;
  return state.primed;
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
 * kırmızısı koyu (doygunluk 0,76) olduğundan onu parlatmak pembe verirdi. Resmin kendi rengi
 * soluksa (bej, pastel) çizgi de soluk ya da beyaz: soluk resme parlak turuncu çizgi yakışmaz.
 */
export function dominantColor(rgba: ArrayLike<number>): Rgb {
  let x = 0;
  let y = 0;
  let chroma = 0;
  let count = 0;
  // Renkliliğe göre ağırlıklı HSV doygunluğu: koyu ama canlı renk (koyu kırmızı) yüksek, açık
  // ama soluk renk (bej) düşük.
  let saturationSum = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = (rgba[i + 3] ?? 255) / 255;
    const [h, c] = hueChroma(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    const max = Math.max(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    x += Math.cos(h * 2 * Math.PI) * c * alpha;
    y += Math.sin(h * 2 * Math.PI) * c * alpha;
    chroma += c * alpha;
    count += alpha;
    if (max > 0) saturationSum += ((c * 255) / max) * c * alpha;
  }
  if (count === 0) return [255, 255, 255];
  const coherence = chroma > 0 ? Math.hypot(x, y) / chroma : 0;
  // Tutarlılık 0,5'in altında beyaz, 0,9'un üstünde saf ton; renksiz resimde (ortalama
  // renklilik 0,08'in altı) beyaza doğru.
  // Resmin kendi doygunluğu (renkliliğe göre ağırlıklı) 0,2'nin altında beyaz, 0,45'in üstünde
  // tam canlı: örnek kırmızı resim 0,52 (beyaz tüyleriyle) → tam canlı kırmızı; bej 0,2 → beyaz.
  const own = chroma > 0 ? saturationSum / chroma : 0;
  const saturation =
    Math.max(0, Math.min(1, (coherence - 0.5) / 0.4)) *
    Math.max(0, Math.min(1, chroma / count / 0.08)) *
    Math.max(0, Math.min(1, (own - 0.2) / 0.25));
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
