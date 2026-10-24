/**
 * "Kendi resmin" sahnesinin saf hesapları: kullanıcının resmi arka planda, ortada şarkıyla oynayan
 * ışık çizgisi, üstünde şarkının adı ve süre. Çizgi çok sayıda ince çubuktan oluşur: bas solda,
 * tizler sağda (frekansa göre logaritmik); çubuklar çizgiden aşağı sarkar, yukarıya kısa uçları
 * çıkar. Her çubuk kendi frekansını izler (`spectrumBars.ts`): vuruşta sol yan derin iner, hemen
 * söner.
 *
 * Epilepsi güvenliği: resim sabittir (parlaklığı değişmez). Değişen tek şey çubukların boyudur;
 * çubukların en büyük boyu, WCAG'nin parlama penceresinde (`flashWindow`) çubuklar tümden yanıp
 * sönse bile ortalama parlaklık değişimi %10'un altında kalacak biçimde ekranın ölçüsünden,
 * çubuk renginden ve resmin çizgi bölgesindeki parlaklığından hesaplanır (`maxBarExtent`).
 * Değişim %10'a varmadığı için parlama sayılmaz; saniyede kaç kez olduğu önemsizleşir.
 */
import { flashWindow } from "./flash";

/** Çubuk sayısı (soldan sağa bastan tize). */
export const PHOTO_BARS = 200;
/** Çubuk genişliğinin çubuk aralığına oranı (geri kalanı boşluk). */
export const BAR_DUTY = 0.45;
/**
 * Işıltı: çubuğun `GLOW_PX` bulanıklıkta, `GLOW_ALPHA` saydamlıkta gölgesi. Bulanıklık ışığı
 * yayar ama toplamını değiştirmez: ışıltı, çubuğun alanının `GLOW_ALPHA` katı ışık ekler.
 */
export const GLOW_PX = 8;
export const GLOW_ALPHA = 0.6;
/** Çubuğun yukarı uzayan kısmı, aşağı sarkan kısmının bu oranı. */
export const UP_SHARE = 0.18;
/** Sessizlikte çubuğun toplam boyu (piksel): çizgi noktalı ince bir sıra olarak kalır. */
export const REST_EXTENT = 2;
/** Bir pencerede izin verilen en büyük ortalama değişim (parlama eşiği 0,1; pay bırakılır). */
export const FLASH_BUDGET = 0.08;
/** Çubuğun toplam boyu ekran yüksekliğinin bu oranını geçmez. */
const MAX_EXTENT_FRACTION = 0.2;

export type Rgb = [number, number, number];

/** sRGB bileşeninden doğrusal ışığa (WCAG bağıl parlaklık). */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG bağıl parlaklık (0..1). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Çubukların en büyük toplam boyu (yukarı + aşağı, piksel). Bir çubuk aralığında (`p`) çubuk
 * `b = BAR_DUTY·p` genişliğinde; ışıltısıyla birlikte `b·(1 + GLOW_ALPHA)` genişliğinde tam renk
 * kadar ışık taşır (bulanıklık ışığı yayar, toplamını değiştirmez; çubuğun altında kalan gölge
 * de sayılır: pay). Boy `e0`'dan `e`'ye çıkınca pencere ortalaması en çok
 * `Δ · (e − e0) · b(1 + α) / (p · pencere yüksekliği)` değişir; `Δ = |çubuk − arka plan|`.
 * Bu değişim `FLASH_BUDGET`'ı geçmesin. Güvenli modda artış yarısı.
 */
export function maxBarExtent(
  width: number,
  height: number,
  barLuminance: number,
  backgroundLuminance: number,
  safe: boolean,
): number {
  if (width <= 0 || height <= 0) return 0;
  const window = flashWindow(width, height);
  const contrast = Math.max(0.05, Math.abs(barLuminance - backgroundLuminance));
  const pitch = width / PHOTO_BARS;
  const bar = Math.max(1, pitch * BAR_DUTY);
  const lit = bar * (1 + GLOW_ALPHA);
  const allowed = (FLASH_BUDGET * pitch * window.height) / (lit * contrast);
  const extent = Math.min(REST_EXTENT + allowed, MAX_EXTENT_FRACTION * height);
  return safe ? REST_EXTENT + (extent - REST_EXTENT) / 2 : extent;
}

