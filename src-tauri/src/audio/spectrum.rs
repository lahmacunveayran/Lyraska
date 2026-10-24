//! İnce spektrum çubukları ("Kendi resmin" sahnesi): çalan sesin o an duyulan kısmının Fourier
//! dönüşümünden 200 çubuk, 40 Hz – 16 kHz arasında logaritmik (bas solda).
//!
//! **İki çözünürlük.** Logaritmik dizilişte bir çubuk komşusundan yalnızca ~%3 yüksek frekanstadır:
//! 60 Hz'te çubuk ~1,8 Hz genişliğindedir. 1024 örneklik pencerenin kutusu ise 43 Hz'tir; bas
//! çubuklarının çoğu aynı kutuyu paylaşır, bas tek düzgün bir tümsek gibi görünür. Bu yüzden
//! ~500 Hz'in altındaki çubuklar 4096 örneklik pencereden (10,8 Hz kutu; 4 kat sıfır
//! dolgusuyla 2,7 Hz aralıklı örneklenir) okunur: 60 Hz ile 80 Hz ayrı çubuklarda tepe yapar,
//! bas çubukları birbirinden bağımsız iner kalkar. Üstündeki çubuklar zaten birkaç kutu
//! genişliğindedir; onlar kısa (1024 örnek) pencereden okunur ve tizler çabuk tepki verir.
//!
//! **Zaman.** İki pencere de duyulan anın üstüne ortalanır (dokunuşta duyulan andan 2 sn öndeki
//! örnekler de vardır): uzun pencere bası geciktirmez, kısa pencereyle aynı ana bakar. Hann
//! penceresiyle uzun pencerenin etkin süresi ~±25 ms'dir.
//!
//! İki pencerenin geçişi [`BLEND_FROM_HZ`]–[`BLEND_TO_HZ`] arasında yumuşaktır (dB'de karışım):
//! gürültü gibi sesler uzun pencerede ~6 dB zayıf görünür (sinüse göre ölçeklenen spektrumda
//! gürültünün kutu başına payı pencere uzadıkça azalır); tek sınırda çubuk sırası basamak yapardı.
//!
//! **Seviye.** Her çubuk kendi frekans aralığının en güçlü bileşenini gösterir. Tizler doğal
//! olarak zayıf olduğundan oktav başına +2 dB eğimle dengelenir; genlik [`REF_DB`]'ye göre
//! doğrusal olarak 0..1'e eşlenir (dB ölçeği değil): güçlü bileşenler belirgin iner, zayıflar
//! çizgide kısa uçlar olarak kalır; çubuklar ayrı ayrı, tırtıklı görünür (müzik görselleştirme
//! videolarındaki gibi; proje sahibinin örneği). Sesler −14 LUFS eşitleme kazancıyla gelir
//! (`player`), şarkıdan şarkıya ölçek aynı kalır. Çubuğun sönmesi arayüzde yapılır
//! (`src/lib/spectrumBars.ts`).
//!
//! Komut iş parçacığında çalışır (ses çıkışına dokunmaz); FFT planları bir kez kurulur.

use std::sync::{Arc, OnceLock};

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

use super::waveform::WAVEFORM_RATE;
use super::Sample;

/// Çubuk sayısı (arayüzde `PHOTO_BARS`).
pub const BARS: usize = 200;
/// Uzun pencere (bas çubukları) ve kısa pencere (geri kalanı), örnek.
pub const LONG: usize = 4096;
pub const SHORT: usize = 1024;
/// Uzun pencerenin sıfır dolgusu: spektrum 10,8 / 4 = 2,7 Hz aralıkla örneklenir.
const LONG_PAD: usize = 4;
/// Çubukların kapsadığı frekans aralığı (Hz).
const MIN_HZ: f64 = 40.0;
const MAX_HZ: f64 = 16_000.0;
/// Bu frekansın altındaki çubuklar yalnızca uzun pencereden, [`BLEND_TO_HZ`]'in üstündekiler
/// yalnızca kısa pencereden okunur; arada ikisi dB'de karışır (Hz). 500 Hz'te çubuk ~15 Hz
/// genişliğinde: uzun pencerenin kutusundan geniş, kısa pencerenin kutusunun üçte biri.
pub const BLEND_FROM_HZ: f64 = 350.0;
pub const BLEND_TO_HZ: f64 = 700.0;
/// Çubuğu dolduran genlik (dB, tam ölçekli sinüs 0 dB; eğimden sonra).
const REF_DB: f64 = -18.0;
/// Oktav başına eğim (dB), 1 kHz'e göre.
const TILT_DB_PER_OCTAVE: f64 = 2.0;

