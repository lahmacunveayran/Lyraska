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
//!    her vuruş arasını doldurmayabilir: güçlü yarıların ortalaması karşılaştırılır. Snare
//!    için ayrıca ölçünün **dört** aralığının hepsinde olmalı ve gürültü olmalı: maksumun
//!    tek'leri aralıkların yalnızca bir kısmına düşer (ve 4'te vuruşta da çalar), arpejin
//!    notaları tonaldır.
//! 2. **Yarım tempo hissi:** tempo yavaşsa ([`HALF_TIME_BPM`]'in altı) ve iki katı tempoda da
//!    vuruş araları hi-hat'le doluysa (geniş bantlı tiz gürültü; davulsuz arpej sayılmaz) iki
//!    katı seçilir: trap ve dubstep 140'tır.
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
/// Hi-hat bantları (2,2–16 kHz): geniş bantlı tiz gürültü burada her bantta birden yükselir.
const NOISE_BANDS: std::ops::Range<usize> = 22..32;
/// Yarım tempo hissi için iki katı tempoda vuruş aralarında hi-hat gürültüsünün en az ortalama
/// yükselişi (seviye birimi; 255 = 60 dB, yani ~0,5 dB her tiz bantta).
const HAT_NOISE_MIN: f64 = 2.0;
/// Snare'in vuruş arasında sayılması için: snare'li aralıkların en az bu kadarında arada olmalı.
const SNARE_EVERY_GAP_MIN: f64 = 0.9;
/// Yeniden izlenen ızgara beklenen (iki kat) vuruş sayısının en az bu kadarını kapsamalı.
const RETRACK_MIN_COVERAGE: f64 = 0.9;
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
        || bands_per_frame < MID_BANDS.end.max(SNARE_BANDS.end).max(NOISE_BANDS.end)
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
    //    snare gücü yalnızca yüksek ve geniş bantlı vuruşu (akor vuruşları karışmasın). Snare
    //    için ayrıca **her** vuruş arasında olmalı: backbeat yarı tempoda her aralığa düşer;
    //    maksumun tek'leri ise aralıkların bir kısmında ve vuruşta da çalar.
    let snare = snare_envelope(bands, bands_per_frame);
    // Snare ve hi-hat gürültüdür: tiz bantların hepsinde birden yükselir (tonal nota değil).
    let noise = noise_envelope(bands, bands_per_frame);
    let snare_coverage = gap_coverage(&snare, &grid.beats, &frame);
    let drums_between = strong(&accent, &grid.beats) > OFFBEAT_ACCENT_MAX
        || (strong(&snare, &grid.beats) > OFFBEAT_ACCENT_MAX
            && snare_coverage >= SNARE_EVERY_GAP_MIN
            && offbeat_noise(&noise, &grid.beats, &frame) >= HAT_NOISE_MIN);
    let doubled_bpm = 2.0 * grid.bpm;
    if doubled_bpm <= MAX_BPM && (drums_between || grid.bpm < HALF_TIME_BPM) {
        let doubled = with_midpoints(&grid.beats);
        // İki katı tempoda yeniden izlenen ızgara: vuruşlar başlangıçlara oturur (ara ortaları
        // swing'de ya da kick'e göre kayabilir).
        let retracked = retrack(onset, fps, latency, &grid, 60.0 / doubled_bpm);
        let fine = retracked.as_ref().map_or(&doubled, |g| &g.beats);
        // 2. Yarım tempo hissi: iki katı tempoda da vuruş araları dolu ve orada hi-hat (geniş
        //    bantlı tiz gürültü) var. Davulsuz arpej de araları doldurur ama hi-hat değildir.
        let half_time = grid.bpm < HALF_TIME_BPM
            && ratio(&strength, fine) >= HALF_TIME_FILL_MIN
            && offbeat_noise(&noise, fine, &frame) >= HAT_NOISE_MIN;
        if drums_between || half_time {
            if let Some(retracked) = retracked {
                return retracked;
            }
            let bpm = rounded_bpm(&doubled);
            if bpm <= MAX_BPM {
                return BeatGrid {
                    bpm,
                    beats: doubled,
                    variable_tempo: false,
                };
            }
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
    let bpm = rounded_bpm(&beats);
    // Gerçekten iki katı olmalı: vuruş sayısı ~2 kat (izleme şarkının bir kısmında kalmadı),
    // tempo istenenin ±%3'ü içinde ve aralığın içinde.
    let wanted = 60.0 / period_secs;
    let enough = beats.len() as f64 >= RETRACK_MIN_COVERAGE * 2.0 * grid.beats.len() as f64;
    (enough && (bpm / wanted - 1.0).abs() <= 0.03 && bpm <= MAX_BPM).then_some(BeatGrid {
        bpm,
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

/// Snare'in her vuruş arasına düşme oranı: dört aralıklık (bir ölçü) kayan pencerelerden snare'li
/// olanların ne kadarında **dört** aranın hepsinde snare var. Yarı tempoda sayılan backbeat
/// (drum and bass 87) her araya düşer; maksumun tek'leri yalnızca bazı aralara (ve vuruşa).
/// Snare: bütün değerlerin %90'lık diliminin 0,3 katını geçen.
fn gap_coverage(envelope: &[f64], beats: &[f64], frame: &dyn Fn(f64) -> f64) -> f64 {
    let (on, off) = peaks(envelope, beats, frame);
    let mut all: Vec<f64> = on.iter().chain(&off).copied().collect();
    all.sort_by(f64::total_cmp);
    let Some(&high) = all.get(all.len() * 9 / 10) else {
        return 0.0;
    };
    let hit = 0.3 * high;
    if hit <= 1e-12 {
        return 0.0;
    }
    let (mut active, mut full) = (0usize, 0usize);
    for (on, off) in on.windows(4).zip(off.windows(4)) {
        if on.iter().chain(off).any(|&v| v >= hit) {
            active += 1;
            if off.iter().all(|&v| v >= hit) {
                full += 1;
            }
        }
    }
    full as f64 / active.max(1) as f64
}

/// Kare başına geniş bantlı tiz gürültü: tiz bantlardaki desibel artışlarının alttan üçüncüsü.
/// Hi-hat ve snare her bantta birden yükselir; tonal bir nota yalnızca birkaç bantta.
fn noise_envelope(bands: &[u8], bands_per_frame: usize) -> Vec<f64> {
    let frames: Vec<&[u8]> = bands.chunks_exact(bands_per_frame).collect();
    frames
        .iter()
        .enumerate()
        .map(|(i, frame)| {
            let previous = frames[i.saturating_sub(1)];
            let mut rises: Vec<f64> = NOISE_BANDS
                .map(|b| (f64::from(frame[b]) - f64::from(previous[b])).max(0.0))
                .collect();
            rises.sort_by(f64::total_cmp);
            rises.get(2).copied().unwrap_or(0.0)
        })
        .collect()
}

/// Vuruş aralarındaki en güçlü değerlerin ortalaması.
fn offbeat_noise(envelope: &[f64], beats: &[f64], frame: &dyn Fn(f64) -> f64) -> f64 {
    mean(&peaks(envelope, beats, frame).1)
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
        /// Darbuka: düm (pes, yuvarlak) ve tek (tiz, kuru).
        Dum,
        Tek,
        /// Tonal nota (saz, piyano): frekans (Hz) ve süre (sn); üç harmonikli, kısa atak.
        Note(f64, f64),
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
            let len = match hit {
                Hit::Note(_, duration) => duration,
                _ => 0.3,
            };
            let (mut phase, mut previous) = (0.0, 0.0);
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
                    Hit::Dum => {
                        phase +=
                            2.0 * std::f64::consts::PI * (70.0 + 60.0 * (-x * 50.0).exp()) / rate;
                        0.8 * phase.sin() * (-x * 7.0).exp()
                    }
                    Hit::Tek => {
                        let n = self.rng.next();
                        let hp = n - previous;
                        previous = n;
                        (0.3 * hp + 0.5 * (2.0 * std::f64::consts::PI * 750.0 * x).sin())
                            * (-x * 50.0).exp()
                    }
                    Hit::Note(freq, duration) => {
                        let tone: f64 = (1..=3)
                            .map(|h| {
                                (2.0 * std::f64::consts::PI * freq * f64::from(h) * x).sin()
                                    / f64::from(h)
                            })
                            .sum();
                        0.15 * tone * (x / 0.004).min(1.0) * ((duration - x) / 0.03).clamp(0.0, 1.0)
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

    /// Takipçi ve oktav seçimi (aksak ölçü aranmadan): bu modülün sonucu.
    fn resolved(samples: &[f64]) -> BeatGrid {
        let path = temp_path("tempo-oktav-cozulen.wav");
        write_wav(&path, RATE, 1, samples.len(), |f, _| {
            (0.7 * samples[f]).clamp(-1.0, 1.0)
        });
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        std::fs::remove_file(&path).ok();
        let saved = spectrogram.saved().unwrap();
        let latency = crate::analysis::beats::onset_latency(RATE, 2048);
        let grid = crate::analysis::beats::track(&saved.onset, 60.0, latency).unwrap();
        resolve_octave(grid, &saved.onset, &saved.levels, 32, 60.0, latency)
    }

    /// Maksum (düm tek . tek düm . tek .) ve saz sekizlikleri; `pop` ise üstüne kick 1 ve 3'te,
    /// snare 2 ve 4'te, hi-hat sekizliklerde (Türk pop'u).
    fn maksum(bpm: f64, seed: u64, pop: bool) -> Vec<f64> {
        let mut drums = Drums::new(40.0, seed);
        let mut hits = vec![
            (0.0, Hit::Dum, 1.0),
            (2.0, Hit::Dum, 1.0),
            (0.5, Hit::Tek, 0.9),
            (1.5, Hit::Tek, 0.9),
            (3.0, Hit::Tek, 0.9),
        ];
        let saz = [220.0, 261.6, 293.7, 329.6];
        hits.extend((0..8).map(|e| {
            (
                f64::from(e) / 2.0,
                Hit::Note(saz[e as usize % 4], 0.25),
                0.6,
            )
        }));
        if pop {
            hits.extend([
                (0.0, Hit::Kick, 0.8),
                (2.0, Hit::Kick, 0.8),
                (1.0, Hit::Snare, 0.8),
                (3.0, Hit::Snare, 0.8),
            ]);
            hits.extend(hats(8, 0.5));
        }
        drums.pattern(bpm, &hits);
        drums.out
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
    fn maksum_ve_turk_pop_iki_katina_cikmaz() {
        // Tek'ler vuruş aralarında (1'in ve 2'nin arkası) ve 4'te: snare'in her vuruş arasına
        // düştüğü drum and bass değildir. Doğrusu 93/97, 186/194 değil (inceleme karşı örneği).
        for (bpm, seed, pop) in [
            (93.0, 11, false),
            (97.0, 12, false),
            (94.0, 13, true),
            (99.0, 14, true),
        ] {
            let grid = resolved(&maksum(bpm, seed, pop));
            assert!(
                (grid.bpm / bpm - 1.0).abs() < 0.02,
                "{bpm} (pop {pop}): {}",
                grid.bpm
            );
        }
    }

    #[test]
    fn davulsuz_arpejli_piyano_iki_katina_cikmaz() {
        // Sol el vuruşlarda, sağ el on altılık arpej; davul yok. Vuruş araları dolu ama hi-hat
        // yok: yarım tempo hissi değildir. Doğrusu 72/76, 144/152 değil.
        for (bpm, seed) in [(72.0, 21), (76.0, 22)] {
            let mut drums = Drums::new(40.0, seed);
            let mut hits: Vec<(f64, Hit, f64)> = (0..4)
                .map(|q| (f64::from(q), Hit::Note(73.4, 0.7), 1.2))
                .collect();
            let arpeggio = [293.7, 440.0, 370.0, 440.0];
            hits.extend((0..16).map(|s| {
                (
                    f64::from(s) / 4.0,
                    Hit::Note(arpeggio[s as usize % 4], 0.18),
                    0.6,
                )
            }));
            drums.pattern(bpm, &hits);
            let grid = resolved(&drums.out);
            assert!((grid.bpm / bpm - 1.0).abs() < 0.02, "{bpm}: {}", grid.bpm);
        }
    }

    #[test]
    fn dar_bant_dizisinde_panik_yok() {
        // 22 bantlı kare: hiçbir bant aralığı taşmamalı (eskiden snare bantları 14..26 taşıyordu).
        let fps = 60.0;
        let frames = 60 * 30;
        let onset: Vec<f32> = (0..frames)
            .map(|i| if i % 30 == 0 { 1.0 } else { 0.0 })
            .collect();
        let bands = vec![100u8; frames * 22];
        let grid = BeatGrid {
            bpm: 120.0,
            beats: (0..60).map(|k| f64::from(k) * 0.5).collect(),
            variable_tempo: false,
        };
        let out = resolve_octave(grid.clone(), &onset, &bands, 22, fps, 0.0);
        assert_eq!(out, grid);
    }

    #[test]
    fn yeniden_izleme_iki_kat_kapsamali_ve_sinir_icinde() {
        let fps = 60.0;
        let grid = |bpm: f64, n: usize| BeatGrid {
            bpm,
            beats: (0..n).map(|k| 0.5 + k as f64 * 60.0 / bpm).collect(),
            variable_tempo: false,
        };
        let impulses = |bpm: f64, seconds: f64, until: f64| -> Vec<f32> {
            let mut onset = vec![0.02f32; (seconds * fps) as usize];
            let mut t = 0.5;
            while t < until {
                onset[(t * fps).round() as usize] = 1.0;
                t += 60.0 / bpm;
            }
            onset
        };
        // Sağlam: 100 → 200, şarkının tamamı.
        let ok = retrack(
            &impulses(200.0, 40.0, 39.0),
            fps,
            0.0,
            &grid(100.0, 64),
            0.3,
        );
        assert!(ok.is_some_and(|g| (g.bpm - 200.0).abs() < 1.0));
        // Kapsamı yarım: başlangıçlar şarkının yalnız ilk yarısında; iki kat vuruş çıkmaz.
        let half = retrack(
            &impulses(200.0, 40.0, 20.0),
            fps,
            0.0,
            &grid(100.0, 64),
            0.3,
        );
        assert!(half.is_none(), "{half:?}");
        // Sınırın üstü: 99,9 BPM'lik ızgara (2T = 199,8), başlangıçlar 203 BPM'de.
        let fast = retrack(
            &impulses(203.0, 40.0, 39.0),
            fps,
            0.0,
            &grid(99.9, 64),
            60.0 / 199.8,
        );
        assert!(fast.is_none(), "{fast:?}");
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
