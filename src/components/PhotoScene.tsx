import { useCallback, useEffect, useRef } from "react";
import { getVisualSpectrum, type VisualFrame } from "../lib/backend";
import {
  DEFAULT_ACCENT,
  PHOTO_BARS,
  barColors,
  barGeometry,
  clockText,
  coreRects,
  displayUpper,
  dominantColor,
  flashBudget,
  glowRects,
  imageBackground,
  isTurkishText,
  limitExtents,
  measureLine,
  targetExtents,
  uniformBackground,
  type BarColors,
  type LineMap,
} from "../lib/photoScene";
import { barTargets, stepBars } from "../lib/spectrumBars";
import { useVisualFeed } from "../hooks/useVisualFeed";

export interface PhotoSceneProps {
  playing: boolean;
  /** Epilepsi güvenli modu: çubuklar yarı boyda, pencere başına değişim payı yarısı. */
  safe?: boolean;
  /** Kullanıcının resmi (`data:` adresi); seçilmemişse `null`, yüklenirken `undefined`. */
  image: string | null | undefined;
  title?: string | null;
  artist?: string | null;
  /** Resim seçme (resim yokken sahnenin ortasındaki düğme). */
  onChooseImage?: () => void;
}

/** Ölçülen çizgi bölgesi ve çubuk renkleri (bir ekran boyu ve bir resim için). */
interface Measured {
  colors: BarColors;
  map: LineMap;
  /** Neye göre ölçüldü: resim (`null`: resimsiz koyu zemin, `undefined`: bilinmeyen resim). */
  source: HTMLImageElement | null | undefined;
  /** Ölçüldüğü ekran boyu (CSS piksel). */
  width: number;
  height: number;
}

/** Resimsiz çizginin renkleri (vurgu yeşili). */
const NO_IMAGE_COLORS = barColors(DEFAULT_ACCENT);

/** Resimsiz zemin (`.photo-scene`: #1a1424'ten #07060b'ye). */
const NO_IMAGE = uniformBackground([0, 0, 0], [26, 20, 36]);
/** Resim yüklenirken: her bileşen siyahla beyaz arasında olabilir. */
const UNKNOWN = uniformBackground([0, 0, 0], [255, 255, 255]);

/** Ekran boyu bu kadar süre değişmeyince resim ölçülür (pencere boyutlanırken), ms. */
const REMEASURE_MS = 300;

/** Ölçümün en büyük genişliği (CSS piksel): daha geniş ekranda resim küçültülerek ölçülür. */
const MEASURE_MAX_WIDTH = 1920;

/**
 * Resmi ekrandaki gibi kırpıp (object-fit: cover) ekran boyunda çizer; baskın rengini ve çizgi
 * bölgesinin her pikselini ölçer (`dominantColor`, `measureLine`).
 */
function measureImage(image: HTMLImageElement, width: number, height: number): Measured | null {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) return null;
  // Çok geniş ekranda küçültülmüş ölçüm: ışık ölçüm pikseli başına sayılır, alan oranı aynı.
  const scale = Math.min(1, MEASURE_MAX_WIDTH / width);
  const mw = Math.max(2, Math.round(width * scale));
  const mh = Math.max(2, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const fit = Math.max(mw / image.naturalWidth, mh / image.naturalHeight);
  const w = image.naturalWidth * fit;
  const h = image.naturalHeight * fit;
  ctx.drawImage(image, (mw - w) / 2, (mh - h) / 2, w, h);
  const all = ctx.getImageData(0, 0, mw, mh).data;
  // Renk için ~64 sütunluk seyrek örnek yeter.
  const step = Math.max(1, Math.round(mw / 64));
  const sample: number[] = [];
  for (let y = 0; y < mh; y += step) {
    for (let x = 0; x < mw; x += step) {
      const i = (y * mw + x) * 4;
      sample.push(all[i]!, all[i + 1]!, all[i + 2]!, all[i + 3]!);
    }
  }
  const colors = barColors(dominantColor(sample));
  return {
    colors,
    map: measureLine(imageBackground(all, mw, mh), mw, mh, colors),
    source: image,
    width,
    height,
  };
}

