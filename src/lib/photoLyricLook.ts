/**
 * "Kendi resmin" sahnesindeki şarkı sözlerinin görünümü: boyut, yer, renk ve arkadaki zemin
 * (sahibinin isteği, 7 Kasım 2026: "yazının konumunu, rengini, boyutunu kullanıcı ayarlayabilsin").
 * Ayarlar bu bilgisayarda hatırlanır. Zemin otomatikken koyuluğu yazının arkasındaki bölgenin
 * parlaklığından hesaplanır ([`backdropFor`]): söylenen kelimeyle 7:1, soluk kelimeyle 4,5:1 karşıtlık.
 */

/** Sözlerin yeri: başlık bloğunda sanatçının altında (düğmeler görünürken üst ortada) ya da üstte. */
export type LyricPlace = "title" | "top";
/** Arkadaki zemin: otomatik (resme göre) ya da kapalı. */
export type LyricBackdrop = "auto" | "off";

export interface PhotoLyricLook {
  /** Boyut çarpanı (taban boyun katı). */
  scale: number;
  place: LyricPlace;
  /** "Üstte" yerinde satırın ortasının ekranın üstünden uzaklığı (ekran yüksekliğinin oranı). */
  top: number;
  /** Yazı rengi (`#rrggbb`). */
  color: string;
  backdrop: LyricBackdrop;
}

export const SCALE_MIN = 0.8;
export const SCALE_MAX = 2.4;
export const SCALE_STEP = 0.1;
/**
 * Üstte yerinin sınırları. En alt: satırın ortası ekranın %34'ünde; en büyük boyda (2,4×) bile
 * sinemadaki başlık bloğunun (alt kenarı ortanın 40 px üstünde) ve ışık çizgisinin üstünde kalır
 * (bağımsız inceleme: %46 1920×1080'de başlığa biniyordu).
 */
export const TOP_MIN = 0.06;
export const TOP_MAX = 0.34;
export const TOP_STEP = 0.01;

/** Hazır renkler (hepsi açık: koyu zeminde okunur). İlki varsayılan. */
export const LYRIC_COLORS: readonly { id: string; name: string; color: string }[] = [
  { id: "white", name: "Beyaz", color: "#ffffff" },
  { id: "warm", name: "Sıcak", color: "#ffe2a8" },
  { id: "ice", name: "Buz mavisi", color: "#bfe6ff" },
  { id: "rose", name: "Gül", color: "#ffc4dc" },
  { id: "mint", name: "Nane", color: "#c4f5d6" },
];

export const DEFAULT_LOOK: PhotoLyricLook = {
  // Sahibi: "yazı çok küçüktü" (7 Kasım); eski boy 1 idi.
  scale: 1.4,
  place: "title",
  top: 0.16,
  color: "#ffffff",
  backdrop: "auto",
};

const KEY = "lyraska.photoLyricLook";

function clampStep(value: number, min: number, max: number, step: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
}

export function clampScale(value: number): number {
  return clampStep(value, SCALE_MIN, SCALE_MAX, SCALE_STEP, DEFAULT_LOOK.scale);
}

export function clampTop(value: number): number {
  return clampStep(value, TOP_MIN, TOP_MAX, TOP_STEP, DEFAULT_LOOK.top);
}

/** `#rrggbb` (küçük harf) ya da geçersizse `null`. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

/** Saklanan ya da gelen değeri geçerli bir görünüme çevirir; bozuk alan varsayılanına döner. */
export function sanitizeLook(value: unknown): PhotoLyricLook {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    scale: typeof v.scale === "number" ? clampScale(v.scale) : DEFAULT_LOOK.scale,
    place: v.place === "top" || v.place === "title" ? v.place : DEFAULT_LOOK.place,
    top: typeof v.top === "number" ? clampTop(v.top) : DEFAULT_LOOK.top,
    color: normalizeColor(v.color) ?? DEFAULT_LOOK.color,
    backdrop: v.backdrop === "off" || v.backdrop === "auto" ? v.backdrop : DEFAULT_LOOK.backdrop,
  };
}

export function loadLook(): PhotoLyricLook {
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved ? sanitizeLook(JSON.parse(saved)) : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLook(look: PhotoLyricLook): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sanitizeLook(look)));
  } catch {
    /* Kaydedilemezse bir sonraki açılışta varsayılan görünüm. */
  }
}

