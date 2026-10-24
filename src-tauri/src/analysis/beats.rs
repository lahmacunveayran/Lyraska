//! Beat takibi: şarkının vuruşlarını ve temposunu (BPM) bulur.
//!
//! Yöntem (Ellis 2007, "Beat Tracking by Dynamic Programming"):
//!
//! 1. **Başlangıç gücü** ([`OnsetDetector`]): spektrogram geçişinde her karede
//!    logaritmik bantlarda sıkıştırılmış genliğin artışı (spektral akı). Vuruş
//!    anlarında, yani davul ya da nota başlarında yükselir.
//! 2. **Tempo**: başlangıç gücünün öz-ilintisi, 120 BPM çevresini yeğleyen bir
//!    ağırlıkla; iki katı aralıktaki uyum da hesaba katılır (yarım/çift tempo
//!    karışmasın diye).
//! 3. **Vuruşlar**: dinamik programlama, hem güçlü başlangıçlara denk gelen hem
//!    de tempoya uygun aralıklı vuruş dizisini seçer. Kare altı doğruluk için
//!    tepe noktası parabolle inceltilir.

use rustfft::num_complex::Complex;
use serde::{Deserialize, Serialize};

/// Başlangıç gücü için logaritmik bant sayısı.
const ONSET_BANDS: usize = 48;
const ONSET_MIN_FREQ: f64 = 30.0;
const ONSET_MAX_FREQ: f64 = 11_000.0;
/// Genlik sıkıştırma katsayısı: `ln(1 + γ·genlik)`.
const ONSET_COMPRESSION: f64 = 1000.0;

/// Aranan tempo aralığı ve tercih edilen tempo.
const MIN_BPM: f64 = 60.0;
const MAX_BPM: f64 = 200.0;
// 125: yumuşatılmış öz-ilintide iki oktav aday (87 ve 174) eşit çıkınca hızlısı seçilsin (√(87·174)
// ≈ 123); 120'de saf dürtü dizilerinde 174 BPM 87'ye iniyordu.
const PREFERRED_BPM: f64 = 125.0;
/// Tempo kestiriminde iki vuruş sonrasına bakılırken öz-ilintinin yumuşatılması (σ, kare).
const ACF_SMOOTHING: f64 = 2.5;
/// Tempo tercihinin genişliği (oktav).
const TEMPO_PRIOR_OCTAVES: f64 = 1.0;
/// Vuruş aralığının tempodan sapmasına verilen ceza (Ellis'teki "tightness").
const TIGHTNESS: f64 = 100.0;
/// Bundan kısa şarkıda (saniye) beat aranmaz.
const MIN_SECONDS: f64 = 4.0;
/// Öz-ilinti tepe değeri bunun altındaysa şarkıda belirgin bir ritim yok sayılır.
const MIN_RHYTHM_STRENGTH: f64 = 0.08;

/// Başlangıç gücünün tepe noktasının vuruşun duyulduğu andan gecikmesi, FFT
/// penceresinin süresine göre: `ONSET_LATENCY_PER_WINDOW · pencere + ONSET_LATENCY_OFFSET`.
/// Pencere örnek sayısıyla sabit olduğundan düşük örnekleme hızında zamanda uzundur ve
/// vuruş ona daha geç "oturur". Kare `k`'nin zamanı `k / 60` sayıldığında (spektrogramla
/// aynı kural) sentetik davul kayıtlarında ölçülen ortalama gecikme (4 tempo): 8 kHz
/// +36,5 ms, 16 kHz +17,6, 22,05 kHz +11,6, 32 kHz +6,7, 44,1 kHz +1,8, 48 kHz 0,0,
/// 96 kHz −5,6 ms. Doğrunun sapması ±3 ms. Senkron testleri doğrular; FFT ya da kare
/// düzeni değişirse burası yeniden ölçülür.
const ONSET_LATENCY_PER_WINDOW: f64 = 0.1737;
const ONSET_LATENCY_OFFSET_SECONDS: f64 = -0.006_36;

/// Verilen örnekleme hızında ve FFT boyunda başlangıç gücünün gecikmesi (saniye).
pub fn onset_latency(sample_rate: u32, fft_size: usize) -> f64 {
    let window_seconds = fft_size as f64 / f64::from(sample_rate.max(1));
    ONSET_LATENCY_PER_WINDOW * window_seconds + ONSET_LATENCY_OFFSET_SECONDS
}

/// Şarkının vuruş ızgarası.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeatGrid {
    /// Tempo (vuruş/dakika). Tempo değişen şarkıda parçaların ortancası.
    pub bpm: f64,
    /// Vuruş anları (saniye, artan sırada).
    pub beats: Vec<f64>,
    /// Tempo şarkı boyunca belirgin değişiyor (canlı kayıt, ritardando, iki tempolu parça):
    /// vuruşlar parça parça izlendi, `bpm` yaklaşık bir değerdir (ANL-04).
    #[serde(default)]
    pub variable_tempo: bool,
}