/// Bir çubuğun frekans aralığı.
#[derive(Debug, Clone, Copy)]
struct Band {
    lo_hz: f64,
    hi_hz: f64,
    /// Aralığın (logaritmik) ortası: eğim için.
    hz: f64,
}

/// Bir pencere boyu için FFT planı, Hann penceresi ve genlik ölçeği.
struct Transform {
    fft: Arc<dyn Fft<Sample>>,
    window: Vec<Sample>,
    /// Dolgulu FFT uzunluğu.
    padded: usize,
    /// Tam ölçekli sinüs kendi kutusunda 1 versin: 2 / Σw.
    scale: Sample,
}

impl Transform {
    fn new(planner: &mut FftPlanner<Sample>, len: usize, pad: usize) -> Self {
        let window: Vec<Sample> = (0..len)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (len - 1) as f64).cos())
            .collect();
        let sum: Sample = window.iter().sum();
        let padded = len * pad;
        Self {
            fft: planner.plan_fft_forward(padded),
            window,
            padded,
            scale: 2.0 / sum.max(f64::MIN_POSITIVE),
        }
    }

    /// `signal`'in (pencere boyunda) genlik spektrumu: `padded / 2 + 1` kutu.
    fn magnitudes(&self, signal: &[Sample]) -> Vec<Sample> {
        let mut buffer = vec![Complex::new(0.0, 0.0); self.padded];
        for ((slot, &x), &w) in buffer.iter_mut().zip(signal).zip(&self.window) {
            let x = if x.is_finite() { x } else { 0.0 };
            *slot = Complex::new(x * w, 0.0);
        }
        self.fft.process(&mut buffer);
        buffer[..self.padded / 2 + 1]
            .iter()
            .map(|c| c.norm() * self.scale)
            .collect()
    }

    /// Kutu genişliği (Hz).
    fn bin_hz(&self) -> f64 {
        f64::from(WAVEFORM_RATE) / self.padded as f64
    }
}

struct Plans {
    long: Transform,
    short: Transform,
    bands: Vec<Band>,
}

fn plans() -> &'static Plans {
    static PLANS: OnceLock<Plans> = OnceLock::new();
    PLANS.get_or_init(|| {
        let mut planner = FftPlanner::new();
        let ratio = MAX_HZ / MIN_HZ;
        let bands = (0..BARS)
            .map(|i| {
                let lo_hz = MIN_HZ * ratio.powf(i as f64 / BARS as f64);
                let hi_hz = MIN_HZ * ratio.powf((i + 1) as f64 / BARS as f64);
                Band {
                    lo_hz,
                    hi_hz,
                    hz: (lo_hz * hi_hz).sqrt(),
                }
            })
            .collect();
        Plans {
            long: Transform::new(&mut planner, LONG, LONG_PAD),
            short: Transform::new(&mut planner, SHORT, 1),
            bands,
        }
    })
}

/// Kesirli kutudaki genlik (komşu iki kutu arası doğrusal).
fn at(spectrum: &[Sample], bin: f64) -> Sample {
    let last = spectrum.len().saturating_sub(1);
    let lo = (bin.max(0.0).floor() as usize).min(last);
    let hi = (lo + 1).min(last);
    let t = (bin - lo as f64).clamp(0.0, 1.0);
    spectrum.get(lo).copied().unwrap_or(0.0) * (1.0 - t)
        + spectrum.get(hi).copied().unwrap_or(0.0) * t
}

