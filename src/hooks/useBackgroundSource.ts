import { useEffect, useRef, useState } from "react";
import {
  dataUrlBytes,
  decodeAnimation,
  firstFrameUrl,
  isAnimated,
  type Animation,
} from "../lib/animatedImage";

/**
 * "Kendi resmin" sahnesinin arka planı: resim yok, yükleniyor, sabit resim (`<img>`) ya da
 * hareketli resmin çözülmüş kareleri (`still`: ilk karesi, fren kurulamazsa gösterilir).
 */
export type BackgroundSource =
  | { kind: "none" }
  | { kind: "pending" }
  | { kind: "still"; url: string }
  | { kind: "animated"; animation: Animation; still: string | null };

/** Kaynağın bıraktığı bellek: kareler ve ilk karenin `blob:` adresi. */
function release(source: BackgroundSource, own: string | null) {
  if (source.kind === "animated") {
    source.animation.frames.forEach((f) => f.close());
    if (source.still) URL.revokeObjectURL(source.still);
  } else if (source.kind === "still" && source.url === own) {
    URL.revokeObjectURL(source.url);
  }
}

/**
 * Resmin (`data:` adresi) nasıl gösterileceği. Hareketli resim (GIF, APNG, hareketli WebP)
 * WebView'da kare kare çözülür; "animasyonları azalt" açıksa, `ImageDecoder` yoksa ya da resim
 * sınırları aşıyorsa yalnızca ilk karesi sabit gösterilir. Yeni resim çözülene dek eskisi yerinde
 * kalır (araya karanlık girip parlamasın); eskisinin kareleri yenisi gelince bırakılır.
 */
export function useBackgroundSource(
  image: string | null | undefined,
  reducedMotion: boolean,
): BackgroundSource {
  const [source, setSource] = useState<BackgroundSource>({ kind: "pending" });
  // Gösterilen kaynak ve kendi oluşturduğu `blob:` adresi (bırakmak için).
  const shown = useRef<{ source: BackgroundSource; own: string | null }>({
    source: { kind: "pending" },
    own: null,
  });

  useEffect(() => {
    let live = true;
    const show = (next: BackgroundSource, own: string | null = null) => {
      release(shown.current.source, shown.current.own);
      shown.current = { source: next, own };
      setSource(next);
    };
    if (image === null) {
      show({ kind: "none" });
      return;
    }
    if (image === undefined) return;
    const data = dataUrlBytes(image);
    if (!data || !isAnimated(data.bytes)) {
      show({ kind: "still", url: image });
      return;
    }
    void (async () => {
      const still = await firstFrameUrl(data.bytes, data.type);
      const decoded =
        live && !reducedMotion ? await decodeAnimation(data.bytes, data.type, () => !live) : null;
      if (!live) {
        if (still) URL.revokeObjectURL(still);
        if (decoded?.kind === "animation") decoded.animation.frames.forEach((f) => f.close());
        return;
      }
      if (decoded?.kind === "animation") {
        show({ kind: "animated", animation: decoded.animation, still });
      } else {
        show(still ? { kind: "still", url: still } : { kind: "none" }, still);
      }
    })();
    return () => {
      live = false;
    };
  }, [image, reducedMotion]);

  // Sahneden çıkınca bellek bırakılır.
  useEffect(
    () => () => {
      release(shown.current.source, shown.current.own);
      shown.current = { source: { kind: "pending" }, own: null };
    },
    [],
  );

  return source;
}