/** "1,4×" biçiminde boyut. */
export function formatScale(scale: number): string {
  return `${clampScale(scale).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}×`;
}

/** "%16" biçiminde yükseklik (ekranın üstünden). */
export function formatTop(top: number): string {
  return `%${Math.round(clampTop(top) * 100)}`;
}

/** sRGB kanalı (0..255) → doğrusal (0..1). */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG bağıl parlaklık; `#rrggbb`. */
export function colorLuminance(color: string): number {
  const hex = normalizeColor(color) ?? "#ffffff";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
}

/** WCAG karşıtlık oranı (1..21). */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Söylenmekte olan kelimeyle zemin arasında istenen en küçük karşıtlık (WCAG AAA, normal yazı). */
export const TARGET_CONTRAST = 7;
/** Henüz söylenmemiş (soluk) kelimeyle zemin arasında (WCAG AA, normal yazı). */
export const DIM_TARGET_CONTRAST = 4.5;
/** Zeminin en çok örtme oranı: resim en açık yerde de seçilir. */
export const BACKDROP_MAX = 0.82;
/** Otomatik zeminin en az örtme oranı (koyu resimde de yazının kenarı yumuşak ayrılsın). */
export const BACKDROP_MIN = 0.2;

/**
 * Karşıtlığın hesaplandığı en soluk kelime: henüz söylenmemiş kelimenin saydamlığı
 * (`.photo-lyrics__word`, global.css; söylenen 0,9, söylenmekte olan 1). Emin olunmayan satırlar
 * ("tahmini", 0,4) bilerek daha soluktur; karşıtlık güvencesi onları kapsamaz.
 */
export const DIMMEST_WORD_OPACITY = 0.75;

/** Zemin: renk (`dark`: siyah, `light`: beyaz) ve örtme oranı (0..1). */
export interface Backdrop {
  tone: "dark" | "light";
  alpha: number;
}

/** Doğrusal parlaklığın (0..1) sRGB değeri (0..255; gri). */
function grayFor(luminance: number): number {
  const l = Math.min(1, Math.max(0, luminance));
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return 255 * c;
}

/**
 * Yazının arkasındaki zemin: söylenmekte olan kelimeyle 7:1, henüz söylenmemiş soluk kelimeyle
 * ([`DIMMEST_WORD_OPACITY`]) 4,5:1 karşıtlık. Açık yazı (parlaklık ≥ 0,18) siyah örtüyle, koyu yazı beyaz örtüyle
 * ayrılır. `brightest` / `darkest`: yazının arkasındaki bölgenin en açık ve en koyu yerleri
 * (parlaklığın %90 ve %10'luk dilimleri; tek açık leke de okunmayı bozar). Örtü sRGB'de karışır
 * (tarayıcının yaptığı gibi); oran 0,01 adımla en küçük yeterli değerdir, sınırları
 * [`BACKDROP_MIN`, `BACKDROP_MAX`].
 */
export function backdropFor(
  textLuminance: number,
  brightest: number,
  darkest: number,
  textOpacity = DIMMEST_WORD_OPACITY,
): Backdrop {
  const lightText = textLuminance >= 0.18;
  const tone = lightText ? "dark" : "light";
  const ground = grayFor(lightText ? brightest : darkest);
  const overlay = lightText ? 0 : 255;
  const text = grayFor(textLuminance);
  for (let step = Math.round(BACKDROP_MIN * 100); step <= BACKDROP_MAX * 100; step++) {
    const alpha = step / 100;
    const mixed = ground * (1 - alpha) + overlay * alpha;
    // Soluk kelime zeminle karışır (saydamlık sRGB'de, tarayıcı gibi; renk gri yaklaşımıyla).
    const seen = text * textOpacity + mixed * (1 - textOpacity);
    const covered = linear(mixed);
    if (
      contrastRatio(textLuminance, covered) >= TARGET_CONTRAST &&
      contrastRatio(linear(seen), covered) >= DIM_TARGET_CONTRAST
    ) {
      return { tone, alpha };
    }
  }
  return { tone, alpha: BACKDROP_MAX };
}

/** Kaba parlaklık ızgarası: ekrandaki gibi kırpılmış resmin her hücresinin parlaklığı (0..1). */
export interface LumaGrid {
  data: Float32Array;
  width: number;
  height: number;
}

