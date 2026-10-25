/**
 * "Kendi resmin" sahnesinin hareketli arka planı (GIF, APNG, hareketli WebP): resmin hareketli
 * olup olmadığı (dosyanın baytlarından), karelerin WebView'da çözülmesi (WebCodecs
 * `ImageDecoder`) ve kare zamanlaması. Hareketli resim ekrana hiçbir zaman `<img>` ile gitmez
 * (tarayıcı onu denetimsiz oynatırdı): kareler tuvalde parlaklık freninden geçerek çizilir
 * (`PhotoScene`). `ImageDecoder` yoksa, çözülemezse ya da "animasyonları azalt" açıksa ilk kare
 * sabit resim olarak gösterilir.
 *
 * Sınırlar çekirdekle aynı (`src-tauri/src/library/covers.rs`): en çok `MAX_FRAMES` kare ve
 * toplam `MAX_PIXELS` piksel (kare boyu × kare sayısı); çekirdek daha büyüğünü seçerken reddeder.
 */

/** En çok kare sayısı. */
export const MAX_FRAMES = 600;
/** Karelerin toplam piksel sayısının sınırı (kare boyu × kare sayısı). */
export const MAX_PIXELS = 50_000_000;

/** Tarayıcıların kuralı: 10 ms ve altındaki GIF gecikmesi 100 ms oynatılır. */
export function frameDelay(ms: number): number {
  return Number.isFinite(ms) && ms > 10 ? ms : 100;
}

/** Çözülmüş hareketli resim. */
export interface Animation {
  frames: ImageBitmap[];
  /** Karelerin süresi (ms, `frameDelay` uygulanmış). */
  durations: number[];
  /** Kaç kez tekrar (0: bir kez oynar; `Infinity`: sonsuz). */
  repetitions: number;
  width: number;
  height: number;
}

/** `elapsed` ms sonra gösterilen kare (tekrarlar bitince son karede kalır). */
export function frameAt(
  elapsed: number,
  durations: readonly number[],
  repetitions: number,
): number {
  const total = durations.reduce((a, b) => a + b, 0);
  if (durations.length <= 1 || !(total > 0)) return 0;
  const t = Math.max(0, elapsed);
  if (Number.isFinite(repetitions) && t >= total * (repetitions + 1)) return durations.length - 1;
  let rest = t % total;
  for (let i = 0; i < durations.length; i++) {
    rest -= durations[i]!;
    if (rest < 0) return i;
  }
  return durations.length - 1;
}

/** `data:` adresinin baytları ve türü (CSP `fetch`'e izin vermez: elle çözülür). */
export function dataUrlBytes(url: string): { type: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!match) return null;
  const [, type, base64, body] = match;
  try {
    const text = base64 ? atob(body!) : decodeURIComponent(body!);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return { type: type!, bytes };
  } catch {
    return null;
  }
}

const ascii = (bytes: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

/** GIF'in kare sayısı (ikiyi bulunca durur); yapı bozuksa `null`. */
function gifFrames(bytes: Uint8Array): number | null {
  const table = (flags: number) => (flags & 0x80 ? 3 << ((flags & 0x07) + 1) : 0);
  if (bytes.length < 13) return null;
  let i = 13 + table(bytes[10]!);
  let frames = 0;
  const skip = (from: number): number | null => {
    let j = from;
    for (;;) {
      if (j >= bytes.length) return null;
      const len = bytes[j]!;
      j += 1;
      if (len === 0) return j;
      j += len;
    }
  };
  for (;;) {
    const b = bytes[i];
    if (b === undefined || b === 0x3b) return frames;
    if (b === 0x21) {
      const next = skip(i + 2);
      if (next === null) return null;
      i = next;
    } else if (b === 0x2c) {
      frames += 1;
      if (frames > 1) return frames;
      if (i + 9 >= bytes.length) return null;
      const next = skip(i + 10 + table(bytes[i + 9]!) + 1);
      if (next === null) return null;
      i = next;
    } else {
      return null;
    }
  }
}

/**
 * Resim hareketli mi (çekirdeğin `is_animated`'ının aynısı): birden çok kareli GIF (kareleri
 * sayılamayan bozuk GIF de, güvenli yan), APNG (`IDAT`'tan önce `acTL`), hareketli WebP (`VP8X`
 * hareket bayrağı, `ANIM`/`ANMF`).
 */
export function isAnimated(bytes: Uint8Array): boolean {
  if (ascii(bytes, 0, "GIF8")) {
    const frames = gifFrames(bytes);
    return frames === null || frames > 1;
  }
  if (bytes[0] === 0x89 && ascii(bytes, 1, "PNG")) {
    let i = 8;
    while (i + 8 <= bytes.length) {
      if (ascii(bytes, i + 4, "acTL")) return true;
      if (ascii(bytes, i + 4, "IDAT")) return false;
      const len =
        ((bytes[i]! << 24) >>> 0) + (bytes[i + 1]! << 16) + (bytes[i + 2]! << 8) + bytes[i + 3]!;
      i += 12 + len;
    }
    return false;
  }
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) {
    let i = 12;
    while (i + 8 <= bytes.length) {
      if (ascii(bytes, i, "ANIM") || ascii(bytes, i, "ANMF")) return true;
      if (ascii(bytes, i, "VP8X") && ((bytes[i + 8] ?? 0) & 0x02) !== 0) return true;
      const len =
        bytes[i + 4]! +
        (bytes[i + 5]! << 8) +
        (bytes[i + 6]! << 16) +
        ((bytes[i + 7]! << 24) >>> 0);
      i += 8 + len + (len & 1);
    }
  }
  return false;
}

