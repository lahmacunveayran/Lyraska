/**
 * Parlaklık freninin saf hesabı (epilepsi güvenliği). Ekran kartındaki fren (`flashGuard.ts`)
 * bu dosyadaki algoritmanın aynısını çalıştırır; buradaki işlemci sürümü testlerin kaynak
 * uygulamasıdır ve sabitler (ızgara, hızlar, pay) iki taraf için de buradan gelir.
 *
 * Amaç: güvenilmeyen bir sahnenin (ör. kullanıcının MilkDrop preseti) görüntüsü ne olursa olsun,
 * ekranda saniyede 3'ten fazla parlama olmaması (WCAG 2.3.1; güvenli modda 1) ve ince bir desenin
 * (şerit, dama) saniyede 3'ten fazla tersine dönmemesi (ITU-R BT.1702, Ofcom: titreyen, tersine
 * dönen desen; güvenli modda ~1). Proje sahibinin kararıyla (24 Ekim 2026) program freni yalnızca
 * Epilepsi güvenli modunda uygular; normal hızlar (`guardRates(false)`) hesabın parçası olarak kalır.
 *
 * ## Yöntem
 *
 * Görüntü `GUARD_COLS × GUARD_ROWS` (32×18) hücreye, her hücre `GUARD_BLOCKS_PER_CELL²` (8×8)
 * bloğa bölünür (256×144 blok). Blok `i`'nin pikselleri `[⌊i·W/NB⌋, ⌊(i+1)·W/NB⌋)` aralığıdır;
 * `n_b` bloğun piksel sayısı, `N_c` hücrenin piksel sayısıdır. Parlaklık bağıl parlaklıktır
 * (doğrusal RGB'den `Y = 0,2126 R + 0,7152 G + 0,0722 B`), yani pikseller arasında doğrusaldır.
 *
 * Durum: `P(p)`, bir önceki karede gösterilen görüntü, **tam çözünürlükte** (doğrusal RGB, kanal
 * başına 16 bit sabit nokta; ping-pong doku). Yeni karede girdi `X(p)`'dir; her blokta iki sayı
 * ölçülür (ikisi de `P`'den, her karede yeniden: birikmez):
 *
 *     ΔY_b = (1/n_b) Σ_{p∈b} (Y(X(p)) − Y(P(p)))      (ortalamanın değişimi)
 *     D_b  = (1/n_b) Σ_{p∈b} |Y(X(p)) − Y(P(p))|      (piksellerin ortalama mutlak değişimi)
 *
 * Hücrenin dört köşesine (k) bir "geçiş payı" `a_k ∈ [0, 1]` verilir; blok içinde payı köşelerin
 * çift doğrusal karışımıdır ve blok boyunca sabittir: `a(b) = Σ_k φ_k(b)·a_k`, `φ_k` köşe
 * ağırlıkları (bloğun hücredeki merkezinde, toplamları 1). Gösterilen piksel:
 *
 *     O(p) = P(p) + a(b)·(X(p) − P(p))        (p, b bloğunda)
 *
 * yani önceki gösterilen pikselle yeni pikselin dışbükey karışımı (sahnede olmayan renk üretilmez).
 * `a = 1` ise görüntü olduğu gibi geçer. `O` 16 bite yuvarlanıp bir sonraki karenin `P`'si olur;
 * ekrana `O`'nun 8 bit sRGB'si gider.
 *
 * ## Sınırın kanıtı
 *
 * 1. Hücre ortalaması. `μ_c` hücrenin gösterilen ortalama parlaklığı olsun. `a` blok boyunca sabit
 *    ve parlaklık doğrusal olduğundan bloğun ortalaması tam `a(b)·ΔY_b` değişir:
 *
 *        μ_c(t) − μ_c(t−1) = Σ_b n_b·a(b)·ΔY_b / N_c = Σ_k a_k·E_{c,k},
 *        E_{c,k} = Σ_{b∈c} n_b·φ_k(b)·ΔY_b / N_c.
 *
 *    Hücrenin ortalama payı `α_c = min(1, s / Σ_k |E_{c,k}|)`. O hâlde `a_k ≤ α_c` iken
 *    `|Δμ_c| ≤ Σ_k a_k·|E_{c,k}| ≤ α_c·Σ_k |E_{c,k}| ≤ s`. Parlaklaşmada da kararmada da (ani
 *    siyah: önceki görüntü `1 − a` payıyla ekranda kalır) geçerlidir. `s = r·dt − m`
 *    (r: saniyedeki en büyük parlaklık değişimi, `dt` en fazla `GUARD_MAX_DT`, m pay).
 *
 * 2. Desen (piksellerin mutlak değişimi). Bloğun her pikseli tam `a(b)·(Y(X) − Y(P))` değişir:
 *    bloğun ortalama mutlak değişimi `a(b)·D_b`'dir. Hücrenin desen payı
 *    `β_c = min(1, s_p / max_{b∈c} D_b)` (`s_p = r_p·dt − m`). Hücrenin payı
 *    `g_c = min(α_c, β_c)`, köşenin payı ona dokunan (en çok dört) hücrenin paylarının en
 *    küçüğüdür: `a_k ≤ g_c`, dolayısıyla `a(b) = Σ_k φ_k·a_k ≤ g_c` ve her blokta
 *    `a(b)·D_b ≤ β_c·D_b ≤ s_p`. Bloğun ortalaması bloğun pikselleri gibi mutlak değişimle de
 *    sınırlı olduğundan (`|ΔY| ≤ D`) r_p ≤ r iken 1. adım 2.'nin sonucudur; ikisi de ayrı denetlenir.
 *
 * 3. Saklama. `O` kanal başına 16 bite yuvarlanır: yarım adım `q/2 = 0,5/65535 ≈ 7,6·10⁻⁶`;
 *    parlaklık kanalların ağırlıklı ortalaması olduğundan piksel ve ortalama değişim bir karede en
 *    çok bu kadar fazla olur. Pay `m = GUARD_SLEW_MARGIN = 10⁻⁵` bunu (ve 32 bit kayan nokta ile
 *    24 bit sabit noktalı ara değerlerin yuvarlamasını) karşılar: saklanan görüntüde her kare
 *    `|Δμ_c| ≤ r·dt`, her blokta ortalama mutlak değişim `≤ r_p·dt`. Ölçüm her karede saklanan
 *    `P`'den yapıldığı için yuvarlama birikmez.
 *
 * 4. Pencere. Hücrelerden oluşan her pencerenin ortalaması hücre ortalamalarının ağırlıklı
 *    ortalamasıdır (`μ_W = Σ_c (N_c / N_W)·μ_c`, ağırlıklar ≥ 0, toplamları 1); dolayısıyla
 *    `|Δμ_W| ≤ max_c |Δμ_c| ≤ s`. WCAG'nin parlama alanı (1024×768 ekranda 341×256, ekranın
 *    ~1/3'ü) ~10×6 hücredir.
 *
 * 5. Parlama sayısı. `countFlashes` (`flash.ts`) bir değişimi, eğri bir önceki değişimden (ya da
 *    başlangıçtan) bu yana izlenen uç değerden 0,1 uzaklaşınca sayar; bunun için eğrinin en az
 *    0,1 yol alması gerekir. T saniyede en çok `r·T / 0,1` değişim, `r·T / 0,2` parlama olur.
 *
 * 6. Ekranın 8 biti. Ekrana giden renk 8 bit sRGB'ye yuvarlanır. Bir kanalın yarım adımı doğrusal
 *    ışıkta en çok `ε_q = ½ · (1/255) · 2,4/1,055 ≈ 0,0045`'tir (sRGB eğrisinin en dik yeri,
 *    beyaz); piksel ve pencere ortalaması da en çok bu kadar sapar ve sapma birikmez (ekrana giden,
 *    saklanandan her karede yeniden hesaplanır). Görünen eğride sayılan bir değişim saklanan
 *    eğride en az `0,1 − 2·ε_q` yol ister: `parlama/sn ≤ r / (2·(0,1 − 2·ε_q))`
 *    (`flashRateBound`), desen için `tersine dönme/sn ≤ r_p / (0,1 − 2·ε_q)`
 *    (`patternReversalBound`).
 *
 * 7. Desenin tersine dönmesi. Bir pikselin parlaklık eğrisinde `countChanges` (`flash.ts`) her
 *    0,1'lik dönüşü bir değişim sayar ("tersine dönme": şerit açıktan koyuya ya da tersi). Bloğun
 *    piksellerinin T saniyedeki yollarının ortalaması 2. adımdan en çok `r_p·T`'dir; her sayılan
 *    değişim o pikselde en az `0,1 − 2ε_q` yol ister. Dolayısıyla **her blokta, piksel başına
 *    ortalama tersine dönme sayısı saniyede ≤ `r_p / (0,1 − 2ε_q)`**. Bloğu kaplayan, kontrastı
 *    ≥ 0,1 (ITU-R BT.1702'nin 20 cd/m²'si ~200 cd/m²'lik ekranda) bir desenin her tersine dönüşü
 *    bloğun her pikselini değiştirir: desen saniyede en çok bu kadar tersine döner. Normal mod
 *    r_p = 0,27 → ≤ 2,96/sn (çift olarak ≤ 1,48 "desen parlaması"); güvenli mod r_p = 0,095 →
 *    ≤ 1,04/sn (kontrast ≥ 0,105 ise ≤ 1; çift olarak ≤ 0,52). Güvenli modun hızı gece göğünün en
 *    hızlı parlaklık eğrisinden (0,0913/sn) küçük seçilmedi: kendi sahnelerimizin eğrileri frenden
 *    değişmeden geçer. Sınır yereldir (her 8×8 piksellik blok, 1080p'de ~7,5 px): ekranın küçük bir
 *    yerindeki desen de sınırlanır (BT.1702 ancak ekranın %25'ini aşanı yasaklar; güvenli taraf).
 *
 * 8. Hizasız pencereler. Herhangi bir piksel kümesinin (W, `N_W` piksel) ortalaması en çok
 *    piksellerinin ortalama mutlak değişimi kadar değişir; W'nin blok içinde kalan parçası da en
 *    çok bütün bloğun toplamı kadar:
 *
 *        |Δμ_W| ≤ (1/N_W)·Σ_{p∈W} |ΔY(p)| ≤ (1/N_W)·Σ_{b ∩ W ≠ ∅} n_b·a(b)·D_b ≤ s_p·N⁺_W / N_W,
 *
 *    `N⁺_W` W'ye dokunan blokların piksel sayısı. Hücrelere ya da bloklara hizasız her pencere
 *    böylece de kesin sınırlıdır: WCAG penceresi 1080p'de 640×480, blok ~7,5 px, `N⁺/N ≤ 1,06`
 *    → saniyede ≤ 1,57 parlama (güvenli ≤ 0,55). Tarayıcı denetimi pencereleri 4 piksel adımla,
 *    hücrelere hizasız ölçer.
 *
 * 9. Kırmızı (isteğe bağlı, `red: true`; "Kendi resmin" sahnesinin hareketli arka planı). WCAG'nin
 *    kırmızı parlaması: pencerenin ortalama kırmızı değeri `320 · max(0, R − G − B)` (doğrusal)
 *    20'den fazla değişip geri dönmesi. Parlaklık bunu görmez (aynı parlaklıkta kırmızı ↔ gri).
 *    `max(0, ·)` 1-Lipschitz ve `L = R − G − B` doğrusal: pikselin kırmızı değeri bir karede en
 *    çok `320 · a(b) · |L(X) − L(P)|` değişir. Her blokta `R_b = ortalama |L(X) − L(P)|` ölçülür,
 *    hücrenin kırmızı payı `γ_c = min(1, s_r / max R_b)`, hücrenin payı `min(α_c, β_c, γ_c)`.
 *    2. ve 8. adımdaki gibi her pencerenin kırmızı ortalaması bir karede en çok
 *    `320 · s_r · N⁺/N` değişir (`s_r = r_r·dt − m_r`, `m_r` üç kanalın 16 bit payı). Sayım
 *    (5. ve 6. adım): T saniyede kırmızı eğrisinin yolu en çok `320 · r_r · N⁺/N · T`; ekranın 8
 *    biti kırmızı değeri en çok `ε_r = 320 · 3 · ε_q` saptırır. Kırmızı değerin doygun olmayan
 *    renklerde 0 sayıldığı (kapılı) PEAT ölçüsü süreksizdir: doygunluk sınırında (`R/(R+G+B) = 0,8`)
 *    gözle görülmeyecek kadar küçük bir renk değişimi değeri sıçratabilir; hiçbir hız sınırı bunu
 *    önleyemez. Fren sürekli (WCAG çalışma tanımı) değeri sınırlar; kapılı ölçü ancak renkler
 *    sınırın iki yanında gidip geliyorsa ayrışır (bilinen sınır, kendi-resmin/README.md).
 *    Kapalıyken kırmızı aynen geçer (MilkDrop; bilinen boşluk, MIMARI.md).
 *
 * Bedel: hızlı ve ince ayrıntılı hareket (ince çizgiler, keskin doku) piksel başına çok değişir;
 * fren onu da yavaşlatır (iz bırakır). Yavaş ya da yumuşak değişen görüntü (piksel başına
 * saniyede `r_p`'den yavaş) değişmeden geçer.
 */

