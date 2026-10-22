import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { CrossfeedControls } from "../hooks/useCrossfeed";
import { formatGain, formatHz, frequencyToRatio } from "../lib/eq";
import {
  CROSSFEED_FLOOR_DB,
  CROSSFEED_HINTS,
  CROSSFEED_LIMITS,
  CUTOFF_STEP_HZ,
  LEVEL_STEP_DB,
  crossfeedCurvePath,
  formatDelayUs,
  matchCrossfeedPreset,
} from "../lib/crossfeed";

const PLOT_WIDTH = 1000;
const PLOT_HEIGHT = 120;
const GRID_DB = [0, -12, -24];
const AXIS_HZ = [50, 200, 1000, 5000, 20000];

/**
 * Crossfeed: kulaklıkta hoparlörden dinler gibi. Aç/kapa, dört hazır ayar, gelişmiş ayar (kesim
 * frekansı ve seviye farkı) ve sola kaydırılmış bir sesin iki kulağa nasıl gittiğinin eğrisi.
 */
export function CrossfeedStrip({
  crossfeed,
  bypassed = false,
}: {
  crossfeed: CrossfeedControls;
  bypassed?: boolean;
}) {
  const { settings, state, update, error } = crossfeed;
  const [advanced, setAdvanced] = useState(false);
  const id = useId();
  const enabled = settings.enabled;
  const preset = matchCrossfeedPreset(settings, state.presets);
  const { minCutoffHz, maxCutoffHz, minLevelDb, maxLevelDb } = CROSSFEED_LIMITS;
  const near = crossfeedCurvePath(state.curveHz, state.nearDb, PLOT_WIDTH, PLOT_HEIGHT);
  const far = crossfeedCurvePath(state.curveHz, state.farDb, PLOT_WIDTH, PLOT_HEIGHT);
  // Ok tuşları şarkıyı sarmasın.
  const keepArrows = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key.startsWith("Arrow")) event.stopPropagation();
  };

  return (
    <div
      className={`xf${enabled && !bypassed ? "" : " is-off"}`}
      role="group"
      aria-label="Crossfeed"
    >
      <div className="xf__head">
        <span className="hp__title">Crossfeed</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Crossfeed"
          className={`switch${enabled ? " is-on" : ""}`}
          onClick={() => update((s) => ({ ...s, enabled: !s.enabled }))}
          title="Crossfeed'i aç / kapat (ayar kaybolmaz)"
        >
          <span className="switch__knob" aria-hidden />
          <span>{enabled ? "Açık" : "Kapalı"}</span>
        </button>
        <span className="hp__meta">
          {preset ?? "Özel ayar"} · kulaklar arası zaman farkı {formatDelayUs(state.delayUs)}
        </span>
      </div>
      <p className="hp__hint xf__hint">
        Kulaklıkta hoparlörden dinler gibi: sola ya da sağa kaydırılmış sesler karşı kulağa da biraz
        gider, ses kafanın içinden önünüze çıkar. Ortadaki ses (vokal, bas, davul) hiç değişmez.
        Hoparlörle dinlerken kapalı tutun.
      </p>

      <div className="xf__presets" role="group" aria-label="Crossfeed hazır ayarları">
        {state.presets.map((p) => {
          const selected = enabled && preset === p.name;
          return (
            <button
              key={p.name}
              type="button"
              className={`chip chip--button${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              title={CROSSFEED_HINTS[p.name]}
              onClick={() =>
                update(() => ({ enabled: true, cutoffHz: p.cutoffHz, levelDb: p.levelDb }))
              }
            >
              {p.name}
            </button>
          );
        })}
        <button
          type="button"
          className="chip chip--button xf__more"
          aria-expanded={advanced}
          aria-controls={`${id}-advanced`}
          onClick={() => setAdvanced((open) => !open)}
        >
          Gelişmiş
        </button>
      </div>

      {advanced && (
        <div className="xf__advanced" id={`${id}-advanced`}>
          <div className="bass__row">
            <label className="bass__label xf__label" htmlFor={`${id}-cutoff`}>
              Kesim
            </label>
            <input
              id={`${id}-cutoff`}
              className="bass__slider bass__slider--depth"
              type="range"
              aria-valuetext={`${Math.round(settings.cutoffHz)} Hz`}
              min={minCutoffHz}
              max={maxCutoffHz}
              step={CUTOFF_STEP_HZ}
              value={settings.cutoffHz}
              style={
                {
                  "--fill": (settings.cutoffHz - minCutoffHz) / (maxCutoffHz - minCutoffHz),
                } as CSSProperties
              }
              onChange={(event) => update((s) => ({ ...s, cutoffHz: Number(event.target.value) }))}
              onKeyDown={keepArrows}
            />
            <output className="bass__depth xf__value" htmlFor={`${id}-cutoff`}>
              {Math.round(settings.cutoffHz)} Hz
            </output>
          </div>
          <div className="bass__row">
            <label className="bass__label xf__label" htmlFor={`${id}-level`}>
              Seviye
            </label>
            <input
              id={`${id}-level`}
              className="bass__slider bass__slider--depth"
              type="range"
              aria-valuetext={`${formatGain(-settings.levelDb)} dB`}
              min={minLevelDb}
              max={maxLevelDb}
              step={LEVEL_STEP_DB}
              value={settings.levelDb}
              style={
                {
                  "--fill": (settings.levelDb - minLevelDb) / (maxLevelDb - minLevelDb),
                } as CSSProperties
              }
              onChange={(event) => update((s) => ({ ...s, levelDb: Number(event.target.value) }))}
              onKeyDown={keepArrows}
            />
            <output className="bass__depth xf__value" htmlFor={`${id}-level`}>
              {formatGain(-settings.levelDb)} dB
            </output>
          </div>
          <p className="bass__hint">
            Kesim: karşı kulağa giden sesin hangi frekanstan sonra azaldığı (düşük = daha uzak
            hoparlör). Seviye: basta karşı kulağın ne kadar kısık olduğu (küçük = daha güçlü
            crossfeed). Zaman farkı kesimden gelir: 1/(2π·kesim).
          </p>
        </div>
      )}

      <figure className="xf__plot" aria-label="Sola kaydırılmış bir sesin iki kulağa gidişi">
        <svg viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`} preserveAspectRatio="none" aria-hidden>
          {GRID_DB.map((db) => (
            <line
              key={db}
              className="eq__grid"
              x1={0}
              x2={PLOT_WIDTH}
              y1={(-db / CROSSFEED_FLOOR_DB) * PLOT_HEIGHT}
              y2={(-db / CROSSFEED_FLOOR_DB) * PLOT_HEIGHT}
            />
          ))}
          <path className="xf__line xf__line--near" d={near} />
          <path className="xf__line xf__line--far" d={far} />
        </svg>
        <div className="xf__axis" aria-hidden>
          {AXIS_HZ.map((hz) => (
            <span key={hz} style={{ left: `${frequencyToRatio(hz) * 100}%` }}>
              {formatHz(hz)}
            </span>
          ))}
        </div>
        <figcaption className="xf__legend">
          <span className="xf__key xf__key--near">Aynı kulak</span>
          <span className="xf__key xf__key--far">Karşı kulak</span>
          <span>0 / −12 / −24 dB</span>
        </figcaption>
      </figure>

      {error && <p className="library__notice library__problem hp__error">{error}</p>}
    </div>
  );
}
