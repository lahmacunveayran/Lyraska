/**
 * Parlaklık freninin saf hesabı (epilepsi güvenliği). Ekran kartındaki fren (`flashGuard.ts`)
 * bu dosyadaki algoritmanın aynısını çalıştırır; buradaki işlemci sürümü testlerin kaynak
 * uygulamasıdır ve sabitler (ızgara, hızlar, pay) iki taraf için de buradan gelir.
 *
 * Amaç: güvenilmeyen bir sahnenin (ör. kullanıcının MilkDrop preseti) görüntüsü ne olursa olsun,
 * ekranda saniyede 3'ten fazla parlama olmaması (WCAG 2.3.1; güvenli modda 1).
 *
 * ## Yöntem
 *
 * Görüntü `GUARD_COLS × GUARD_ROWS` (32×18) hücreye, her hücre `GUARD_BLOCKS_PER_CELL²` (8×8)
 * bloğa bölünür (256×144 blok). Blok `i`'nin pikselleri `[⌊i·W/NB⌋, ⌊(i+1)·W/NB⌋)` aralığıdır;
 * `n_b` bloğun piksel sayısı, `N_c` hücrenin piksel sayısıdır. Parlaklık bağıl parlaklıktır
 * (doğrusal RGB'den `Y = 0,2126 R + 0,7152 G + 0,0722 B`), yani pikseller arasında doğrusaldır.
 *
 * Durum: `H_b`, bir önceki karede gösterilen görüntünün blok ortalama rengi (doğrusal RGB, kesin).
 * Yeni karede girdinin blok ortalaması `X̄_b` ölçülür. Hücrenin dört köşesine (k) bir "geçiş payı"
 * `a_k ∈ [0, 1]` verilir; blok içinde payı köşelerin çift doğrusal karışımıdır ve blok boyunca
 * sabittir: `a(b) = Σ_k φ_k(b)·a_k`, `φ_k` köşe ağırlıkları (bloğun hücredeki merkezinde, toplamları 1).
 * Gösterilen piksel:
 *
 *     O(p) = H_b + a(b)·(X(p) − H_b)        (p, b bloğunda)
 *
 * yani önceki görüntüyle yeni görüntünün dışbükey karışımı. `a = 1` ise görüntü olduğu gibi geçer.
 * Bloğun yeni ortalaması `H_b + a(b)·(X̄_b − H_b)`'dir ve bir sonraki karenin durumu olur.
 *
 * ## Sınırın kanıtı
 *
 * 1. Hücre. `μ_c` hücrenin gösterilen ortalama parlaklığı olsun. `a` blok boyunca sabit olduğundan
 *
 *        μ_c(t) − μ_c(t−1) = Σ_b n_b·a(b)·ΔY_b / N_c = Σ_k a_k·E_{c,k},
 *        ΔY_b = Y(X̄_b) − Y(H_b),   E_{c,k} = Σ_{b∈c} n_b·φ_k(b)·ΔY_b / N_c.
 *
 *    Hücrenin payı `α_c = min(1, s / Σ_k |E_{c,k}|)`, köşenin payı ona dokunan (en çok dört)
 *    hücrenin paylarının en küçüğüdür: `a_k ≤ α_c`. O hâlde
 *    `|Δμ_c| ≤ Σ_k a_k·|E_{c,k}| ≤ α_c·Σ_k |E_{c,k}| ≤ s`. Bu kesindir; parlaklaşmada da
 *    kararmada da (ani siyah: önceki görüntü `1 − a` payıyla ekranda kalır) geçerlidir.
 *    `s = r·dt` (r: saniyedeki en büyük parlaklık değişimi), `dt` en fazla `GUARD_MAX_DT`.
 *
 * 2. Pencere. Hücrelerden oluşan her pencerenin ortalaması hücre ortalamalarının ağırlıklı
 *    ortalamasıdır (`μ_W = Σ_c (N_c / N_W)·μ_c`, ağırlıklar ≥ 0, toplamları 1); dolayısıyla
 *    `|Δμ_W| ≤ max_c |Δμ_c| ≤ s`. WCAG'nin parlama alanı (1024×768 ekranda 341×256, ekranın
 *    ~1/3'ü) ~10×6 hücredir.
 *
 * 3. Parlama sayısı. `countFlashes` (`flash.ts`) bir değişimi, eğri bir önceki değişimden (ya da
 *    başlangıçtan) bu yana izlenen uç değerden 0,1 uzaklaşınca sayar; bunun için eğrinin en az
 *    0,1 yol alması, yani en az `0,1 / r` saniye gerekir. T saniyede en çok `⌊r·T / 0,1⌋` değişim,
 *    en çok `r·T / 0,2` parlama olur: r = 0,3 → saniyede 1,5.
 *
 * 4. Ekranın 8 biti. Ekrana giden renk 8 bit sRGB'ye yuvarlanır. Bir kanalın yarım adımı doğrusal
 *    ışıkta en çok `ε_q = ½ · (1/255) · 2,4/1,055 ≈ 0,0045`'tir (sRGB eğrisinin en dik yeri,
 *    beyaz); parlaklık kanalların ağırlıklı ortalaması olduğundan piksel ve pencere ortalaması da
 *    en çok bu kadar sapar ve sapma birikmez (durum yuvarlanmamış değeri saklar). Görünen eğride
 *    sayılan bir değişim kesin eğride en az `0,1 − 2·ε_q` yol ister:
 *    `parlama/sn ≤ r / (2·(0,1 − 2·ε_q))` (`flashRateBound`). Normal mod r = 0,3 → ≤ 1,65 (sınır 3);
 *    güvenli mod r = 0,18 → ≤ 0,99 (hedef 1; 0,2 yuvarlamayla 1,1'e çıkardı).
 *
 * 5. Hizasız pencereler. Kenarı hücrelerin ortasından geçen bir pencerenin ortalaması
 *    `Σ_c w_c·μ_c + D_W`'dir: ilk terim yine hız sınırlıdır (ağırlıklar ≥ 0, toplamları 1);
 *    `D_W`, kenardaki hücrelerin içindeki dağılımdan gelir (hücrenin pencerede kalan kısmı
 *    hücre ortalamasından farklıysa). `|D_W| ≤ d` ise sınır `r / (2·(0,1 − 2·ε_q − 2·d))` olur.
 *    Tekdüze ya da hücreden büyük ölçekli değişimlerde `d ≈ 0`; köşe ağırlıkları hücre içindeki
 *    birinci dereceden dağılımı da görür (bir yarısı parlayıp öbür yarısı kararan hücrede köşe
 *    terimleri zıt işaretlidir, mutlak toplamları sınırlanır). Kalan açık: hücre içinde ortalaması
 *    ve köşe ağırlıklı toplamları sıfır olan, belirli bir pencerenin kenarına göre kurgulanmış ince
 *    desenler. Tarayıcı denetimi pencereleri 4 piksel adımla, hücrelere hizasız ölçer.
 *
 * Kırmızı parlama (WCAG "red flash"): doymuş kırmızı ↔ karanlık geçişleri parlaklık üzerinden
 * sınırlıdır (saf kırmızının parlaklığı 0,2126; tam geçiş normal modda en az 0,7 sn). Aynı
 * parlaklıkta kırmızı ↔ başka renk titreşimi bu frene görünmez; gerekirse ikinci bir "kırmızılık"
 * kanalı aynı yöntemle sınırlanır (bilinen boşluk, MIMARI.md).
 *
 * Renk tonu: gösterilen her piksel, önceki gösterilen blok rengiyle yeni pikselin karışımıdır;
 * sahnede olmayan bir renk üretilmez. Fren devrede değilken (`a = 1`) görüntü değişmeden geçer.
 */