import { FLASH_DELTA } from "./flash";

/** Izgaranın hücre sayısı (yatay, dikey). */
export const GUARD_COLS = 32;
export const GUARD_ROWS = 18;
/** Hücre başına blok (her eksende). */
export const GUARD_BLOCKS_PER_CELL = 8;

/** Normal modda gösterilen ortalama parlaklığın en büyük değişim hızı (bağıl parlaklık / saniye). */
export const GUARD_RATE = 0.3;
/** Güvenli modda (8 bit yuvarlama dahil saniyede ≤ 1 parlama). */
export const GUARD_SAFE_RATE = 0.18;
/**
 * Normal modda bir bloğun piksellerinin ortalama mutlak parlaklık değişiminin en büyük hızı
 * (desen: saniyede ≤ 2,96 tersine dönme).
 */
export const GUARD_PATTERN_RATE = 0.27;
/** Güvenli modda (≤ 1,04 tersine dönme/sn; gece göğünün eğrisi değişmeden geçer). */
export const GUARD_PATTERN_SAFE_RATE = 0.095;
/**
 * Bir karenin en uzun süresi (saniye). Sekme arka plandan dönünce gelen uzun bir kare tek seferde
 * büyük bir sıçramaya izin vermesin; kısa `dt` her zaman güvenli taraftır.
 */
