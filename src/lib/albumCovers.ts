import { getTrackCover } from "./backend";
import { drawPrintCover, readPrintColors, type CoverInput, type PrintColors } from "./printCover";

/**
 * Albüm ızgarasının kapakları: şarkıdaki gerçek kapak varsa o (küçültülmüş), yoksa baskı kapağı
 * (`printCover.ts`). Kapaklar sırayla ve azar azar hazırlanır (kaydırırken arayüz takılmasın),
 * küçük `data:` adresleri olarak akılda tutulur.
 */

/** Izgaradaki kapağın piksel boyu (yüksek DPI'da da keskin). */
export const COVER_SIZE = 320;
/** Akılda tutulan kapak sayısı (her biri ≈ 20–40 KB). */
const CACHE_LIMIT = 600;
/** Aynı anda okunan gerçek kapak sayısı (dosya okuma çekirdekte, ayrı iş parçacığında). */
const PARALLEL = 3;

export interface AlbumCoverRequest extends CoverInput {
  /** Kapak resminin okunacağı şarkı. */
  coverPath: string;
}

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let running = 0;
const queue: (() => void)[] = [];
let colors: PrintColors | null = null;

export function albumCoverKey(album: string, artist: string | null): string {
  return `${artist ?? ""}\u0000${album}`;
}

/** Hazırsa kapağın adresi (beklemeden). */
export function cachedAlbumCover(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Testler arasında temizler. */
export function clearAlbumCovers() {
  cache.clear();
  pending.clear();
  colors = null;
}

function remember(key: string, url: string) {
  cache.delete(key);
  cache.set(key, url);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function slot<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++;
      work()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < PARALLEL) start();
    else queue.push(start);
  });
}

function canvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = COVER_SIZE;
  c.height = COVER_SIZE;
  return c;
}

/** Gerçek kapağı kare kırpıp küçültür; çözülemezse `null`. */
function shrink(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const c = canvas();
      const ctx = c.getContext("2d");
      if (!ctx || !image.naturalWidth) return resolve(null);
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      ctx.drawImage(image, sx, sy, side, side, 0, 0, COVER_SIZE, COVER_SIZE);
      resolve(c.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Bir sonraki boş ana kadar bekler (baskı kapağı çizimi kare kaçırmasın). */
function idle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function printed(request: AlbumCoverRequest): Promise<string> {
  await idle();
  colors ??= readPrintColors();
  const c = canvas();
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-figures").trim();
  // Çizilemeyen tuvalde (2D bağlamı yok) boş kalır; kart düz zeminle görünür.
  if (!drawPrintCover(c, request, colors, { mono: mono || "monospace" })) return "";
  return c.toDataURL("image/jpeg", 0.88);
}

/** Albümün kapağı: önce şarkıdaki resim, yoksa baskı kapağı. */
export function albumCover(request: AlbumCoverRequest): Promise<string> {
  const key = albumCoverKey(request.album, request.artist);
  const ready = cache.get(key);
  if (ready) return Promise.resolve(ready);
  const waiting = pending.get(key);
  if (waiting) return waiting;
  const work = slot(async () => {
    const real = await getTrackCover(request.coverPath).catch(() => null);
    const url = (real && (await shrink(real))) || (await printed(request));
    remember(key, url);
    return url;
  }).finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
