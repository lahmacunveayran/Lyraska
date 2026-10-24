import { useCallback, useEffect, useRef, useState } from "react";
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
  animatedBudgets,
  flashBudgets,
  glowFilter,
  glowRects,
  isTurkishText,
  limitExtents,
  lineRows,
  measureLine,
  presentMotion,
  redSplit,
  targetExtents,
  uniformBackground,
  type BarColors,
  type LineMap,
} from "../lib/photoScene";
import { barTargets, stepBars } from "../lib/spectrumBars";
import { frameAt, type Animation } from "../lib/animatedImage";
import { createFlashGuard, type FlashGuard } from "../lib/flashGuard";
import { fitCanvas, getWebGl2 } from "../lib/gl";
import { measureFrames, measureStill } from "../lib/photoMeasure";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { useBackgroundSource } from "../hooks/useBackgroundSource";
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
  /**
   * Neye göre ölçüldü: resim, hareketli resim (`null`: resimsiz koyu zemin, `undefined`:
   * bilinmeyen resim).
   */
  source: HTMLImageElement | Animation | null | undefined;
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
/** Hareketli resmin ölçümünün en büyük genişliği (her kare ayrı çizilir). */
const MEASURE_MAX_WIDTH_ANIMATED = 960;

/** Resmi (ya da kareyi) ekrandaki gibi kırpıp (object-fit: cover) `w × h` tuvale çizer. */
function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  w: number,
  h: number,
) {
  const fit = Math.max(w / naturalWidth, h / naturalHeight);
  const dw = naturalWidth * fit;
  const dh = naturalHeight * fit;
  // Saydam yerler siyah (ekranda da öyle: tuval siyahla başlar).
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Seyrek örnekten (~64 sütun) baskın renk (`dominantColor`) için pikseller. */
function sampleColors(all: ArrayLike<number>, mw: number, mh: number, into: number[]) {
  const step = Math.max(1, Math.round(mw / 64));
  for (let y = 0; y < mh; y += step) {
    for (let x = 0; x < mw; x += step) {
      const i = (y * mw + x) * 4;
      into.push(all[i]!, all[i + 1]!, all[i + 2]!, all[i + 3]!);
    }
  }
}

/** Ölçüm boyu: çok geniş ekranda küçültülmüş (ışık ölçüm pikseli başına sayılır, alan oranı aynı). */
function measureSize(width: number, height: number, max: number) {
  const scale = Math.min(1, max / width);
  return {
    mw: Math.max(2, Math.round(width * scale)),
    mh: Math.max(2, Math.round(height * scale)),
  };
}

/**
 * Sabit resmi ekrandaki gibi kırpıp ölçer: baskın rengi burada, çizgi bölgesinin her pikseli ayrı
 * iş parçacığında (`measureStill`).
 */
async function measureImage(
  image: HTMLImageElement,
  width: number,
  height: number,
): Promise<Measured | null> {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) return null;
  const { mw, mh } = measureSize(width, height, MEASURE_MAX_WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  drawCover(ctx, image, image.naturalWidth, image.naturalHeight, mw, mh);
  const all = ctx.getImageData(0, 0, mw, mh).data;
  const sample: number[] = [];
  sampleColors(all, mw, mh, sample);
  const colors = barColors(dominantColor(sample));
  const map = await measureStill(all, mw, mh, colors);
  return map ? { colors, map, source: image, width, height } : null;
}

/**
 * Hareketli resmin bütün karelerini ekrandaki gibi kırpıp ölçer: zarfı (her pikselin bütün
 * karelerdeki renkleri) ayrı iş parçacığı toplar (`measureFrames`). Kareler arasında arayüze
 * zaman bırakılır.
 */
async function measureAnimation(
  animation: Animation,
  width: number,
  height: number,
  cancelled: () => boolean,
): Promise<Measured | null> {
  const { mw, mh } = measureSize(width, height, MEASURE_MAX_WIDTH_ANIMATED);
  const canvas = document.createElement("canvas");
  canvas.width = mw;
  canvas.height = mh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { firstRow, lastRow } = lineRows(mw, mh);
  const from = Math.max(0, firstRow - 1);
  const to = Math.min(mh, lastRow + 1);
  // Renk birkaç kareden (en çok 8, eşit aralıklı).
  const sample: number[] = [];
  const every = Math.max(1, Math.floor(animation.frames.length / 8));
  for (let i = 0; i < animation.frames.length; i += every) {
    drawCover(ctx, animation.frames[i]!, animation.width, animation.height, mw, mh);
    sampleColors(ctx.getImageData(0, 0, mw, mh).data, mw, mh, sample);
  }
  const colors = barColors(dominantColor(sample));
  const job = measureFrames(mw, mh, colors);
  for (let i = 0; i < animation.frames.length; i++) {
    if (cancelled()) {
      job.cancel();
      return null;
    }
    try {
      drawCover(ctx, animation.frames[i]!, animation.width, animation.height, mw, mh);
    } catch {
      job.cancel();
      return null;
    }
    if (to > from) job.add(ctx.getImageData(0, from, mw, to - from).data);
    if (i % 8 === 7) await new Promise((done) => setTimeout(done, 0));
  }
  const map = await job.finish();
  return map ? { colors, map, source: animation, width, height } : null;
}

/** Hareketli arka planın çizimi: görünen tuvalde fren, kareler görünmeyen tuvalde. */
interface Motion {
  animation: Animation;
  guard: FlashGuard;
  /** Ekrandaki gibi kırpılmış kare (fren buradan okur). */
  frame: OffscreenCanvas | HTMLCanvasElement;
  index: number;
  /** Oynatma saati (ms): yalnız çalarken ilerler. */
  clock: number;
  /** Ekrandaki görüntünün durumu (`presentMotion`). */
  shown: { primed: boolean; raw: boolean };
}

/**
 * "Kendi resmin" sahnesi: kullanıcının seçtiği resim arka planda, ortada şarkıyla oynayan ışık
 * çizgisi: 200 ince çubuk (20 Hz – 2 kHz, bas solda), çizgiden aşağı sarkar. Çubuğun özü beyaza
 * yakın, ışıltısı resmin baskın renginde; ışık resme eklenir (`plus-lighter`). Üstünde şarkının
 * adı (geniş harfler) ve geçen süre; bu yazılar sinema görünümünde (denetimler gizliyken)
 * görünür. Her karede çubukların ekleyebileceği ışık ve kırmızı değişim resmin pikselleriyle
 * sınırlanır (`limitExtents`, `flashBudgets`).
 *
 * Hareketli resim (GIF, APNG, hareketli WebP) kare kare çözülür ve parlaklık freninden (kırmızı
 * kanalıyla) geçerek çizilir: parlayan bir resim yumuşar, olağan hareket görünür. Çubukların
 * sınırı bütün karelerin zarfıyla ölçülür, payları frenle birlikte hesaplanır (`animatedBudgets`).
 * Animasyon yalnız çalarken ilerler; "animasyonları azalt" açıksa, fren kurulamazsa ya da kareler
 * çözülemezse ilk kare sabit gösterilir.
 */
export function PhotoScene({
  playing,
  safe = false,
  image,
  title = null,
  artist = null,
  onChooseImage,
}: PhotoSceneProps) {
  const reducedMotion = usePrefersReducedMotion();
  const source = useBackgroundSource(image, reducedMotion);
  // Freni kurulamayan hareketli resim: ilk karesi sabit.
  const [motionFailed, setMotionFailed] = useState<Animation | null>(null);
  const animation =
    source.kind === "animated" && motionFailed !== source.animation ? source.animation : null;
  const stillUrl =
    source.kind === "still"
      ? source.url
      : source.kind === "animated" && !animation
        ? source.still
        : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef<HTMLCanvasElement>(null);
  const motion = useRef<Motion | null>(null);
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
  // pencere boyutlanıyor, ölçüm sürüyor) bilinmeyen zemine göre ölçülmüş harita kullanılır.
  const measured = useRef<Measured | null>(null);
  const loaded = useRef<HTMLImageElement | null>(null);
  // Süren ölçüm (neyin, hangi boyda).
  const pending = useRef<{ source: Measured["source"]; width: number; height: number } | null>(
    null,
  );
  // Ekran boyu ve ne zamandan beri bu boyda olduğu.
  const size = useRef({ width: 0, height: 0, since: -Infinity });
  // Son ölçülen renk: pencere boyutlanırken yeniden ölçülene dek çubuk rengini değiştirmez.
  const lastColors = useRef<BarColors>(NO_IMAGE_COLORS);
  // Resim ölçülene dek kullanılan (bilinmeyen zemine göre) ölçüm.
  const fallback = useRef<Measured | null>(null);
  // Kırmızı payın artış/azalış bölüşümü: resmin ilk ölçümünden, resim değişene dek sabit
  // (pencere boyutlansa da): böylece herhangi iki karenin farkı payı geçmez (`flashBudgets`).
  const split = useRef<number | null>(null);
  const safeRef = useRef(safe);

  useEffect(() => {
    loaded.current = null;
    measured.current = null;
    pending.current = null;
    split.current = null;
    lastColors.current = NO_IMAGE_COLORS;
    // Önbellekten hemen gelen resimde `load` olayı React bağlanmadan geçmiş olabilir.
    const element = imageRef.current;
    if (stillUrl && element?.complete && element.naturalWidth > 0) loaded.current = element;
  }, [stillUrl, animation]);

  const onImageLoad = useCallback(() => {
    const element = imageRef.current;
    if (element && element.naturalWidth > 0) {
      loaded.current = element;
      measured.current = null;
      pending.current = null;
      split.current = null;
    }
  }, []);

  // Hareketli arka plan: görünen tuvalde parlaklık freni (kırmızı kanalıyla).
  useEffect(() => {
    const canvas = motionRef.current;
    if (!animation || !canvas) return;
    const gl = getWebGl2(canvas);
    const setup = gl ? createFlashGuard(gl, { safe: safeRef.current, red: true }) : null;
    if (!gl || !setup?.ok) {
      canvas.dataset.webgl = "off";
      setMotionFailed(animation);
      return;
    }
    canvas.dataset.webgl = "on";
    canvas.dataset.guard = setup.guard.storage;
    canvas.dataset.frames = String(animation.frames.length);
    const frame =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(1, 1)
        : document.createElement("canvas");
    motion.current = {
      animation,
      guard: setup.guard,
      frame,
      index: -1,
      clock: 0,
      shown: { primed: false, raw: false },
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      // Bağlam geri gelse de durum kayboldu: ilk kare sabit (güvenli yan).
      setMotionFailed(animation);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      motion.current = null;
      setup.guard.dispose();
    };
  }, [animation]);

  useEffect(() => {
    safeRef.current = safe;
    motion.current?.guard.setSafe(safe);
  }, [safe]);

  /** Hareketli arka planın bir karesi; çizildiyse tuvalin boyu (`null`: çizilemedi). */
  const drawMotion = useCallback(
    (dt: number): { width: number; height: number } | null => {
      const m = motion.current;
      const canvas = motionRef.current;
      if (!m || !canvas) return null;
      const { width, height } = fitCanvas(canvas);
      if (playing) m.clock += Math.max(0, Math.min(dt, 0.25)) * 1000;
      const { frames, durations, repetitions } = m.animation;
      const index = frameAt(m.clock, durations, repetitions);
      const changed = m.frame.width !== width || m.frame.height !== height || index !== m.index;
      if (changed) {
        m.frame.width = width;
        m.frame.height = height;
        const ctx = m.frame.getContext("2d") as
          CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
        if (!ctx) return null;
        try {
          drawCover(ctx, frames[index]!, m.animation.width, m.animation.height, width, height);
        } catch {
          return null;
        }
        m.index = index;
      }
      // Fren yalnızca Epilepsi güvenli modunda; kapalıyken her kare olduğu gibi ve yalnızca
      // değişince çizilir (açılınca fren o anki kareden sürer).
      const ok = presentMotion(m.guard, m.frame, m.shown, changed, safeRef.current, dt);
      return ok ? { width, height } : null;
    },
    [playing],
  );

  const onTick = useCallback(
    (frame: VisualFrame | null, dt: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Hareketli arka plan çubuklardan önce (aynı karede).
      const motionSize = animation ? drawMotion(dt) : null;
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

      // Ölçüm: resmin ya da hareketli resmin kendisi, resimsiz koyu zemin ya da (resim
      // yüklenirken, pencere boyutlanırken, ölçüm sürerken) bilinmeyen zemin. Her biri ekran boyuna
      // göre bir kez ölçülür; resmin ölçümü ayrı iş parçacığında.
      const want: Measured["source"] = animation
        ? animation
        : stillUrl
          ? (loaded.current ?? undefined)
          : source.kind === "none"
            ? null
            : undefined;
      const fits = (m: Measured | null, of: Measured["source"]) =>
        !!m && m.source === of && m.width === width && m.height === height;
      // Pencere boyutlanırken ölçüm boy durulunca yapılır.
      const now = performance.now();
      if (size.current.width !== width || size.current.height !== height) {
        size.current = { width, height, since: now };
      }
      let current = measured.current;
      if (!fits(current, want)) {
        const busy = pending.current;
        const stale =
          !busy || busy.source !== want || busy.width !== width || busy.height !== height;
        if (want && stale && now - size.current.since >= REMEASURE_MS) {
          const job = { source: want, width, height };
          pending.current = job;
          const still = want instanceof HTMLImageElement;
          const task = still
            ? measureImage(want, width, height)
            : measureAnimation(want, width, height, () => pending.current !== job);
          void task.then((result) => {
            if (pending.current !== job) return;
            pending.current = null;
            if (result) {
              measured.current = result;
              lastColors.current = result.colors;
            }
          });
        }
        const of = want === null ? null : undefined;
        current = fits(fallback.current, of) ? fallback.current : null;
        const colors = of === null ? NO_IMAGE_COLORS : lastColors.current;
        if (!current || current.colors !== colors) {
          current = {
            colors,
            map: measureLine(of === null ? NO_IMAGE : UNKNOWN, width, height, colors),
            source: of,
            width,
            height,
          };
          fallback.current = current;
        }
        if (of === null) measured.current = current;
      }
      if (!current) return;
      const { colors, map } = current;
      // Ölçüm hazır mı (denetim için): resme ya da resimsiz zemine göre.
      const ready = current.source === undefined ? "off" : "on";
      if (canvas.dataset.measured !== ready) canvas.dataset.measured = ready;
      // Bölüşüm yalnızca gerçek zemine göre ölçülmüş haritadan (resim ya da resimsiz zemin).
      if (split.current === null && current.source !== undefined) split.current = redSplit(map);
      // Ölçüm pikseli CSS pikselinden küçük olabilir (çok geniş ekran).
      const scale = map.geometry.width / width;
      const geometry = barGeometry(width, height);
      // Hedef boylar ve bu karenin parlama sınırı (ölçüm pikseliyle hesaplanır).
      const wanted = targetExtents(levels.current, geometry, safe);
      // Hareketli arka planda paylar frenle birlikte (fren kurulduysa onun tuvali; çizilemediyse
      // de hareketli paylar: güvenli yan).
      // Parlama sınırı yalnızca Epilepsi güvenli modunda (proje sahibinin kararı, 24 Ekim 2026:
      // varsayılanda sınırlama yok); kapalıyken çubuklar istenen boyda.
      let limited = wanted;
      if (safe) {
        const budgets = animation
          ? animatedBudgets(
              safe,
              split.current,
              motionSize?.width ?? width * ratio,
              motionSize?.height ?? height * ratio,
            )
          : flashBudgets(safe, split.current);
        limited = limitExtents(
          map,
          wanted.map((e) => e * scale),
          budgets,
        ).map((e) => e / scale);
      }

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      // Işık toplanır: tuvalin içinde de, resmin üstünde de (CSS `mix-blend-mode: plus-lighter`).
      // Önce ışıltı (çubuk aralığı genişliğinde dikdörtgenlerin Gauss bulanıklığı), sonra öz.
      // Parlama hesabı bu modele göre (src/lib/photoScene.ts `measureLine`).
      ctx.globalCompositeOperation = "lighter";
      const [gr, gg, gb] = colors.glow;
      ctx.filter = glowFilter(geometry.sigma, ratio);
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
    [playing, safe, animation, stillUrl, source.kind, drawMotion],
  );
  useVisualFeed(playing, onTick);
  const turkish = isTurkishText(title, artist);

  return (
    <div className="photo-scene">
      {animation ? (
        <canvas ref={motionRef} className="photo-scene__image photo-scene__motion" aria-hidden />
      ) : stillUrl ? (
        <img
          ref={imageRef}
          className="photo-scene__image"
          src={stillUrl}
          alt=""
          draggable={false}
          onLoad={onImageLoad}
        />
      ) : (
        source.kind === "none" && (
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