/// Tempo değişimi aranırken şarkının bölündüğü parça uzunluğu (saniye).
const TEMPO_SEGMENT_SECONDS: f64 = 20.0;
/// Parça tempoları birbirinden bu orandan çok ayrılıyorsa tempo "değişken" sayılır (%8).
const VARIABLE_TEMPO_RATIO: f64 = 1.08;
/// Parçanın kendi tempo kestirimi ancak ritmi bu kadar belirginse (öz-ilinti / enerji) sayılır.
const SEGMENT_MIN_CLARITY: f64 = 0.2;
/// Parça periyodu bütünün periyoduyla basit oranlıysa (bu payla) aynı tempo sayılır.
const SIMPLE_RATIO_TOLERANCE: f64 = 0.03;

/// Bir anın vuruş ızgarasındaki yeri.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BeatPosition {
    /// O ana kadarki son vuruşun sırası (0'dan başlar).
    pub index: usize,
    /// Son vuruştan bu yana geçen süre, vuruş aralığına oranla (0..1).
    pub phase: f64,
}

impl BeatGrid {
    /// Verilen andaki vuruş konumu. İlk vuruştan önce ve son vuruştan bir aralık
    /// sonrasında `None`.
    pub fn position_at(&self, seconds: f64) -> Option<BeatPosition> {
        let first = *self.beats.first()?;
        if !seconds.is_finite() || seconds < first {
            return None;
        }
        let index = self.beats.partition_point(|&b| b <= seconds) - 1;
        let start = self.beats[index];
        let interval = match self.beats.get(index + 1) {
            Some(&next) => next - start,
            None => 60.0 / self.bpm,
        };
        let phase = (seconds - start) / interval;
        (phase < 1.0).then_some(BeatPosition { index, phase })
    }
}

/// Spektrumdan her karenin başlangıç gücünü hesaplar.
pub struct OnsetDetector {
    /// Her bandın FFT kutu aralığı [başlangıç, bitiş).
    ranges: Vec<(usize, usize)>,
    previous: Vec<f64>,
    current: Vec<f64>,
    primed: bool,
}

impl OnsetDetector {
    pub fn new(sample_rate: u32, fft_size: usize) -> Self {
        let bin_hz = f64::from(sample_rate) / fft_size as f64;
        let max_freq = ONSET_MAX_FREQ.min(f64::from(sample_rate) * 0.45);
        let ratio = (max_freq / ONSET_MIN_FREQ).powf(1.0 / ONSET_BANDS as f64);
        let max_bin = fft_size / 2;
        let mut ranges = Vec::with_capacity(ONSET_BANDS);
        let mut last_end = 1;
        for band in 0..ONSET_BANDS {
            let lo = ONSET_MIN_FREQ * ratio.powi(band as i32);
            let hi = lo * ratio;
            // Düşük frekanslarda bantlar tek kutudan dardır: her bant en az bir
            // kutu alır ve bir öncekinin bittiği yerden başlar (çakışma olmaz).
            let start = ((lo / bin_hz).round() as usize)
                .max(last_end)
                .min(max_bin - 1);
            let end = ((hi / bin_hz).round() as usize).max(start + 1).min(max_bin);
            ranges.push((start, end));
            last_end = end;
        }
        let bands = ranges.len();
        Self {
            ranges,
            previous: vec![0.0; bands],
            current: vec![0.0; bands],
            primed: false,
        }
    }

    /// FFT sonucundan (`norm` ile tam ölçekli sinüs 1 olur) başlangıç gücü.
    pub fn process(&mut self, spectrum: &[Complex<f64>], norm: f64) -> f32 {
        for (value, &(start, end)) in self.current.iter_mut().zip(&self.ranges) {
            let mean = spectrum[start..end].iter().map(|c| c.norm()).sum::<f64>()
                / (end - start) as f64
                * norm;
            *value = (1.0 + ONSET_COMPRESSION * mean).ln();
        }
        let flux = if self.primed {
            self.current
                .iter()
                .zip(&self.previous)
                .map(|(c, p)| (c - p).max(0.0))
                .sum::<f64>()
                / self.current.len() as f64
        } else {
            0.0
        };
        std::mem::swap(&mut self.current, &mut self.previous);
        self.primed = true;
        flux as f32
    }

    /// Pencere dolmadan üretilen sessiz karelerde çağrılır.
    pub fn silent(&mut self) -> f32 {
        self.previous.iter_mut().for_each(|v| *v = 0.0);
        self.primed = true;
        0.0
    }
}

