import type { LyricLine, Lyrics } from "./backend";

/** Satır başlamadan bu kadar önce belirmeye başlar (saniye). */
export const LYRIC_LEAD = 0.25;
/** Satır bittikten sonra bu sürede söner (saniye). */
export const LYRIC_TAIL = 0.4;
/** Sözsüz arada sıradaki satır, başlamasına bu kadar kala gösterilir (saniye). */
export const NEXT_PREVIEW = 2.5;

export type WordState = "sung" | "current" | "upcoming";

export interface WordFrame {
  text: string;
  state: WordState;
  /** Söylenen kelimede 0..1 ilerleme. */
  progress: number;
}

/** Bir an için sözlerin görünümü. */
export interface LyricFrame {
  /** Söylenen (ya da birazdan söylenecek) satır. */
  line: LyricLine | null;
  /** Sıradaki satır (küçük, soluk gösterilir). */
  next: LyricLine | null;
  /** Satırın görünürlüğü 0..1: başında ve sonunda yumuşak geçiş (ani parlama yok). */
  opacity: number;
  words: WordFrame[];
}

const EMPTY: LyricFrame = { line: null, next: null, opacity: 0, words: [] };

/** `t` anında ya da öncesinde başlayan son satırın sırası (yoksa −1). */
function lastStartedBefore(lines: LyricLine[], t: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid]!.start <= t) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/**
 * `t` (saniye) anında gösterilecek sözler. Söylenen satır, sıradaki başlayana kadar ekranda kalır
 * (araya boşluk girmez); sıradaki satır hemen başlamıyorsa önceki satır bittikten sonra
 * [`LYRIC_TAIL`] içinde söner. Bir satır başlamadan [`LYRIC_LEAD`] önce belirmeye başlar (önceki
 * satır bitmişse); sözsüz arada sıradaki satır başlamadan kısa süre önce soluk görünür.
 */
export function lyricFrame(lyrics: Lyrics | null, t: number): LyricFrame {
  if (!lyrics?.synced || lyrics.lines.length === 0 || !Number.isFinite(t)) return EMPTY;
  const lines = lyrics.lines;
  const index = lastStartedBefore(lines, t);
  const current = index >= 0 ? lines[index]! : null;
  const upcoming = lines[index + 1] ?? null;
  // Söylenen satırın görünürlüğü: sıradaki hemen başlıyorsa sönmez.
  const continues =
    current !== null && upcoming !== null && upcoming.start - current.end < LYRIC_TAIL;
  const currentOpacity = !current
    ? 0
    : continues
      ? 1
      : Math.min(1, Math.max(0, 1 - (t - current.end) / LYRIC_TAIL));
  // Sıradaki satırın erken belirmesi: yalnızca söylenen satır bitmişse.
  const upcomingOpacity =
    upcoming && (!current || t >= current.end) && !continues
      ? Math.min(1, Math.max(0, (t - (upcoming.start - LYRIC_LEAD)) / LYRIC_LEAD))
      : 0;
  const [line, opacity] =
    upcomingOpacity > currentOpacity ? [upcoming, upcomingOpacity] : [current, currentOpacity];
  if (!line || opacity <= 0) {
    // Sözsüz ara: sıradaki satır yaklaşınca yalnızca o (soluk) görünür.
    const soon = upcoming && upcoming.start - t <= NEXT_PREVIEW ? upcoming : null;
    return { ...EMPTY, next: soon };
  }
  const next = line === upcoming ? (lines[index + 2] ?? null) : upcoming;
  const words: WordFrame[] = line.words.map((w) => {
    if (t >= w.end) return { text: w.text, state: "sung", progress: 1 };
    if (t < w.start) return { text: w.text, state: "upcoming", progress: 0 };
    const span = w.end - w.start;
    return {
      text: w.text,
      state: "current",
      progress: span > 0 ? Math.min(1, (t - w.start) / span) : 1,
    };
  });
  return { line, next, opacity, words };
}

const VISIBLE_STORAGE_KEY = "lyraska.lyrics.visible";

/** Sözler gösterilsin mi (varsayılan evet)? Tercih bu bilgisayarda hatırlanır. */
export function loadLyricsVisible(): boolean {
  try {
    return window.localStorage.getItem(VISIBLE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveLyricsVisible(visible: boolean): void {
  try {
    window.localStorage.setItem(VISIBLE_STORAGE_KEY, visible ? "1" : "0");
  } catch {
    /* Kaydedilemezse bir sonraki açılışta gösterilir. */
  }
}