/** Izgaranın en çok genişliği (hücre): satırın arkası için yeter, ölçüm hızlı kalır. */
export const LUMA_GRID_MAX_WIDTH = 96;

/** `rgba` (`mw`×`mh`) resimden kaba parlaklık ızgarası (en yakın piksel; ızgara ≤ 96 geniş). */
export function lumaGrid(rgba: ArrayLike<number>, mw: number, mh: number): LumaGrid {
  const width = Math.max(1, Math.min(LUMA_GRID_MAX_WIDTH, mw));
  const height = Math.max(1, Math.round((mh * width) / Math.max(1, mw)));
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(mh - 1, Math.floor(((y + 0.5) * mh) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(mw - 1, Math.floor(((x + 0.5) * mw) / width));
      const i = (sy * mw + sx) * 4;
      data[y * width + x] =
        0.2126 * linear(rgba[i]!) + 0.7152 * linear(rgba[i + 1]!) + 0.0722 * linear(rgba[i + 2]!);
    }
  }
  return { data, width, height };
}

/**
 * İki ızgaranın hücre hücre en açığı ve en koyusu (hareketli resmin kareleri: zemin bütün
 * karelerde yetsin). `into` boşsa `next`'in kopyası başlar.
 */
export function mergeLuma(
  into: { max: LumaGrid; min: LumaGrid } | null,
  next: LumaGrid,
): { max: LumaGrid; min: LumaGrid } {
  if (!into || into.max.width !== next.width || into.max.height !== next.height) {
    return {
      max: { ...next, data: Float32Array.from(next.data) },
      min: { ...next, data: Float32Array.from(next.data) },
    };
  }
  for (let i = 0; i < next.data.length; i++) {
    into.max.data[i] = Math.max(into.max.data[i]!, next.data[i]!);
    into.min.data[i] = Math.min(into.min.data[i]!, next.data[i]!);
  }
  return into;
}

/** Ekranın oranı olarak dikdörtgen (0..1). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function percentile(grid: LumaGrid, rect: Rect, q: number): number | null {
  const x0 = Math.max(0, Math.floor(rect.left * grid.width));
  const x1 = Math.min(grid.width, Math.ceil(rect.right * grid.width));
  const y0 = Math.max(0, Math.floor(rect.top * grid.height));
  const y1 = Math.min(grid.height, Math.ceil(rect.bottom * grid.height));
  const values: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) values.push(grid.data[y * grid.width + x]!);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * q))]!;
}

/**
 * Bölgenin en açık (%90'lık dilim; `bright` ızgarasından) ve en koyu (%10'luk dilim; `dark`
 * ızgarasından) parlaklığı. Bölge ızgaranın dışındaysa `null`.
 */
export function regionLight(
  bright: LumaGrid,
  dark: LumaGrid,
  rect: Rect,
): { brightest: number; darkest: number } | null {
  const brightest = percentile(bright, rect, 0.9);
  const darkest = percentile(dark, rect, 0.1);
  return brightest === null || darkest === null ? null : { brightest, darkest };
}

/** Görünümün CSS değişkenleri (`.app`'e yazılır; sözlerin iki yeri de okur). */
export function lookVars(look: PhotoLyricLook): Record<string, string> {
  return {
    "--photo-lyric-scale": String(clampScale(look.scale)),
    "--photo-lyric-color": normalizeColor(look.color) ?? DEFAULT_LOOK.color,
    "--photo-lyric-top": `${(clampTop(look.top) * 100).toFixed(1)}%`,
  };
}

/**
 * Zemin için ölçülecek öğe: ekranda görünen söz satırı. Üstteki satır varsa o (başlık bloğundaki yer
 * de ayrılı olabilir ama denetimler görünürken görünmez); yoksa başlık bloğundaki. Satır henüz
 * yoksa satırın yeri. Bağımsız inceleme (7 Kasım): ilk sürüm belge sırasıyla ilkini, görünmeyen
 * boş yeri ölçüyordu.
 */
export function lyricTextElement(app: ParentNode): HTMLElement | null {
  const place =
    app.querySelector<HTMLElement>(".photo-lyrics-top") ??
    app.querySelector<HTMLElement>(".photo-scene__lyrics");
  return place?.querySelector<HTMLElement>(".photo-lyrics__line") ?? place ?? null;
}