export const GUARD_MAX_DT = 0.1;
/**
 * Her karede düşülen pay: durumun 16 bit saklanmasının yarım adımı (`STATE_HALF_STEP`) ve kayan
 * nokta ile 24 bit sabit noktalı ara değerlerin yuvarlaması.
 */
export const GUARD_SLEW_MARGIN = 1e-5;

/** Durum (önceki gösterilen görüntü): kanal başına 16 bit sabit nokta. */
export const STATE_SCALE = 65535;
/** Durumun yuvarlamasının en büyük hatası (doğrusal ışık, kanal başına). */
export const STATE_HALF_STEP = 0.5 / STATE_SCALE;

/** Ekranın 8 bit sRGB yuvarlamasının doğrusal parlaklıktaki en büyük sapması (yarım adım). */
export const SRGB_HALF_STEP_LUMINANCE = (0.5 / 255) * (2.4 / 1.055);

/** Bağıl parlaklık ağırlıkları (doğrusal RGB). */
export const LUMA: readonly [number, number, number] = [0.2126, 0.7152, 0.0722];

/**
 * Kırmızı kanalın en büyük hızı: bloğun piksellerinin ortalama `|ΔL|`'si (`L = R − G − B`,
 * doğrusal) saniyede. Normal modda 0,09 (kırmızı değerde 28,8/sn), güvenli modda 0,03.
 */
