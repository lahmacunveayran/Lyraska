//! İnce spektrum çubukları ("Kendi resmin" sahnesi): çalan sesin o an duyulan kısmının Fourier
//! dönüşümünden 200 çubuk, 20 Hz – 2 kHz arasında **doğrusal** frekansla (bas solda).
//!
//! Model, proje sahibinin örnek videolarından ölçülerek çıkarıldı (docs/arastirma/kendi-resmin/):
//! her karede her çubuğun boyu ölçüldü, kaydın sesiyle hizalandı; frekans ekseni, pencere,
//! genlik ölçeği ve zaman davranışı ölçümle seçildi.
//!
//! - **Frekans ekseni doğrusal, 20 Hz'ten 2 kHz'e**: `k`. çubuk `20 + k · 1980 / 200` Hz'i
//!   (9,9 Hz aralık) gösterir. İki farklı videoda (200 ve 220 çubuk) en iyi uyan uçlar aynıydı:
//!   20 Hz ve 2000 Hz; logaritmik eksen ölçümle çok daha kötü uydu. Bas (20–200 Hz) soldaki ilk
//!   ~18 çubuktur; orta sesler çizginin geri kalanını kaplar.
//! - **Çubuk tek bir frekanstır** (aralığın en büyüğü ya da ortalaması değil): spektrum o
//!   frekansta okunur. Komşu çubuklar 9,9 Hz aralıklı, pencerenin kutusu 10,8 Hz: her çubuk kendi
//!   tepe ve çukurunu gösterir; çizgi tırtıklı, ince, bağımsız sivri çubuklardan oluşur.
//! - **Pencere 4096 örnek Hann** (~93 ms; duyulan anın üstüne ortalanır). Daha kısa ya da uzun
//!   pencereler ölçümle daha kötü uydu.
//! - **Genlik doğrusal** (dB değil): boy genlikle doğru orantılıdır (ölçülen boy ile doğrusal
//!   genlik arasında r ≈ 0,92; dB ile 0,50). Frekansa göre ağırlık yok. [`FULL_AMPLITUDE`]
//!   genlik çubuğu en büyük boyuna (arayüzde ekran yüksekliğinin %45'i) çıkarır: −14 LUFS'e
//!   eşitlenmiş seste ölçülen eğimle aynı.
//! - Zamanda yumuşatma neredeyse yoktur: her kare kendi spektrumudur (sönme ≤ 20 ms; arayüzde,
//!   `src/lib/spectrumBars.ts`).
//!
//! Sesler −14 LUFS eşitleme kazancıyla gelir (`player`): şarkıdan şarkıya ölçek aynı kalır.
//! Komut iş parçacığında çalışır (ses çıkışına dokunmaz); FFT planı bir kez kurulur.

use std::sync::{Arc, OnceLock};

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

use super::waveform::WAVEFORM_RATE;
use super::Sample;

/// Çubuk sayısı (arayüzde `PHOTO_BARS`).
pub const BARS: usize = 200;
/// Pencere boyu (örnek, 44,1 kHz'te ~93 ms).
pub const WINDOW: usize = 4096;
/// Sıfır dolgusu: spektrum 10,8 / 4 = 2,7 Hz aralıkla örneklenir; çubuğun frekansındaki değer
/// komşu iki örnek arasından okunur.
const PAD: usize = 4;
/// İlk çubuğun frekansı ve çubukların kapladığı aralığın üst ucu (Hz): `k`. çubuk
/// `START_HZ + k · (END_HZ − START_HZ) / BARS`.
pub const START_HZ: f64 = 20.0;
pub const END_HZ: f64 = 2000.0;
/// Çubuğu dolduran genlik (sol ve sağın ortalaması; tam ölçekli sinüs 1). Orijinal videonun tamamı
/// ve kendi sesiyle ölçüldü (30 Ekim; `docs/arastirma/kendi-resmin/`): boy = 0,732 · ham genlik ·
/// ekran yüksekliği, şarkı boyunca sabit (sıkıştırma, otomatik kazanç yok; 17 pencerede oran
/// 0,96–1,00). −14 LUFS kazancıyla (bu şarkıda −9,52 dB) eğim ≈ 2,2 · genlik; arayüzün en büyük boyu
/// ekranın %45'i: 0,45 / 2,2 ≈ 0,204. İlk ölçek (0,285, kısa ekran kayıtlarından) çubukları
/// orijinalin 0,72 katı bırakıyordu: orta seslerde hareket görünmüyordu.
pub const FULL_AMPLITUDE: f64 = 0.204;

