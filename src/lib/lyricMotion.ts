import type { LyricLine } from "./backend";
import { LYRIC_LEAD, LYRIC_TAIL } from "./lyrics";

/*
 * Sözlerin hareketi: Lyraska'nın adı lirden (Orpheus'un lirinin gökyüzüne konduğu Lyra takımyıldızı).
 * Söylenen satırın altında bir lir teli gerilidir; her kelimenin başı teli kelimenin altından çeker ve
 * tel gerçek bir tel gibi titreşip söner (yüksek tınılar önce). Kelimeler söylendikçe satırın üstünde
 * yıldız olarak tutuşur ve takımyıldız çizgileriyle birbirine bağlanır; satır değişirken Vega'nın
 * yönünden bir Lyrid meteoru geçer. Satırlar yayla yerine oturur.
 *
 * Hepsi yalnızca söz zamanının (`t`, saniye) saf işlevidir: kare hızından bağımsız, sarınca da sürekli,
 * durum tutmaz ve test edilir. Epilepsi güvenli modunda ve "animasyonları azalt"ta hiçbiri çizilmez.
 */

// ---------- Görünüm seçimi ----------

/**
 * Sözlerin görünümü (Epilepsi güvenli modunda hep sade, eskisi gibi):
 * - `constellation`: lir teli + kelimeler yıldız olup takımyıldız çizgileriyle bağlanır + meteor.
 * - `lyre`: lir teli + meteor.
 * - `plain`: yalnızca ışıkla dolan kelimeler ve yayla oturan satır.
 */
export type LyricEffect = "constellation" | "lyre" | "plain";

export const LYRIC_EFFECTS: readonly { id: LyricEffect; name: string; hint: string }[] = [
  {
    id: "constellation",
    name: "Takımyıldız",
    hint: "Söylenen kelime yıldız olur, yıldızlar çizgiyle bağlanır; altta lir teli titrer.",
  },
  { id: "lyre", name: "Lir", hint: "Kelimeler satırın altındaki lir telini çeker; yıldız yok." },
  { id: "plain", name: "Sade", hint: "Yalnızca kelimelerin içinden geçen ışık ve yumuşak geçiş." },
];
const EFFECT_KEY = "lyraska.lyricEffect";

export function loadLyricEffect(): LyricEffect {
  try {
    const saved = window.localStorage.getItem(EFFECT_KEY);
    return LYRIC_EFFECTS.find((e) => e.id === saved)?.id ?? "constellation";
  } catch {
    return "constellation";
  }
}

export function saveLyricEffect(effect: LyricEffect): void {
  try {
    window.localStorage.setItem(EFFECT_KEY, effect);
  } catch {
    // Saklanamazsa yalnızca bu oturumda geçerli.
  }
}

// ---------- Yay: satırın yerine oturması ----------

/** Yayın doğal açısal frekansı (rad/sn): ~0,4 sn'de oturur. */
export const SPRING_OMEGA = 2 * Math.PI * 1.6;
/** Sönüm oranı: 1'in biraz altı, hedefi bir kez hafifçe geçip oturur. */
export const SPRING_ZETA = 0.86;

/**
 * Kritik altı sönümlü yay x'' = −ω²(x − x*) − 2ζω x' için hedefe kalan uzaklık; başlangıçta `e0`,
 * hızı 0. Kapalı biçim (adım adım tümleme yok):
 * e(τ) = e0 · e^(−ζωτ) · [cos ω_d τ + (ζω/ω_d) sin ω_d τ], ω_d = ω√(1 − ζ²).
 */
export function springOffset(
  tau: number,
  e0: number,
  omega = SPRING_OMEGA,
  zeta = SPRING_ZETA,
): number {
  if (tau <= 0) return e0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return (
    e0 *
    Math.exp(-zeta * omega * tau) *
    (Math.cos(wd * tau) + ((zeta * omega) / wd) * Math.sin(wd * tau))
  );
}

/**
 * Satırın ekranda belirdiği an (`lyricFrame` ile aynı kural): önceki satır hemen bitiyorsa (arası
 * `LYRIC_TAIL`'den kısa) satır başladığı anda yerine geçer, yoksa `LYRIC_LEAD` önce belirmeye başlar.
 */
export function lineShownAt(lines: readonly LyricLine[], index: number): number {
  const line = lines[index]!;
  const previous = lines[index - 1];
  return previous && line.start - previous.end < LYRIC_TAIL ? line.start : line.start - LYRIC_LEAD;
}

