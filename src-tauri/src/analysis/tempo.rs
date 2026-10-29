//! Tempo oktavı: takipçinin bulduğu tempo ([`super::beats::track`]) doğrunun yarısı ya da iki
//! katı olabilir. Öz-ilinti yalnızca "hangi aralıkta tekrar var" der; drum and bass'ta snare'ler
//! iki vuruşta bir geldiği için yarı tempo (87), yarım tempolu trap'te kick ve clap ölçüde bir
//! geldiği için yarı tempo (70), yavaş baladda sekizlik piyano yüzünden iki kat (132) bulunur.
//!
//! DJ yazılımlarının ve müzisyenlerin kabulü: dubstep/trap 140, drum and bass 170–176, hip-hop
//! 85–95, house 120–128, balad 60–72 (bkz. `docs/arastirma/tempo/README.md`). Bu modül bulunan
//! temponun yarısını ve iki katını, vuruş ızgarasının kendi kanıtıyla sınar:
//!
//! 1. **Vuruş arasında davul:** kick ve snare doğru tempoda vuruşa düşer (kick 1 ve 3'te, snare
//!    2 ve 4'te). Vuruş aralarındaki kick ya da snare vuruşlardakinden güçlüyse (drum and bass
//!    87'de snare'ler ya da kick'ler vuruş aralarına düşer) gerçek vuruş iki kat hızlıdır. Kalıp
//!    her vuruş arasını doldurmayabilir: güçlü yarıların ortalaması karşılaştırılır.
//! 2. **Yarım tempo hissi:** tempo yavaşsa ([`HALF_TIME_BPM`]'in altı) ve iki katı tempoda da
//!    vuruş araları doluysa (hi-hat sekizlikleri) iki katı seçilir: trap ve dubstep 140'tır.
//!    Sınır, dinleyicilerin yeğlediği tempo bölgesinden (~120 BPM çevresi, bir oktav; Moelants,
//!    McKinney) gelir; yalnızca kanıt (araların doluluğu) varken uygulanır.
//! 3. **Boş vuruş araları:** vuruşların arası neredeyse hiç dolmuyorsa (baladda sekizlik piyano
//!    vuruş sanılmış) ve yarısı tempoda vuruş aralarında vurgu yoksa yarısı seçilir.
//!
//! Ayarlar sentetik geliştirme setinde yapıldı, ayrı tohumlu doğrulama setinde ölçüldü
//! (`docs/arastirma/tempo/`). Değişken tempolu ızgaraya dokunulmaz.

use super::beats::{mean_interval, normalize, track_period, BeatGrid};

/// Bas bantları (30–145 Hz: kick, bas) ve orta bantlar (145 Hz–1,9 kHz: snare gövdesi, clap);
/// 32 bantlık spektrogramda.
const LOW_BANDS: std::ops::Range<usize> = 0..8;
const MID_BANDS: std::ops::Range<usize> = 8..21;
/// Vuruşun kendisi sayılan bölge (vuruş aralığına oranla, vuruşun iki yanı) ve vuruş arası
/// sayılan bölge (swing'li sekizlik de içinde kalsın diye geniş).
const ON_BEAT: f64 = 0.08;
const OFF_BEAT: (f64, f64) = (0.3, 0.7);
/// Snare/clap bantları (500 Hz–5 kHz) ve spektrogram seviyelerinin desibel aralığı (0..255 ↔
/// −66..−6 dB).
const SNARE_BANDS: std::ops::Range<usize> = 14..26;
const LEVEL_RANGE_DB: f64 = 60.0;
/// Vuruş arasındaki vurgu (ya da snare) vuruşlardakinin bu katından fazlaysa tempo iki katıdır.
const OFFBEAT_ACCENT_MAX: f64 = 1.1;
/// Yarıya inerken: seçilen yarıda vuruş arasındaki vurgu bundan azsa (snare vuruşta).
const SPARSE_OFFBEAT_ACCENT_MAX: f64 = 0.5;
/// Bundan yavaş tempo, iki katında vuruş araları doluysa yarım tempo hissi sayılır.
const HALF_TIME_BPM: f64 = 80.0;
/// Yarım tempo hissinde iki katı tempoda vuruş aralarının en az doluluğu (başlangıç gücü).
const HALF_TIME_FILL_MIN: f64 = 0.2;
/// Vuruş araları bundan boşsa (başlangıç gücü) tempo iki kat bulunmuştur.
const SPARSE_FILL_MAX: f64 = 0.12;
/// Bundan az vuruşlu ızgaraya dokunulmaz.
const MIN_BEATS: usize = 8;
/// Aranan tempo aralığı ([`super::beats`] ile aynı).
const MIN_BPM: f64 = 60.0;
const MAX_BPM: f64 = 200.0;