/**
 * "Kendi resmin" sahnesi: kullanıcının seçtiği resim arka planda (sabit), ortada şarkıyla oynayan
 * ışık çizgisi: 200 ince çubuk (20 Hz – 2 kHz, bas solda), çizgiden aşağı sarkar. Çubuğun özü
 * beyaza yakın, ışıltısı resmin baskın renginde; ışık resme eklenir (`plus-lighter`). Üstünde
 * şarkının adı (geniş harfler) ve geçen süre; bu yazılar sinema görünümünde (denetimler gizliyken)
 * görünür. Her karede çubukların ekleyebileceği ışık resmin pikselleriyle sınırlanır
 * (`limitExtents`): hiçbir pencerenin parlaklığı 0,08'den fazla değişmez.
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
  // Son ölçüm; ekran boyu ya da resim değişince yeniden ölçülür. O arada (resim yükleniyor,
  // pencere boyutlanıyor) bilinmeyen zemine göre ölçülmüş harita kullanılır.
  const measured = useRef<Measured | null>(null);
  const loaded = useRef<HTMLImageElement | null>(null);
  // Ekran boyu ve ne zamandan beri bu boyda olduğu.
  const size = useRef({ width: 0, height: 0, since: -Infinity });
  // Son ölçülen renk: pencere boyutlanırken yeniden ölçülene dek çubuk rengini değiştirmez.
  const lastColors = useRef<BarColors>(NO_IMAGE_COLORS);
  // Resim ölçülene dek kullanılan (bilinmeyen zemine göre) ölçüm.
  const fallback = useRef<Measured | null>(null);

  useEffect(() => {
    loaded.current = null;
    measured.current = null;
    lastColors.current = NO_IMAGE_COLORS;
    // Önbellekten hemen gelen resimde `load` olayı React bağlanmadan geçmiş olabilir.
    const element = imageRef.current;
    if (image && element?.complete && element.naturalWidth > 0) loaded.current = element;
  }, [image]);

  const onImageLoad = useCallback(() => {
    const element = imageRef.current;
    if (element && element.naturalWidth > 0) {
      loaded.current = element;
      measured.current = null;
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
      // Çekirdeğin çubukları yoksa (istek sürüyor, tarayıcı önizlemesi, boş yanıt) bantlardan.
      const targets = !live
        ? levels.current.map(() => 0)
        : barTargets(feed.levels, live.bands, PHOTO_BARS);
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

      // Ölçüm: resmin kendisi (yüklendiyse), resimsiz koyu zemin ya da (resim yüklenirken,
      // pencere boyutlanırken) bilinmeyen zemin. Her biri ekran boyuna göre bir kez ölçülür.
      const element = loaded.current;
      const want: HTMLImageElement | null | undefined = image ? (element ?? undefined) : null;
      const fits = (m: Measured | null, source: Measured["source"]) =>
        !!m && m.source === source && m.width === width && m.height === height;
      // Pencere boyutlanırken ölçüm (çizgi bölgesinin her pikseli, ~0,2 sn) boy durulunca yapılır.
      const now = performance.now();
      if (size.current.width !== width || size.current.height !== height) {
        size.current = { width, height, since: now };
      }
      let current = measured.current;
      if (!fits(current, want)) {
        current = null;
        if (want && now - size.current.since >= REMEASURE_MS) {
          current = measureImage(want, width, height);
        }
        if (current) {
          measured.current = current;
          lastColors.current = current.colors;
        } else {
          const source = want === null ? null : undefined;
          current = fits(fallback.current, source) ? fallback.current : null;
          if (
            !current ||
            current.colors !== (source === null ? NO_IMAGE_COLORS : lastColors.current)
          ) {
            const colors = source === null ? NO_IMAGE_COLORS : lastColors.current;
            current = {
              colors,
              map: measureLine(source === null ? NO_IMAGE : UNKNOWN, width, height, colors),
              source,
              width,
              height,
            };
            fallback.current = current;
          }
          if (source === null) measured.current = current;
        }
      }
      if (!current) return;
      const { colors, map } = current;
      // Ölçüm pikseli CSS pikselinden küçük olabilir (çok geniş ekran).
      const scale = map.geometry.width / width;
      const geometry = barGeometry(width, height);
      // Hedef boylar ve bu karenin parlama sınırı (ölçüm pikseliyle hesaplanır).
      const wanted = targetExtents(levels.current, geometry, safe);
      const limited = limitExtents(
        map,
        wanted.map((e) => e * scale),
        flashBudget(safe),
      ).map((e) => e / scale);

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // Işık toplanır: tuvalin içinde de, resmin üstünde de (CSS `mix-blend-mode: plus-lighter`).
      // Önce ışıltı (çubuk aralığı genişliğinde dikdörtgenlerin Gauss bulanıklığı), sonra öz.
      // Parlama hesabı bu modele göre (src/lib/photoScene.ts `measureLine`).
      ctx.globalCompositeOperation = "lighter";
      const [gr, gg, gb] = colors.glow;
      ctx.filter = `blur(${geometry.sigma}px)`;
      ctx.fillStyle = `rgba(${gr}, ${gg}, ${gb}, ${colors.glowAlpha})`;
      ctx.beginPath();
      for (const r of glowRects(limited, geometry)) ctx.rect(r.x, r.y, r.width, r.height);
      ctx.fill();
      ctx.filter = "none";
      const [cr, cg, cb] = colors.core;
      ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
      ctx.beginPath();
      for (const r of coreRects(limited, geometry)) ctx.rect(r.x, r.y, r.width, r.height);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // Yazılar çizginin hemen üstünde durur (ışıltının yukarı taşan kısmının üstünde).
      const lift = 3 * geometry.sigma + 10;
      textRef.current?.style.setProperty("--photo-lift", `${Math.ceil(lift)}px`);
    },
    [playing, safe, image],
  );
  useVisualFeed(playing, onTick);
  const turkish = isTurkishText(title, artist);

  return (
    <div className="photo-scene">
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
