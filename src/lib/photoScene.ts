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
 * çubuk renginden ve resmin çizgi bölgesinden hesaplanır (`measureLine`, `lineExtent`; resim
 * yokken `maxBarExtentForContrast`). Değişim %10'a varmadığı için parlama sayılmaz; saniyede kaç
 * kez olduğu önemsizleşir.
 *
 * Resmin ortalaması yetmez: yarısı karanlık yarısı aydınlık bir resimde ortalama çubuğun rengine
 * yakın çıkabilir, karanlık yarıda ise çubuk tam karşıtlıkla yanar. Bu yüzden her yerin kendi
 * karşıtlığı, çubukların o pencerede kapladığı satırlarda toplanır. Tarayıcı renkleri sRGB uzayında karıştırır; yarı saydam ışıltı açık
 * zeminde doğrusal hesabın iki katına kadar karartabilir (`pixelContrast` bunu da sayar).
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
  return maxBarExtentForContrast(width, height, Math.abs(barLuminance - backgroundLuminance), safe);
}

/**
 * `maxBarExtent`'in karşıtlıkla biçimi: `contrast`, birim saydamlıkta (tam kaplamada) bir
 * pikselin bağıl parlaklığının en çok ne kadar değiştiği (`pixelContrast`, `worstContrast`).
 */
export function maxBarExtentForContrast(
  width: number,
  height: number,
  contrast: number,
  safe: boolean,
): number {
  if (width <= 0 || height <= 0) return 0;
  const window = flashWindow(width, height);
  contrast = Math.max(0.05, contrast);
  const pitch = width / PHOTO_BARS;
  const bar = Math.max(1, pitch * BAR_DUTY);
  const lit = bar * (1 + GLOW_ALPHA);
  const allowed = (FLASH_BUDGET * pitch * window.height) / (lit * contrast);
  const extent = Math.min(REST_EXTENT + allowed, MAX_EXTENT_FRACTION * height);
  return safe ? REST_EXTENT + (extent - REST_EXTENT) / 2 : extent;
}

/** sRGB bileşeninin (0..1) doğrusal ışığa çevrilme eğrisinin o noktadaki eğimi (artan). */
function linearSlope(v: number): number {
  return Math.max(1 / 12.92, (2.4 / 1.055) * ((v + 0.055) / 1.055) ** 1.4);
}

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

/**
 * `fg` rengi `bg` zeminin üstüne `a` saydamlıkla (tarayıcı gibi sRGB uzayında) çizilince
 * pikselin bağıl parlaklığı en çok `a · pixelContrast(fg, bg)` değişir. Açılan bileşenlerin
 * eğrisi dışbükeydir: değişim `a` ile en çok doğrusal artar (tam kaplamadaki fark). Kararan
 * bileşenlerde değişim küçük `a`'da en diktir: zeminin eğimiyle sınırlanır. İkisi ters yönde
 * olduğundan toplam değişim büyük olanını geçmez.
 */
export function pixelContrast(fg: Rgb, bg: Rgb): number {
  let up = 0;
  let down = 0;
  for (let k = 0; k < 3; k++) {
    const f = fg[k]!;
    const b = bg[k]!;
    if (f > b) up += LUMA[k]! * (linear(f) - linear(b));
    else down += LUMA[k]! * ((b - f) / 255) * linearSlope(b / 255);
  }
  return Math.max(up, down);
}

/** Resim bilinmezken (yüklenirken) en kötü zemin: her bileşeni siyah ya da beyaz. */
export function worstContrast(colors: readonly Rgb[]): number {
  let worst = 0;
  for (const c of colors) {
    worst = Math.max(worst, pixelContrast(c, [0, 0, 0]), pixelContrast(c, [255, 255, 255]));
  }
  return worst;
}

/**
 * Sahnenin kenarları karartan katmanının (`.photo-scene__shade`, global.css) `(x, y)` (ekranın
 * oranı) noktasındaki saydamlığı. CSS değişirse burası da değişir.
 */
export function shadeAlpha(x: number, y: number): number {
  const d = Math.SQRT2 * Math.hypot(x - 0.5, y - 0.5);
  const radial = 0.45 * Math.max(0, Math.min(1, (d - 0.55) / 0.45));
  const linearShade = y < 0.3 ? 0.18 * (1 - y / 0.3) : y > 0.7 ? 0.25 * ((y - 0.7) / 0.3) : 0;
  return 1 - (1 - radial) * (1 - linearShade);
}

/**
 * Resmin yavaş kayması (`photo-drift`: 1,04–1,08 büyütme, ±%0,8 ve ±%0,4 kayma) için pay (ekranın
 * oranı): ölçülen resim ekrandakinden bu kadar kaymış olabilir.
 */