/** Satırın girişi: aşağıdan bu kadar (em) yükselerek oturur. */
export const ENTER_RISE = 0.55;
/** Biten satırın hayaleti bu sürede yukarı kayıp söner (saniye). */
export const GHOST_SECS = 0.28;

export interface LineMotion {
  /** Satırın aşağı kayması (em; 0 = yerinde) ve ölçeği. */
  y: number;
  scale: number;
  /** Hemen ardından gelen satıra yer veren önceki satır: yukarı kayıp söner. */
  ghost: { line: LyricLine; y: number; opacity: number } | null;
  /** Satırın belirdiği an (saniye). */
  shownAt: number;
}

/** Gösterilen satırın `t` anındaki hareketi. */
export function lineMotion(lines: readonly LyricLine[], line: LyricLine, t: number): LineMotion {
  const index = lines.indexOf(line);
  const shownAt = index >= 0 ? lineShownAt(lines, index) : line.start;
  const tau = t - shownAt;
  const y = springOffset(tau, ENTER_RISE);
  const scale = 1 - 0.04 * (y / ENTER_RISE);
  const previous = index > 0 ? lines[index - 1]! : null;
  let ghost: LineMotion["ghost"] = null;
  if (previous && shownAt === line.start && tau >= 0 && tau < GHOST_SECS) {
    const fade = 1 - tau / GHOST_SECS;
    ghost = { line: previous, y: -1.1 * (1 - Math.exp(-tau / 0.07)), opacity: 0.75 * fade * fade };
  }
  return { y, scale, ghost, shownAt };
}

// ---------- Uzun hece: harfler sırayla yükselir ----------

/** Kelime en az bu kadar sürerse (saniye) uzun hece sayılır; tam etki bundan 1,2 sn sonra. */
export const HELD_MIN = 0.8;

/** Uzun hecenin etkisi 0..1: s = clamp((D − 0,8) / 1,2). */
export function heldStrength(duration: number): number {
  return Math.min(1, Math.max(0, (duration - HELD_MIN) / 1.2));
}

/** Harf başına yükselme (em): her harf kelime süresinin %40'ında bir kez yükselip iner. */
export const HELD_LIFT = 0.08;

/**
 * Uzun hecede `i`. harfin (N harften) yükselmesi (em, yukarı negatif) ve kendi silme ilerlemesi.
 * u = kelimenin ilerlemesi (0..1); harfin dalgası φ_i = (u − 0,6·i/N) / 0,4, yükselme −A·s·sin²(πφ_i).
 * Silme harf harf: q_i = clamp(u·N − i).
 */
export function heldGlyph(
  i: number,
  n: number,
  u: number,
  strength: number,
): { lift: number; progress: number } {
  const phase = (u - (0.6 * i) / n) / 0.4;
  const bump = phase > 0 && phase < 1 ? Math.sin(Math.PI * phase) ** 2 : 0;
  return {
    lift: strength * bump > 0 ? -HELD_LIFT * strength * bump : 0,
    progress: Math.min(1, Math.max(0, u * n - i)),
  };
}

