/**
 * İnce ayrıntılı spektrum çubukları ("Kendi resmin" sahnesi). Seviyeleri çekirdek hesaplar
 * (`getVisualSpectrum`, src-tauri/src/audio/spectrum.rs: 200 çubuk, 40 Hz – 16 kHz logaritmik,
 * bas uzun pencereden); burada yalnızca çubukların zamanda ilerlemesi (hemen yükselir, hızla
 * söner: vuruşta iner, kalkar) ve çekirdek yokken (tarayıcı önizlemesi) analiz karesinin
 * bantlarından yedek çubuklar.
 */

/** Sönme hızı: çubuk her saniye boyunun bu kadarını (1 − e^(−dt/τ)) bırakır. */
const RELEASE_TAU = 0.085;
/** Yedek çubuklarda seviye eğrisi: >1 sessiz bantları küçültür. */
const LEVEL_CURVE = 1.35;

/**
 * Çekirdeğin çubukları gelmediyse (tarayıcı önizlemesi) analiz karesinin 32 bandından çubuklar:
 * soldan sağa doğrusal ara değerle.
 */
export function barTargetsFromBands(bands: readonly number[], count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    if (bands.length === 0) return 0;
    const pos = (i / Math.max(1, count - 1)) * (bands.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(bands.length - 1, lo + 1);
    const t = pos - lo;
    const v = (bands[lo] ?? 0) * (1 - t) + (bands[hi] ?? 0) * t;
    return Math.max(0, Math.min(1, v)) ** LEVEL_CURVE;
  });
}

/** Çubukları `dt` saniye ilerletir: hedef yüksekse hemen ona çıkar, alçaksa üstel söner. */
export function stepBars(
  prev: readonly number[],
  targets: readonly number[],
  dt: number,
): number[] {
  const keep = Math.exp(-Math.max(0, Math.min(dt, 0.25)) / RELEASE_TAU);
  return targets.map((target, i) => {
    const old = prev[i] ?? 0;
    return target >= old ? target : target + (old - target) * keep;
  });
}