import { FLASH_DELTA } from "./flash";

/** Izgaranın hücre sayısı (yatay, dikey). */
export const GUARD_COLS = 32;
export const GUARD_ROWS = 18;
/** Hücre başına blok (her eksende). */
export const GUARD_BLOCKS_PER_CELL = 8;

/** Normal modda gösterilen parlaklığın en büyük değişim hızı (bağıl parlaklık / saniye). */
export const GUARD_RATE = 0.3;
/** Güvenli modda (8 bit yuvarlama dahil saniyede ≤ 1 parlama). */
export const GUARD_SAFE_RATE = 0.18;
/**
 * Bir karenin en uzun süresi (saniye). Sekme arka plandan dönünce gelen uzun bir kare tek seferde
 * büyük bir sıçramaya izin vermesin; kısa `dt` her zaman güvenli taraftır.
 */
export const GUARD_MAX_DT = 0.1;
/** Kayan nokta ve 24 bit saklama yuvarlamaları için her karede düşülen pay. */
export const GUARD_SLEW_MARGIN = 1e-5;

/** Ekranın 8 bit sRGB yuvarlamasının doğrusal parlaklıktaki en büyük sapması (yarım adım). */
export const SRGB_HALF_STEP_LUMINANCE = (0.5 / 255) * (2.4 / 1.055);

