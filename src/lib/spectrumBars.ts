/**
 * İnce ayrıntılı spektrum çubukları ("Kendi resmin" sahnesi). Seviyeleri çekirdek hesaplar
 * (`getVisualSpectrum`, src-tauri/src/audio/spectrum.rs: 200 çubuk, 20 Hz – 2 kHz doğrusal);
 * burada yalnızca çubukların zamanda ilerlemesi ve çekirdek yokken (tarayıcı önizlemesi) analiz
 * karesinin bantlarından yedek çubuklar. Örnek videolarda her kare kendi spektrumuydu: sönme
 * eklemek ölçümle uyumu artırmadı (20 ms'de en iyi, 40 ms'den sonra kötüleşti).
 */

/** Sönme süresi (s): çubuk `dt`'de yüksekliğinin `e^(−dt/τ)` kadarını korur. */
export const RELEASE_TAU = 0.02;
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

/**
 * Bu karenin hedefleri: çekirdeğin çubukları (`core`, tam `count` seviye) varsa onlar, yoksa
 * (istek sürüyor, tarayıcı önizlemesi, çalan oturum yokken çekirdeğin boş dizisi) analiz karesinin
 * bantlarından. Sayısı tutmayan dizi kullanılmaz: boş dizi çizgiyi (sessizlik çentikleri dahil)
 * tümden silerdi.
 */
export function barTargets(
  core: readonly number[] | null,
  bands: readonly number[],
  count: number,
): number[] {
  if (!core || core.length !== count) return barTargetsFromBands(bands, count);
  return core.map((v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0));
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