/// `k`. çubuğun frekansı (Hz).
pub fn bar_hz(k: usize) -> f64 {
    START_HZ + (END_HZ - START_HZ) * k as f64 / BARS as f64
}

/// FFT planı, Hann penceresi ve genlik ölçeği.
struct Transform {
    fft: Arc<dyn Fft<Sample>>,
    window: Vec<Sample>,
    /// Dolgulu FFT uzunluğu.
    padded: usize,
    /// Tam ölçekli sinüs kendi frekansında 1 versin: 2 / Σw.
    scale: Sample,
}

impl Transform {
    fn new(len: usize, pad: usize) -> Self {
        let window: Vec<Sample> = (0..len)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (len - 1) as f64).cos())
            .collect();
        let sum: Sample = window.iter().sum();
        let padded = len * pad;
        Self {
            fft: FftPlanner::new().plan_fft_forward(padded),
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

    /// Kutu aralığı (Hz).
    fn bin_hz(&self) -> f64 {
        f64::from(WAVEFORM_RATE) / self.padded as f64
    }
}

fn transform() -> &'static Transform {
    static PLAN: OnceLock<Transform> = OnceLock::new();
    PLAN.get_or_init(|| Transform::new(WINDOW, PAD))
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

/// Genlikten çubuk seviyesi (0..1): doğrusal.
fn level(amplitude: Sample) -> f32 {
    if amplitude.is_finite() {
        (amplitude / FULL_AMPLITUDE).clamp(0.0, 1.0) as f32
    } else {
        0.0
    }
}

