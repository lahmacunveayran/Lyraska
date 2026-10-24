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

  it("tekrarlanan yol düz sıradaki gibi kalır; kapatınca liste, sayı ve yer aynen döner", () => {
    const withDupes = ["a", "b", "a", "c", "b"];
    const queue = shuffledQueueFrom(withDupes, "a", seededRandom(5));
    expect(queue.paths).toHaveLength(withDupes.length);
    expect([...queue.paths].sort()).toEqual([...withDupes].sort());
    // İkinci "a"ya kadar ilerle: kapatınca asıl listede ikinci "a"nın yerinden (2) sürer.
    let at = queue;
    while (!(currentPath(at) === "a" && at.index > 0)) at = nextInQueue(at)!;
    const restored = withShuffle(at, false);
    expect(restored.paths).toEqual(withDupes);
    expect(restored.index).toBe(2);
    // Düz sıradan açıp kapatınca da aynı yer.
    const ordered = { paths: withDupes, index: 2 };
    expect(withShuffle(withShuffle(ordered, true, seededRandom(1)), false)).toEqual(ordered);
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

  it("açınca çalınmışlar yerinde kalır, yalnızca sonrakiler karışır; durum aynıysa sıra değişmez", () => {
    const ordered = queueFrom(list, "06.flac");
    const on = withShuffle(ordered, true, seededRandom(2));
    expect(currentPath(on)).toBe("06.flac");
    // Sayaç baştan başlamaz, "Önceki" çalınmış şarkılara gider.
    expect(on.index).toBe(5);
    expect(on.paths.slice(0, 6)).toEqual(list.slice(0, 6));
    expect(currentPath(previousInQueue(on)!)).toBe("05.flac");
    expect([...on.paths.slice(6)].sort()).toEqual(list.slice(6));
    expect(on.paths.slice(6)).not.toEqual(list.slice(6));
    expect(on.original).toEqual(list);
    expect(withShuffle(on, true)).toBe(on);
    expect(withShuffle(ordered, false)).toBe(ordered);
    expect(withShuffle(on, false)).toEqual(ordered);
  });

  it("bildirilmiş sıradaki şarkı açınca da kapatınca da hemen sıradaki kalır", () => {
    // Açınca: 07 çekirdeğe bildirilmişti; o kalır, sonrası karışır.
    const ordered = queueFrom(list, "06.flac");
    const on = withShuffle(ordered, true, seededRandom(2), true);
    expect(currentPath(nextInQueue(on)!)).toBe("07.flac");
    expect(on.paths.slice(0, 7)).toEqual(list.slice(0, 7));
    expect(on.paths.slice(7)).not.toEqual(list.slice(7));
    expect([...on.paths.slice(7)].sort()).toEqual(list.slice(7));

    // Kapatınca: karışık sırada bildirilen şarkı kalır, ardından asıl sıra çalan şarkıdan sürer.
    const shuffledQueue = shuffledQueueFrom(list, "03.flac", seededRandom(9));
    const announced = shuffledQueue.paths[1]!;
    const off = withShuffle(shuffledQueue, false, Math.random, true);
    expect(isShuffled(off)).toBe(false);
    expect(currentPath(off)).toBe("03.flac");
    expect(currentPath(nextInQueue(off)!)).toBe(announced);
    expect(off.paths).toHaveLength(list.length);
    expect([...off.paths].sort()).toEqual(list);
    expect(off.paths.filter((path) => path !== announced)).toEqual(
      list.filter((path) => path !== announced),
    );
    // Sıranın sonunda bildirilecek şarkı yoksa düz dönüş.
    const last = { ...shuffledQueue, index: list.length - 1 };
    expect(withShuffle(last, false, Math.random, true).paths).toEqual(list);
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