export const GUARD_RED_RATE = 0.09;
export const GUARD_RED_SAFE_RATE = 0.03;
/** Kırmızı kanalın her karede düşülen payı: üç kanalın 16 bitlik yuvarlaması ve ara değerler. */
export const GUARD_RED_MARGIN = 3e-5;
/** Kırmızı değerin ölçeği (WCAG: `320 · (R − G − B)`). */
export const RED_FLASH_SCALE = 320;

/** Ortalama, desen ve kırmızı hızları (normal ya da güvenli mod; kırmızı kapalıysa sonsuz). */
export interface GuardRates {
  mean: number;
  pattern: number;
  red: number;
}

export function guardRates(safe: boolean, red = false): GuardRates {
  const r = red ? (safe ? GUARD_RED_SAFE_RATE : GUARD_RED_RATE) : Infinity;
  return safe
    ? { mean: GUARD_SAFE_RATE, pattern: GUARD_PATTERN_SAFE_RATE, red: r }
    : { mean: GUARD_RATE, pattern: GUARD_PATTERN_RATE, red: r };
}

/** Kırmızı kanalın bir karede izin verilen `|ΔL|` ortalaması (kapalıyken sonsuz). */
export function redSlew(rate: number, dt: number): number {
  if (!Number.isFinite(rate)) return Infinity;
  const time = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), GUARD_MAX_DT) : 0;
  return Math.max(0, rate * time - GUARD_RED_MARGIN);
}

