/**
 * Çalma sırası: kütüphaneden bir şarkı çalınınca, o anki liste sıra olur.
 * Şarkı bitince ya da "sonraki"ye basılınca sıradaki çalar.
 */
export interface Queue {
  paths: string[];
  index: number;
  /**
   * Karışık çalmada listenin asıl sırası (karışık çal kapanınca bu sıraya dönülür). Sıra
   * karışık değilse yoktur.
   */
  original?: string[];
  /**
   * Karışık çalmada her sıra yerinin asıl listedeki yeri (`paths[i] === original[positions[i]]`).
   * Aynı yol listede iki kez geçse de çalan şarkının asıl yeri bulunur.
   */
  positions?: number[];
}

/** 0 ile 1 arası (1 hariç) rastgele sayı üreten kaynak; testlerde tohumlu olanı verilir. */
export type RandomSource = () => number;

export const EMPTY_QUEUE: Queue = { paths: [], index: -1 };

/**
 * Verilen sıra yola uyuyorsa o, uymuyorsa yolun ilk geçtiği yer. Aynı şarkı listede iki kez
 * olabilir (çalma listesi): tıklanan satırın sırası verilir.
 */
function startIndex(paths: string[], path: string, at?: number): number {
  return at !== undefined && paths[at] === path ? at : paths.indexOf(path);
}

/** Listeden bir şarkı seçilince yeni sıra (`at`: seçilen satırın sırası, bkz. `startIndex`). */
export function queueFrom(paths: string[], path: string, at?: number): Queue {
  const index = startIndex(paths, path, at);
  return index < 0 ? { paths: [path], index: 0 } : { paths, index };
}

/** Fisher–Yates karıştırması: her dizilişin olasılığı eşittir. Verilen dizi değişmez. */
export function shuffled<T>(items: T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    // Kaynak 1 döndürse bile dizinin dışına taşmasın.
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** 0, 1, …, n − 1. */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Asıl listeden, verilen yerlerin sırasıyla karışık sıra. */
function arranged(original: string[], positions: number[], index: number): Queue {
  return { paths: positions.map((i) => original[i]!), index, original, positions };
}

/**
 * Karışık sıra: verilen şarkı başta, geri kalanlar karışık. Şarkı verilmezse (`null`) bütün liste
 * karışır, ilk şarkı da rastgele olur. Asıl sıra (tekrarlananlarla birlikte, düz sıradaki gibi)
 * saklanır: karışık çal kapanınca ona dönülür.
 */
export function shuffledQueueFrom(
  paths: string[],
  start: string | null,
  random: RandomSource = Math.random,
  at?: number,
): Queue {
  if (start === null) {
    return paths.length === 0
      ? EMPTY_QUEUE
      : arranged(paths, shuffled(range(paths.length), random), 0);
  }
  const first = startIndex(paths, start, at);
  if (first < 0) return arranged([start], [0], 0);
  const rest = range(paths.length).filter((i) => i !== first);
  return arranged(paths, [first, ...shuffled(rest, random)], 0);
}

/** Sıra karışık mı. */
export function isShuffled(queue: Queue): boolean {
  return queue.original !== undefined;
}

/**
 * Karışık çalı açar ya da kapatır; çalan şarkı yerinde kalır.
 *
 * - Açınca: çalınmış şarkılar ve çalan şarkı yerinde kalır ("Önceki" onlara gider, sayaç baştan
 *   başlamaz); yalnızca sonrakiler karışır.
 * - Kapatınca: asıl sıraya dönülür, çalma çalan şarkıdan sürer.
 * - `keepNext`: sıradaki şarkı çekirdeğe önceden bildirildiyse (boşluksuz geçiş için çekirdek onu
 *   şarkı bitmeden ~2 sn önce açmış olabilir) o şarkı hemen sıradaki olarak kalır; karıştırma ya
 *   da asıl sıraya dönüş ondan sonrasına uygulanır. Yoksa çekirdeğin çaldığı şarkı sırada
 *   tanınmaz ve çalma o şarkının sonunda durur.
 */
export function withShuffle(
  queue: Queue,
  on: boolean,
  random: RandomSource = Math.random,
  keepNext = false,
): Queue {
  if (currentPath(queue) === null || on === isShuffled(queue)) return queue;
  const { index } = queue;
  const hasNext = keepNext && index + 1 < queue.paths.length;
  if (on) {
    const kept = index + 1 + (hasNext ? 1 : 0);
    const all = range(queue.paths.length);
    return arranged(
      queue.paths,
      [...all.slice(0, kept), ...shuffled(all.slice(kept), random)],
      index,
    );
  }
  const original = queue.original ?? queue.paths;
  const positions = queue.positions ?? range(queue.paths.length);
  const current = positions[index] ?? 0;
  if (!hasNext) return { paths: original, index: current };
  // Bildirilen şarkı asıl sırada başka yerdeyse çalan şarkının hemen arkasına alınır.
  const announced = positions[index + 1]!;
  const order = range(original.length).filter((i) => i !== announced);
  order.splice(order.indexOf(current) + 1, 0, announced);
  return { paths: order.map((i) => original[i]!), index: order.indexOf(current) };
}

/**
 * Tohumlu rastgele sayı kaynağı (mulberry32): aynı tohum aynı diziyi verir. Testlerde karışık
 * sıranın her seferinde aynı olması için.
 */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sonraki şarkı; sıra bittiyse `null`. */
export function nextInQueue(queue: Queue): Queue | null {
  return queue.index + 1 < queue.paths.length ? { ...queue, index: queue.index + 1 } : null;
}

/** Önceki şarkı; başta ise `null`. */
export function previousInQueue(queue: Queue): Queue | null {
  return queue.index > 0 ? { ...queue, index: queue.index - 1 } : null;
}

export function currentPath(queue: Queue): string | null {
  return queue.paths[queue.index] ?? null;
}

/**
 * Boşluksuz geçiş: çekirdek sıradaki şarkıya kendiliğinden geçer. Çalan şarkı
 * sıradakiyse sıra bir ilerlemiş sayılır; değilse sıra aynen döner.
 */
export function followQueue(queue: Queue, playingPath: string | null): Queue {
  const next = nextInQueue(queue);
  return next && playingPath !== null && currentPath(next) === playingPath ? next : queue;
}

/** Çekirdeğe önceden bildirilecek sıradaki şarkı (sıra etkin değilse `null`). */
export function upcomingPath(queue: Queue, playingPath: string | null): string | null {
  if (playingPath === null || currentPath(queue) !== playingPath) return null;
  const next = nextInQueue(queue);
  return next ? currentPath(next) : null;
}

/** "Önceki" düğmesi: şarkının ilk 3 saniyesinden sonra basılırsa şarkı başa sarılır. */
export const RESTART_THRESHOLD_SECONDS = 3;