/// Başlangıç gücü dizisinden (`fps` kare/saniye) vuruş ızgarasını çıkarır; vuruş
/// anlarından `latency` saniye ([`onset_latency`]) düşülür.
/// Şarkı çok kısaysa ya da belirgin bir ritim yoksa `None`.
pub fn track(onset: &[f32], fps: f64, latency: f64) -> Option<BeatGrid> {
    if (onset.len() as f64) < MIN_SECONDS * fps {
        return None;
    }
    let strength = normalize(onset, fps)?;
    let period = estimate_period(&strength, fps)?;
    let local = smooth(&strength, period / 32.0);
    // Tempo şarkı boyunca değişiyorsa tek periyot bütününe uymaz: parça parça izlenir.
    let segments = segment_periods(&strength, fps, period);
    let (frames, variable_tempo, bpm_override) = match segments {
        Some(segments) => {
            let mut frames = Vec::new();
            for (range, period) in &segments {
                let min_gap = (period * 0.5) as usize;
                for b in dynamic_beats(&local[range.clone()], *period) {
                    let b = b + range.start;
                    // Parça sınırında iki izleme aynı vuruşu bulabilir: yakın olanı atla.
                    if frames.last().is_none_or(|&last: &usize| b > last + min_gap) {
                        frames.push(b);
                    }
                }
            }
            let mut bpms: Vec<f64> = segments.iter().map(|(_, p)| 60.0 * fps / p).collect();
            bpms.sort_by(f64::total_cmp);
            let median = bpms[bpms.len() / 2];
            (frames, true, Some((median * 10.0).round() / 10.0))
        }
        None => (dynamic_beats(&local, period), false, None),
    };
    let frames = trim_quiet_ends(&local, frames);
    if frames.len() < 4 {
        return None;
    }

    let beats: Vec<f64> = frames
        .iter()
        .map(|&b| (b as f64 + peak_offset(&local, b)) / fps - latency)
        .map(|t| t.max(0.0))
        .collect();
    let bpm = bpm_override.unwrap_or_else(|| (600.0 / mean_interval(&beats)).round() / 10.0);
    Some(BeatGrid {
        bpm,
        beats,
        variable_tempo,
    })
}

/// Şarkıyı ~20 saniyelik parçalara böler ve her parçanın periyodunu ayrı kestirir. Parça
/// periyotları birbirinden [`VARIABLE_TEMPO_RATIO`]'dan çok ayrılıyorsa parçaları (kare aralığı,
/// periyot) olarak döndürür; tempo sabitse ya da şarkı iki parçaya yetmiyorsa `None`
/// (tek periyotla izlenir; sabit tempolu şarkıların sonucu değişmez).
fn segment_periods(
    strength: &[f64],
    fps: f64,
    global: f64,
) -> Option<Vec<(std::ops::Range<usize>, f64)>> {
    let segment = (TEMPO_SEGMENT_SECONDS * fps) as usize;
    let count = strength.len() / segment;
    if count < 2 {
        return None;
    }
    let mut segments = Vec::with_capacity(count);
    for i in 0..count {
        let start = i * segment;
        // Son parça kalanı da alır (yarım parça tek başına kestirilmez).
        let end = if i + 1 == count {
            strength.len()
        } else {
            start + segment
        };
        // Ritmi zayıf parça (davulsuz ara, yükseliş) kendi tempo kestirimini taşımaz: bütünün
        // periyodu geçerlidir. Yoksa sakin bir ara sabit tempolu şarkıyı "değişken" yapıp ortanca
        // tempoyu bozardı.
        let mut period = match estimate_period_with_strength(&strength[start..end], fps) {
            Some((period, clarity)) if clarity >= SEGMENT_MIN_CLARITY => period,
            _ => global,
        };
        // Parça kestirimi oktav atlamış olabilir (yarım/iki kat): bütünün oktavına çekilir.
        while period > global * 1.5 {
            period /= 2.0;
        }
        while period < global / 1.5 {
            period *= 2.0;
        }
        // Bütünle basit oranlı (2/3, 3/2, 3/4, 4/3: üçleme, yarım tempo kalıbı) parça aynı tempodadır.
        let ratio = period / global;
        if [2.0 / 3.0, 1.5, 0.75, 4.0 / 3.0]
            .iter()
            .any(|r| (ratio / r - 1.0).abs() <= SIMPLE_RATIO_TOLERANCE)
        {
            period = global;
        }
        segments.push((start..end, period));
    }
    let (min, max) = segments
        .iter()
        .fold((f64::MAX, 0.0f64), |(lo, hi), (_, p)| {
            (lo.min(*p), hi.max(*p))
        });
    (max / min > VARIABLE_TEMPO_RATIO).then_some(segments)
}

/// Verilen aralıkla (saniye) bir ızgara: [`track`] gibi dinamik programlamayla başlangıçlara
/// oturur ama tempo aranmaz (ör. aksak ölçü çözümlemesi için sekizlik ızgarası). Izgara
/// noktalarının zamanları ve her birindeki başlangıç gücü (yerel, normalleştirilmiş).
pub(crate) fn track_period(
    onset: &[f32],
    fps: f64,
    latency: f64,
    period_secs: f64,
) -> Option<(Vec<f64>, Vec<f64>)> {
    let period = period_secs * fps;
    if (onset.len() as f64) < MIN_SECONDS * fps || period < 2.0 {
        return None;
    }
    let strength = normalize(onset, fps)?;
    let local = smooth(&strength, period / 32.0);
    let frames = trim_quiet_ends(&local, dynamic_beats(&local, period));
    if frames.len() < 4 {
        return None;
    }
    let times = frames
        .iter()
        .map(|&b| ((b as f64 + peak_offset(&local, b)) / fps - latency).max(0.0))
        .collect();
    // Nokta çevresindeki (±1 kare) en güçlü başlangıç: tepe kareye tam denk gelmeyebilir.
    let strengths = frames
        .iter()
        .map(|&b| {
            strength[b.saturating_sub(1)..(b + 2).min(strength.len())]
                .iter()
                .copied()
                .fold(0.0, f64::max)
        })
        .collect();
    Some((times, strengths))
}