const DRIFT_X = 0.05;
const DRIFT_Y = 0.025;
/** Çubuğun yarı kaplanan (kenar yumuşatmalı) iki kenarının toplam genişliği en çok (CSS piksel). */
const EDGE_PX = 2;

/** Ölçülmüş çizgi bandı: her sütunda satır satır karşıtlıkların birikimli toplamları. */
export interface LineMap {
  /** Ölçülen resmin boyu (piksel) ve ekrandaki boyu (CSS piksel). */
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
  /** Tam kaplanan çubuk pikseli için karşıtlık (`[x · (height + 1) + y]`, y'ye kadar toplam). */
  solid: Float64Array;
  /** Yarı saydam (ışıltı, kenar) için karşıtlık, aynı biçimde. */
  soft: Float64Array;
}

/** `width`×`height` haritayı yatayda `rx`, dikeyde `ry` piksel en büyük değerle genişletir. */
function dilate(
  map: Float64Array,
  width: number,
  height: number,
  rx: number,
  ry: number,
  firstRow: number,
  lastRow: number,
) {
  // `firstRow`–`lastRow` dışı 0: yalnızca bu satırlar ve dikey payı işlenir.
  const across = new Float64Array(map.length);
  for (let y = firstRow; y < lastRow; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let k = Math.max(0, x - rx); k <= Math.min(width - 1, x + rx); k++) {
        m = Math.max(m, map[y * width + k]!);
      }
      across[y * width + x] = m;
    }
  }
  const out = new Float64Array(map.length);
  for (let y = Math.max(0, firstRow - ry); y < Math.min(height, lastRow + ry); y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let k = Math.max(0, y - ry); k <= Math.min(height - 1, y + ry); k++) {
        m = Math.max(m, across[k * width + x]!);
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

/**
 * Resmin (ekrandaki gibi kırpılmış, `sourceWidth`×`sourceHeight` RGBA) her `block`×`block`
 * bloğu için çubuğun ekleyebileceği en büyük parlaklık değişimi: tam kaplanan öz pikselinde |öz − zemin|, yarı saydam ışıltı ve
 * kenarda `pixelContrast` (sRGB karışımı). Zemin kenar karartmasıyla (`shadeAlpha`) ya da onsuz;
 * kayma ve ışıltının yayılması için komşuların en kötüsü alınır.
 */
export function measureLine(
  rgba: ArrayLike<number>,
  sourceWidth: number,
  sourceHeight: number,
  screenWidth: number,
  screenHeight: number,
  core: Rgb,
  accent: Rgb,
  block = 2,
): LineMap {
  // Her `block`×`block` blokta bileşenlerin en koyusu ve en açığı: ince desen ortalamada kaybolmasın.
  const width = Math.max(1, Math.floor(sourceWidth / block));
  const height = Math.max(1, Math.floor(sourceHeight / block));
  const scale = width / Math.max(1, screenWidth);
  const solid = new Float64Array(width * height);
  const soft = new Float64Array(width * height);
  const coreLum = relativeLuminance(core);
  // Yalnızca çubukların ve ışıltılarının uzanabileceği satırlar (kayma payıyla); gerisi 0.
  const glowFraction = (2 * GLOW_PX) / Math.max(1, screenHeight);
  const firstRow = Math.max(
    0,
    Math.floor((0.5 - MAX_EXTENT_FRACTION * UP_SHARE - glowFraction - 2 * DRIFT_Y) * height),
  );
  const lastRow = Math.min(
    height,
    Math.ceil((0.5 + MAX_EXTENT_FRACTION + glowFraction + 2 * DRIFT_Y) * height),
  );
  for (let y = firstRow; y < lastRow; y++) {
    const y0 = Math.max(0, y / height - DRIFT_Y);
    const y1 = Math.min(1, (y + 1) / height + DRIFT_Y);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x / width - DRIFT_X);
      const x1 = Math.min(1, (x + 1) / width + DRIFT_X);
      // Karartma merkezden uzaklaştıkça artar: dikdörtgenin köşelerinden en koyusu.
      const s = Math.max(
        shadeAlpha(x0, y0),
        shadeAlpha(x0, y1),
        shadeAlpha(x1, y0),
        shadeAlpha(x1, y1),
      );
      const low: Rgb = [255, 255, 255];
      const high: Rgb = [0, 0, 0];
      for (let by = 0; by < block; by++) {
        for (let bx = 0; bx < block; bx++) {
          const i = ((y * block + by) * sourceWidth + x * block + bx) * 4;
          for (let k = 0; k < 3; k++) {
            const v = rgba[i + k] ?? 0;
            low[k] = Math.min(low[k]!, v);
            high[k] = Math.max(high[k]!, v);
          }
        }
      }
      // Açılma en koyu (karartılmış) zeminde, kararma en açık zeminde en büyük.
      // Aşağı yuvarlanır: daha koyu zemin, açılmada daha büyük fark (güvenli yön).
      const dark: Rgb = [
        Math.floor(low[0] * (1 - s)),
        Math.floor(low[1] * (1 - s)),
        Math.floor(low[2] * (1 - s)),
      ];
      solid[y * width + x] = Math.max(
        Math.abs(coreLum - relativeLuminance(dark)),
        Math.abs(coreLum - relativeLuminance(high)),
      );
      soft[y * width + x] = Math.max(
        pixelContrast(core, dark),
        pixelContrast(core, high),
        pixelContrast(accent, dark),
        pixelContrast(accent, high),
      );
    }
  }
  const pitch = screenWidth / PHOTO_BARS;
  const rx = Math.ceil((DRIFT_X * screenWidth + pitch + 2 * GLOW_PX) * scale);
  const ry = Math.ceil(DRIFT_Y * screenHeight * scale) + 1;
  const glowRows = Math.ceil(2 * GLOW_PX * scale);
  const cumulative = (map: Float64Array) => {
    const out = new Float64Array(width * (height + 1));
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        out[x * (height + 1) + y + 1] = out[x * (height + 1) + y]! + map[y * width + x]!;
      }
    }
    return out;
  };
  return {
    width,
    height,
    screenWidth,
    screenHeight,
    solid: cumulative(dilate(solid, width, height, rx, ry, firstRow, lastRow)),
    soft: cumulative(dilate(soft, width, height, rx, ry + glowRows, firstRow, lastRow)),
  };
}

