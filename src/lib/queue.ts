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
}

/** 0 ile 1 arası (1 hariç) rastgele sayı üreten kaynak; testlerde tohumlu olanı verilir. */
export type RandomSource = () => number;

export const EMPTY_QUEUE: Queue = { paths: [], index: -1 };

/** Listeden bir şarkı seçilince yeni sıra. */
export function queueFrom(paths: string[], path: string): Queue {
  const index = paths.indexOf(path);
  return index < 0 ? { paths: [path], index: 0 } : { paths, index };
}

/** Tekrarlananları atar (ilk geçtiği yer kalır): karışık sırada aynı şarkı iki kez çalmaz. */
function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}

/** Fisher–Yates karıştırması: her dizilişin olasılığı eşittir. Verilen dizi değişmez. */
export function shuffled(paths: string[], random: RandomSource = Math.random): string[] {
  const result = [...paths];
  for (let i = result.length - 1; i > 0; i--) {
    // Kaynak 1 döndürse bile dizinin dışına taşmasın.
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Karışık sıra: verilen şarkı başta, geri kalanlar karışık. Şarkı verilmezse (`null`) bütün liste
 * karışır, ilk şarkı da rastgele olur. Asıl sıra saklanır: karışık çal kapanınca ona dönülür.
 */
export function shuffledQueueFrom(
  paths: string[],
  start: string | null,
  random: RandomSource = Math.random,
): Queue {
  const list = unique(paths);
  if (start === null) {
    return list.length === 0
      ? EMPTY_QUEUE
      : { paths: shuffled(list, random), index: 0, original: list };
  }
  const original = list.includes(start) ? list : [start];
  const rest = original.filter((path) => path !== start);
  return { paths: [start, ...shuffled(rest, random)], index: 0, original };
}

/** Sıra karışık mı. */
export function isShuffled(queue: Queue): boolean {
  return queue.original !== undefined;
}

/**
 * Karışık çalı açar ya da kapatır; çalan şarkı yerinde kalır. Açınca çalan şarkı başa gelir,
 * geri kalanlar karışır; kapatınca asıl sıraya dönülür ve çalma çalan şarkıdan sürer.
 */
export function withShuffle(queue: Queue, on: boolean, random: RandomSource = Math.random): Queue {
  const path = currentPath(queue);
  if (path === null || on === isShuffled(queue)) return queue;
  if (on) return shuffledQueueFrom(queue.paths, path, random);
  const original = queue.original ?? queue.paths;
  const index = original.indexOf(path);
  return index < 0 ? { paths: [path], index: 0 } : { paths: original, index };
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
