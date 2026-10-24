import { useCallback, useEffect, useRef } from "react";
import { getVisualWaveform, type VisualFrame } from "../lib/backend";
import {
  DEFAULT_ACCENT,
  GLOW_ALPHA,
  GLOW_PX,
  PHOTO_BARS,
  UP_SHARE,
  accentFromPixels,
  barRects,
  clockText,
  coreColor,
  displayUpper,
  lineExtent,
  maxBarExtentForContrast,
  measureLine,
  pixelContrast,
  worstContrast,
  type Rgb,
} from "../lib/photoScene";
import { barBands, barTargetsFromBands, barTargetsFromWave, stepBars } from "../lib/spectrumBars";
import { useVisualFeed } from "../hooks/useVisualFeed";

const BANDS = barBands(PHOTO_BARS);

export interface PhotoSceneProps {
  playing: boolean;
  /** Epilepsi güvenli modu: çubuklar yarı boyda. */
  safe?: boolean;
  /** Kullanıcının resmi (`data:` adresi); seçilmemişse `null`, yüklenirken `undefined`. */
  image: string | null | undefined;
  title?: string | null;
  artist?: string | null;
  /** Resim seçme (resim yokken sahnenin ortasındaki düğme). */
  onChooseImage?: () => void;
}

/** Resmin rengi ve ölçülen ekran boyunda çubukların en büyük boyu (`lineExtent`). */
interface ImageTone {
  accent: Rgb;
  /** Normal ve güvenli modda en büyük boy (CSS piksel). */
  extent: number;
  safeExtent: number;
  /** Ölçüldüğü ekran boyu (CSS piksel). */
  width: number;
  height: number;
}

/** Çubuğun iki rengi: öz ve ışıltı. */
function barColors(accent: Rgb): Rgb[] {
  return [coreColor(accent), accent];
}

/** Resimsiz zemin (`.photo-scene`: #1a1424'ten #07060b'ye; kenar karartmasıyla siyaha dek). */
const NO_IMAGE_CONTRAST = Math.max(
  ...barColors(DEFAULT_ACCENT).flatMap((c) => [
    pixelContrast(c, [0, 0, 0]),
    pixelContrast(c, [26, 20, 36]),
  ]),
);

/** Aynı resmi yeniden ölçmeden önce beklenen süre (pencere boyutlanırken), ms. */
const REMEASURE_MS = 300;

/** Ölçüm genişliği (piksel): 2×2 blokların en koyusu ve en açığıyla 320 sütun. */
const MEASURE_WIDTH = 640;

/**
 * Resmi ekrandaki gibi kırpıp küçültür; rengini ve bu ekran boyunda çubukların parlama sınırından
 * en büyük boyunu ölçer (`measureLine`, `lineExtent`).
 */
function measureImage(image: HTMLImageElement, width: number, height: number): ImageTone {
  const fallback = (accent: Rgb): ImageTone => {
    // Ölçülemezse en kötü zemin.
    const contrast = worstContrast(barColors(accent));
    return {
      accent,
      extent: maxBarExtentForContrast(width, height, contrast, false),
      safeExtent: maxBarExtentForContrast(width, height, contrast, true),
      width,
      height,
    };
  };
  const mw = MEASURE_WIDTH;
  const mh = Math.max(2, Math.round((mw * height) / width));
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || image.naturalWidth === 0 || image.naturalHeight === 0)
    return fallback(DEFAULT_ACCENT);
  // Ekrandaki gibi kırpılarak (object-fit: cover) çizilir.
  const scale = Math.max(mw / image.naturalWidth, mh / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (mw - w) / 2, (mh - h) / 2, w, h);
  const all = ctx.getImageData(0, 0, mw, mh).data;
  // Renk için her onuncu sütun ve satır yeter (64 sütun).
  const sample: number[] = [];
  for (let y = 0; y < mh; y += 10) {
    for (let x = 0; x < mw; x += 10) {
      const i = (y * mw + x) * 4;
      sample.push(all[i]!, all[i + 1]!, all[i + 2]!, all[i + 3]!);
    }
  }
  const accent = accentFromPixels(sample);
  const map = measureLine(all, mw, mh, width, height, coreColor(accent), accent);
  return {
    accent,
    extent: lineExtent(map, false),
    safeExtent: lineExtent(map, true),
    width,
    height,
  };
}

/**
 * "Kendi resmin" sahnesi: kullanıcının seçtiği resim arka planda (çok yavaş kayar), ortada
 * şarkıyla oynayan ışık çizgisi: ince spektrum çubukları, bas solda, çizgiden aşağı sarkar. Çizginin rengi resmin
 * baskın renginden. Üstünde şarkının adı (geniş harfler) ve geçen süre; bu yazılar sinema
 * görünümünde (denetimler gizliyken) görünür. Resim sabit kalır; çubukların boyu parlama
 * sınırından hesaplanır (`lineExtent`).
 */