/** Bir karede izin verilen en büyük parlaklık değişimi. */
export function frameSlew(rate: number, dt: number): number {
  const time = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), GUARD_MAX_DT) : 0;
  return Math.max(0, rate * time - GUARD_SLEW_MARGIN);
}

/** Hızı `rate` olan frenin 8 bit ekranda saniyedeki en çok parlama sayısı (kanıtın 6. adımı). */
export function flashRateBound(rate: number): number {
  return rate / (2 * (FLASH_DELTA - 2 * SRGB_HALF_STEP_LUMINANCE));
}

/**
 * Desen hızı `rate` olan frenin 8 bit ekranda bir blokta piksel başına saniyedeki en çok tersine
 * dönme (0,1'lik değişim) sayısı (kanıtın 7. adımı).
 */
export function patternReversalBound(rate: number): number {
  return rate / (FLASH_DELTA - 2 * SRGB_HALF_STEP_LUMINANCE);
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

/** Durumun saklanışı: 16 bit sabit noktaya yuvarlama (ekran kartının `writeState`'i). */
export function quantizeState(v: number): number {
  return Math.round(Math.min(Math.max(v, 0), 1) * STATE_SCALE) / STATE_SCALE;
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

/** Her pikselin bloğu (satır satır, `width × height`). */
export function pixelBlocks(grid: GuardGrid): Int32Array {
  const { width, height } = grid;
  const bx = grid.cols * grid.perCell;
  const by = grid.rows * grid.perCell;
  const blocks = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    const yb = blockOfPixel(y, height, by);
    for (let x = 0; x < width; x++) blocks[y * width + x] = yb * bx + blockOfPixel(x, width, bx);
  }
  return blocks;
}

/** Bir karede blokların ölçümü (kanıtın `ΔY_b` ve `D_b`'si). */
export interface BlockStats {
  delta: Float64Array;
  abs: Float64Array;
  /** Bloğun piksellerinin ortalama `|ΔL|`'si (`L = R − G − B`, 9. adım). */
  red: Float64Array;
}

/**
 * Blokların ölçümü: `state` (önceki gösterilen) ve `input` (yeni kare) pikseller, doğrusal RGB,
 * piksel başına 3 değer, satır satır.
 */
export function blockStats(
  grid: GuardGrid,
  blocks: Int32Array,
  counts: Float64Array,
  state: Float64Array,
  input: Float64Array,
): BlockStats {
  const delta = new Float64Array(counts.length);
  const abs = new Float64Array(counts.length);
  const red = new Float64Array(counts.length);
  const [lr, lg, lb] = LUMA;
  const pixels = grid.width * grid.height;
  for (let p = 0; p < pixels; p++) {
    const d =
      lr * (input[p * 3]! - state[p * 3]!) +
      lg * (input[p * 3 + 1]! - state[p * 3 + 1]!) +
      lb * (input[p * 3 + 2]! - state[p * 3 + 2]!);
    const b = blocks[p]!;
    delta[b]! += d;
    abs[b]! += Math.abs(d);
    red[b]! += Math.abs(
      input[p * 3]! -
        state[p * 3]! -
        (input[p * 3 + 1]! - state[p * 3 + 1]!) -
        (input[p * 3 + 2]! - state[p * 3 + 2]!),
    );
  }
  for (let b = 0; b < counts.length; b++) {
    const n = counts[b]!;
    delta[b] = n > 0 ? delta[b]! / n : 0;
    abs[b] = n > 0 ? abs[b]! / n : 0;
    red[b] = n > 0 ? red[b]! / n : 0;
  }
  return { delta, abs, red };
}

export interface GuardGains {
  /** Blokların geçiş payı `a(b)`. */
  gains: Float64Array;
  /** Hücrelerin payı `g_c = min(α_c, β_c)` (satır satır). */
  cellGains: Float64Array;
}

/**
 * Payların hesabı (kanıtın 1. ve 2. adımı): `slew` ortalama, `patternSlew` desen için bu karede
 * izin verilen değişim (`frameSlew`).
 */
export function guardGains(
  grid: GuardGrid,
  counts: Float64Array,
  stats: BlockStats,
  slew: number,
  patternSlew: number,
  redSlewValue = Infinity,
): GuardGains {
  const { cols, rows, perCell } = grid;
  const bx = cols * perCell;
  const cellGains = new Float64Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const e = [0, 0, 0, 0];
      let total = 0;
      let worst = 0;
      let worstRed = 0;
      for (let j = 0; j < perCell; j++) {
        for (let i = 0; i < perCell; i++) {
          const b = (cy * perCell + j) * bx + cx * perCell + i;
          const n = counts[b] ?? 0;
          const dy = stats.delta[b] ?? 0;
          const w = cornerWeights(i, j, perCell);
          for (let k = 0; k < 4; k++) e[k]! += n * w[k]! * dy;
          total += n;
          if (n > 0) {
            worst = Math.max(worst, stats.abs[b] ?? 0);
            worstRed = Math.max(worstRed, stats.red[b] ?? 0);
          }
        }
      }
      const l1 = total > 0 ? e.reduce((sum, v) => sum + Math.abs(v), 0) / total : 0;
      const alpha = l1 <= slew ? 1 : slew / l1;
      const beta = worst <= patternSlew ? 1 : patternSlew / worst;
      const gamma = worstRed <= redSlewValue ? 1 : redSlewValue / worstRed;
      cellGains[cy * cols + cx] = Math.min(alpha, beta, gamma);
    }
  }
  const vertices = vertexGains(cellGains, cols, rows);
  const blocks = bx * rows * perCell;
  const gains = new Float64Array(blocks);
  for (let b = 0; b < blocks; b++) {
    gains[b] = blockGain(vertices, cols, perCell, b % bx, Math.floor(b / bx));
  }
  return { gains, cellGains };
}