/// Ortalama vuruş aralığı: vuruş anlarına doğru uydurma (en küçük kareler).
/// Tek tek aralıklara göre kare ızgarasından etkilenmez.
pub(crate) fn mean_interval(beats: &[f64]) -> f64 {
    let n = beats.len() as f64;
    let mean_index = (n - 1.0) / 2.0;
    let mean_time = beats.iter().sum::<f64>() / n;
    let (num, den) = beats
        .iter()
        .enumerate()
        .fold((0.0, 0.0), |(num, den), (i, &t)| {
            let di = i as f64 - mean_index;
            (num + di * (t - mean_time), den + di * di)
        });
    num / den
}

/// Yavaş değişimi çıkarır (yerel ortalamanın üstü kalır) ve standart sapmaya böler.
fn normalize(onset: &[f32], fps: f64) -> Option<Vec<f64>> {
    let radius = (fps * 0.25).round() as usize;
    let mut prefix = Vec::with_capacity(onset.len() + 1);
    prefix.push(0.0f64);
    for &x in onset {
        prefix.push(prefix.last().copied().unwrap_or(0.0) + f64::from(x));
    }
    let high: Vec<f64> = (0..onset.len())
        .map(|i| {
            let lo = i.saturating_sub(radius);
            let hi = (i + radius + 1).min(onset.len());
            let mean = (prefix[hi] - prefix[lo]) / (hi - lo) as f64;
            (f64::from(onset[i]) - mean).max(0.0)
        })
        .collect();
    let mean = high.iter().sum::<f64>() / high.len() as f64;
    let deviation =
        (high.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / high.len() as f64).sqrt();
    (deviation > 1e-9).then(|| high.iter().map(|x| x / deviation).collect())
}

/// Vuruş aralığı (kare; kesirli). Ritim belirgin değilse `None`.
fn estimate_period(strength: &[f64], fps: f64) -> Option<f64> {
    estimate_period_with_strength(strength, fps).map(|(period, _)| period)
}

/// [`estimate_period`] ve ritmin belirginliği (öz-ilintinin tepedeki değeri / enerji, 0..1).
fn estimate_period_with_strength(strength: &[f64], fps: f64) -> Option<(f64, f64)> {
    let min_lag = (fps * 60.0 / MAX_BPM).floor() as usize;
    let max_lag = (fps * 60.0 / MIN_BPM).ceil() as usize;
    let mean = strength.iter().sum::<f64>() / strength.len() as f64;
    let centered: Vec<f64> = strength.iter().map(|x| x - mean).collect();
    let acf = autocorrelation(&centered, 2 * max_lag + 2);
    let energy = acf[0];
    // Tempo seçimi yumuşatılmış başlangıç gücünün öz-ilintisiyle yapılır: periyot kesirliyse (126
    // BPM = 28,57 kare) vuruşlar 28 ve 29 kare arayla gelir, keskin tepeler tam sayı kareye denk
    // gelmez; vuruş zayıf görünür ve bir buçuk vuruşluk aralık (2/3 tempo) kazanırdı. Ritmin
    // belirginliği ve kare altı tepe ham öz-ilintiden.
    let wide = {
        let soft = smooth(strength, ACF_SMOOTHING);
        let mean = soft.iter().sum::<f64>() / soft.len() as f64;
        let centered: Vec<f64> = soft.iter().map(|x| x - mean).collect();
        autocorrelation(&centered, 2 * max_lag + 2)
    };
    if energy <= 0.0 {
        return None;
    }

    let preferred = fps * 60.0 / PREFERRED_BPM;
    let score = |lag: usize| {
        let prior = (-0.5 * ((lag as f64 / preferred).log2() / TEMPO_PRIOR_OCTAVES).powi(2)).exp();
        prior * (wide[lag] + 0.5 * wide[2 * lag] + 0.25 * (wide[2 * lag - 1] + wide[2 * lag + 1]))
    };
    let best = (min_lag.max(2)..=max_lag).max_by(|&a, &b| score(a).total_cmp(&score(b)))?;
    let clarity = acf[best] / energy;
    if clarity < MIN_RHYTHM_STRENGTH {
        return None;
    }
    // Kare altı tempo: öz-ilinti tepesine parabol.
    let refined = best as f64 + parabola(acf[best - 1], acf[best], acf[best + 1]);
    Some((refined, clarity))
}

/// Öz-ilinti, 0..=`max_lag` gecikmeler için (örnek başına ortalama).
fn autocorrelation(centered: &[f64], max_lag: usize) -> Vec<f64> {
    (0..=max_lag)
        .map(|lag| {
            if lag >= centered.len() {
                return 0.0;
            }
            let n = centered.len() - lag;
            centered[..n]
                .iter()
                .zip(&centered[lag..])
                .map(|(a, b)| a * b)
                .sum::<f64>()
                / n as f64
        })
        .collect()
}