/// Takipçinin ızgarasını gerekirse iki katı ya da yarısı tempoya çevirir. `onset`: kare başına
/// başlangıç gücü; `bands`: kare başına `bands_per_frame` bant seviyesi (0..255); `latency`:
/// başlangıç gücünün gecikmesi (vuruş anlarından düşülmüş olan).
pub fn resolve_octave(
    grid: BeatGrid,
    onset: &[f32],
    bands: &[u8],
    bands_per_frame: usize,
    fps: f64,
    latency: f64,
) -> BeatGrid {
    if grid.variable_tempo
        || grid.beats.len() < MIN_BEATS
        || bands_per_frame < MID_BANDS.end
        || grid.bpm <= 0.0
    {
        return grid;
    }
    let Some(strength) = normalize(onset, fps).map(|s| box3(&s)) else {
        return grid;
    };
    let accent = accent_envelope(bands, bands_per_frame);
    let frame = |t: f64| (t + latency) * fps;
    let ratio = |envelope: &[f64], beats: &[f64]| offbeat_ratio(envelope, beats, &frame);
    let strong = |envelope: &[f64], beats: &[f64]| strong_offbeat_ratio(envelope, beats, &frame);

    // 1. Kick ya da snare vuruş aralarında mı? dB vurgusu kısık başlangıçları da sayar; doğrusal
    //    snare gücü yalnızca yüksek ve geniş bantlı vuruşu (akor vuruşları karışmasın).
    let drums_between = strong(&accent, &grid.beats) > OFFBEAT_ACCENT_MAX
        || strong(&snare_envelope(bands, bands_per_frame), &grid.beats) > OFFBEAT_ACCENT_MAX;
    let doubled_bpm = 2.0 * grid.bpm;
    if doubled_bpm <= MAX_BPM && (drums_between || grid.bpm < HALF_TIME_BPM) {
        let doubled = with_midpoints(&grid.beats);
        // İki katı tempoda yeniden izlenen ızgara: vuruşlar başlangıçlara oturur (ara ortaları
        // swing'de ya da kick'e göre kayabilir).
        let retracked = retrack(onset, fps, latency, &grid, 60.0 / doubled_bpm);
        // 2. Yarım tempo hissi: iki katı tempoda da vuruş araları dolu (hi-hat sekizlikleri).
        let half_time = grid.bpm < HALF_TIME_BPM
            && ratio(&strength, retracked.as_ref().map_or(&doubled, |g| &g.beats))
                >= HALF_TIME_FILL_MIN;
        if drums_between || half_time {
            return retracked.unwrap_or(BeatGrid {
                bpm: rounded_bpm(&doubled),
                beats: doubled,
                variable_tempo: false,
            });
        }
    }
    // 3. Vuruş araları boş: tempo iki kat bulunmuş olabilir. Yarısının hangi vuruşları? Araları
    //    vurgusuz olanı (snare ve kick vuruşa düşer); öyle bir yarı yoksa dokunulmaz.
    if grid.bpm / 2.0 >= MIN_BPM && ratio(&strength, &grid.beats) < SPARSE_FILL_MAX {
        let best = [0, 1]
            .into_iter()
            .map(|phase| -> Vec<f64> {
                grid.beats.iter().skip(phase).step_by(2).copied().collect()
            })
            .map(|beats| (ratio(&accent, &beats), beats))
            .min_by(|a, b| a.0.total_cmp(&b.0));
        if let Some((between, beats)) = best {
            if between <= SPARSE_OFFBEAT_ACCENT_MAX && beats.len() >= MIN_BEATS / 2 {
                return BeatGrid {
                    bpm: rounded_bpm(&beats),
                    beats,
                    variable_tempo: false,
                };
            }
        }
    }
    grid
}