/// [`BARS`] çubuğun seviyesi (0..1, bas solda). `signal`: 44,1 kHz tek kanallı [`WINDOW`] örnek,
/// duyulan an tam ortada. Daha kısa gelen sinyalin eksiği sessizlik sayılır.
pub fn bar_levels(signal: &[Sample]) -> Vec<f32> {
    let plan = transform();
    let mut padded = vec![0.0; WINDOW];
    let n = signal.len().min(WINDOW);
    padded[..n].copy_from_slice(&signal[..n]);
    let spectrum = plan.magnitudes(&padded);
    let bin_hz = plan.bin_hz();
    (0..BARS)
        .map(|k| level(at(&spectrum, bar_hz(k) / bin_hz)))
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

    /// `parts` (frekans, genlik) sinüslerinin toplamı, [`WINDOW`] örnek.
    fn tones(parts: &[(f64, f64)]) -> Vec<Sample> {
        (0..WINDOW)
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

    /// Frekansı `hz`'e en yakın çubuk.
    fn bar_of(hz: f64) -> usize {
        ((hz - START_HZ) * BARS as f64 / (END_HZ - START_HZ)).round() as usize
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
    fn frekans_ekseni_dogrusal_20_hz_ile_2_khz_arasi() {
        assert_eq!(bar_hz(0), 20.0);
        assert!((bar_hz(1) - bar_hz(0) - 9.9).abs() < 1e-9);
        assert!((bar_hz(100) - 1010.0).abs() < 1e-9);
        assert!((bar_hz(BARS - 1) - 1990.1).abs() < 1e-9);
        // Her ses kendi çubuğunda tepe yapar: çubuklar eşit aralıklı.
        for hz in [50.0, 120.0, 515.0, 1010.0, 1504.0, 1940.0] {
            let levels = bar_levels(&tones(&[(hz, 0.05)]));
            assert_eq!(levels.len(), BARS);
            assert_eq!(peak_bar(&levels), bar_of(hz), "{hz} Hz");
        }
        // 2 kHz'in üstü çizgide görünmez; 20 Hz'in çok altı da.
        let high = bar_levels(&tones(&[(5_000.0, 0.5)]));
        assert!(high.iter().all(|&v| v < 0.01), "5 kHz");
        let low = bar_levels(&tones(&[(5.0, 0.5)]));
        assert!(low[3..].iter().all(|&v| v < 0.01), "5 Hz");
    }

    #[test]
    fn genlik_dogrusal_yari_genlik_yari_boy() {
        let k = bar_of(1_010.0);
        let full = bar_levels(&tones(&[(1_010.0, 0.2)]));
        let half = bar_levels(&tones(&[(1_010.0, 0.1)]));
        // Tam ölçekli sinüs kendi frekansında 1: 0,2 genlik 0,2 / FULL_AMPLITUDE.
        assert!(
            (f64::from(full[k]) - 0.2 / FULL_AMPLITUDE).abs() < 0.01,
            "{}",
            full[k]
        );
        assert!((f64::from(half[k]) * 2.0 - f64::from(full[k])).abs() < 0.005);
        // Dolduran genlikte 1'de kırpılır.
        let loud = bar_levels(&tones(&[(1_010.0, 0.9)]));
        assert_eq!(loud[k], 1.0);
    }

    #[test]
    fn olcek_orijinal_videoyla_olculen_egim() {
        // Orijinal video (eşitlenmiş seste): boy ≈ 2,2 · genlik · ekran yüksekliği; arayüzün en
        // büyük boyu ekranın %45'i. 0,1 genlikli ton ekranın ~%22'si kadar çubuk (seviye ~0,49).
        // İlk ölçekle 0,35'te kalıyordu (orijinalin 0,72 katı).
        let k = bar_of(1_010.0);
        let level = f64::from(bar_levels(&tones(&[(1_010.0, 0.1)]))[k]);
        assert!((0.45 * level - 2.2 * 0.1).abs() < 0.01, "{level}");
    }

    #[test]
    fn cubuklar_bagimsiz_komsu_sesler_ayri_tepe_yapar() {
        // 60 ve 90 Hz üç çubuk arayla ayrı tepe; arada çukur kalır.
        let both = bar_levels(&tones(&[(60.0, 0.02), (90.0, 0.02)]));
        let (p, q) = (bar_of(60.0), bar_of(90.0));
        assert_eq!((p, q), (4, 7));
        let dip = both[p + 1..q].iter().copied().fold(f32::MAX, f32::min);
        assert!(dip < 0.7 * both[p].min(both[q]), "çukur {dip}");
        // Tek ses üç çubuk ötede sönmüştür (Hann ana lobu ±21,5 Hz).
        let one = bar_levels(&tones(&[(1_010.0, 0.1)]));
        let k = bar_of(1_010.0);
        assert!(one[k + 3] < 0.05 * one[k] && one[k - 3] < 0.05 * one[k]);
    }

    #[test]
    fn sessizlik_sifir_seviyeler_0_ile_1_arasinda() {
        assert!(bar_levels(&vec![0.0; WINDOW]).iter().all(|&v| v == 0.0));
        assert!(
            bar_levels(&[]).iter().all(|&v| v == 0.0),
            "eksik sinyal sessiz"
        );
        assert_eq!(silence(), vec![0.0; BARS]);
        // Taşan gürültü ve bozuk örnekler de 0..1'de kalır.
        let mut seed = 1u64;
        let mut noise: Vec<Sample> = (0..WINDOW)
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
        assert!(levels.iter().any(|&v| v > 0.1));
    }

    #[test]
    fn pencere_duyulan_ana_ortalanir() {
        // Yalnızca pencerenin ilk yarısında (duyulan andan önce) çalan ses yarı görünür.
        let k = bar_of(1_010.0);
        let centred = bar_levels(&tones(&[(1_010.0, 0.05)]));
        let mut early = tones(&[(1_010.0, 0.05)]);
        for x in &mut early[WINDOW / 2..] {
            *x = 0.0;
        }
        let ratio = f64::from(bar_levels(&early)[k]) / f64::from(centred[k]);
        assert!((ratio - 0.5).abs() < 0.05, "{ratio}");
        // Duyulan andan 30 ms önce bitmiş ses çok zayıf görünür.
        let mut old = tones(&[(1_010.0, 0.05)]);
        for x in &mut old[WINDOW / 2 - 1_323..] {
            *x = 0.0;
        }
        assert!(bar_levels(&old)[k] < 0.15 * centred[k]);
    }
}
