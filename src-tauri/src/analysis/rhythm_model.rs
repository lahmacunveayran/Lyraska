//! Ritim modelinin (Beat This; Foscarin, Schlüter, Widmer, ISMIR 2024; kod ve ağırlıklar MIT) girişi ve
//! çıkışı: şarkının sesi log-mel spektrumuna çevrilir, model her 20 ms'lik karede "burada vuruş / ölçü başı
//! var" log-olasılığı (logit) verir, bunlar vuruş ve ölçü başı zamanlarına çevrilir. Modelin kendisi
//! burada çalışmaz; bu modül saf hesaptır ve Beat This'in Python kodunun birebir karşılığıdır
//! (`docs/arastirma/ritim-olcum/`; GTZAN'da Lyraska'nın kendi analizinden belirgin iyi).
//!
//! - **Giriş** ([`log_mel`]): 22 050 Hz mono; 1024 örneklik periyodik Hann penceresi, 441 örnek adım
//!   (saniyede 50 kare), kenarlar yansıtılarak doldurulur (kare `t`'nin merkezi `441·t`); genlik
//!   spektrumu `1/√1024` ile ölçeklenir (torchaudio `normalized="frame_length"`); 30 Hz – 11 kHz arası
//!   128 Slaney mel süzgeci (alan normalleştirmesi yok); `ln(1 + 1000·x)`.
//! - **Bölme** ([`chunk_starts`], [`aggregate`]): model 1500 karelik (30 sn) parçalarda çalışır; parçalar
//!   6 kare örtüşür ve her parçanın kenarındaki 6 kare atılır (model kenarlarda eğitilmedi). Örtüşen
//!   karede önceki parçanın değeri kalır (Beat This `keep_first`).
//! - **Çıkış** ([`pick`]): ±3 karedeki (±60 ms) en büyük ve sıfırdan büyük (olasılık > 0,5) logitler;
//!   bitişik tepeler ortalamalarına indirgenir; ölçü başları en yakın vuruşa taşınır (Beat This
//!   `minimal` son işlemi).

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

/// Modelin beklediği örnekleme hızı.
pub const SAMPLE_RATE: u32 = 22_050;
/// Saniyedeki kare.
pub const FPS: f64 = 50.0;
/// Mel bandı sayısı.
pub const N_MELS: usize = 128;
const N_FFT: usize = 1024;
const HOP: usize = 441;
const N_BINS: usize = N_FFT / 2 + 1;
const F_MIN: f64 = 30.0;
const F_MAX: f64 = 11_000.0;
const LOG_MULTIPLIER: f64 = 1000.0;
/// Modelin bir seferde gördüğü kare (30 sn) ve her parçanın kenarında atılan kare.
pub const CHUNK_FRAMES: usize = 1500;
pub const BORDER_FRAMES: usize = 6;
/// Tepe arama penceresi: ±3 kare.
const PEAK_RADIUS: usize = 3;

/// Bir log-mel karesi.
pub type MelFrame = [f32; N_MELS];

/// Slaney mel ölçeği: 1 kHz'e kadar doğrusal (200/3 Hz'de 1 mel), sonra logaritmik.
fn hz_to_mel(hz: f64) -> f64 {
    let log_step = 6.4f64.ln() / 27.0;
    if hz >= 1000.0 {
        15.0 + (hz / 1000.0).ln() / log_step
    } else {
        hz * 3.0 / 200.0
    }
}

fn mel_to_hz(mel: f64) -> f64 {
    let log_step = 6.4f64.ln() / 27.0;
    if mel >= 15.0 {
        1000.0 * (log_step * (mel - 15.0)).exp()
    } else {
        mel * 200.0 / 3.0
    }
}

/// Bir mel süzgeci: ilk sıfır olmayan FFT kutusu ve ağırlıklar.
#[derive(Debug, Clone, PartialEq)]
pub struct MelFilter {
    pub first_bin: usize,
    pub weights: Vec<f64>,
}