/// `lo_hz`–`hi_hz` aralığının en güçlü bileşeni: uçlardaki (kesirli) değerler ve aradaki kutular.
fn peak(spectrum: &[Sample], bin_hz: f64, band: &Band) -> Sample {
    let from = band.lo_hz / bin_hz;
    let to = band.hi_hz / bin_hz;
    let mut peak = at(spectrum, from).max(at(spectrum, to));
    let first = from.ceil() as usize;
    let last = (to.floor() as usize).min(spectrum.len().saturating_sub(1));
    if first <= last {
        for &v in &spectrum[first..=last] {
            peak = peak.max(v);
        }
    }
    peak
}

/// Bunun altı sessizlik (dB): çubuk tam 0.
const SILENT_DB: f64 = -120.0;

fn to_db(amplitude: Sample) -> f64 {
    20.0 * amplitude.max(1e-9).log10()
}

/// Uzun pencerenin payı: [`BLEND_FROM_HZ`] altında 1, [`BLEND_TO_HZ`] üstünde 0, arada
/// logaritmik frekansta doğrusal.
fn long_share(hz: f64) -> f64 {
    1.0 - ((hz / BLEND_FROM_HZ).ln() / (BLEND_TO_HZ / BLEND_FROM_HZ).ln()).clamp(0.0, 1.0)
}

/// Genlikten (dB) çubuk seviyesi (0..1).
fn level(db: f64, hz: f64) -> f32 {
    if db <= SILENT_DB {
        return 0.0;
    }
    let db = db + TILT_DB_PER_OCTAVE * (hz / 1000.0).log2();
    10f64.powf((db - REF_DB) / 20.0).clamp(0.0, 1.0) as f32
}

/// [`BARS`] çubuğun seviyesi (0..1, bas solda). `signal`: 44,1 kHz tek kanallı [`LONG`] örnek,
/// duyulan an tam ortada (`LONG / 2`. örnek); kısa pencere de aynı ana ortalanır. Daha kısa
/// gelen sinyalin eksiği sessizlik sayılır.
pub fn bar_levels(signal: &[Sample]) -> Vec<f32> {
    let plans = plans();
    let mut long = vec![0.0; LONG];
    let n = signal.len().min(LONG);
    long[..n].copy_from_slice(&signal[..n]);
    let start = (LONG - SHORT) / 2;
    let long_spectrum = plans.long.magnitudes(&long);
    let short_spectrum = plans.short.magnitudes(&long[start..start + SHORT]);
    let (long_bin, short_bin) = (plans.long.bin_hz(), plans.short.bin_hz());
    plans
        .bands
        .iter()
        .map(|band| {
            let share = long_share(band.hz);
            let mut db = 0.0;
            if share > 0.0 {
                db += share * to_db(peak(&long_spectrum, long_bin, band));
            }
            if share < 1.0 {
                db += (1.0 - share) * to_db(peak(&short_spectrum, short_bin, band));
            }
            level(db, band.hz)
        })
        .collect()
}

