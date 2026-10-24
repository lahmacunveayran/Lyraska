import { describe, expect, it } from "vitest";
import {
  EMPTY_QUEUE,
  currentPath,
  followQueue,
  isShuffled,
  nextInQueue,
  previousInQueue,
  queueFrom,
  seededRandom,
  shuffled,
  shuffledQueueFrom,
  upcomingPath,
  withShuffle,
  type Queue,
} from "./queue";

const list = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}.flac`);

/** Sırayı baştan sona yürür: "sonraki"lerle görülen şarkılar. */
function walk(queue: Queue): string[] {
  const seen = [currentPath(queue)!];
  for (let q = nextInQueue(queue); q; q = nextInQueue(q)) seen.push(currentPath(q)!);
  return seen;
}

describe("karışık çalma", () => {
  it("seçilen şarkıdan başlar, her şarkı tam bir kez bulunur", () => {
    const queue = shuffledQueueFrom(list, "05.flac", seededRandom(1));
    expect(currentPath(queue)).toBe("05.flac");
    expect(queue.paths).toHaveLength(list.length);
    expect([...queue.paths].sort()).toEqual(list);
    expect(queue.paths).not.toEqual(list);
    expect(isShuffled(queue)).toBe(true);
  });

  it("aynı tohumla aynı sıra, başka tohumla başka sıra", () => {
    const a = shuffledQueueFrom(list, "01.flac", seededRandom(42));
    const b = shuffledQueueFrom(list, "01.flac", seededRandom(42));
    const c = shuffledQueueFrom(list, "01.flac", seededRandom(7));
    expect(a.paths).toEqual(b.paths);
    expect(a.paths).not.toEqual(c.paths);
  });

  it("şarkı verilmezse ilk şarkı da rastgeledir; asıl sıra saklanır", () => {
    const queue = shuffledQueueFrom(list, null, seededRandom(3));
    expect(queue.index).toBe(0);
    expect([...queue.paths].sort()).toEqual(list);
    expect(queue.original).toEqual(list);
  });

  it("tekrarlanan yol bir kez çalar: art arda aynı şarkı yok", () => {
    const queue = shuffledQueueFrom(["a", "b", "a", "c", "b"], "a", seededRandom(5));
    expect([...queue.paths].sort()).toEqual(["a", "b", "c"]);
    for (let i = 1; i < queue.paths.length; i++) {
      expect(queue.paths[i]).not.toBe(queue.paths[i - 1]);
    }
  });

  it("sonraki ve önceki karışık sırayı izler", () => {
    const queue = shuffledQueueFrom(list, "03.flac", seededRandom(9));
    const order = walk(queue);
    expect(order).toEqual(queue.paths);
    const second = nextInQueue(queue)!;
    expect(currentPath(second)).toBe(queue.paths[1]);
    expect(currentPath(previousInQueue(second)!)).toBe("03.flac");
    expect(previousInQueue(queue)).toBeNull();
    // Boşluksuz geçiş de karışık sıradakini bildirir.
    expect(upcomingPath(queue, "03.flac")).toBe(queue.paths[1]);
    expect(isShuffled(followQueue(queue, queue.paths[1]!))).toBe(true);
  });

  it("kapatınca asıl sıraya döner ve çalan şarkıdan sürer", () => {
    let queue = shuffledQueueFrom(list, "04.flac", seededRandom(11));
    queue = nextInQueue(nextInQueue(queue)!)!;
    const playing = currentPath(queue)!;
    const ordered = withShuffle(queue, false);
    expect(isShuffled(ordered)).toBe(false);
    expect(ordered.paths).toEqual(list);
    expect(currentPath(ordered)).toBe(playing);
    expect(currentPath(nextInQueue(ordered)!)).toBe(list[list.indexOf(playing) + 1]);
  });

  it("açınca çalan şarkı başa gelir, geri kalanlar karışır; durum aynıysa sıra değişmez", () => {
    const ordered = queueFrom(list, "06.flac");
    const on = withShuffle(ordered, true, seededRandom(2));
    expect(currentPath(on)).toBe("06.flac");
    expect(on.index).toBe(0);
    expect(on.original).toEqual(list);
    expect(withShuffle(on, true)).toBe(on);
    expect(withShuffle(ordered, false)).toBe(ordered);
    expect(withShuffle(on, false).paths).toEqual(list);
  });

  it("tek şarkı ve boş liste", () => {
    const single = shuffledQueueFrom(["tek.flac"], "tek.flac", seededRandom(1));
    expect(single.paths).toEqual(["tek.flac"]);
    expect(nextInQueue(single)).toBeNull();
    expect(shuffledQueueFrom([], null)).toEqual(EMPTY_QUEUE);
    // Listede olmayan şarkı tek başına sıra olur (düz sıradaki gibi).
    expect(shuffledQueueFrom([], "x.flac").paths).toEqual(["x.flac"]);
    expect(withShuffle(EMPTY_QUEUE, true)).toBe(EMPTY_QUEUE);
    expect(shuffled([])).toEqual([]);
  });

  it("karıştırma verilen diziyi değiştirmez ve kaynak 1'e yaklaşsa da taşmaz", () => {
    const copy = [...list];
    const result = shuffled(list, () => 0.999999999);
    expect(list).toEqual(copy);
    expect([...result].sort()).toEqual(list);
  });

  it("tohumlu kaynak 0 ile 1 arasında kalır", () => {
    const random = seededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
