import { useCallback, useEffect, useRef } from "react";
import { getVisualSpectrum, type VisualFrame } from "../lib/backend";
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
  isTurkishText,
  lineExtent,
  maxBarExtentForContrast,
  measureBest,
  measureLine,
  pixelContrast,
  worstContrast,
  type Rgb,
} from "../lib/photoScene";
import { barTargetsFromBands, stepBars } from "../lib/spectrumBars";
import { useVisualFeed } from "../hooks/useVisualFeed";

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
  /** Ölçüldüğü bant koyuluğu (`--photo-band`); ölçülemediyse `null` (en kötü zemin). */
  band: number | null;
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
 * en büyük boyunu ölçer (`measureLine`, `lineExtent`). `band`: çizginin koyu bandının koyuluğu;
 * `null` ise çubukları en uzun tutan seçilir (`measureBest`; resim ilk ölçülürken).
 */
function measureImage(
  image: HTMLImageElement,
  width: number,
  height: number,
  band: number | null,
): ImageTone {
  const fallback = (accent: Rgb): ImageTone => {
    // Ölçülemezse en kötü zemin.
    const contrast = worstContrast(barColors(accent));
    return {
      accent,
      extent: maxBarExtentForContrast(width, height, contrast, false),
      safeExtent: maxBarExtentForContrast(width, height, contrast, true),
      band: null,
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
  const core = coreColor(accent);
  const map =
    band === null
      ? measureBest(all, mw, mh, width, height, core, accent)
      : measureLine(all, mw, mh, width, height, core, accent, band);
  return {
    accent,
    extent: lineExtent(map, false),
    safeExtent: lineExtent(map, true),
    band: map.band,
    width,
    height,
  };
}

/**
 * "Kendi resmin" sahnesi: kullanıcının seçtiği resim arka planda (sabit), ortada
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
  // Çekirdeğin çubuk seviyeleri: aynı anda tek istek; istek sürerken bir öncekiyle çizilir.
  const spectrum = useRef<{ levels: number[] | null; inFlight: boolean }>({
    levels: null,
    inFlight: false,
  });
  // Ekrandaki resim: ölçüm de bundan yapılır (resim bir kez çözülür).
  const imageRef = useRef<HTMLImageElement>(null);
  // Ölçülmemişse `null` (resim yükleniyor ya da pencere boyutlandı): en kötü karşıtlıkla çizilir.
  const tone = useRef<ImageTone | null>(null);
  const loaded = useRef<HTMLImageElement | null>(null);
  const measuredAt = useRef(-Infinity);
  // Son ölçülen renk: pencere boyutlanırken yeniden ölçülene dek çubuk rengini değiştirmez.
  const lastAccent = useRef<Rgb>(DEFAULT_ACCENT);
  // Bu resim için seçilen bant koyuluğu: resim değişene dek sabit (pencere boyutlanınca bant
  // yerinde kalır, yalnızca çubukların boyu yeniden ölçülür).
  const band = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loaded.current = null;
    tone.current = null;
    lastAccent.current = DEFAULT_ACCENT;
    band.current = null;
    // Resimsizken bant yok; yeni resim ölçülene dek eskisi kalır (çubuklar o sırada en kötü
    // zemine göre: bant koyuluğundan bağımsız).
    if (!image) rootRef.current?.style.setProperty("--photo-band", "0");
    // Önbellekten hemen gelen resimde `load` olayı React bağlanmadan geçmiş olabilir.
    const element = imageRef.current;
    if (image && element?.complete && element.naturalWidth > 0) loaded.current = element;
  }, [image]);

  const onImageLoad = useCallback(() => {
    const element = imageRef.current;
    if (element && element.naturalWidth > 0) {
      loaded.current = element;
      tone.current = null;
    }
  }, []);

  const onTick = useCallback(
    (frame: VisualFrame | null, dt: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const live = playing ? frame : null;
      const feed = spectrum.current;
      if (!live) {
        feed.levels = null;
      } else if (!feed.inFlight) {
        feed.inFlight = true;
        getVisualSpectrum(PHOTO_BARS)
          .then((levels) => {
            feed.levels = levels;
          })
          .catch(() => {
            feed.levels = null;
          })
          .finally(() => {
            feed.inFlight = false;
          });
      }
      // Çekirdek yoksa (tarayıcı önizlemesi) analiz karesinin bantlarından.
      const targets = !live
        ? levels.current.map(() => 0)
        : (feed.levels ?? barTargetsFromBands(live.bands, PHOTO_BARS));
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
      // Resim yüklenirken ya da değişirken (`loaded` boş) en kötü zemin varsayılır.
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
          const fresh = measureImage(element, width, height, band.current);
          tone.current = fresh;
          if (fresh.band !== null && band.current === null) {
            band.current = fresh.band;
            rootRef.current?.style.setProperty("--photo-band", String(fresh.band));
          }
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
      // Bütün çubuklar tek yol, tek doldurma: ışıltı (bulanık gölge) bir kez hesaplanır. Gölge
      // bütün çubukların altına, çubuklar üstüne çizilir (parlama hesabı bu modele göre:
      // GLOW_ALPHA, GLOW_PX; photoScene.test.ts'teki tarayıcı gibi çizim de böyle).
      ctx.shadowColor = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${GLOW_ALPHA})`;
      ctx.shadowBlur = GLOW_PX * ratio;
      ctx.fillStyle = `rgb(${core[0]}, ${core[1]}, ${core[2]})`;
      ctx.beginPath();
      for (const r of rects) ctx.rect(r.x, r.y, r.width, r.height);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Yazılar çizginin hemen üstünde durur.
      const lift = (maxExtent * UP_SHARE) / (1 + UP_SHARE) + GLOW_PX + 10;
      textRef.current?.style.setProperty("--photo-lift", `${Math.ceil(lift)}px`);
    },
    [playing, safe, image],
  );
  useVisualFeed(playing, onTick);
  const turkish = isTurkishText(title, artist);

  return (
    <div className="photo-scene" ref={rootRef}>
      {image ? (
        <img
          ref={imageRef}
          className="photo-scene__image"
          src={image}
          alt=""
          draggable={false}
          onLoad={onImageLoad}
        />
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
          <span className="photo-scene__title">{displayUpper(title || "Lyraska", turkish)}</span>
          {artist && <span className="photo-scene__artist">{displayUpper(artist, turkish)}</span>}
        </div>
        <span className="photo-scene__clock" ref={clockRef}>
          00:00
        </span>
      </div>
    </div>
  );
}