export function PhotoScene({
  playing,
  safe = false,
  image,
  title = null,
  artist = null,
  onChooseImage,
}: PhotoSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const levels = useRef<number[]>(new Array<number>(PHOTO_BARS).fill(0));
  // Ham dalga: istek sürerken bir öncekiyle çizilir (MilkDrop sahnesiyle aynı yol).
  const wave = useRef<{ bytes: Uint8Array | null; inFlight: boolean }>({
    bytes: null,
    inFlight: false,
  });
  // Ölçülmemişse `null` (resim yükleniyor ya da pencere boyutlandı): en kötü karşıtlıkla çizilir.
  const tone = useRef<ImageTone | null>(null);
  const loaded = useRef<HTMLImageElement | null>(null);
  const measuredAt = useRef(-Infinity);
  // Son ölçülen renk: pencere boyutlanırken yeniden ölçülene dek çubuk rengini değiştirmez.
  const lastAccent = useRef<Rgb>(DEFAULT_ACCENT);

  useEffect(() => {
    loaded.current = null;
    tone.current = null;
    lastAccent.current = DEFAULT_ACCENT;
    if (!image) return;
    const element = new Image();
    let live = true;
    element.onload = () => {
      if (live) loaded.current = element;
    };
    element.src = image;
    return () => {
      live = false;
    };
  }, [image]);

  const onTick = useCallback(
    (frame: VisualFrame | null, dt: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const live = playing ? frame : null;
      const feed = wave.current;
      if (!live) {
        feed.bytes = null;
      } else if (!feed.inFlight) {
        feed.inFlight = true;
        getVisualWaveform()
          .then((bytes) => {
            feed.bytes = bytes;
          })
          .catch(() => {
            feed.bytes = null;
          })
          .finally(() => {
            feed.inFlight = false;
          });
      }
      const targets = !live
        ? BANDS.map(() => 0)
        : feed.bytes
          ? barTargetsFromWave(feed.bytes, BANDS)
          : barTargetsFromBands(live.bands, PHOTO_BARS);
      levels.current = stepBars(levels.current, targets, dt);
      if (live && clockRef.current) clockRef.current.textContent = clockText(live.positionSecs);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const element = loaded.current;
      const measured = tone.current;
      const stale =
        !measured ||
        Math.abs(measured.width - width) > 0.01 * width ||
        Math.abs(measured.height - height) > 0.01 * height;
      if (element && stale) {
        // Resim yeni yüklendi ya da pencere boyutlandı: kırpılan yer değişir, yeniden ölçülür.
        tone.current = null;
        const now = performance.now();
        if (now - measuredAt.current >= REMEASURE_MS) {
          measuredAt.current = now;
          tone.current = measureImage(element, width, height);
        }
      }
      const current = element ? tone.current : null;
      if (current) lastAccent.current = current.accent;
      const accent = lastAccent.current;
      const core = coreColor(accent);
      // Parlama sınırı resmin en kötü yerine göre (`lineExtent`); resim yokken koyu zemin,
      // resim ölçülmemişken (yükleniyor, pencere boyutlanıyor) en kötü zemin.
      const maxExtent = current
        ? safe
          ? current.safeExtent
          : current.extent
        : maxBarExtentForContrast(
            width,
            height,
            image ? worstContrast(barColors(accent)) : NO_IMAGE_CONTRAST,
            safe,
          );
      const rects = barRects(levels.current, width, height, maxExtent);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // Işıltı: çubuğun bulanık gölgesi (parlama hesabı bu modele göre: GLOW_ALPHA, GLOW_PX).
      ctx.shadowColor = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${GLOW_ALPHA})`;
      ctx.shadowBlur = GLOW_PX * ratio;
      ctx.fillStyle = `rgb(${core[0]}, ${core[1]}, ${core[2]})`;
      for (const r of rects) ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.shadowBlur = 0;
      // Yazılar çizginin hemen üstünde durur.
      const lift = (maxExtent * UP_SHARE) / (1 + UP_SHARE) + GLOW_PX + 10;
      textRef.current?.style.setProperty("--photo-lift", `${Math.ceil(lift)}px`);
    },
    [playing, safe, image],
  );
  useVisualFeed(playing, onTick);

  return (
    <div className="photo-scene">
      {image ? (
        <img className="photo-scene__image" src={image} alt="" draggable={false} />
      ) : (
        image === null && (
          <div className="photo-scene__empty">
            <p>Arka plana istediğiniz resmi koyun.</p>
            {onChooseImage && (
              <button
                type="button"
                className="hw-button hw-button--primary"
                onClick={onChooseImage}
              >
                Resim seç…
              </button>
            )}
            <p className="photo-scene__hint">
              Sonra Galeri › Kendi resmin'den değiştirebilirsiniz.
            </p>
          </div>
        )
      )}
      <div className="photo-scene__shade" aria-hidden />
      <canvas
        ref={canvasRef}
        className="photo-scene__bars"
        role="img"
        aria-label="Şarkıyla oynayan ışık çizgisi"
      />
      <div className="photo-scene__text" ref={textRef} aria-hidden>
        <div className="photo-scene__song">
          <span className="photo-scene__title">{displayUpper(title || "Lyraska")}</span>
          {artist && <span className="photo-scene__artist">{displayUpper(artist)}</span>}
        </div>
        <span className="photo-scene__clock" ref={clockRef}>
          00:00
        </span>
      </div>
    </div>
  );
}