/// Verilen aralıkla (saniye) yeniden izler: vuruşlar başlangıçlara oturur.
fn retrack(
    onset: &[f32],
    fps: f64,
    latency: f64,
    grid: &BeatGrid,
    period_secs: f64,
) -> Option<BeatGrid> {
    let (beats, _) = track_period(onset, fps, latency, period_secs)?;
    // İzleme ızgaranın kapsadığından çok kısa kalırsa (sessiz uçlar) güvenilmez.
    (beats.len() >= grid.beats.len()).then(|| BeatGrid {
        bpm: rounded_bpm(&beats),
        beats,
        variable_tempo: false,
    })
}

/// Tempo (BPM, bir ondalık): vuruşlara uydurulan ortalama aralıktan.
fn rounded_bpm(beats: &[f64]) -> f64 {
    (600.0 / mean_interval(beats)).round() / 10.0
}

/// Üç karelik toplam: kare sınırına düşen vuruşun gücü iki kareye bölünür (60 kare/sn'de 144
/// BPM'in sekizliği 12,5 kare); toplam onu bütün sayar.
fn box3(values: &[f64]) -> Vec<f64> {
    (0..values.len())
        .map(|i| {
            values[i.saturating_sub(1)..(i + 2).min(values.len())]
                .iter()
                .sum()
        })
        .collect()
}

/// Vuruşlar ve aralarının ortaları.
fn with_midpoints(beats: &[f64]) -> Vec<f64> {
    let mut out = Vec::with_capacity(beats.len() * 2);
    for pair in beats.windows(2) {
        out.push(pair[0]);
        out.push(0.5 * (pair[0] + pair[1]));
    }
    out.extend(beats.last());
    out
}

/// Kare başına vurgu: bas ve orta bantlarda seviye artışı (her biri kendi standart sapmasına
/// bölünür; kick de snare de sayılsın).
fn accent_envelope(bands: &[u8], bands_per_frame: usize) -> Vec<f64> {
    let frames: Vec<&[u8]> = bands.chunks_exact(bands_per_frame).collect();
    let rise = |range: std::ops::Range<usize>| -> Vec<f64> {
        let width = range.len() as f64;
        let mut out: Vec<f64> = frames
            .iter()
            .enumerate()
            .map(|(i, frame)| {
                let previous = frames[i.saturating_sub(1)];
                range
                    .clone()
                    .map(|b| (f64::from(frame[b]) - f64::from(previous[b])).max(0.0))
                    .sum::<f64>()
                    / width
            })
            .collect();
        let deviation = standard_deviation(&out);
        if deviation > 1e-9 {
            out.iter_mut().for_each(|v| *v /= deviation);
        }
        out
    };
    rise(LOW_BANDS)
        .iter()
        .zip(rise(MID_BANDS))
        .map(|(low, mid)| low + mid)
        .collect()
}

/// Kare başına snare/clap gücü: 500 Hz–5 kHz bantlarında **doğrusal** güç artışı. Seviyeler
/// desibel olduğundan doğrusala çevrilir: sessizlikten çıkan kısık hi-hat ya da piyano değil,
/// yüksek ve geniş bantlı vuruş (snare, clap) ağır basar.
fn snare_envelope(bands: &[u8], bands_per_frame: usize) -> Vec<f64> {
    // Seviye 0..255, `LEVEL_RANGE_DB` desibellik aralığa eşlenmiştir.
    let power = |level: u8| 10f64.powf(f64::from(level) / 255.0 * LEVEL_RANGE_DB / 10.0);
    let frames: Vec<&[u8]> = bands.chunks_exact(bands_per_frame).collect();
    frames
        .iter()
        .enumerate()
        .map(|(i, frame)| {
            let previous = frames[i.saturating_sub(1)];
            SNARE_BANDS
                .clone()
                .map(|b| (power(frame[b]) - power(previous[b])).max(0.0))
                .sum()
        })
        .collect()
}