/**
 * Ölçülmüş resimde çubukların en büyük toplam boyu (CSS piksel): boy `e` iken her WCAG
 * penceresinde çubukların (öz, kenar, ışıltı) değiştirebileceği ortalama parlaklık, çubukların
 * kapladığı satırların karşıtlıkları toplanarak bulunur; `FLASH_BUDGET`'ı geçmeyen en büyük boy
 * (ikiye bölerek arama). Güvenli modda artış yarısı.
 */
export function lineExtent(map: LineMap, safe: boolean): number {
  const { width, height, screenWidth, screenHeight } = map;
  if (width <= 0 || height <= 0 || screenWidth <= 0 || screenHeight <= 0) return 0;
  const scale = width / screenWidth;
  const pitch = screenWidth / PHOTO_BARS;
  const bar = Math.max(1, pitch * BAR_DUTY);
  const edge = Math.min(bar, EDGE_PX);
  const window = flashWindow(screenWidth, screenHeight);
  const columns = Math.max(1, Math.min(width, Math.round(window.width * scale)));
  const area = (columns / scale) * window.height;
  const sum = (table: Float64Array, x: number, from: number, to: number) =>
    table[x * (height + 1) + to]! - table[x * (height + 1) + from]!;
  const density = new Float64Array(width);
  const change = (extent: number) => {
    const up = (extent * UP_SHARE) / (1 + UP_SHARE);
    const lineAt = screenHeight / 2;
    const from = Math.max(0, Math.min(height, Math.floor((lineAt - up) * scale)));
    const to = Math.max(from, Math.min(height, Math.ceil((lineAt - up + extent) * scale)));
    for (let x = 0; x < width; x++) {
      // Satır toplamı ölçüm pikseli cinsinden; CSS piksele çevrilir.
      const solid = sum(map.solid, x, from, to) / scale;
      const soft = sum(map.soft, x, from, to) / scale;
      density[x] = ((bar - edge) * solid + edge * soft + GLOW_ALPHA * bar * soft) / pitch;
    }
    let total = 0;
    for (let x = 0; x < columns; x++) total += density[x]!;
    let worst = total;
    for (let x = columns; x < width; x++) {
      total += density[x]! - density[x - columns]!;
      worst = Math.max(worst, total);
    }
    return worst / scale / area;
  };
  const cap = MAX_EXTENT_FRACTION * screenHeight;
  let extent = cap;
  if (change(cap) > FLASH_BUDGET) {
    // Değişim boyla artar: sınırın altında kalan en büyük boy.
    let lo = REST_EXTENT;
    let hi = cap;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (change(mid) <= FLASH_BUDGET) lo = mid;
      else hi = mid;
    }
    extent = lo;
  }
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
