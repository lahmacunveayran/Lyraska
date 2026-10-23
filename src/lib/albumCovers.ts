import { getTrackCover } from "./backend";
import { drawPrintCover, readPrintColors, type CoverInput, type PrintColors } from "./printCover";

/**
 * Albüm ızgarasının kapakları: şarkıdaki gerçek kapak varsa o (küçültülmüş), yoksa baskı kapağı
 * (`printCover.ts`). Kapaklar sırayla hazırlanır (kaydırırken arayüz takılmasın) ve küçük
 * `data:` adresleri olarak akılda tutulur. Ekrandan çıkan kartın bekleyen işi yapılmaz.
 */

/** Izgaradaki kapağın piksel boyu (yüksek DPI'da da keskin). */
export const COVER_SIZE = 320;
/** Akılda tutulan kapak sayısı (her biri ≈ 40–70 KB). */
const CACHE_LIMIT = 400;
/** Aynı anda hazırlanan kapak sayısı (dosya okuma çekirdekte, ayrı iş parçacığında). */
const PARALLEL = 2;
/** Bundan büyük gömülü kapak küçültülmez, baskı kapağı çizilir (çok büyük `data:` adresi). */
const MAX_REAL_COVER_CHARS = 12 * 1024 * 1024;

export interface AlbumCoverRequest extends CoverInput {
  /** Kapak resminin okunacağı şarkı. */
  coverPath: string;
}

/** Kapağın kimliği: albüm, ton ve tempo (analiz bitince baskı kapağı yeniden çizilir). */
export function albumCoverKey(request: AlbumCoverRequest): string {
  return [request.artist ?? "\u0001", request.album, request.key ?? "", request.bpm ?? ""].join(
    "\u0000",
  );
}

const cache = new Map<string, string>();
const queue: (() => void)[] = [];
/** Kapağı bekleyen kartlar (kimlik başına): sıfıra inerse bekleyen iş yapılmaz. */
const wanted = new Map<string, number>();
const pending = new Map<string, Promise<string | null>>();
let running = 0;
let colors: PrintColors | null = null;

/** Hazırsa kapağın adresi (beklemeden); `""` = çizilemedi (2D bağlamı yok). */
export function cachedAlbumCover(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Testler arasında temizler. */
export function clearAlbumCovers() {
  cache.clear();
  queue.length = 0;
  wanted.clear();
  pending.clear();
  running = 0;
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

function next() {
  while (running < PARALLEL && queue.length > 0) queue.shift()?.();
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

function printed(request: AlbumCoverRequest): string {
  colors ??= readPrintColors();
  const c = canvas();
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-figures").trim();
  // Çizilemeyen tuvalde (2D bağlamı yok) boş kalır; kart düz zeminle görünür.
  if (!drawPrintCover(c, request, colors, { mono: mono || "monospace" })) return "";
  return c.toDataURL("image/jpeg", 0.88);
}

async function prepare(request: AlbumCoverRequest): Promise<string> {
  const real = await getTrackCover(request.coverPath).catch(() => null);
  if (real && real.length <= MAX_REAL_COVER_CHARS) {
    const small = await shrink(real);
    if (small) return small;
  }
  // Bir kare boyunca nefes: üst üste çizimler arayüzü kilitlemesin.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return printed(request);
}

/**
 * Albümün kapağını ister; hazır olunca `onReady` çağrılır (önbellekteyse hemen). Dönen işlev
 * isteği bırakır: kartı ekrandan çıkan istek, sırası gelince yapılmaz.
 */
export function requestAlbumCover(
  request: AlbumCoverRequest,
  onReady: (url: string) => void,
): () => void {
  const key = albumCoverKey(request);
  const ready = cache.get(key);
  if (ready !== undefined) {
    onReady(ready);
    return () => undefined;
  }
  wanted.set(key, (wanted.get(key) ?? 0) + 1);
  let active = true;
  let job = pending.get(key);
  if (!job) {
    job = new Promise<string | null>((resolve) => {
      queue.push(() => {
        if (!wanted.get(key)) {
          pending.delete(key);
          resolve(null);
          return;
        }
        running++;
        prepare(request)
          .then(
            (url) => {
              remember(key, url);
              resolve(url);
            },
            () => resolve(null),
          )
          .finally(() => {
            running--;
            pending.delete(key);
            next();
          });
      });
    });
    pending.set(key, job);
    next();
  }
  void job.then((url) => {
    if (active && url !== null) onReady(url);
  });
  return () => {
    if (!active) return;
    active = false;
    const left = (wanted.get(key) ?? 1) - 1;
    if (left > 0) wanted.set(key, left);
    else wanted.delete(key);
  };
}