fn standard_deviation(values: &[f64]) -> f64 {
    let n = values.len().max(1) as f64;
    let mean = values.iter().sum::<f64>() / n;
    (values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n).sqrt()
}

/// Vuruş aralarındaki en güçlü değerin ortalaması / vuruşlardaki en güçlü değerin ortalaması.
/// `frame`: zamanı (saniye) kare sırasına çevirir.
fn offbeat_ratio(envelope: &[f64], beats: &[f64], frame: &dyn Fn(f64) -> f64) -> f64 {
    let (on, off) = peaks(envelope, beats, frame);
    quotient(mean(&on), mean(&off))
}

/// Güçlü yarıların oranı: vuruş aralarındaki en güçlü değerlerin büyük yarısının ortalaması /
/// vuruşlardakinin büyük yarısının. Kalıp her vuruş arasını doldurmasa da (drum and bass'ta kick
/// iki aradan birinde) aradaki vuruş sayılır.
fn strong_offbeat_ratio(envelope: &[f64], beats: &[f64], frame: &dyn Fn(f64) -> f64) -> f64 {
    let (on, off) = peaks(envelope, beats, frame);
    quotient(upper_half_mean(on), upper_half_mean(off))
}

/// Her vuruş aralığı için vuruştaki ve aradaki en güçlü değer.
fn peaks(envelope: &[f64], beats: &[f64], frame: &dyn Fn(f64) -> f64) -> (Vec<f64>, Vec<f64>) {
    let peak = |from: f64, to: f64| {
        let start = from.round().max(0.0) as usize;
        let end = ((to.round().max(0.0) as usize) + 1).min(envelope.len());
        envelope
            .get(start..end)
            .map_or(0.0, |s| s.iter().copied().fold(0.0, f64::max))
    };
    beats
        .windows(2)
        .map(|pair| {
            let (a, b) = (frame(pair[0]), frame(pair[1]));
            let span = b - a;
            (
                peak(a - ON_BEAT * span, a + ON_BEAT * span),
                peak(a + OFF_BEAT.0 * span, a + OFF_BEAT.1 * span),
            )
        })
        .unzip()
}

fn mean(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len().max(1) as f64
}

fn upper_half_mean(mut values: Vec<f64>) -> f64 {
    values.sort_by(f64::total_cmp);
    let half = values.len() / 2;
    mean(&values[half..])
}