/** WebCodecs `ImageDecoder`'ın kullanılan kısmı (TypeScript'in DOM türlerinde yok). */
interface DecodedFrame {
  displayWidth: number;
  displayHeight: number;
  duration: number | null;
  close(): void;
}
interface ImageDecoderLike {
  tracks: {
    ready: Promise<void>;
    selectedTrack: { frameCount: number; repetitionCount: number; animated: boolean } | null;
  };
  completed: Promise<void>;
  decode(options: { frameIndex: number }): Promise<{ image: DecodedFrame }>;
  close(): void;
}
interface ImageDecoderClass {
  new (init: { data: Uint8Array; type: string }): ImageDecoderLike;
  isTypeSupported(type: string): Promise<boolean>;
}

/** Tarayıcının `ImageDecoder`'ı (yoksa `null`: ilk kare sabit gösterilir). */
export function imageDecoderClass(): ImageDecoderClass | null {
  const value = (globalThis as { ImageDecoder?: unknown }).ImageDecoder;
  return typeof value === "function" ? (value as ImageDecoderClass) : null;
}

/** Çözme sonucu: kareler, sınırı aşan resim ya da çözülemeyen (o zaman ilk kare sabit). */
export type DecodeResult =
  | { kind: "animation"; animation: Animation }
  | { kind: "too-large"; frames: number; pixels: number }
  | { kind: "unsupported" };

/** Hareketli resmin bütün karelerini çözer (her kare `ImageBitmap`; sınırlar aşılırsa durur). */
export async function decodeAnimation(
  bytes: Uint8Array,
  type: string,
  cancelled: () => boolean = () => false,
): Promise<DecodeResult> {
  const Decoder = imageDecoderClass();
  if (!Decoder || typeof createImageBitmap !== "function") return { kind: "unsupported" };
  let decoder: ImageDecoderLike | null = null;
  const frames: ImageBitmap[] = [];
  try {
    if (!(await Decoder.isTypeSupported(type))) return { kind: "unsupported" };
    decoder = new Decoder({ data: bytes, type });
    await decoder.tracks.ready;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 1) return { kind: "unsupported" };
    const first = await decoder.decode({ frameIndex: 0 });
    const width = first.image.displayWidth;
    const height = first.image.displayHeight;
    const count = track.frameCount;
    const pixels = width * height * count;
    if (count > MAX_FRAMES || pixels > MAX_PIXELS) {
      first.image.close();
      return { kind: "too-large", frames: count, pixels };
    }
    const durations: number[] = [];
    for (let i = 0; i < count; i++) {
      const { image } = i === 0 ? first : await decoder.decode({ frameIndex: i });
      try {
        if (cancelled()) throw new Error("iptal");
        durations.push(frameDelay((image.duration ?? 0) / 1000));
        frames.push(await createImageBitmap(image as unknown as ImageBitmapSource));
      } finally {
        image.close();
      }
    }
    return {
      kind: "animation",
      animation: {
        frames,
        durations,
        repetitions: track.repetitionCount,
        width,
        height,
      },
    };
  } catch {
    frames.forEach((f) => f.close());
    return { kind: "unsupported" };
  } finally {
    decoder?.close();
  }
}

/**
 * Resmin ilk karesi sabit bir PNG olarak (`blob:` adresi): `createImageBitmap` hareketli resmin
 * varsayılan (ilk) karesini verir. Olmazsa `null`.
 */
export async function firstFrameUrl(bytes: Uint8Array, type: string): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