/** Bağıl parlaklık ağırlıkları (doğrusal RGB). */
export const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/** Bir karede izin verilen en büyük parlaklık değişimi. */
export function frameSlew(rate: number, dt: number): number {
  const time = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), GUARD_MAX_DT) : 0;
  return Math.max(0, rate * time - GUARD_SLEW_MARGIN);
}

/** Hızı `rate` olan frenin 8 bit ekranda saniyedeki en çok parlama sayısı (kanıtın 4. adımı). */
export function flashRateBound(rate: number): number {
  return rate / (2 * (FLASH_DELTA - 2 * SRGB_HALF_STEP_LUMINANCE));
}

/** sRGB (0..1) → doğrusal ışık. */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Doğrusal ışık → sRGB (0..1). */
export function linearToSrgb(v: number): number {
  const c = Math.min(Math.max(v, 0), 1);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

export interface GuardGrid {
  /** Görüntünün piksel boyu. */
  width: number;
  height: number;
  cols: number;
  rows: number;
  perCell: number;
}

/** Varsayılan ızgara, `width × height` görüntü için. */
export function guardGrid(width: number, height: number): GuardGrid {
  return {
    width,
    height,
    cols: GUARD_COLS,
    rows: GUARD_ROWS,
    perCell: GUARD_BLOCKS_PER_CELL,
  };
}

/** Blok `i`'nin ilk pikseli (`count` blok, `size` piksel). Ekran kartı da aynı tamsayı hesabını yapar. */
export function blockEdge(i: number, size: number, count: number): number {
  return Math.floor((i * size) / count);
}

/** Pikselin bloğu: `blockEdge(i) ≤ x < blockEdge(i + 1)` olan `i`. */
export function blockOfPixel(x: number, size: number, count: number): number {
  return Math.ceil(((x + 1) * count) / size) - 1;
}

/** Bloğun hücre içindeki konumu için köşe ağırlıkları (sol-alt, sağ-alt, sol-üst, sağ-üst). */
export function cornerWeights(
  i: number,
  j: number,
  perCell: number,
): [number, number, number, number] {
  const u = (i + 0.5) / perCell;
  const v = (j + 0.5) / perCell;
  return [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
}

/** Blokların piksel sayıları (satır satır, `blocksX × blocksY`). */
export function blockCounts(grid: GuardGrid): Float64Array {
  const bx = grid.cols * grid.perCell;
  const by = grid.rows * grid.perCell;
  const counts = new Float64Array(bx * by);
  for (let y = 0; y < by; y++) {
    const h = blockEdge(y + 1, grid.height, by) - blockEdge(y, grid.height, by);
    for (let x = 0; x < bx; x++) {
      counts[y * bx + x] = h * (blockEdge(x + 1, grid.width, bx) - blockEdge(x, grid.width, bx));
    }
  }
  return counts;
}

export interface GuardStep {
  /** Blokların geçiş payı `a(b)`. */
  gains: Float64Array;
  /** Gösterilen blok ortalamaları (doğrusal RGB, `3 × blok`); bir sonraki karenin durumu. */
  output: Float64Array;
  /** Hücrelerin payı `α_c` (satır satır). */
  cellGains: Float64Array;
}

/**
 * Frenin bir karesi (kaynak uygulama). `hold`: önceki gösterilen blok ortalamaları, `input`: yeni
 * karenin blok ortalamaları (ikisi de doğrusal RGB, blok başına 3 değer, satır satır), `slew`: bu
 * karede izin verilen değişim (`frameSlew`).
 */
export function guardStep(
  grid: GuardGrid,
  counts: Float64Array,
  hold: Float64Array,
  input: Float64Array,
  slew: number,
): GuardStep {
  const { cols, rows, perCell } = grid;
  const bx = cols * perCell;
  const cellGains = new Float64Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const e = [0, 0, 0, 0];
      let total = 0;
      for (let j = 0; j < perCell; j++) {
        for (let i = 0; i < perCell; i++) {
          const b = (cy * perCell + j) * bx + cx * perCell + i;
          const n = counts[b] ?? 0;
          const dy = luminanceAt(input, b) - luminanceAt(hold, b);
          const w = cornerWeights(i, j, perCell);
          for (let k = 0; k < 4; k++) e[k]! += n * w[k]! * dy;
          total += n;
        }
      }
      const l1 = total > 0 ? e.reduce((sum, v) => sum + Math.abs(v), 0) / total : 0;
      cellGains[cy * cols + cx] = l1 <= slew ? 1 : slew / l1;
    }
  }
  const vertices = vertexGains(cellGains, cols, rows);
  const blocks = bx * rows * perCell;
  const gains = new Float64Array(blocks);
  const output = new Float64Array(blocks * 3);
  for (let b = 0; b < blocks; b++) {
    const x = b % bx;
    const y = Math.floor(b / bx);
    const a = blockGain(vertices, cols, perCell, x, y);
    gains[b] = a;
    for (let ch = 0; ch < 3; ch++) {
      const h = hold[b * 3 + ch] ?? 0;
      output[b * 3 + ch] = h + a * ((input[b * 3 + ch] ?? 0) - h);
    }
  }
  return { gains, output, cellGains };
}