/// 128 üçgen süzgeç (torchaudio `melscale_fbanks`, Slaney, normalleştirmesiz): uçları mel ölçeğinde
/// eşit aralıklı 130 noktanın Hz karşılıkları; FFT kutusunun frekansı `k·11 025/512`.
pub fn mel_filters() -> Vec<MelFilter> {
    let (lo, hi) = (hz_to_mel(F_MIN), hz_to_mel(F_MAX));
    let points: Vec<f64> = (0..N_MELS + 2)
        .map(|i| mel_to_hz(lo + (hi - lo) * i as f64 / (N_MELS + 1) as f64))
        .collect();
    let nyquist = f64::from(SAMPLE_RATE / 2);
    (0..N_MELS)
        .map(|m| {
            let (left, center, right) = (points[m], points[m + 1], points[m + 2]);
            let weight = |k: usize| {
                let hz = nyquist * k as f64 / (N_BINS - 1) as f64;
                let rising = (hz - left) / (center - left);
                let falling = (right - hz) / (right - center);
                rising.min(falling).max(0.0)
            };
            let first_bin = (0..N_BINS).find(|&k| weight(k) > 0.0).unwrap_or(N_BINS);
            let last_bin = (0..N_BINS).rev().find(|&k| weight(k) > 0.0);
            let weights = match last_bin {
                Some(last) if last >= first_bin => (first_bin..=last).map(weight).collect(),
                _ => Vec::new(),
            };
            MelFilter { first_bin, weights }
        })
        .collect()
}

/// Yansıtarak doldurma (kenar örneği tekrarlanmaz): `-1 → 1`, `n → n − 2`.
fn reflect(i: isize, len: usize) -> usize {
    let last = len as isize - 1;
    let mut i = i;
    if i < 0 {
        i = -i;
    }
    if i > last {
        i = 2 * last - i;
    }
    i.clamp(0, last) as usize
}

/// 22 050 Hz mono sesin log-mel spektrumu; kare sayısı `1 + uzunluk / 441`. Ses yarım pencereden
/// (512 örnek) kısaysa boş (yansıtma için yetmez). Sonlu olmayan örnek sessizlik sayılır.
pub fn log_mel(samples: &[f32]) -> Vec<MelFrame> {
    let len = samples.len();
    if len <= N_FFT / 2 {
        return Vec::new();
    }
    let window: Vec<f64> = (0..N_FFT)
        .map(|n| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * n as f64 / N_FFT as f64).cos())
        .collect();
    let filters = mel_filters();
    let fft = FftPlanner::new().plan_fft_forward(N_FFT);
    let scale = 1.0 / (N_FFT as f64).sqrt();
    let half = (N_FFT / 2) as isize;
    let frames = 1 + len / HOP;
    let mut buffer = vec![Complex::<f64>::default(); N_FFT];
    let mut magnitude = [0.0f64; N_BINS];
    let mut out = Vec::with_capacity(frames);
    for t in 0..frames {
        let center = (t * HOP) as isize;
        for (n, slot) in buffer.iter_mut().enumerate() {
            let x = f64::from(samples[reflect(center - half + n as isize, len)]);
            let x = if x.is_finite() { x } else { 0.0 };
            *slot = Complex::new(x * window[n], 0.0);
        }
        fft.process(&mut buffer);
        for (m, c) in magnitude.iter_mut().zip(&buffer) {
            *m = c.norm() * scale;
        }
        let mut frame = [0.0f32; N_MELS];
        for (value, filter) in frame.iter_mut().zip(&filters) {
            let energy: f64 = filter
                .weights
                .iter()
                .zip(&magnitude[filter.first_bin..])
                .map(|(w, m)| w * m)
                .sum();
            *value = (LOG_MULTIPLIER * energy).ln_1p() as f32;
        }
        out.push(frame);
    }
    out
}