/** Kelimenin harfleri (Türkçe ve birleşik harfler bölünmeden; boşluk dahil). */
export function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("tr", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

// ---------- Lir teli ----------

/** Telin titreşim kipleri (yüksek tınılar dahil). */
export const STRING_MODES = 8;
/** Telin temel frekansı (Hz): gerçek perde gözle görülmez; yavaşlatılmış. */
export const STRING_F1 = 2.4;
/** Frekansa bağlı kayıp σ_n = b1 + b3·n² (1/sn): yüksek kipler önce söner, kıvrım yumuşar. */
export const STRING_B1 = 0.7;
export const STRING_B3 = 0.32;
/** Çekişin yumuşak başlangıcı (saniye): telin ani sıçramaması için. */
export const PLUCK_RAMP = 0.035;

export interface Pluck {
  /** Çekilen yer (telin 0..1 arası). */
  at: number;
  /** Çekiş anı (saniye). */
  time: number;
  /** Çekiş yüksekliği (piksel). */
  height: number;
}

/**
 * Çekilen telin biçimi: dalga denkleminin kip çözümü (uçları sabit, boyu 1).
 * y(x,τ) = r(τ) · Σ_n A_n sin(nπx) cos(2π n f1 τ) e^(−σ_n τ),
 * A_n = 2h / (n²π² a(1 − a)) · sin(nπa)  (a'dan h yüksekliğe çekilmiş üçgenin Fourier katsayıları),
 * r(τ) = 1 − e^(−τ/0,035). Birden çok çekiş doğrusal olarak toplanır. `xs`: 0..1 noktalar.
 */
export function stringShape(plucks: readonly Pluck[], t: number, xs: readonly number[]): number[] {
  const ys = new Array<number>(xs.length).fill(0);
  for (const pluck of plucks) {
    const tau = t - pluck.time;
    if (tau < 0) continue;
    const ramp = 1 - Math.exp(-tau / PLUCK_RAMP);
    const a = Math.min(0.97, Math.max(0.03, pluck.at));
    for (let n = 1; n <= STRING_MODES; n++) {
      const sigma = STRING_B1 + STRING_B3 * n * n;
      const amp =
        ((2 * pluck.height) / (n * n * Math.PI * Math.PI * a * (1 - a))) *
        Math.sin(n * Math.PI * a) *
        Math.cos(2 * Math.PI * n * STRING_F1 * tau) *
        Math.exp(-sigma * tau) *
        ramp;
      if (Math.abs(amp) < 1e-4) continue;
      for (let k = 0; k < xs.length; k++) ys[k]! += amp * Math.sin(n * Math.PI * xs[k]!);
    }
  }
  return ys;
}

// ---------- Lyrid meteoru ----------

/** İki meteor arasında en az bu kadar (saniye): göz yorulmasın. */
export const METEOR_GAP = 4;
/** Meteorun görünme süresi (saniye). */
export const METEOR_SECS = 0.75;

/** Satır değişirken meteor geçecek satırlar (sıraları): öncekinden en az `METEOR_GAP` sonra. */
export function meteorLines(lines: readonly LyricLine[]): Set<number> {
  const chosen = new Set<number>();
  let last = -Infinity;
  lines.forEach((_, i) => {
    const at = lineShownAt(lines, i);
    if (at - last >= METEOR_GAP) {
      chosen.add(i);
      last = at;
    }
  });
  return chosen;
}

/**
 * Meteorun `tau` sn sonraki hali: yolun alınan payı (Vega'nın yönünden, 1 − e^(−τ/0,16)) ve
 * parlaklığı (0,85 · hızlı yanma · e^(−τ/0,3); yazıdan sönük); yoksa `null`.
 */
export function meteorState(tau: number): { travel: number; opacity: number } | null {
  if (tau < 0 || tau > METEOR_SECS) return null;
  return {
    travel: 1 - Math.exp(-tau / 0.16),
    opacity: 0.85 * (1 - Math.exp(-tau / 0.025)) * Math.exp(-tau / 0.3),
  };
}

// ---------- Takımyıldız ----------

/** Kelimenin yıldızının satırın üstündeki yüksekliği (em, 0,25..1): kelimeden türetilir, sabit. */
export function starHeight(text: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (const ch of text) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619);
  return 0.25 + (((hash >>> 0) % 1000) / 1000) * 0.75;
}

/** Yıldızın tutuşması: kelime başında hızla parlar, 0,55'e oturur; pırıltı ortalamayı değiştirmez. */
export function starBrightness(tau: number, t: number, seed: number): number {
  if (tau < 0) return 0;
  const ignite = 1 - Math.exp(-tau / 0.06);
  const settle = 0.55 + 0.45 * Math.exp(-tau / 0.35); // oturmuş yıldız 0,55
  // Pırıltı: log-normal I = e^(σg − σ²/2), g birim varyanslı (iki ilgisiz sinüs), σ = 0,15.
  const g = Math.sin(2 * Math.PI * 0.71 * t + seed) + Math.sin(2 * Math.PI * 1.13 * t + 2.3 * seed);
  const sigma = 0.15;
  return ignite * settle * Math.exp(sigma * g - (sigma * sigma) / 2);
}

/** Takımyıldız çizgisi: önceki yıldızdan bu kelimeye min(ara, 0,3 sn)'de ease-out-quart ile çizilir. */
export function linkProgress(tau: number, gap: number): number {
  if (tau <= 0) return 0;
  const span = Math.max(0.08, Math.min(0.3, gap));
  const u = Math.min(1, tau / span);
  return 1 - (1 - u) ** 4;
}