/// Gauss çekirdeğiyle yumuşatma (σ kare cinsinden).
fn smooth(values: &[f64], sigma: f64) -> Vec<f64> {
    let sigma = sigma.max(0.5);
    let radius = (3.0 * sigma).ceil() as isize;
    let kernel: Vec<f64> = (-radius..=radius)
        .map(|i| (-0.5 * (i as f64 / sigma).powi(2)).exp())
        .collect();
    let len = values.len() as isize;
    (0..len)
        .map(|i| {
            kernel
                .iter()
                .enumerate()
                .map(|(k, w)| {
                    let j = i + k as isize - radius;
                    if (0..len).contains(&j) {
                        w * values[j as usize]
                    } else {
                        0.0
                    }
                })
                .sum()
        })
        .collect()
}

/// En iyi vuruş dizisi (kare sıraları).
fn dynamic_beats(local: &[f64], period: f64) -> Vec<usize> {
    let n = local.len();
    let near = (period / 2.0).round().max(1.0) as usize;
    let far = (period * 2.0).round() as usize;
    let mut score = vec![0.0; n];
    let mut back: Vec<Option<usize>> = vec![None; n];
    for t in 0..n {
        let mut best: Option<(f64, usize)> = None;
        if t >= near {
            let first = t.saturating_sub(far);
            for (p, &previous) in score.iter().enumerate().take(t - near + 1).skip(first) {
                let gap = (t - p) as f64 / period;
                let value = previous - TIGHTNESS * gap.ln().powi(2);
                if best.is_none_or(|(v, _)| value > v) {
                    best = Some((value, p));
                }
            }
        }
        match best {
            Some((value, p)) if value > 0.0 => {
                score[t] = local[t] + value;
                back[t] = Some(p);
            }
            _ => score[t] = local[t],
        }
    }

    // Son iki aralıktaki en yüksek puanlı vuruştan geriye doğru izle.
    let tail = n.saturating_sub(far.max(1));
    let Some(mut t) = (tail..n).max_by(|&a, &b| score[a].total_cmp(&score[b])) else {
        return Vec::new();
    };
    let mut beats = vec![t];
    while let Some(p) = back[t] {
        beats.push(p);
        t = p;
    }
    beats.reverse();
    beats
}

/// Başta ve sondaki sessiz kısımlara düşen vuruşları atar.
fn trim_quiet_ends(local: &[f64], beats: Vec<usize>) -> Vec<usize> {
    if beats.is_empty() {
        return beats;
    }
    let rms = (beats.iter().map(|&b| local[b].powi(2)).sum::<f64>() / beats.len() as f64).sqrt();
    let threshold = 0.5 * rms;
    let first = beats.iter().position(|&b| local[b] >= threshold);
    let last = beats.iter().rposition(|&b| local[b] >= threshold);
    match (first, last) {
        (Some(f), Some(l)) => beats[f..=l].to_vec(),
        _ => Vec::new(),
    }
}

/// Tepe noktasının kare altı kayması (−0,5..0,5).
fn peak_offset(values: &[f64], index: usize) -> f64 {
    if index == 0 || index + 1 >= values.len() {
        return 0.0;
    }
    parabola(values[index - 1], values[index], values[index + 1])
}