/// `off / on`; vuruşlarda hiçbir şey yoksa aradaki varsa sonsuz.
fn quotient(on: f64, off: f64) -> f64 {
    if on <= 1e-12 {
        return if off > 0.0 { f64::INFINITY } else { 0.0 };
    }
    off / on
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::beats::tests::Lcg;
    use crate::analysis::evaluate::f_measure;
    use crate::analysis::spectrogram::{analyze, Spectrogram};
    use crate::audio::decode::Decoder;
    use crate::audio::test_util::{temp_path, write_wav};

    const RATE: u32 = 22_050;

    /// Sentetik davul kaydı: `pattern` (ölçüdeki vuruş konumu, çalgı) dört vuruşluk ölçüde
    /// tekrar eder. Gerçek vuruş anlarını da döndürür.
    struct Drums {
        out: Vec<f64>,
        rng: Lcg,
    }

    #[derive(Clone, Copy)]
    enum Hit {
        Kick,
        Snare,
        Hat,
    }

    impl Drums {
        fn new(seconds: f64, seed: u64) -> Self {
            Self {
                out: vec![0.0; (seconds * f64::from(RATE)) as usize],
                rng: Lcg(seed),
            }
        }

        fn hit(&mut self, at: f64, hit: Hit, gain: f64) {
            let rate = f64::from(RATE);
            let start = (at * rate) as usize;
            let (len, mut phase, mut previous) = (0.3, 0.0, 0.0);
            for i in 0..((len * rate) as usize).min(self.out.len().saturating_sub(start)) {
                let x = i as f64 / rate;
                let v = match hit {
                    Hit::Kick => {
                        phase +=
                            2.0 * std::f64::consts::PI * (48.0 + 90.0 * (-x * 30.0).exp()) / rate;
                        0.8 * phase.sin() * (-x * 9.0).exp()
                    }
                    Hit::Snare => {
                        let n = self.rng.next();
                        (0.45 * n + 0.3 * (2.0 * std::f64::consts::PI * 200.0 * x).sin())
                            * (-x * 18.0).exp()
                    }
                    Hit::Hat => {
                        let n = self.rng.next();
                        let hp = n - previous;
                        previous = n;
                        0.12 * hp * (-x * 70.0).exp()
                    }
                };
                self.out[start + i] += gain * v;
            }
        }

        /// Kalıbı `bpm` tempoda şarkı boyunca yazar; gerçek vuruşları döndürür.
        fn pattern(&mut self, bpm: f64, hits: &[(f64, Hit, f64)]) -> Vec<f64> {
            let beat = 60.0 / bpm;
            let seconds = self.out.len() as f64 / f64::from(RATE);
            let start = 0.5;
            let mut truth = Vec::new();
            let mut bar = 0;
            while start + (bar as f64 + 1.0) * 4.0 * beat < seconds - 0.5 {
                let t0 = start + bar as f64 * 4.0 * beat;
                for &(pos, hit, gain) in hits {
                    let velocity = 0.85 + 0.15 * self.rng.next().abs();
                    self.hit(t0 + pos * beat, hit, gain * velocity);
                }
                truth.extend((0..4).map(|q| t0 + f64::from(q) * beat));
                bar += 1;
            }
            truth
        }
    }

    fn analyzed(samples: &[f64]) -> BeatGrid {
        let path = temp_path("tempo-oktav.wav");
        write_wav(&path, RATE, 1, samples.len(), |f, _| {
            (0.7 * samples[f]).clamp(-1.0, 1.0)
        });
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        std::fs::remove_file(&path).ok();
        spectrogram.beat_grid().unwrap().as_ref().clone()
    }

    fn hats(steps: usize, gain: f64) -> Vec<(f64, Hit, f64)> {
        (0..steps)
            .map(|i| (4.0 * i as f64 / steps as f64, Hit::Hat, gain))
            .collect()
    }

    #[test]
    fn drum_and_bass_iki_adim_tam_tempoda() {
        // Kick 1'de ve 3'ün arkasında, snare 2 ve 4'te; eski takipçi 87 buluyordu.
        for (bpm, seed) in [(172.0, 1), (175.0, 2)] {
            let mut drums = Drums::new(40.0, seed);
            let mut hits = vec![
                (0.0, Hit::Kick, 1.0),
                (2.5, Hit::Kick, 0.9),
                (1.0, Hit::Snare, 1.0),
                (3.0, Hit::Snare, 1.0),
            ];
            hits.extend(hats(8, 0.6));
            let truth = drums.pattern(bpm, &hits);
            let grid = analyzed(&drums.out);
            assert!((grid.bpm / bpm - 1.0).abs() < 0.02, "{bpm}: {}", grid.bpm);
            let f = f_measure(&grid.beats, &truth, 0.07);
            assert!(f > 0.9, "{bpm}: F = {f}");
        }
    }

    #[test]
    fn yarim_tempolu_trap_ve_dubstep_140() {
        // Kick 1'de, clap 3'te (yarım tempo hissi), hi-hat sekizlik: doğrusu 140, 70 değil.
        for (bpm, seed) in [(140.0, 3), (144.0, 4)] {
            let mut drums = Drums::new(40.0, seed);
            let mut hits = vec![
                (0.0, Hit::Kick, 1.0),
                (1.75, Hit::Kick, 0.7),
                (2.0, Hit::Snare, 1.0),
            ];
            // Trap'te hi-hat önde ve belirgindir.
            hits.extend(hats(8, 1.5));
            let truth = drums.pattern(bpm, &hits);
            let grid = analyzed(&drums.out);
            assert!((grid.bpm / bpm - 1.0).abs() < 0.02, "{bpm}: {}", grid.bpm);
            let f = f_measure(&grid.beats, &truth, 0.07);
            assert!(f > 0.9, "{bpm}: F = {f}");
        }
    }

    #[test]
    fn hip_hop_ve_pop_tempolari_iki_katina_cikmaz() {
        // Kick/snare boom-bap ve on altılık hi-hat: 88 BPM 176 olmamalı; 110'luk pop da 55 değil.
        for (bpm, steps, seed) in [(88.0, 16, 5), (94.0, 8, 6), (110.0, 8, 7)] {
            let mut drums = Drums::new(40.0, seed);
            let mut hits = vec![
                (0.0, Hit::Kick, 1.0),
                (2.5, Hit::Kick, 0.8),
                (1.0, Hit::Snare, 1.0),
                (3.0, Hit::Snare, 1.0),
            ];
            hits.extend(hats(steps, 0.6));
            drums.pattern(bpm, &hits);
            let grid = analyzed(&drums.out);
            assert!((grid.bpm / bpm - 1.0).abs() < 0.02, "{bpm}: {}", grid.bpm);
        }
    }

    #[test]
    fn yavas_baladda_sekizlikler_vurus_sayilmaz() {
        // 64 BPM: kick 1'de, snare 2 ve 4'te, sekizliklerde hafif tık (piyano gibi); vuruş
        // araları (on altılıklar) boş. Doğrusu 64, 128 değil.
        let bpm = 64.0;
        let mut drums = Drums::new(48.0, 8);
        let mut hits = vec![
            (0.0, Hit::Kick, 0.9),
            (1.0, Hit::Snare, 0.6),
            (3.0, Hit::Snare, 0.6),
        ];
        hits.extend(hats(8, 1.6));
        let truth = drums.pattern(bpm, &hits);
        let grid = analyzed(&drums.out);
        assert!((grid.bpm / bpm - 1.0).abs() < 0.02, "{}", grid.bpm);
        let f = f_measure(&grid.beats, &truth, 0.07);
        assert!(f > 0.9, "F = {f}");
    }

    #[test]
    fn ara_ortalari_ve_oran() {
        assert_eq!(
            with_midpoints(&[0.0, 1.0, 2.0]),
            vec![0.0, 0.5, 1.0, 1.5, 2.0]
        );
        // Vurgu yalnızca vuruş aralarında: oran büyük; yalnızca vuruşlarda: sıfır.
        let mut envelope = vec![0.0; 600];
        for k in 0..20 {
            envelope[k * 30 + 15] = 1.0;
        }
        let beats: Vec<f64> = (0..20).map(|k| f64::from(k) * 0.5).collect();
        let frame = |t: f64| t * 60.0;
        assert!(offbeat_ratio(&envelope, &beats, &frame) > 10.0);
        let shifted: Vec<f64> = beats.iter().map(|b| b + 0.25).collect();
        assert!(offbeat_ratio(&envelope, &shifted, &frame) < 1e-9);

        // Drum and bass gibi: her vuruşta snare (0,6), iki aradan yalnızca birinde kick (1,0).
        // Ortalama kick'i yarıya böler (0,83); güçlü yarılar onu sayar (1,67).
        let mut envelope = vec![0.0; 600];
        for k in 0..20 {
            envelope[k * 30] = 0.6;
            if k % 2 == 0 {
                envelope[k * 30 + 15] = 1.0;
            }
        }
        assert!(offbeat_ratio(&envelope, &beats, &frame) < 1.0);
        assert!(strong_offbeat_ratio(&envelope, &beats, &frame) > OFFBEAT_ACCENT_MAX);
    }
}