/// Parçaların başlangıç karesi (ilki −6: baştaki kenar da atılabilsin diye sıfırla doldurulur). Ardışık
/// parçalar 1488 kare arayla; son parça şarkının sonuna dayanır (kısa kalmasın diye öncekiyle daha çok
/// örtüşebilir). Şarkı bir parçadan kısaysa tek parça.
pub fn chunk_starts(frames: usize) -> Vec<isize> {
    let border = BORDER_FRAMES as isize;
    let step = (CHUNK_FRAMES - 2 * BORDER_FRAMES) as isize;
    let len = frames as isize;
    let mut starts: Vec<isize> = (0..)
        .map(|i| -border + i * step)
        .take_while(|&s| s < len - border)
        .collect();
    if len > step {
        if let Some(last) = starts.last_mut() {
            *last = len - (CHUNK_FRAMES - BORDER_FRAMES) as isize;
        }
    }
    starts
}

/// `start`'tan başlayan parçanın girişi: şarkının dışına düşen kareler (yalnızca baştaki ve sondaki
/// kenar payı kadar) sıfır.
pub fn chunk_input(spect: &[MelFrame], start: isize) -> Vec<MelFrame> {
    let len = spect.len() as isize;
    let border = BORDER_FRAMES as isize;
    let from = start.max(0);
    let to = (start + CHUNK_FRAMES as isize).min(len);
    let left = (-start).max(0) as usize;
    let right = border.min(start + CHUNK_FRAMES as isize - len).max(0) as usize;
    let mut out = vec![[0.0f32; N_MELS]; left];
    if to > from {
        out.extend_from_slice(&spect[from as usize..to as usize]);
    }
    out.extend(std::iter::repeat_n([0.0f32; N_MELS], right));
    out
}

/// Parçaların çıktılarını şarkı boyunca birleştirir: her parçanın kenardaki 6 karesi atılır, örtüşen
/// karede önceki parçanınki kalır; hiçbir parçanın kapsamadığı kare −1000 (olasılık sıfır).
pub fn aggregate(frames: usize, chunks: &[(isize, Vec<f32>)]) -> Vec<f32> {
    let mut out = vec![-1000.0f32; frames];
    for (start, values) in chunks.iter().rev() {
        let keep = BORDER_FRAMES..values.len().saturating_sub(BORDER_FRAMES);
        for j in keep {
            let frame = start + j as isize;
            if (0..frames as isize).contains(&frame) {
                out[frame as usize] = values[j];
            }
        }
    }
    out
}

/// ±3 karenin en büyüğü olan ve sıfırdan büyük logitlerin kareleri.
fn peak_frames(logits: &[f32]) -> Vec<usize> {
    (0..logits.len())
        .filter(|&i| {
            let lo = i.saturating_sub(PEAK_RADIUS);
            let hi = (i + PEAK_RADIUS + 1).min(logits.len());
            let max = logits[lo..hi]
                .iter()
                .copied()
                .fold(f32::NEG_INFINITY, f32::max);
            logits[i] > 0.0 && logits[i] == max
        })
        .collect()
}

/// Bitişik tepeleri (ortalamaya en çok 1 kare uzak) ortalamalarına indirger (Beat This
/// `deduplicate_peaks`: karşılaştırma o ana kadarki ortalamayla yapılır).
fn deduplicate(peaks: &[usize]) -> Vec<f64> {
    let mut out = Vec::new();
    let mut iter = peaks.iter().map(|&p| p as f64);
    let Some(mut mean) = iter.next() else {
        return out;
    };
    let mut count = 1.0;
    for p in iter {
        if p - mean <= 1.0 {
            count += 1.0;
            mean += (p - mean) / count;
        } else {
            out.push(mean);
            mean = p;
            count = 1.0;
        }
    }
    out.push(mean);
    out
}

