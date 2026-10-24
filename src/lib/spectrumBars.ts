/**
 * İnce ayrıntılı spektrum çubukları ("Kendi resmin" sahnesi): çekirdeğin görseller için tuttuğu
 * ham dalganın (`getVisualWaveform`: 44,1 kHz, 1024 örnek, o an duyulan an) her karede Fourier
 * dönüşümü. Çubuklar 40 Hz – 16 kHz arasında logaritmik dizilir (bas solda); her çubuk kendi
 * frekans aralığının en güçlü bileşenini gösterir. Tizler doğal olarak zayıf olduğundan oktav
 * başına +3 dB eğimle dengelenir. Çubuk hemen yükselir, hızla söner: vuruşta iner, kalkar.
 */

/** Dalga biçimindeki örnek sayısı (kanal başına) ve örnekleme hızı. */
export const WAVE_SAMPLES = 1024;
export const WAVE_RATE = 44100;
/** Çubukların kapsadığı frekans aralığı (Hz). */
const MIN_HZ = 40;
const MAX_HZ = 16000;
/** Gösterilen ses aralığı (dB, tam ölçekli sinüs 0 dB): altı boş, üstü dolu. */
const FLOOR_DB = -62;
const RANGE_DB = 56;
/** Oktav başına eğim (dB), 1 kHz'e göre. */
const TILT_DB_PER_OCTAVE = 3;
/** Sönme hızı: çubuk her saniye boyunun bu kadarını (1 − e^(−dt/τ)) bırakır. */
const RELEASE_TAU = 0.11;
/** Seviye eğrisi: >1 sessiz bileşenleri küçültür, vuruşları öne çıkarır. */
const LEVEL_CURVE = 1.35;

/** Hann penceresi (dalganın uçlarındaki sıçrama spektruma yayılmasın). */
const HANN = Float64Array.from(
  { length: WAVE_SAMPLES },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WAVE_SAMPLES - 1)),
);

/**
 * Gerçek sinyalin genlik spektrumu (`n/2` kutu; `n` ikinin kuvveti): yerinde, yinelemeli
 * radix-2 FFT. Tam ölçekli sinüs (Hann pencereli) kendi kutusunda ≈ 1 verir.
 */
export function magnitudes(signal: ArrayLike<number>): Float64Array {
  const n = signal.length;
  const re = Float64Array.from(signal);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const cos = Math.cos(step * k);
        const sin = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const tr = re[b]! * cos - im[b]! * sin;
        const ti = re[b]! * sin + im[b]! * cos;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
      }
    }
  }
  // Hann penceresinin genlik kazancı 0,5; tek yanlı spektrum için ×2: 4/n.
  const out = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = (Math.hypot(re[k]!, im[k]!) * 4) / n;
  return out;
}

/** Çubuğun frekans aralığı (FFT kutusu cinsinden, kesirli). */
export interface BarBand {
  from: number;
  to: number;
  /** Aralığın orta frekansı (eğim için). */
  hz: number;
}

/** `count` çubuğun logaritmik frekans aralıkları. */
export function barBands(count: number, size = WAVE_SAMPLES, rate = WAVE_RATE): BarBand[] {
  const binHz = rate / size;
  const ratio = MAX_HZ / MIN_HZ;
  return Array.from({ length: count }, (_, i) => {
    const lo = MIN_HZ * ratio ** (i / count);
    const hi = MIN_HZ * ratio ** ((i + 1) / count);
    return { from: lo / binHz, to: hi / binHz, hz: Math.sqrt(lo * hi) };
  });
}

/** Kesirli kutudaki genlik (komşu iki kutu arası doğrusal): bas çubukları aynı kutuyu paylaşmasın. */
function at(spectrum: Float64Array, bin: number): number {
  const lo = Math.max(0, Math.min(spectrum.length - 1, Math.floor(bin)));
  const hi = Math.min(spectrum.length - 1, lo + 1);
  const t = Math.max(0, Math.min(1, bin - lo));
  return spectrum[lo]! * (1 - t) + spectrum[hi]! * t;
}

/**
 * Dalgadan çubuk hedefleri (0..1). `wave`: çekirdeğin baytları (karışım, sol, sağ; 128 sessizlik);
 * yalnızca karışım kullanılır. Dalga yoksa hepsi 0.
 */
export function barTargetsFromWave(wave: Uint8Array | null, bands: readonly BarBand[]): number[] {
  if (!wave || wave.length < WAVE_SAMPLES) return bands.map(() => 0);
  const signal = new Float64Array(WAVE_SAMPLES);
  for (let i = 0; i < WAVE_SAMPLES; i++) signal[i] = ((wave[i]! - 128) / 128) * HANN[i]!;
  const spectrum = magnitudes(signal);
  return bands.map(({ from, to, hz }) => {
    // Aralığın en güçlü bileşeni: dar aralıkta (bas) kesirli kutu, genişte en büyük kutu.
    let peak = Math.max(at(spectrum, from), at(spectrum, to));
    for (let k = Math.ceil(from); k <= Math.floor(to) && k < spectrum.length; k++) {
      peak = Math.max(peak, spectrum[k]!);
    }
    const db = 20 * Math.log10(Math.max(peak, 1e-9)) + TILT_DB_PER_OCTAVE * Math.log2(hz / 1000);
    const level = Math.max(0, Math.min(1, (db - FLOOR_DB) / RANGE_DB));
    return level ** LEVEL_CURVE;
  });
}

/**
 * Dalga gelmediyse (tarayıcı önizlemesi, eski çekirdek) analiz karesinin 32 bandından çubuklar:
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