/** Köşelerin payı: köşeye dokunan hücrelerin en küçük payı (`(cols+1) × (rows+1)`). */
export function vertexGains(cellGains: Float64Array, cols: number, rows: number): Float64Array {
  const vertices = new Float64Array((cols + 1) * (rows + 1));
  for (let vy = 0; vy <= rows; vy++) {
    for (let vx = 0; vx <= cols; vx++) {
      let a = 1;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ] as const) {
        const cx = vx + dx;
        const cy = vy + dy;
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) {
          a = Math.min(a, cellGains[cy * cols + cx] ?? 1);
        }
      }
      vertices[vy * (cols + 1) + vx] = a;
    }
  }
  return vertices;
}

/** Bloğun payı: hücresinin dört köşesinin çift doğrusal karışımı (bloğun merkezinde). */
export function blockGain(
  vertices: Float64Array,
  cols: number,
  perCell: number,
  x: number,
  y: number,
): number {
  const cx = Math.floor(x / perCell);
  const cy = Math.floor(y / perCell);
  const w = cornerWeights(x - cx * perCell, y - cy * perCell, perCell);
  const stride = cols + 1;
  const at = (dx: number, dy: number) => vertices[(cy + dy) * stride + cx + dx] ?? 1;
  return w[0] * at(0, 0) + w[1] * at(1, 0) + w[2] * at(0, 1) + w[3] * at(1, 1);
}

/** Blok rengi dizisinde `b` bloğunun parlaklığı. */
export function luminanceAt(rgb: Float64Array, b: number): number {
  return (
    LUMA[0] * (rgb[b * 3] ?? 0) + LUMA[1] * (rgb[b * 3 + 1] ?? 0) + LUMA[2] * (rgb[b * 3 + 2] ?? 0)
  );
}

/** Hücrelerin gösterilen ortalama parlaklıkları (piksel ağırlıklı). */
export function cellLuminances(
  grid: GuardGrid,
  counts: Float64Array,
  rgb: Float64Array,
): Float64Array {
  const { cols, rows, perCell } = grid;
  const bx = cols * perCell;
  const result = new Float64Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      let total = 0;
      for (let j = 0; j < perCell; j++) {
        for (let i = 0; i < perCell; i++) {
          const b = (cy * perCell + j) * bx + cx * perCell + i;
          const n = counts[b] ?? 0;
          sum += n * luminanceAt(rgb, b);
          total += n;
        }
      }
      result[cy * cols + cx] = total > 0 ? sum / total : 0;
    }
  }
  return result;
}
