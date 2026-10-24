import type { LibraryTrack } from "./backend";
import { hash, rng } from "./printCover";
import { parseCamelot } from "./librarySort";

/**
 * Gökyüzü: kütüphanenin her şarkısı bir yıldız. Açı tondan (Camelot çarkı; uyumlu tonlar yan
 * yana), merkezden uzaklık tempodan (yavaş içeride, hızlı dışarıda); renk tonun rengi (`--key-n`,
 * Şarkılar listesindeki noktayla aynı). Yer şarkının yolundan türetilen küçük bir sapmayla
 * belirlenir: aynı şarkı her açılışta aynı yerdedir. Görüntü durağandır (hareket, parlama yok).
 */

/** Tempo ekseninin sınırları (BPM): bunun dışındakiler kenara yapışır. */
export const BPM_MIN = 60;
export const BPM_MAX = 190;
/** İç boşluk ve dış kenar (yarıçapın kesri). */
const INNER = 0.16;
const OUTER = 0.96;

export interface SkyStar {
  x: number;
  y: number;
  /** Camelot sayısı (1–12): renk `--key-n`. */
  hue: number;
  minor: boolean;
  /** Parlaklık 0,35–1 (şimdilik şarkının yolundan; analizde enerji gelince ondan). */
  brightness: number;
  track: LibraryTrack;
}

export interface SkyLayout {
  stars: SkyStar[];
  /** Tonu ya da temposu henüz bilinmeyen (analiz bekleyen ya da ritimsiz) şarkı sayısı. */
  unplaced: number;
}

/** Tempo → yarıçap kesri (0…1 arası; doğrusal). */
export function bpmRadius(bpm: number): number {
  const t = (Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)) - BPM_MIN) / (BPM_MAX - BPM_MIN);
  return INNER + t * (OUTER - INNER);
}

/** Camelot sayısı → açı (radyan; 12 yukarıda değil, 1 yukarıda; saat yönünde). Minör 7° önce, majör 7° sonra. */
export function keyAngle(number: number, minor: boolean): number {
  return (((number - 1) * 30 - 90 + (minor ? -7 : 7)) * Math.PI) / 180;
}

/**
 * Yıldızların yeri: `cx, cy` merkez, `radius` piksel. Sapma şarkının yolundan (belirlenimci):
 * aynı ton ve tempodaki şarkılar üst üste binmez, küme olur.
 */
export function layoutSky(
  tracks: LibraryTrack[],
  cx: number,
  cy: number,
  radius: number,
): SkyLayout {
  const stars: SkyStar[] = [];
  let unplaced = 0;
  for (const track of tracks) {
    const key = track.key ? parseCamelot(track.key) : null;
    if (!key || track.bpm === null || !Number.isFinite(track.bpm)) {
      unplaced++;
      continue;
    }
    const r = rng(hash(track.path));
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    const angle = keyAngle(key.number, key.minor) + gauss() * 0.11;
    const dist = (bpmRadius(track.bpm) + gauss() * 0.012) * radius;
    stars.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      hue: key.number,
      minor: key.minor,
      brightness: 0.35 + 0.65 * r(),
      track,
    });
  }
  return { stars, unplaced };
}

/** Konuma en yakın yıldız (`maxDistance` piksel içinde); yoksa `null`. */
export function nearestStar(
  stars: SkyStar[],
  x: number,
  y: number,
  maxDistance: number,
): SkyStar | null {
  let best: SkyStar | null = null;
  let bestD = maxDistance * maxDistance;
  for (const star of stars) {
    const d = (star.x - x) ** 2 + (star.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = star;
    }
  }
  return best;
}

/**
 * Klavyeyle dolaşma sırası: çarkta tondan tona saat yönünde (1A, 1B, 2A, …), her tonda yavaştan
 * hızlıya (merkezden uzaklık).
 */
export function orderStars(stars: SkyStar[], cx: number, cy: number): SkyStar[] {
  const rank = (s: SkyStar) => (s.hue - 1) * 2 + (s.minor ? 0 : 1);
  const dist = (s: SkyStar) => (s.x - cx) ** 2 + (s.y - cy) ** 2;
  return [...stars].sort((a, b) => rank(a) - rank(b) || dist(a) - dist(b));
}

/** Tempo halkalarının etiketleri (BPM). */
export const BPM_RINGS = [80, 100, 120, 140, 160, 180];