/// Duyulan ses yokken (duraklatıldı, şarkı bitti): hepsi 0.
pub fn silence() -> Vec<f32> {
    vec![0.0; BARS]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    /// `parts` (frekans, genlik) sinüslerinin toplamı, [`LONG`] örnek.
    fn tones(parts: &[(f64, f64)]) -> Vec<Sample> {
        (0..LONG)
            .map(|n| {
                parts
                    .iter()
                    .enumerate()
                    .map(|(k, &(hz, amp))| {
                        amp * (2.0 * PI * hz * n as f64 / f64::from(WAVEFORM_RATE) + k as f64).sin()
                    })
                    .sum()
            })
            .collect()
    }

    fn bar_of(hz: f64) -> usize {
        plans()
            .bands
            .iter()
            .position(|b| b.lo_hz <= hz && hz < b.hi_hz)
            .unwrap()
    }

    fn peak_bar(levels: &[f32]) -> usize {
        levels
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .unwrap()
            .0
    }

    #[test]
    fn bas_cubuklari_bagimsiz_60_ve_80_hz_ayri_cubukta_tepe_yapar() {
        // Çubuğu doldurmayan genlik (−34 dB): tepe kırpılmaz, komşular karşılaştırılabilir.
        let low = bar_levels(&tones(&[(60.0, 0.02)]));
        let high = bar_levels(&tones(&[(80.0, 0.02)]));
        assert_eq!(low.len(), BARS);
        let (a, b) = (peak_bar(&low), peak_bar(&high));
        assert!(a.abs_diff(bar_of(60.0)) <= 1, "60 Hz tepesi {a}");
        assert!(b.abs_diff(bar_of(80.0)) <= 1, "80 Hz tepesi {b}");
        assert!(b >= a + 8, "ayrı çubuklar: {a}, {b}");
        // Bağımsız: 60 Hz'lik ses 80 Hz'in çubuğunda ~20 dB zayıf (1024 örneklik pencerede
        // ikisi aynı kutudaydı, çubuk tepenin ~%95'i olurdu).
        assert!(
            low[b] < 0.2 * low[a],
            "60 Hz → 80 Hz çubuğu {} / {}",
            low[b],
            low[a]
        );
        assert!(
            high[a] < 0.2 * high[b],
            "80 Hz → 60 Hz çubuğu {} / {}",
            high[a],
            high[b]
        );
        // Birlikte çalınan 60 ve 90 Hz arasında çukur kalır: iki ayrı tepe.
        let both = bar_levels(&tones(&[(60.0, 0.02), (90.0, 0.02)]));
        let (p, q) = (bar_of(60.0), bar_of(90.0));
        let dip = both[p + 2..q - 1].iter().copied().fold(f32::MAX, f32::min);
        assert!(dip < 0.6 * both[p].min(both[q]), "çukur {dip}");
    }

    #[test]
    fn orta_ve_tiz_kendi_cubugunda_uzak_cubuklar_sessiz() {
        for hz in [1_000.0, 8_000.0] {
            let levels = bar_levels(&tones(&[(hz, 0.8)]));
            let top = peak_bar(&levels);
            assert!(top.abs_diff(bar_of(hz)) <= 3, "{hz} Hz tepesi {top}");
            assert!(levels[top] > 0.8, "{hz} Hz seviyesi {}", levels[top]);
            assert!(levels[bar_of(100.0)] < 0.15, "{hz} Hz → 100 Hz");
        }
        let mid = bar_levels(&tones(&[(1_000.0, 0.8)]));
        assert!(mid[bar_of(8_000.0)] < 0.15);
    }

    #[test]
    fn sessizlik_sifir_seviyeler_0_ile_1_arasinda() {
        assert!(bar_levels(&vec![0.0; LONG]).iter().all(|&v| v == 0.0));
        assert!(
            bar_levels(&[]).iter().all(|&v| v == 0.0),
            "eksik sinyal sessiz"
        );
        assert_eq!(silence(), vec![0.0; BARS]);
        // Taşan gürültü ve bozuk örnekler de 0..1'de kalır.
        let mut seed = 1u64;
        let mut noise: Vec<Sample> = (0..LONG)
            .map(|_| {
                seed = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
                ((seed >> 33) as f64 / f64::from(u32::MAX) - 0.25) * 8.0
            })
            .collect();
        noise[7] = f64::NAN;
        noise[8] = f64::INFINITY;
        let levels = bar_levels(&noise);
        assert_eq!(levels.len(), BARS);
        assert!(levels.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!(levels.iter().any(|&v| v > 0.5));
    }

    #[test]
    fn pencereler_duyulan_ana_ortalanir() {
        // Yalnızca uzun pencerenin başında (duyulan andan 40 ms önce) çalan 60 Hz ses
        // yarı kalır; duyulan anda çalan tam görünür. 1 kHz ses kısa pencerenin dışında kalırsa
        // görünmez.
        let mut early = tones(&[(60.0, 0.05), (1_000.0, 0.05)]);
        for x in &mut early[LONG / 2 - 300..] {
            *x = 0.0;
        }
        let centred = bar_levels(&tones(&[(60.0, 0.05), (1_000.0, 0.05)]));
        let levels = bar_levels(&early);
        let bass = bar_of(60.0);
        assert!(
            levels[bass] < centred[bass],
            "{} {}",
            levels[bass],
            centred[bass]
        );
        assert!(levels[bass] > 0.2 * centred[bass]);
        assert!(levels[bar_of(1_000.0)] < 0.5 * centred[bar_of(1_000.0)]);
    }
}
