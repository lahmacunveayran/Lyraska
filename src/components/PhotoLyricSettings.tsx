import { useRef } from "react";
import type { PhotoLyricLookControls } from "../hooks/usePhotoLyricLook";
import {
  DEFAULT_LOOK,
  LYRIC_COLORS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  TOP_MAX,
  TOP_MIN,
  TOP_STEP,
  formatScale,
  formatTop,
  type LyricBackdrop,
  type LyricPlace,
} from "../lib/photoLyricLook";

const PLACES: readonly { id: LyricPlace; name: string }[] = [
  { id: "title", name: "Başlığın altında" },
  { id: "top", name: "Üstte" },
];

const BACKDROPS: readonly { id: LyricBackdrop; name: string }[] = [
  { id: "auto", name: "Otomatik" },
  { id: "off", name: "Kapalı" },
];

/**
 * "Kendi resmin" sözlerinin görünümü (galeride, resmin ve parçacıkların altında): boyut, yer
 * (yükseklik), renk (hazır ya da özel) ve arkadaki zemin. Değişiklik sahnede hemen görünür.
 */
export function PhotoLyricSettings({ controls }: { controls: PhotoLyricLookControls }) {
  const { look, update, reset } = controls;
  const preset = LYRIC_COLORS.find((c) => c.color === look.color);
  const isDefault = JSON.stringify(look) === JSON.stringify(DEFAULT_LOOK);
  // "Varsayılana dön" basılınca kapanır: klavye odağı sayfaya düşmesin, ilk ayara geçer.
  const first = useRef<HTMLInputElement>(null);
  return (
    <section className="scene-gallery__section" role="group" aria-label="Şarkı sözlerinin görünümü">
      <h3 className="scene-gallery__heading">Sözler</h3>
      <label className="scene-gallery__speed">
        <span>Boyut</span>
        <input
          ref={first}
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          value={look.scale}
          aria-label="Sözlerin boyutu"
          aria-valuetext={formatScale(look.scale)}
          onChange={(event) => update({ scale: Number(event.target.value) })}
        />
        <output aria-hidden>{formatScale(look.scale)}</output>
      </label>

      <div className="scene-gallery__chips" role="group" aria-label="Sözlerin yeri">
        {PLACES.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className="scene-gallery__chip"
            aria-pressed={look.place === id}
            onClick={() => update({ place: id })}
          >
            {name}
          </button>
        ))}
      </div>
      {look.place === "top" ? (
        <label className="scene-gallery__speed">
          <span>Yükseklik</span>
          <input
            type="range"
            min={TOP_MIN}
            max={TOP_MAX}
            step={TOP_STEP}
            value={look.top}
            aria-label="Sözlerin yüksekliği (ekranın üstünden)"
            aria-valuetext={formatTop(look.top)}
            onChange={(event) => update({ top: Number(event.target.value) })}
          />
          <output aria-hidden>{formatTop(look.top)}</output>
        </label>
      ) : (
        <p className="scene-gallery__milk-line">
          Sinema görünümünde başlığın altında; düğmeler görünürken üst ortada.
        </p>
      )}

      <div className="scene-gallery__chips lyric-colors" role="group" aria-label="Sözlerin rengi">
        {LYRIC_COLORS.map(({ id, name, color }) => (
          <button
            key={id}
            type="button"
            className="scene-gallery__chip lyric-colors__swatch"
            aria-pressed={look.color === color}
            onClick={() => update({ color })}
          >
            <span className="lyric-colors__dot" style={{ background: color }} aria-hidden />
            {name}
          </button>
        ))}
        <label
          className={`scene-gallery__chip lyric-colors__swatch lyric-colors__custom${
            preset ? "" : " is-on"
          }`}
        >
          <input
            type="color"
            value={look.color}
            aria-label={preset ? "Özel renk" : "Özel renk (seçili)"}
            onChange={(event) => update({ color: event.target.value })}
          />
          Özel…
        </label>
      </div>

      <div className="scene-gallery__chips" role="group" aria-label="Sözlerin zemini">
        <span className="lyric-colors__label">Zemin</span>
        {BACKDROPS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className="scene-gallery__chip"
            aria-pressed={look.backdrop === id}
            onClick={() => update({ backdrop: id })}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="scene-gallery__milk-line">
        Otomatik zemin yazının arkasını resmin o bölgesine göre koyulaştırır: yazı açık renkli
        resimde de okunur.
      </p>
      <div className="scene-gallery__chips">
        <button
          type="button"
          className="scene-gallery__button"
          disabled={isDefault}
          onClick={() => {
            reset();
            first.current?.focus();
          }}
        >
          Varsayılana dön
        </button>
      </div>
    </section>
  );
}
