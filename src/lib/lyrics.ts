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

/** Sahnede gösterilecek (zamanlı, satırı olan) sözler mi? Yer ayırmak için: satırdan bağımsız. */
export function hasTimedLyrics(lyrics: Lyrics | null): boolean {
  return !!lyrics?.synced && lyrics.lines.length > 0;
}

/** "Kendi resmin" başlık bloğundaki söz satırının bir kelimesi. */
export interface PhotoLyricWord {
  text: string;
  state: WordState;
  /** Söylenen kelime çubuk renginden ışıldar mı (Epilepsi güvenli modunda hiç). */
  glow: boolean;
}

/**
 * "Kendi resmin" başlık bloğundaki satırın kelimeleri. Kelime zamanı olmayan satır tek parça
 * (okunur, ışıltısız) gösterilir. Güvenli modda ışıltı yoktur: kelimeler yalnızca saydamlıkla ayrılır.
 */
export function photoLyricWords(frame: LyricFrame, safe: boolean): PhotoLyricWord[] {
  if (!frame.line) return [];
  if (frame.words.length === 0) return [{ text: frame.line.text, state: "sung", glow: false }];
  return frame.words.map((w) => ({
    text: w.text,
    state: w.state,
    glow: !safe && w.state === "current",
  }));
}

/** Uzun satır en çok bu orana küçülür (daha küçüğü okunmaz); yine sığmazsa kayar. */
export const LYRIC_MIN_SCALE = 0.72;

/**
 * Tek satırlık sözün yerleşimi: `natural` yazının tam boydaki genişliği, `available` ayrılan
 * genişlik (piksel). Sığmayan satır önce küçülür (en çok [`LYRIC_MIN_SCALE`]); o da yetmezse
 * `overflow` kadar taşar ve söylendikçe kayar ([`lyricPan`]). Satır kesilmez, sonu kaybolmaz.
 */
export function lyricFit(
  natural: number,
  available: number,
  minScale = LYRIC_MIN_SCALE,
): { scale: number; overflow: number } {
  if (!(natural > 0) || !(available > 0)) return { scale: 1, overflow: 0 };
  const scale = Math.min(1, Math.max(minScale, available / natural));
  return { scale, overflow: Math.max(0, natural * scale - available) };
}

/**
 * Taşan satırın sola kayması (piksel, 0..`overflow`): söylenen kelimenin ortası her zaman görünür.
 * Kayma harf sayısıyla orantılı ve kelime kelime ilerler (kelimenin içinde kıpırdamaz); satırın
 * başında baş, sonunda son görünür.
 */
export function lyricPan(words: readonly { text: string; state: WordState }[], overflow: number) {
  if (!(overflow > 0) || words.length === 0) return 0;
  let total = 0;
  let before = 0;
  let found = false;
  for (const w of words) {
    const length = w.text.length;
    if (!found) {
      if (w.state === "sung") before += length;
      else if (w.state === "current") {
        before += length / 2;
        found = true;
      } else found = true;
    }
    total += length;
  }
  if (total === 0) return 0;
  return Math.round(overflow * Math.min(1, Math.max(0, before / total)));
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