export interface GuardStep extends GuardGains {
  /** Gösterilen ve saklanan görüntü (doğrusal RGB, piksel başına 3; 16 bite yuvarlanmış). */
  output: Float64Array;
}

/**
 * Frenin bir karesi (kaynak uygulama): `state` önceki gösterilen, `input` yeni kare (doğrusal RGB,
 * piksel başına 3 değer, satır satır). Çıktı `O = P + a·(X − P)`, ekran kartı gibi 16 bite
 * yuvarlanır (`quantize: false` ile yuvarlanmaz).
 */
export function guardStep(
  grid: GuardGrid,
  blocks: Int32Array,
  counts: Float64Array,
  state: Float64Array,
  input: Float64Array,
  slew: number,
  patternSlew: number,
  quantize = true,
  redSlewValue = Infinity,
): GuardStep {
  const stats = blockStats(grid, blocks, counts, state, input);
  const { gains, cellGains } = guardGains(grid, counts, stats, slew, patternSlew, redSlewValue);
  const output = new Float64Array(state.length);
  const pixels = grid.width * grid.height;
  for (let p = 0; p < pixels; p++) {
    const a = gains[blocks[p]!]!;
    for (let ch = 0; ch < 3; ch++) {
      const i = p * 3 + ch;
      const o = state[i]! + a * (input[i]! - state[i]!);
      output[i] = quantize ? quantizeState(o) : o;
    }
  }
  return { gains, cellGains, output };
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

/**
 * Bloklarda piksel başına ortalama değişim sayısı (`countChanges`'in sayıları, piksel başına) ve
 * en kötü bloğunki: desenin tersine dönme ölçüsü (kanıtın 7. adımı).
 */
export function worstBlockChanges(
  blocks: Int32Array,
  counts: Float64Array,
  changes: ArrayLike<number>,
): number {
  const sums = new Float64Array(counts.length);
  for (let p = 0; p < blocks.length; p++) sums[blocks[p]!]! += changes[p] ?? 0;
  let worst = 0;
  sums.forEach((s, b) => {
    const n = counts[b] ?? 0;
    if (n > 0) worst = Math.max(worst, s / n);
  });
  return worst;
}