fn parabola(left: f64, center: f64, right: f64) -> f64 {
    let denominator = left - 2.0 * center + right;
    if denominator.abs() < 1e-12 {
        return 0.0;
    }
    (0.5 * (left - right) / denominator).clamp(-0.5, 0.5)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::analysis::evaluate::f_measure;
    use crate::analysis::spectrogram::{analyze, Spectrogram};
    use crate::audio::decode::Decoder;
    use crate::audio::test_util::{temp_path, write_wav};
    use std::sync::Arc;

    const FPS: f64 = 60.0;

    /// Verilen tempoda dürtü dizisi (başlangıç gücü olarak).
    fn impulses(bpm: f64, offset: f64, seconds: f64) -> (Vec<f32>, Vec<f64>) {
        let frames = (seconds * FPS) as usize;
        let mut onset = vec![0.05f32; frames];
        let mut truth = Vec::new();
        let mut t = offset;
        while t < seconds - 0.05 {
            let k = (t * FPS).round() as usize;
            if k < frames {
                onset[k] = 1.0;
            }
            truth.push(t);
            t += 60.0 / bpm;
        }
        (onset, truth)
    }

    #[test]
    fn duzgun_durtulerde_tempo_ve_vuruslar() {
        for bpm in [72.0, 96.0, 120.0, 128.0, 140.0, 174.0] {
            let (onset, truth) = impulses(bpm, 0.5, 30.0);
            let grid = track(&onset, FPS, 0.0).unwrap();
            assert!((grid.bpm - bpm).abs() < bpm * 0.02, "{bpm}: {}", grid.bpm);
            let f = f_measure(&grid.beats, &truth, 0.07);
            assert!(f > 0.95, "{bpm} BPM: F = {f}");
        }
    }

    #[test]
    fn kesirli_vurus_araliginda_tempo_iki_ucte_birine_kaymaz() {
        // Sekizlikleri dolu (vuruşta kick, arada hi-hat) 4/4 kalıp; 60 kare/sn'de vuruş aralığı
        // kesirli (ör. 126 BPM = 28,57 kare). İki vuruş sonrasının tepesi tam sayı kareye denk
        // gelmeyince bir buçuk vuruşluk aralık (2/3 tempo) seçilmemeli.
        for bpm in (118..=134).map(f64::from) {
            let frames = (40.0 * FPS) as usize;
            let mut onset = vec![0.0f32; frames];
            let mut t = 0.5;
            let mut eighth = 0usize;
            while t < 39.5 {
                let k = (t * FPS).round() as usize;
                if k < frames {
                    onset[k] = if eighth.is_multiple_of(2) { 1.0 } else { 0.7 };
                }
                eighth += 1;
                t += 30.0 / bpm;
            }
            let grid = track(&onset, FPS, 0.0).unwrap();
            assert!((grid.bpm - bpm).abs() < bpm * 0.02, "{bpm}: {}", grid.bpm);
        }
    }

    #[test]
    fn hicbir_tempoda_iki_ucte_bire_kaymaz() {
        // 70–190 BPM arası her tempo, iki kalıp (yalnız vuruş; vuruş + hafif sekizlik): bulunan
        // tempo gerçeğin 2/3'ü ya da 3/2'si olmaz. (Yarısı ya da iki katı belirsizdir; sayılmaz.)
        let mut wrong = Vec::new();
        for b in 70..=190 {
            let bpm = f64::from(b);
            let frames = (40.0 * FPS) as usize;
            for offbeat in [0.0f32, 0.7] {
                let mut onset = vec![0.0f32; frames];
                let (mut t, mut eighth) = (0.5, 0usize);
                while t < 39.5 {
                    let k = (t * FPS).round() as usize;
                    if k < frames {
                        onset[k] = if eighth.is_multiple_of(2) {
                            1.0
                        } else {
                            offbeat
                        };
                    }
                    eighth += 1;
                    t += 30.0 / bpm;
                }
                let Some(grid) = track(&onset, FPS, 0.0) else {
                    wrong.push(format!("{bpm}: yok"));
                    continue;
                };
                let ratio = grid.bpm / bpm;
                if (ratio - 2.0 / 3.0).abs() < 0.03 || (ratio - 1.5).abs() < 0.05 {
                    wrong.push(format!("{bpm} → {:.1}", grid.bpm));
                }
            }
        }
        assert!(wrong.is_empty(), "{wrong:?}");
    }

    #[test]
    fn baslangic_bantlari_her_orneklemede_gecerli() {
        for rate in [8_000, 22_050, 44_100, 48_000, 96_000, 192_000] {
            let detector = OnsetDetector::new(rate, 2048);
            assert!(
                detector
                    .ranges
                    .iter()
                    .all(|&(s, e)| s >= 1 && s < e && e <= 1024),
                "{rate}"
            );
            assert!(
                detector.ranges.windows(2).all(|w| w[0].1 <= w[1].0),
                "{rate}: çakışma"
            );
        }
    }

    #[test]
    fn sessizlik_ve_kisa_parca_ritimsiz() {
        assert_eq!(track(&vec![0.0; 600], FPS, 0.0), None);
        assert_eq!(track(&[1.0; 60], FPS, 0.0), None);
    }

    #[test]
    fn konum_ve_faz() {
        let grid = BeatGrid {
            bpm: 120.0,
            beats: vec![1.0, 1.5, 2.0],
            variable_tempo: false,
        };
        assert_eq!(grid.position_at(0.5), None);
        let p = grid.position_at(1.25).unwrap();
        assert_eq!(p.index, 0);
        assert!((p.phase - 0.5).abs() < 1e-9);
        assert_eq!(grid.position_at(2.0).unwrap().index, 2);
        assert!((grid.position_at(2.25).unwrap().phase - 0.5).abs() < 1e-9);
        assert_eq!(grid.position_at(2.6), None, "son vuruştan bir aralık sonra");
        assert_eq!(grid.position_at(f64::NAN), None);
    }

    /// Basit sözde rastgele sayı üreteci (testler tekrarlanabilir olsun).
    pub(crate) struct Lcg(pub(crate) u64);
    impl Lcg {
        pub(crate) fn next(&mut self) -> f64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((self.0 >> 11) as f64 / (1u64 << 53) as f64) * 2.0 - 1.0
        }
    }

    /// Gerçekçi bir davul + bas + akor kaydı üretir; gerçek vuruş anlarını döndürür.
    /// Kick 1 ve 3'te (bazen 3'ün arkasında da), snare 2 ve 4'te, hi-hat sekizliklerde.
    pub(crate) fn drum_track(
        bpm: f64,
        start: f64,
        seconds: f64,
        rate: u32,
        seed: u64,
    ) -> (Vec<f64>, Vec<f64>) {
        let n = (seconds * f64::from(rate)) as usize;
        let mut out = vec![0.0f64; n];
        let mut rng = Lcg(seed);
        let beat = 60.0 / bpm;
        let mut truth = Vec::new();
        let mut add = |at: f64, len: f64, f: &mut dyn FnMut(f64) -> f64| {
            let s0 = (at * f64::from(rate)) as usize;
            let len = (len * f64::from(rate)) as usize;
            for i in 0..len.min(n.saturating_sub(s0)) {
                out[s0 + i] += f(i as f64 / f64::from(rate));
            }
        };
        let mut index = 0usize;
        let mut t = start;
        while t < seconds - 0.3 {
            truth.push(t);
            let velocity = 0.8 + 0.2 * rng.next().abs();
            let in_bar = index % 4;
            if in_bar == 0 || in_bar == 2 {
                // Kick: 110 Hz'den 45 Hz'e inen sinüs.
                let mut phase = 0.0;
                add(t, 0.25, &mut |x| {
                    phase += 2.0 * std::f64::consts::PI * (45.0 + 65.0 * (-x * 30.0).exp())
                        / f64::from(rate);
                    0.7 * velocity * phase.sin() * (-x * 14.0).exp()
                });
            } else {
                // Snare: gürültü + 190 Hz gövde.
                let mut noise = Lcg(seed ^ index as u64);
                add(t, 0.2, &mut |x| {
                    velocity
                        * (0.35 * noise.next() * (-x * 22.0).exp()
                            + 0.25
                                * (2.0 * std::f64::consts::PI * 190.0 * x).sin()
                                * (-x * 30.0).exp())
                });
            }
            if in_bar == 2 && index % 8 == 2 {
                let mut phase = 0.0;
                add(t + beat * 0.5, 0.2, &mut |x| {
                    phase += 2.0 * std::f64::consts::PI * (45.0 + 65.0 * (-x * 30.0).exp())
                        / f64::from(rate);
                    0.45 * phase.sin() * (-x * 14.0).exp()
                });
            }
            // Hi-hat: türevi alınmış gürültü (tiz), sekizliklerde.
            for half in [0.0, 0.5] {
                let mut noise = Lcg(seed.wrapping_add(index as u64 * 2 + (half * 2.0) as u64));
                let mut previous = 0.0;
                let accent = if half == 0.0 { 0.12 } else { 0.08 };
                add(t + beat * half, 0.05, &mut |x| {
                    let v = noise.next();
                    let hp = v - previous;
                    previous = v;
                    accent * hp * (-x * 90.0).exp()
                });
            }
            // Bas: her vuruşta değişen nota, yumuşak başlangıçlı.
            let note = [55.0, 55.0, 65.4, 49.0][(index / 4) % 4];
            add(t, beat * 0.95, &mut |x| {
                0.18 * (2.0 * std::f64::consts::PI * note * x).sin()
                    * (1.0 - (-x * 60.0).exp())
                    * (-x * 2.0).exp()
            });
            index += 1;
            t = start + index as f64 * beat;
        }
        // Sürekli akor (ritimsiz zemin).
        for (i, sample) in out.iter_mut().enumerate() {
            let x = i as f64 / f64::from(rate);
            *sample += 0.05
                * [220.0, 277.2, 329.6]
                    .iter()
                    .map(|f| (2.0 * std::f64::consts::PI * f * x).sin())
                    .sum::<f64>();
        }
        (out, truth)
    }

    fn analyze_samples(samples: &[f64], rate: u32) -> Option<Arc<BeatGrid>> {
        let path = temp_path("beat.wav");
        write_wav(&path, rate, 2, samples.len(), |f, _| 0.8 * samples[f]);
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        std::fs::remove_file(&path).ok();
        spectrogram.beat_grid()
    }

    #[test]
    fn davul_kaydinda_tempo_vuruslar_ve_senkron() {
        let rate = 44_100;
        for (bpm, start, seed) in [
            (90.0, 1.37, 1),
            (120.0, 0.52, 2),
            (128.0, 2.0, 3),
            (140.0, 0.9, 4),
            (105.5, 1.1, 5),
        ] {
            let (samples, truth) = drum_track(bpm, start, 32.0, rate, seed);
            let grid = analyze_samples(&samples, rate).expect("ritim bulunmalı");
            assert!((grid.bpm - bpm).abs() <= 0.3, "{bpm}: {}", grid.bpm);
            assert!(!grid.variable_tempo, "{bpm}: sabit tempo değişken sanıldı");
            let f = f_measure(&grid.beats, &truth, 0.07);
            assert!(f > 0.95, "{bpm} BPM: F = {f}");
            // Senkron: eşleşen vuruşların ortalama ve en büyük hatası.
            let errors = sync_errors(&grid.beats, &truth);
            let mean = errors.iter().sum::<f64>() / errors.len() as f64;
            let worst = errors.iter().fold(0.0f64, |m, e| m.max(e.abs()));
            eprintln!(
                "{bpm} BPM: bulunan {} F={f:.3} ortalama hata {:.1} ms, en büyük {:.1} ms",
                grid.bpm,
                mean * 1000.0,
                worst * 1000.0
            );
            assert!(
                mean.abs() < 0.005,
                "{bpm} BPM ortalama hata {:.1} ms",
                mean * 1000.0
            );
            assert!(
                worst < 0.02,
                "{bpm} BPM en büyük hata {:.1} ms",
                worst * 1000.0
            );
        }
    }

    /// Her bulunan vuruşun en yakın gerçek vuruşa farkı (saniye; 70 ms içindekiler).
    fn sync_errors(beats: &[f64], truth: &[f64]) -> Vec<f64> {
        beats
            .iter()
            .filter_map(|&b| {
                truth
                    .iter()
                    .map(|&t| b - t)
                    .min_by(|a, c| a.abs().total_cmp(&c.abs()))
            })
            .filter(|e| e.abs() < 0.07)
            .collect()
    }

    #[test]
    fn yarim_tempo_kalibindaki_ara_sabit_tempoyu_degisken_yapmaz() {
        // 120 BPM'lik şarkının ortasında 24 sn'lik bir ara, vuruşları 2/3 tempoda (80 BPM, üçleme
        // ya da yarım tempo kalıbı). Tempo değişmiyor: "değişken" sanılmamalı, tempo 120 kalmalı.
        let rate = 22_050;
        let (mut samples, _) = drum_track(120.0, 0.5, 24.0, rate, 21);
        let (middle, _) = drum_track(80.0, 0.5, 24.0, rate, 22);
        let (end, _) = drum_track(120.0, 0.5, 24.0, rate, 23);
        samples.extend(middle);
        samples.extend(end);
        let grid = analyze_samples(&samples, rate).expect("ritim bulunmalı");
        assert!(
            !grid.variable_tempo,
            "sabit tempo değişken sanıldı: {}",
            grid.bpm
        );
        assert!((grid.bpm - 120.0).abs() < 2.0, "tempo: {}", grid.bpm);
    }

    #[test]
    fn tempo_degisen_sarkida_iki_yarinin_vuruslari_da_bulunur() {
        // 112 BPM'lik 24 sn + 132 BPM'lik 24 sn: tek periyotla izlense bir yarıda vuruşlar
        // kayar ve BPM ~122 çıkardı; parça parça izlemeyle ikisi de bulunur (ANL-04).
        let rate = 22_050;
        let (mut samples, mut truth) = drum_track(112.0, 0.8, 24.0, rate, 11);
        let (second, truth2) = drum_track(132.0, 0.5, 24.0, rate, 12);
        let offset = samples.len() as f64 / f64::from(rate);
        samples.extend(second);
        truth.extend(truth2.iter().map(|t| t + offset));
        let grid = analyze_samples(&samples, rate).expect("ritim bulunmalı");
        assert!(grid.variable_tempo, "tempo değişimi fark edilmeli");
        assert!(
            grid.bpm > 108.0 && grid.bpm < 136.0,
            "ortanca tempo: {}",
            grid.bpm
        );
        let (first_truth, second_truth): (Vec<f64>, Vec<f64>) =
            truth.iter().partition(|&&t| t < offset);
        let (first, second): (Vec<f64>, Vec<f64>) = grid.beats.iter().partition(|&&t| t < offset);
        let f1 = f_measure(&first, &first_truth, 0.07);
        let f2 = f_measure(&second, &second_truth, 0.07);
        eprintln!(
            "112 BPM yarısı F={f1:.3}, 132 BPM yarısı F={f2:.3}, bpm {}",
            grid.bpm
        );
        assert!(f1 > 0.9, "ilk yarı F = {f1}");
        assert!(f2 > 0.9, "ikinci yarı F = {f2}");
    }

    #[test]
    fn her_orneklemede_vuruslar_sesle_senkron() {
        // FFT penceresi düşük hızda zamanda uzun: vuruş ona daha geç oturur. Bu gecikme
        // düşülmeseydi 22,05 kHz'te +12 ms, 8 kHz'te +37 ms geç kalırdı. 192 kHz'te pencere
        // katlanır (ANL-01): kısa vuruşlar kare aralarına düşmez.
        for rate in [8_000, 22_050, 32_000, 48_000, 96_000, 192_000] {
            let mut errors = Vec::new();
            for (bpm, start, seed) in [(90.0, 1.37, 1), (128.0, 2.0, 3)] {
                let (samples, truth) = drum_track(bpm, start, 32.0, rate, seed);
                let grid = analyze_samples(&samples, rate).expect("ritim bulunmalı");
                errors.extend(sync_errors(&grid.beats, &truth));
            }
            let mean = errors.iter().sum::<f64>() / errors.len() as f64;
            let worst = errors.iter().fold(0.0f64, |m, e| m.max(e.abs()));
            eprintln!(
                "{rate} Hz: ortalama hata {:.1} ms, en büyük {:.1} ms",
                mean * 1000.0,
                worst * 1000.0
            );
            assert!(
                mean.abs() < 0.005,
                "{rate} Hz ortalama {:.1} ms",
                mean * 1000.0
            );
            // Tek tek vuruşların titreşimi bu düzeltmenin konusu değil: 96 kHz'te kısa
            // pencere yüzünden tek bir vuruş ~25 ms sapabiliyor (44,1 kHz testi ≤ 20 ms ister).
            assert!(worst < 0.03, "{rate} Hz en büyük {:.1} ms", worst * 1000.0);
        }
    }

    #[test]
    fn ritimsiz_gurultude_vurus_uydurmaz() {
        let rate = 22_050;
        let mut rng = Lcg(7);
        let samples: Vec<f64> = (0..rate as usize * 20).map(|_| 0.3 * rng.next()).collect();
        assert_eq!(analyze_samples(&samples, rate), None);
    }
}
