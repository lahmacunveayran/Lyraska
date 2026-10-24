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
  maxBarExtent,
  meanLuminance,
  relativeLuminance,
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

/** Resmin rengi ve çizgi bölgesinin parlaklığı (resim yüklenince küçültülmüş kopyasından). */
interface ImageTone {
  accent: Rgb;
  /** Çizginin geçtiği yatay bandın ortalama bağıl parlaklığı. */
  lineLuminance: number;
}

const NO_IMAGE_TONE: ImageTone = { accent: DEFAULT_ACCENT, lineLuminance: 0.02 };

/** Resmi 64×36'ya küçültüp rengini ve orta bandın parlaklığını ölçer. */
function measureImage(image: HTMLImageElement): ImageTone {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return NO_IMAGE_TONE;
  // Ekrandaki gibi kırpılarak (object-fit: cover) çizilir.
  const scale = Math.max(64 / image.naturalWidth, 36 / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (64 - w) / 2, (36 - h) / 2, w, h);
  const all = ctx.getImageData(0, 0, 64, 36).data;
  // Çizgi ve ışıltısı ortadaki banttadır (yüksekliğin %40–%60'ı).
  const band = ctx.getImageData(0, 14, 64, 8).data;
  return { accent: accentFromPixels(all), lineLuminance: meanLuminance(band) };
}

/**
 * "Kendi resmin" sahnesi: kullanıcının seçtiği resim arka planda (çok yavaş kayar), ortada
 * şarkıyla oynayan ışık çizgisi: ince spektrum çubukları, bas solda, çizgiden aşağı sarkar. Çizginin rengi resmin
 * baskın renginden. Üstünde şarkının adı (geniş harfler) ve geçen süre; bu yazılar sinema
 * görünümünde (denetimler gizliyken) görünür. Resim sabit kalır; çubukların boyu parlama
 * sınırından hesaplanır (`maxBarExtent`).
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
  const tone = useRef<ImageTone>(NO_IMAGE_TONE);

  useEffect(() => {
    tone.current = NO_IMAGE_TONE;
    if (!image) return;
    const element = new Image();
    let live = true;
    element.onload = () => {
      if (live) tone.current = measureImage(element);
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
      const { accent, lineLuminance } = tone.current;
      const core = coreColor(accent);
      // Parlama hesabı özün (en parlak kısım) parlaklığıyla; ışıltı ondan koyu, pay kalır.
      const maxExtent = maxBarExtent(width, height, relativeLuminance(core), lineLuminance, safe);
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
    [playing, safe],
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