/** Çubuğun ekrandaki dikdörtgeni. */
export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Çubukların yerleri: çizgi ekranın `lineY` oranındaki yükseklikte, yatayda kenarlardan `margin`
 * oranında boşlukla. Her çubuğun toplam boyu en az `REST_EXTENT`, en çok `maxExtent`; bunun
 * `UP_SHARE / (1 + UP_SHARE)` kadarı çizginin üstünde, gerisi altında.
 */
export function barRects(
  levels: readonly number[],
  width: number,
  height: number,
  maxExtent: number,
  lineY = 0.5,
  margin = 0,
): BarRect[] {
  const left = width * margin;
  const span = width - 2 * left;
  const pitch = span / Math.max(1, levels.length);
  const barWidth = Math.max(1, pitch * BAR_DUTY);
  const lineAt = height * lineY;
  return levels.map((level, i) => {
    const extent = Math.max(REST_EXTENT, Math.max(0, Math.min(1, level)) * maxExtent);
    const up = (extent * UP_SHARE) / (1 + UP_SHARE);
    return {
      x: left + i * pitch + (pitch - barWidth) / 2,
      y: lineAt - up,
      width: barWidth,
      height: extent,
    };
  });
}

/** RGB → HSL (0..1). */
function toHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const hue = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue(p, q, h + 1 / 3) * 255),
    Math.round(hue(p, q, h) * 255),
    Math.round(hue(p, q, h - 1 / 3) * 255),
  ];
}

/** Resimden renk bulunamazsa (gri, siyah-beyaz) çizginin rengi: programın vurgu yeşili. */
export const DEFAULT_ACCENT: Rgb = [70, 240, 166];

/**
 * Resmin baskın canlı rengi (RGBA pikseller, küçültülmüş resimden): her pikselin tonu doygunluğu
 * ve parlaklığıyla ağırlıklanır, en ağır ton aralığı (24 dilim) seçilir. Renk çizgide parlasın
 * diye doygunluğu ve açıklığı yükseltilir. Resim neredeyse renksizse vurgu yeşili.
 */
export function accentFromPixels(rgba: ArrayLike<number>): Rgb {
  const SLICES = 24;
  const weight = new Array<number>(SLICES).fill(0);
  const sumX = new Array<number>(SLICES).fill(0);
  const sumY = new Array<number>(SLICES).fill(0);
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [h, s, l] = toHsl([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
    // Çok koyu ve çok açık pikseller renk taşımaz.
    const w = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 2) * ((rgba[i + 3] ?? 255) / 255);
    if (w <= 0) continue;
    const slice = Math.min(SLICES - 1, Math.floor(h * SLICES));
    weight[slice]! += w;
    sumX[slice]! += Math.cos(h * 2 * Math.PI) * w;
    sumY[slice]! += Math.sin(h * 2 * Math.PI) * w;
    total += w;
  }
  const pixels = rgba.length / 4;
  if (pixels === 0 || total / pixels < 0.01) return DEFAULT_ACCENT;
  let best = 0;
  for (let i = 1; i < SLICES; i++) if (weight[i]! > weight[best]!) best = i;
  const angle = Math.atan2(sumY[best]!, sumX[best]!);
  const hue = (angle / (2 * Math.PI) + 1) % 1;
  return fromHsl(hue, 0.9, 0.6);
}

/** Çubuğun özünün rengi: vurgu renginin dörtte biri beyaza (canlı kalır, ışık gibi parlar). */
export function coreColor([r, g, b]: Rgb): Rgb {
  const mix = (c: number) => Math.round(c * 0.75 + 255 * 0.25);
  return [mix(r), mix(g), mix(b)];
}

/** Çizgi bölgesindeki ortalama bağıl parlaklık (RGBA pikseller). Pikselsiz: 0. */
export function meanLuminance(rgba: ArrayLike<number>): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    sum += relativeLuminance([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

/** Türkçeye özgü harfler: adda biri varsa büyük harfe Türkçe kuralıyla çevrilir. */
const TURKISH_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Yazının büyük harflisi. "Flying" → "FLYING" (İngilizce kural), "Gülpembe" → "GÜLPEMBE";
 * Türkçe harf içeren adda i → İ ("Şirin" → "ŞİRİN").
 */
export function displayUpper(text: string): string {
  return text.toLocaleUpperCase(TURKISH_LETTERS.test(text) ? "tr" : "en");
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