/// Kare kare logitlerden vuruş ve ölçü başı zamanları (sn). Ölçü başı en yakın vuruşa taşınır (eşit
/// uzaklıkta öncekine); aynı vuruşa düşen ölçü başları bire iner.
pub fn pick(beat: &[f32], downbeat: &[f32]) -> (Vec<f64>, Vec<f64>) {
    let beats: Vec<f64> = deduplicate(&peak_frames(beat))
        .into_iter()
        .map(|f| f / FPS)
        .collect();
    let mut downbeats: Vec<f64> = deduplicate(&peak_frames(downbeat))
        .into_iter()
        .map(|f| f / FPS)
        .collect();
    if !beats.is_empty() {
        for d in &mut downbeats {
            let nearest = beats
                .iter()
                .copied()
                .fold(None::<f64>, |best, b| match best {
                    Some(x) if (x - *d).abs() <= (b - *d).abs() => Some(x),
                    _ => Some(b),
                });
            if let Some(b) = nearest {
                *d = b;
            }
        }
    }
    downbeats.sort_by(f64::total_cmp);
    downbeats.dedup();
    (beats, downbeats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    /// Referansların sinyali (`docs/arastirma/ritim-olcum/beat_this_referans.py` ile aynı): üç sinüs ve
    /// her yarım saniyede bir tık, 3 sn.
    fn reference_signal() -> Vec<f32> {
        let sr = f64::from(SAMPLE_RATE);
        (0..3 * SAMPLE_RATE as usize)
            .map(|n| {
                let t = n as f64;
                let mut x = 0.5 * (2.0 * PI * 440.0 * t / sr).sin()
                    + 0.25 * (2.0 * PI * 3000.0 * t / sr + 1.0).sin()
                    + 0.1 * (2.0 * PI * 60.0 * t / sr).sin();
                if n % 11_025 == 100 {
                    x += 0.9;
                }
                x as f32
            })
            .collect()
    }

    #[test]
    fn mel_suzgecleri_slaney_formulu_ve_torchaudio_ile_ayni() {
        let filters = mel_filters();
        assert_eq!(filters.len(), N_MELS);
        // El hesabı (ilk süzgeç): uçlar 0,45 mel (30 Hz) ve 49,877 mel (11 kHz) arasında 129 eşit adım:
        // 30; 55,544; 81,088 Hz. Kutu 2 = 43,07 Hz → (43,07 − 30)/25,544 = 0,5116; kutu 3 = 64,60 Hz →
        // (81,088 − 64,60)/25,544 = 0,6455.
        assert_eq!(filters[0].first_bin, 2);
        assert_eq!(filters[0].weights.len(), 2);
        assert!((filters[0].weights[0] - 0.5116).abs() < 1e-3);
        assert!((filters[0].weights[1] - 0.645_487_8).abs() < 1e-6);
        // torchaudio `melscale_fbanks(513, 30, 11000, 128, 22050, None, "slaney")`: sıfır olmayan
        // kutular ve tepe.
        let peak = |f: &MelFilter| f.weights.iter().copied().fold(0.0, f64::max);
        for (m, first, last, top) in [
            (1, 3, 4, 0.802_502),
            (64, 93, 97, 0.858_582_85),
            (127, 485, 510, 0.966_693_1),
        ] {
            let f = &filters[m];
            assert_eq!(f.first_bin, first, "süzgeç {m}");
            assert_eq!(f.first_bin + f.weights.len() - 1, last, "süzgeç {m}");
            // torchaudio float32 hesaplar (göreli ~1e-7 · ara adımlar); burada f64.
            assert!((peak(f) - top).abs() < 1e-5, "süzgeç {m}: {}", peak(f));
        }
    }

    #[test]
    fn log_mel_beat_this_on_islemesiyle_ayni() {
        let spect = log_mel(&reference_signal());
        assert_eq!(spect.len(), 151);
        // Beat This `LogMelSpect` (torchaudio, float32) çıktısından: kare × band.
        let bands = [0, 1, 10, 64, 100, 127];
        let expected: [(usize, [f64; 6]); 4] = [
            (
                0,
                [6.316878, 5.463798, 6.282670, 4.037776, 5.321074, 6.057948],
            ),
            (
                1,
                [6.654615, 6.207155, 3.029645, 2.894936, 3.829242, 4.538250],
            ),
            (
                75,
                [6.685653, 6.254027, 3.402643, 4.156716, 5.105998, 5.816916],
            ),
            (
                150,
                [6.351953, 5.335266, 6.376261, 3.903110, 4.368134, 4.100924],
            ),
        ];
        for (frame, values) in expected {
            for (band, want) in bands.iter().zip(values) {
                let got = f64::from(spect[frame][*band]);
                assert!(
                    (got - want).abs() < 2e-4,
                    "kare {frame}, band {band}: {got} ≠ {want}"
                );
            }
        }
    }

    #[test]
    fn log_mel_kare_sayisi_ve_kisa_ses() {
        // torchaudio: 513 örnek → 2 kare, 1000 → 3, 22 050 → 51 (1 + uzunluk / 441).
        assert_eq!(log_mel(&[0.0; 513]).len(), 2);
        assert_eq!(log_mel(&[0.0; 1000]).len(), 3);
        assert_eq!(log_mel(&vec![0.0; 22_050]).len(), 51);
        assert!(log_mel(&[0.0; 512]).is_empty());
        // Sessizlik log1p(0) = 0; sonlu olmayan örnek sessizlik.
        assert!(log_mel(&[f32::NAN; 1000])
            .iter()
            .all(|f| f.iter().all(|&v| v == 0.0)));
    }

    #[test]
    fn parcalara_bolme_beat_this_ile_ayni() {
        // Beat This `split_piece(…, 1500, 6)` başlangıçları.
        assert_eq!(chunk_starts(100), vec![-6]);
        assert_eq!(chunk_starts(1488), vec![-6]);
        assert_eq!(chunk_starts(1500), vec![-6, 6]);
        assert_eq!(chunk_starts(3000), vec![-6, 1482, 1506]);
        assert_eq!(chunk_starts(5000), vec![-6, 1482, 2970, 3506]);
    }

    #[test]
    fn parca_girisi_kenarlarda_sifirla_doldurulur() {
        let spect: Vec<MelFrame> = (0..100).map(|i| [i as f32 + 1.0; N_MELS]).collect();
        // Tek kısa parça: başta 6, sonda 6 sıfır kare (100 + 12).
        let chunk = chunk_input(&spect, -6);
        assert_eq!(chunk.len(), 112);
        assert_eq!(chunk[5][0], 0.0);
        assert_eq!(chunk[6][0], 1.0);
        assert_eq!(chunk[105][0], 100.0);
        assert_eq!(chunk[106][0], 0.0);
        // Uzun şarkıda ortadaki ve sondaki parça tam 1500 kare.
        let long: Vec<MelFrame> = (0..3000).map(|i| [i as f32; N_MELS]).collect();
        let starts = chunk_starts(3000);
        let middle = chunk_input(&long, starts[1]);
        assert_eq!((middle.len(), middle[0][0]), (1500, 1482.0));
        let last = chunk_input(&long, starts[2]);
        assert_eq!(
            (last.len(), last[0][0], last[1493][0], last[1494][0]),
            (1500, 1506.0, 2999.0, 0.0)
        );
    }

    #[test]
    fn birlestirmede_kenarlar_atilir_ve_onceki_parca_kalir() {
        // Her parça kendi sırasını yazar: hangi parçanın değeri hangi kareye kaldı?
        let frames = 3000;
        let chunks: Vec<(isize, Vec<f32>)> = chunk_starts(frames)
            .into_iter()
            .enumerate()
            .map(|(i, s)| {
                (
                    s,
                    vec![i as f32; chunk_input(&vec![[0.0; N_MELS]; frames], s).len()],
                )
            })
            .collect();
        let out = aggregate(frames, &chunks);
        // Parça 0: [-6, 1494) → kenarsız [0, 1488). Parça 1: 1482 + [6, 1494) = [1488, 2976).
        // Parça 2: 1506 + [6, 1494) = [1512, 3000); örtüşen [1512, 2976) parça 1'de kalır.
        assert_eq!(out[0], 0.0);
        assert_eq!(out[1487], 0.0);
        assert_eq!(out[1488], 1.0);
        assert_eq!(out[2975], 1.0);
        assert_eq!(out[2976], 2.0);
        assert_eq!(out[2999], 2.0);
        // Kısa şarkı: tek parçanın kenarları atılınca şarkının tamamı kalır.
        assert_eq!(aggregate(100, &[(-6, vec![0.5; 112])]), vec![0.5; 100]);
        // Hiçbir parçanın kapsamadığı kare olasılık sıfır.
        assert_eq!(aggregate(3, &[]), vec![-1000.0; 3]);
    }

    #[test]
    fn son_islem_beat_this_minimal_ile_ayni() {
        // Beat This `Postprocessor("minimal")` çıktısıyla aynı girdi.
        let mut beat = vec![-5.0f32; 60];
        let mut down = vec![-5.0f32; 60];
        for (i, v) in [
            (5, 2.0),
            (10, 1.0),
            (11, 1.0),
            (20, 3.0),
            (22, 2.5),
            (30, -0.5),
            (40, 1.0),
            (41, 1.0),
            (42, 1.0),
            (50, 0.1),
        ] {
            beat[i] = v;
        }
        for (i, v) in [(6, 1.0), (39, 2.0), (45, 0.5)] {
            down[i] = v;
        }
        let (beats, downbeats) = pick(&beat, &down);
        // 10–11 bitişik → 10,5; 22, ±3'te 20'den küçük; 30 olasılık < 0,5; 40, 41 → 40,5, sonra 42 −
        // 40,5 = 1,5 > 1 ayrı tepe (karşılaştırma ortalamayla).
        let want = [0.1, 0.21, 0.4, 0.81, 0.84, 1.0];
        assert_eq!(beats.len(), want.len());
        for (g, w) in beats.iter().zip(want) {
            assert!((g - w).abs() < 1e-12, "{beats:?}");
        }
        // 6 → 0,1; 39 → 0,81; 45 (0,9 sn) → 0,84 (1,0'dan yakın).
        let want = [0.1, 0.81, 0.84];
        assert_eq!(downbeats.len(), want.len());
        for (g, w) in downbeats.iter().zip(want) {
            assert!((g - w).abs() < 1e-12, "{downbeats:?}");
        }
    }

    #[test]
    fn tepe_penceresi_arti_eksi_uc_kare() {
        // Beat This `max_pool1d(7, 1, 3)`: 3 kare ötedeki daha küçük tepe bastırılır, 4 kare öteki kalır.
        let mut beat = vec![-1.0f32; 30];
        beat[10] = 2.0;
        beat[13] = 1.5;
        beat[20] = 2.0;
        beat[24] = 1.5;
        assert_eq!(pick(&beat, &[]).0, vec![0.2, 0.4, 0.48]);
    }

    #[test]
    fn son_islem_uc_durumlar() {
        assert_eq!(pick(&[], &[]), (vec![], vec![]));
        // Vuruş yoksa ölçü başı taşınmaz; aynı vuruşa düşen ölçü başları bire iner.
        let (b, d) = pick(
            &[-1.0; 10],
            &[0.0, 0.0, 0.0, 0.0, 1.0, -1.0, -1.0, -1.0, -1.0, -1.0],
        );
        assert!(b.is_empty());
        assert_eq!(d, vec![0.08]);
        let mut beat = vec![-1.0f32; 30];
        beat[10] = 1.0;
        let mut down = vec![-1.0f32; 30];
        down[2] = 1.0;
        down[25] = 1.0;
        assert_eq!(pick(&beat, &down), (vec![0.2], vec![0.2]));
        // Eşit uzaklıkta öncekine: vuruşlar 0 ve 1 sn (kare 0 ve 50), ölçü başı 0,5 sn (tam ikili kesir).
        let mut beat = vec![-1.0f32; 60];
        beat[0] = 1.0;
        beat[50] = 1.0;
        let mut down = vec![-1.0f32; 60];
        down[25] = 1.0;
        assert_eq!(pick(&beat, &down), (vec![0.0, 1.0], vec![0.0]));
    }
}
