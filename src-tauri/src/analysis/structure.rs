//! Şarkı yapısı: ölçü başları (downbeat), bölümler, droplar ve enerji eğrisi.
//!
//! Beat ızgarası bulunduktan sonra, spektrogram geçişinde biriken bant
//! seviyeleri ve kanal seviyeleriyle hesaplanır (şarkı ikinci kez çözülmez).
//!
//! - **Ölçü başı:** Her vuruş için iki işaret: kick gücü (bas bantlarının vuruş
//!   anındaki yükselişi) ve tını/armoni değişimi (vuruşun ortalama spektrumunun
//!   bir öncekinden farkı; akor ve bas notası genelde ölçü başında değişir).
//!   4/4 ve 3/4 için her olası başlangıç vuruşu puanlanır; belirgin biçimde
//!   üstün değilse 4/4 kabul edilir.
//! - **Bölümler:** Ölçü başına özellik vektörü (bant seviyeleri, ses yüksekliği,
//!   bas). Benzerlik matrisi üzerinde dama tahtası çekirdeğiyle yenilik eğrisi
//!   (Foote 2000); tepeleri bölüm sınırıdır. En kısa bölüm 4 ölçü.
//! - **Drop:** Bassız ya da sakin bir kısımdan sonra bas ve enerjinin birden
//!   güçlü döndüğü ölçü başı (elektronik müzikteki "drop", rock'taki büyük giriş).
//! - **Enerji:** Ses yüksekliğinin 1 sn'lik ortalaması; şarkının en sessiz %5'i
//!   0, en yüksek %5'i 1 olacak biçimde.

use serde::{Deserialize, Serialize};

use super::beats::BeatGrid;
use super::meter::Aksak;

/// Bas sayılan spektrum bantları (32 bandın ilk 8'i: ~30–150 Hz).
const BASS_BANDS: usize = 8;
/// Bölüm sınırı aramada çekirdeğin yarı genişliği (ölçü).
const NOVELTY_HALF_WIDTH: usize = 4;
/// En kısa bölüm (ölçü).
const MIN_SECTION_BARS: usize = 4;
/// Dropun öncesi ve sonrası kaç ölçüye bakılır.
const DROP_BEFORE_BARS: usize = 4;
const DROP_AFTER_BARS: usize = 2;
/// Drop için bas seviyesindeki en az artış (bant ölçeği: 0,1 ≈ 6 dB).
const DROP_MIN_BASS_JUMP: f64 = 0.12;
/// İki drop arası en az (ölçü).
const DROP_MIN_GAP_BARS: usize = 16;
/// Drop güveninde bas artışı bu kadar olunca (bant ölçeği: 0,3 ≈ 18 dB) tam puan.
const DROP_SURE_BASS_JUMP: f64 = 0.30;
/// Drop güveninde enerji farkı (önceki 4 ölçüye göre) bu kadar olunca tam puan.
const DROP_SURE_ENERGY_RISE: f64 = 0.40;
/// Drop'tan sonra yüksek enerjinin sürdüğüne bakılan ölçü sayısı.
const DROP_SUSTAIN_BARS: usize = 8;
/// Drop için davul (kick) gücündeki en az artış: bas sürerken davulun dönüşü de drop'tur.
const DROP_MIN_KICK_JUMP: f64 = 0.08;
/// Drop güveninde kick artışı bu kadar olunca tam puan.
const DROP_SURE_KICK_JUMP: f64 = 0.20;
/// Güvende yalnızca kick dönüşünün ve yalnızca tırmanışın payı (bas dönüşüne ve enerji artışına göre).
const DROP_KICK_ONLY_WEIGHT: f64 = 0.7;
const DROP_CLIMB_WEIGHT: f64 = 0.5;
/// Öncesindeki ölçülerden biri bundan sessizse (dBFS, ölçü ortalaması) şarkının başı sayılır,
/// drop değil.
const DROP_SILENCE_DB: f64 = -50.0;
/// Öncesinin şarkıya göre enerjisi (0..1) bundan azsa sessizlik sayılır.
const DROP_SILENCE_ENERGY: f64 = 0.02;
/// Drop'tan sonraki iki ölçünün enerjisi en az bu kadar (şarkıya göre 0..1) olmalı.
const DROP_AFTER_ENERGY: f64 = 0.65;
/// Drop anı ölçü başından en çok bu kadar (ölçü) önceye ya da sonraya kayar: vuruş ızgarası kaymış
/// olabilir (yarım tempo, sessizlikten sonra kayan faz); an, basın döndüğü kareye oturur.
const DROP_REFINE_BARS: f64 = 0.5;
/// Kaymak için bas farkı ölçü başındakinden en az bu kadar (bant ölçeği) büyük olmalı.
const DROP_REFINE_MIN_GAIN: f64 = 0.08;

/// Şarkının yapısı.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct SongMap {
    /// Ölçüdeki vuruş sayısı: düzenli ölçüde 3 ya da 4; aksak ölçüde grup sayısı (ör. 9/8 =
    /// 2+2+2+3'te 4: vuruşlar grup başlarıdır).
    pub meter: usize,
    /// İlk tam ölçünün başladığı vuruşun sırası (0..meter).
    pub downbeat_phase: usize,
    /// Aksak ölçünün sekizlik gruplaması (ör. [2, 2, 2, 3] = 9/8); düzenli ölçüde boş.
    #[serde(default)]
    pub grouping: Vec<u8>,
    /// Ölçünün (ölçü başlarının) güveni (0..1). [`METER_CONFIDENCE_MIN`]'in altında görseller
    /// ölçü başını vurgulamaz (lamba, dalga), yalnızca vuruşa tepki verir: yanlış ölçü vurgusu,
    /// hiç vurgu olmamasından kötüdür.
    #[serde(default)]
    pub meter_confidence: f32,
    /// Ölçü başlarının zamanları (saniye).
    pub downbeats: Vec<f64>,
    pub sections: Vec<Section>,
    /// Drop anları (saniye).
    pub drops: Vec<f64>,
    /// Her drop'un güveni (0..1; `drops` ile aynı sırada). Bas ve enerji ne kadar belirgin
    /// döndü, bölüm sınırına denk geliyor mu, yüksek enerji sürüyor mu. Güveni
    /// [`DROP_CONFIDENCE_MIN`]'in altındaki drop hiçbir yerde drop sayılmaz
    /// ([`SongMap::confident_drops`]).
    #[serde(default)]
    pub drop_confidence: Vec<f32>,
    /// Saniyede bir enerji değeri (0..1).
    pub energy: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct Section {
    pub start: f64,
    pub end: f64,
    /// Bölümün ortalama enerjisi (0..1).
    pub energy: f32,
    /// Benzer bölümler aynı etiketi alır (ör. her nakarat): 0, 1, 2… ilk görülme sırasıyla.
    pub label: usize,
}

/// Drop sayılmak için gereken en düşük güven. Altındaki aday hiçbir yerde drop sayılmaz:
/// sayaç, şarkı haritası şeridindeki işaret, Görsel Yönetmen'in beklentisi ve açılımı,
/// doğruluk ölçümü. Arayüzdeki `DROP_CONFIDENCE_MIN` (`src/lib/songMap.ts`) ile aynıdır
/// (testli).
pub const DROP_CONFIDENCE_MIN: f32 = 0.6;

/// Ölçü vurgusu için gereken en düşük ölçü güveni (bkz. [`SongMap::meter_confidence`]).
pub const METER_CONFIDENCE_MIN: f32 = 0.5;
/// Düzenli ölçüde güven, şarkı boyunca tutarlılıktan: 8 ölçülük pencerelerin (yarım adımla)
/// kaçında aynı ölçü başı konumu kazanıyor. Bu payın altı güvensiz, üstü tam güvenli. Ölçü başı
/// diğer vuruşlardan hiç ayrılmıyorsa (z-puanı farkı `METER_CONTRAST_MIN`'in altı) güven yok.
const METER_WINDOW_BARS: usize = 8;
const METER_AGREEMENT_LOW: f64 = 0.5;
const METER_AGREEMENT_FULL: f64 = 0.85;
const METER_CONTRAST_MIN: f64 = 0.2;

impl SongMap {
    /// Ölçü başları vurgulanacak kadar güvenli mi?
    pub fn bars_confident(&self) -> bool {
        self.meter_confidence >= METER_CONFIDENCE_MIN
    }

    /// Güveni yeterli droplar (artan sırada). Güveni kayıtlı olmayan drop sayılmaz.
    pub fn confident_drops(&self) -> impl Iterator<Item = f64> + '_ {
        self.drops
            .iter()
            .zip(&self.drop_confidence)
            .filter(|(_, &confidence)| confidence >= DROP_CONFIDENCE_MIN)
            .map(|(&drop, _)| drop)
    }

    /// Verilen andaki enerji (0..1).
    pub fn energy_at(&self, seconds: f64) -> Option<f32> {
        if !seconds.is_finite() || seconds < 0.0 {
            return None;
        }
        self.energy.get(seconds as usize).copied()
    }

    /// Vuruşun ölçüdeki yeri (1 = ölçü başı).
    pub fn bar_beat(&self, beat_index: usize) -> usize {
        let meter = self.meter.max(1) as isize;
        (beat_index as isize - self.downbeat_phase as isize).rem_euclid(meter) as usize + 1
    }

    /// Verilen andaki bölümün sırası.
    pub fn section_at(&self, seconds: f64) -> Option<usize> {
        self.sections
            .iter()
            .position(|s| seconds >= s.start && seconds < s.end)
    }
}

/// Analiz verilerinden şarkının yapısını çıkarır.
///
/// `bands`: kare başına `bands_per_frame` seviye (0..255); `loudness_db`: kare başına
/// ses yüksekliği (dBFS); `fps`: saniyedeki kare. `aksak`: aksak ölçü bulunduysa
/// ([`super::meter::detect`]); o zaman `beats` grup başlarıdır ve ölçü ondan gelir.
pub fn map_song(
    bands: &[u8],
    bands_per_frame: usize,
    loudness_db: &[f32],
    beats: &BeatGrid,
    fps: f64,
    aksak: Option<&Aksak>,
) -> Option<SongMap> {
    let frames = loudness_db.len().min(bands.len() / bands_per_frame.max(1));
    if beats.beats.len() < 8 || frames == 0 || bands_per_frame < BASS_BANDS {
        return None;
    }
    let level =
        |frame: usize, band: usize| f64::from(bands[frame * bands_per_frame + band]) / 255.0;
    let frame_of = |t: f64| ((t * fps).round().max(0.0) as usize).min(frames - 1);

    // Vuruş başına: ortalama spektrum, bas, kick gücü.
    let beat_frames: Vec<(usize, usize)> = beats
        .beats
        .iter()
        .enumerate()
        .map(|(i, &t)| {
            let start = frame_of(t);
            let end = beats
                .beats
                .get(i + 1)
                .map_or(start + (fps * 60.0 / beats.bpm) as usize, |&n| frame_of(n))
                .clamp(start + 1, frames);
            (start, end)
        })
        .collect();
    let spectra: Vec<Vec<f64>> = beat_frames
        .iter()
        .map(|&(s, e)| {
            (0..bands_per_frame)
                .map(|b| (s..e).map(|f| level(f, b)).sum::<f64>() / (e - s) as f64)
                .collect()
        })
        .collect();
    let bass_at = |f: usize| (0..BASS_BANDS).map(|b| level(f, b)).sum::<f64>() / BASS_BANDS as f64;
    let reach = (fps * 0.1) as usize;
    let kicks: Vec<f64> = beat_frames
        .iter()
        .map(|&(s, _)| {
            let after = (s..(s + reach).min(frames))
                .map(bass_at)
                .fold(0.0, f64::max);
            let before = (s.saturating_sub(reach)..s)
                .map(bass_at)
                .fold(1.0, f64::min);
            (after - before.min(after)).max(0.0)
        })
        .collect();
    let changes: Vec<f64> = (0..spectra.len())
        .map(|i| match i.checked_sub(1) {
            Some(p) => distance(&spectra[p], &spectra[i]),
            None => 0.0,
        })
        .collect();

    // Ölçü ve ölçü başı.
    let kick_z = zscores(&kicks);
    let change_z = zscores(&changes);
    let score: Vec<f64> = kick_z.iter().zip(&change_z).map(|(k, c)| k + c).collect();
    let (meter, downbeat_phase, meter_confidence, grouping) = match aksak {
        Some(aksak) => (
            aksak.grouping.len(),
            aksak.downbeat_phase % aksak.grouping.len().max(1),
            aksak.confidence,
            aksak.grouping.clone(),
        ),
        None => {
            let (meter, phase, contrast) = choose_meter(&score);
            let confidence = if contrast < METER_CONTRAST_MIN {
                0.0
            } else {
                ((phase_agreement(&score, meter, phase) - METER_AGREEMENT_LOW)
                    / (METER_AGREEMENT_FULL - METER_AGREEMENT_LOW))
                    .clamp(0.0, 1.0)
            };
            (meter, phase, confidence as f32, Vec::new())
        }
    };
    let downbeat_indices: Vec<usize> = (downbeat_phase..beats.beats.len()).step_by(meter).collect();
    let downbeats: Vec<f64> = downbeat_indices.iter().map(|&i| beats.beats[i]).collect();

    // Ses yüksekliğinden enerji (şarkıya göre 0..1).
    let (low, high) = percentile_range(loudness_db, 0.05, 0.95);
    let normalize = |db: f64| ((db - low) / (high - low).max(1.0)).clamp(0.0, 1.0);
    let seconds = (frames as f64 / fps).ceil() as usize;
    let energy: Vec<f32> = (0..seconds)
        .map(|s| {
            let a = (s as f64 * fps) as usize;
            let b = (((s + 1) as f64 * fps) as usize).min(frames);
            if a >= b {
                return 0.0;
            }
            let mean =
                loudness_db[a..b].iter().map(|&d| f64::from(d)).sum::<f64>() / (b - a) as f64;
            normalize(mean) as f32
        })
        .collect();

    // Ölçü başına özellikler.
    let bars: Vec<(usize, usize)> = downbeats
        .iter()
        .enumerate()
        .map(|(k, &t)| {
            let s = frame_of(t);
            let e = downbeats
                .get(k + 1)
                .map_or(frames, |&n| frame_of(n))
                .max(s + 1);
            (s, e.min(frames))
        })
        .filter(|(s, e)| e > s)
        .collect();
    let bar_bass: Vec<f64> = bars
        .iter()
        .map(|&(s, e)| (s..e).map(bass_at).sum::<f64>() / (e - s) as f64)
        .collect();
    let bar_energy: Vec<f64> = bars
        .iter()
        .map(|&(s, e)| {
            normalize(loudness_db[s..e].iter().map(|&d| f64::from(d)).sum::<f64>() / (e - s) as f64)
        })
        .collect();
    let bar_features: Vec<Vec<f64>> = bars
        .iter()
        .enumerate()
        .map(|(k, &(s, e))| {
            let mut v: Vec<f64> = (0..bands_per_frame)
                .map(|b| (s..e).map(|f| level(f, b)).sum::<f64>() / (e - s) as f64)
                .collect();
            // Ses yüksekliği ve bas, tını kadar önemli: ağırlıklı ekle.
            v.extend(std::iter::repeat_n(bar_energy[k], 6));
            v.extend(std::iter::repeat_n(bar_bass[k], 6));
            v
        })
        .collect();

    let boundaries = section_boundaries(&bar_features);
    let bar_time = |k: usize| {
        downbeats
            .get(k)
            .copied()
            .unwrap_or(downbeats[downbeats.len() - 1])
    };
    let song_end = frames as f64 / fps;
    let mut cuts: Vec<usize> = vec![0];
    cuts.extend(boundaries);
    let sections: Vec<Section> = cuts
        .iter()
        .enumerate()
        .map(|(i, &k)| {
            let end_bar = cuts.get(i + 1).copied().unwrap_or(bars.len());
            let start = if i == 0 { 0.0 } else { bar_time(k) };
            let end = if end_bar >= bars.len() {
                song_end
            } else {
                bar_time(end_bar)
            };
            let energy = mean(&bar_energy[k..end_bar.max(k + 1).min(bar_energy.len())]) as f32;
            Section {
                start,
                end,
                energy,
                label: 0,
            }
        })
        .collect();
    let mut sections = sections;
    let section_features: Vec<Vec<f64>> = cuts
        .iter()
        .enumerate()
        .map(|(i, &k)| {
            let end_bar = cuts.get(i + 1).copied().unwrap_or(bars.len()).max(k + 1);
            average(&bar_features[k..end_bar.min(bar_features.len())])
        })
        .collect();
    for (section, label) in sections.iter_mut().zip(label_sections(&section_features)) {
        section.label = label;
    }

    // Ölçü başına kick gücü ve mutlak ses yüksekliği (dBFS; sessizlik eşiği için).
    // Vuruşlar ve ölçüler zamanda sıralı: tek geçişte (uzun miksajlarda da doğrusal).
    let mut bar_kick = vec![0.0; bars.len()];
    let mut beat = 0;
    for (slot, &(s, e)) in bar_kick.iter_mut().zip(&bars) {
        while beat_frames.get(beat).is_some_and(|&(start, _)| start < s) {
            beat += 1;
        }
        let (mut sum, mut count) = (0.0, 0usize);
        while let Some(&kick) = beat_frames
            .get(beat)
            .filter(|&&(start, _)| start < e)
            .and(kicks.get(beat))
        {
            sum += kick;
            count += 1;
            beat += 1;
        }
        *slot = if count > 0 { sum / count as f64 } else { 0.0 };
    }
    let bar_db: Vec<f64> = bars
        .iter()
        .map(|&(s, e)| {
            loudness_db[s..e].iter().map(|&d| f64::from(d)).sum::<f64>() / (e - s) as f64
        })
        .collect();
    let bar_signals = BarSignals {
        bass: &bar_bass,
        kick: &bar_kick,
        energy: &bar_energy,
        db: &bar_db,
    };
    let beat_seconds = 60.0 / beats.bpm.max(1.0);
    let drop_bars = find_drops(&bar_signals);
    let (drops, drop_confidence): (Vec<f64>, Vec<f32>) = drop_bars
        .iter()
        .map(|&k| {
            let bar_seconds = beat_seconds * meter.max(1) as f64;
            let at = refine_drop(
                bar_time(k),
                bar_seconds,
                beat_seconds,
                fps,
                frames,
                &bass_at,
            );
            (at, drop_confidence(k, &bar_signals, &cuts))
        })
        .unzip();
    align_sections_to_drops(&mut sections, &cuts, &drop_bars, &drops);

    Some(SongMap {
        meter,
        downbeat_phase,
        grouping,
        meter_confidence,
        downbeats,
        sections,
        drops,
        drop_confidence,
        energy,
    })
}

/// Ölçü (3 ya da 4), ilk ölçü başının sırası ve ölçü başlarının diğer vuruşlardan ayrılışı
/// (ortalama z-puanı farkı).
fn choose_meter(score: &[f64]) -> (usize, usize, f64) {
    let best = |meter: usize| {
        let phases: Vec<f64> = (0..meter)
            .map(|p| {
                mean(
                    &score
                        .iter()
                        .skip(p)
                        .step_by(meter)
                        .copied()
                        .collect::<Vec<_>>(),
                )
            })
            .collect();
        let (phase, top) = phases
            .iter()
            .copied()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .unwrap_or((0, 0.0));
        let others = (phases.iter().sum::<f64>() - top) / (meter - 1) as f64;
        (phase, top - others)
    };
    let (phase4, contrast4) = best(4);
    let (phase3, contrast3) = best(3);
    // 3/4 ancak açıkça daha uygunsa: müziğin çoğu 4/4.
    if contrast3 > 1.5 * contrast4.max(0.05) && contrast3 > 0.5 {
        (3, phase3, contrast3)
    } else {
        (4, phase4, contrast4)
    }
}

/// Ölçü başı konumunun şarkı boyunca tutarlılığı: 8 ölçülük pencerelerin (yarım pencere adımla)
/// kaçında en yüksek puanlı konum `phase`. Pencere sayısı ikiden azsa bütün şarkı tek pencere.
fn phase_agreement(score: &[f64], meter: usize, phase: usize) -> f64 {
    let meter = meter.max(1);
    let window = METER_WINDOW_BARS * meter;
    let step = (window / 2).max(1);
    let mut windows = 0usize;
    let mut agree = 0usize;
    let mut start = 0;
    while start + window <= score.len() || (windows == 0 && start == 0) {
        let end = (start + window).min(score.len());
        let best = (0..meter)
            .map(|p| {
                let values: Vec<f64> = (start..end)
                    .filter(|&i| i % meter == p)
                    .map(|i| score[i])
                    .collect();
                (p, mean(&values))
            })
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .map_or(0, |(p, _)| p);
        windows += 1;
        if best == phase % meter {
            agree += 1;
        }
        start += step;
    }
    agree as f64 / windows.max(1) as f64
}

/// Bölüm sınırları (ölçü sırası): Foote yenilik eğrisinin tepeleri.
fn section_boundaries(features: &[Vec<f64>]) -> Vec<usize> {
    let n = features.len();
    let w = NOVELTY_HALF_WIDTH;
    if n < 2 * w + 2 {
        return Vec::new();
    }
    // Her boyutu standartlaştır: büyük değerli boyutlar baskın olmasın.
    let dims = features[0].len();
    let mut normalized = features.to_vec();
    for d in 0..dims {
        let column: Vec<f64> = features.iter().map(|f| f[d]).collect();
        let z = zscores(&column);
        for (row, value) in normalized.iter_mut().zip(z) {
            row[d] = value;
        }
    }
    let similarity = |a: usize, b: usize| -distance(&normalized[a], &normalized[b]);
    let novelty: Vec<f64> = (0..n)
        .map(|k| {
            if k < w || k + w > n {
                return 0.0;
            }
            let mut sum = 0.0;
            for i in k - w..k + w {
                for j in k - w..k + w {
                    let same_side = (i < k) == (j < k);
                    let taper = gauss(i as f64 + 0.5 - k as f64, w as f64)
                        * gauss(j as f64 + 0.5 - k as f64, w as f64);
                    // Sınırın aynı tarafı birbirine benzer, karşı tarafla farklıysa yenilik yüksek.
                    let sign = if same_side { 1.0 } else { -1.0 };
                    sum += sign * taper * similarity(i, j);
                }
            }
            sum
        })
        .collect();
    let threshold = mean(&novelty) + 0.5 * std_dev(&novelty);
    let mut peaks: Vec<usize> = (w..n.saturating_sub(w - 1))
        .filter(|&k| {
            novelty[k] > threshold
                && (k.saturating_sub(MIN_SECTION_BARS)..(k + MIN_SECTION_BARS).min(n))
                    .all(|j| novelty[j] <= novelty[k])
        })
        .collect();
    peaks.dedup();
    peaks
}

/// Benzer bölümlere aynı etiket: bölümler sırayla, mevcut etiketlerin ilk
/// örneğine yakınsa o etiketi, değilse yeni etiket alır. "Yakın": bölümler arası
/// uzaklıkların ortalamasının yarısından az.
fn label_sections(features: &[Vec<f64>]) -> Vec<usize> {
    let n = features.len();
    if n == 0 {
        return Vec::new();
    }
    // Boyutları bölümler arasında standartlaştır.
    let dims = features[0].len();
    let mut normalized = features.to_vec();
    for d in 0..dims {
        let column: Vec<f64> = features.iter().map(|f| f[d]).collect();
        for (row, value) in normalized.iter_mut().zip(zscores(&column)) {
            row[d] = value;
        }
    }
    let mut pairs = Vec::new();
    for i in 0..n {
        for j in i + 1..n {
            pairs.push(distance(&normalized[i], &normalized[j]));
        }
    }
    let threshold = 0.5 * mean(&pairs);
    let mut prototypes: Vec<usize> = Vec::new();
    (0..n)
        .map(|i| {
            let nearest = prototypes
                .iter()
                .enumerate()
                .map(|(label, &p)| (label, distance(&normalized[i], &normalized[p])))
                .min_by(|a, b| a.1.total_cmp(&b.1));
            match nearest {
                Some((label, d)) if d < threshold => label,
                _ => {
                    prototypes.push(i);
                    prototypes.len() - 1
                }
            }
        })
        .collect()
}

fn average(rows: &[Vec<f64>]) -> Vec<f64> {
    let Some(first) = rows.first() else {
        return Vec::new();
    };
    (0..first.len())
        .map(|d| rows.iter().map(|r| r[d]).sum::<f64>() / rows.len() as f64)
        .collect()
}

/// Ölçü başına drop işaretleri.
struct BarSignals<'a> {
    /// Bas bantlarının ortalaması (0..1).
    bass: &'a [f64],
    /// Vuruş başındaki bas sıçraması, yani kick gücü (0..1).
    kick: &'a [f64],
    /// Şarkıya göre ses yüksekliği (0..1).
    energy: &'a [f64],
    /// Mutlak ses yüksekliği (dBFS).
    db: &'a [f64],
}

/// `k`. ölçünün öncesi ve sonrası arasındaki farklar: (bas, kick, enerji).
/// Hemen önceki ölçü sayılmaz: yükselişin son ölçüsündeki kick ya da trampet rulosu drop kadar
/// güçlü olabilir; sayılsaydı drop bir ölçü erkene, ruloya kayardı.
fn drop_jumps(k: usize, signals: &BarSignals) -> (f64, f64, f64) {
    let n = signals.bass.len();
    let before = k.saturating_sub(DROP_BEFORE_BARS + 1)..k.saturating_sub(1).max(1);
    let after = k..(k + DROP_AFTER_BARS).min(n);
    // Sonrası en zayıf ölçüsüyle: drop süren bir düzeydir, tek ölçülük vurgu değil.
    let floor = |v: &[f64]| {
        v[after.clone()]
            .iter()
            .copied()
            .fold(f64::INFINITY, f64::min)
    };
    let jump = |v: &[f64]| {
        let low = floor(v);
        if low.is_finite() {
            low - mean(&v[before.clone()])
        } else {
            0.0
        }
    };
    (jump(signals.bass), jump(signals.kick), jump(signals.energy))
}

/// Drop olan ölçüler (sırası).
fn find_drops(signals: &BarSignals) -> Vec<usize> {
    let n = signals.bass.len();
    // Sonrası şarkının yüksek kısmı olmalı. Sıkıştırılmış kayıtta yükseliş droptan yüksek olabilir:
    // eşik, şarkının ortanca ölçü enerjisinden yüksek değildir.
    let mut sorted = signals.energy.to_vec();
    sorted.sort_by(f64::total_cmp);
    let high = sorted
        .get(sorted.len() / 2)
        .copied()
        .unwrap_or(DROP_AFTER_ENERGY)
        .min(DROP_AFTER_ENERGY);
    let mut candidates: Vec<(usize, f64)> = (DROP_BEFORE_BARS
        ..n.saturating_sub(DROP_AFTER_BARS - 1))
        .filter_map(|k| {
            let (bass, kick, rise) = drop_jumps(k, signals);
            let after_energy = mean(&signals.energy[k..(k + DROP_AFTER_BARS).min(n)]);
            // Öncesindeki ölçülerin hiçbiri sessiz olmamalı: şarkının başındaki sessizlikten
            // birkaç ölçü sonrası da drop değildir.
            let before_db = signals.db[k - DROP_BEFORE_BARS..k]
                .iter()
                .copied()
                .fold(f64::INFINITY, f64::min);
            // Bas ya da davul birden güçlü dönmeli, sonrası şarkının yüksek kısmı olmalı, öncesi
            // sessizlik olmamalı (sakin bir giriş olabilir: rock'ta grubun büyük girişi drop'tur).
            let low_end = bass >= DROP_MIN_BASS_JUMP || kick >= DROP_MIN_KICK_JUMP;
            // Sessizlik iki türlü: mutlak (−50 dBFS altı) ya da şarkıya göre neredeyse hiç (eski
            // kayıtta cızırtı tabanı −50 dBFS'ten yüksek olabilir).
            let before_energy = mean(&signals.energy[k - DROP_BEFORE_BARS..k]);
            let silent = before_db <= DROP_SILENCE_DB || before_energy < DROP_SILENCE_ENERGY;
            (low_end && after_energy >= high && !silent)
                .then_some((k, bass.max(0.0) + kick.max(0.0) + 0.5 * rise.max(0.0)))
        })
        .collect();
    // En güçlüsünden başlayarak, birbirine yakın adayları ele.
    // Puanı (yuvarlama payıyla) eşit adaylardan önce geleni: değişimin başladığı ölçü.
    let level = |score: f64| (score * 1e6).round();
    candidates.sort_by(|a, b| level(b.1).total_cmp(&level(a.1)).then(a.0.cmp(&b.0)));
    let mut chosen: Vec<usize> = Vec::new();
    for (k, _) in candidates {
        if chosen.iter().all(|&c| c.abs_diff(k) >= DROP_MIN_GAP_BARS) {
            chosen.push(k);
        }
    }
    chosen.sort_unstable();
    chosen
}

/// Drop'un başlattığı bölüm (sınırı drop ölçüsüne ±1 ölçü) drop anında başlar: bölüm ve drop aynı
/// an olur (ör. MilkDrop görsel geçişi bir kez yapar, iki ayrı geçiş değil).
fn align_sections_to_drops(
    sections: &mut [Section],
    cuts: &[usize],
    drop_bars: &[usize],
    drops: &[f64],
) {
    for (&k, &at) in drop_bars.iter().zip(drops) {
        let Some(i) = cuts.iter().position(|&c| c > 0 && c.abs_diff(k) <= 1) else {
            continue;
        };
        // Komşu bölümlerin içine taşmaz (bölümler en az dört ölçü).
        let (Some(prev), Some(next)) = (i.checked_sub(1), sections.get(i)) else {
            continue;
        };
        if at <= sections[prev].start || at >= next.end {
            continue;
        }
        sections[prev].end = at;
        sections[i].start = at;
    }
}

/// Drop anını ölçü başından basın gerçekten döndüğü kareye oturtur. Vuruş ızgarası kaymış olabilir
/// (yarım tempo, sessizlikle kayan faz): ölçü başının yarım ölçü öncesiyle yarım ölçü sonrası
/// arasında, bir vuruş sonrasıyla bir vuruş öncesi arasındaki bas farkının en büyük olduğu kareye
/// bakılır. Ölçü başındaki farkı açıkça geçmiyorsa (sürekli alt bas, yerinde drop) ölçü başı kalır.
/// Yalnızca bas düzeyine bakılır: yükselişin sonundaki kick ya da trampet rulosu yoğun vuruşludur
/// ama drop'un sürekli basına yetişmez; ses yüksekliğine de bakılmaz (sıkıştırılmış kayıtta
/// yükselişin sonu droptan yüksek olabilir).
fn refine_drop(
    bar_start: f64,
    bar_seconds: f64,
    beat_seconds: f64,
    fps: f64,
    frames: usize,
    bass_at: &dyn Fn(usize) -> f64,
) -> f64 {
    let window = ((beat_seconds * fps).round() as usize).max(1);
    if frames <= 2 * window {
        return bar_start;
    }
    let frame = |t: f64| (t * fps).round().max(0.0) as usize;
    let first = frame(bar_start - DROP_REFINE_BARS * bar_seconds).max(window);
    let last = frame(bar_start + DROP_REFINE_BARS * bar_seconds).min(frames - window);
    let start = frame(bar_start).clamp(first.min(last), last.max(first));
    if first >= last {
        return bar_start;
    }
    // Yalnızca bakılan aralığın bas düzeyi (kayan toplam).
    let lo = first - window;
    let mut prefix = vec![0.0; last + window - lo + 1];
    for f in lo..last + window {
        prefix[f - lo + 1] = prefix[f - lo] + bass_at(f);
    }
    let w = window as f64;
    let contrast = |f: usize| {
        (prefix[f + window - lo] - prefix[f - lo]) / w
            - (prefix[f - lo] - prefix[f - window - lo]) / w
    };
    // Eşitlikte ölçü başına yakın olan seçilir.
    let best =
        (first..=last)
            .map(|f| (f, contrast(f)))
            .fold((start, f64::MIN), |(bf, bv), (f, v)| {
                let closer = f.abs_diff(start) < bf.abs_diff(start);
                if v > bv || (v == bv && closer) {
                    (f, v)
                } else {
                    (bf, bv)
                }
            });
    if best.1 - contrast(start) < DROP_REFINE_MIN_GAIN {
        return bar_start;
    }
    best.0 as f64 / fps
}

/// `k`. ölçüdeki drop'un güveni (0..1). Dört işaret, ağırlıklarıyla:
/// - alt uç ne kadar güçlü döndü (%35): bas sıçraması (eşikte 0, 18 dB'de tam) ya da davulun
///   dönüşü (bas sürerken kick'in gelmesi; %70 payla), hangisi büyükse,
/// - yükseliş (%30): enerji önceki dört ölçüye göre arttı mı, ya da önceki dört ölçüde enerji
///   tırmandı mı (%50 payla; sıkıştırılmış kayıtta yükseliş droptan yüksek olabilir),
/// - bölüm sınırına (±1 ölçü) denk geliyor mu (%20): gerçek droplar yeni bölüm başlatır,
/// - yüksek enerji sonraki sekiz ölçü boyunca sürüyor mu (%15): tek bir vurgu drop değildir.
fn drop_confidence(k: usize, signals: &BarSignals, cuts: &[usize]) -> f32 {
    let n = signals.bass.len();
    let (jump, kick_jump, rise) = drop_jumps(k, signals);
    let unit = |x: f64| x.clamp(0.0, 1.0);
    let bass = unit((jump - DROP_MIN_BASS_JUMP) / (DROP_SURE_BASS_JUMP - DROP_MIN_BASS_JUMP));
    let kick = unit((kick_jump - DROP_MIN_KICK_JUMP) / (DROP_SURE_KICK_JUMP - DROP_MIN_KICK_JUMP));
    // Yalnızca davulun dönüşü (bas zaten sürüyor) bas dönüşünden zayıf işarettir: pop'ta seyrek
    // ön nakarattan tam davullu nakarata geçiş de böyledir.
    let low_end = bass.max(DROP_KICK_ONLY_WEIGHT * kick);
    let before = &signals.energy[k.saturating_sub(DROP_BEFORE_BARS)..k];
    let climb = match (before.first(), before.last()) {
        (Some(first), Some(last)) if before.len() >= 2 => last - first,
        _ => 0.0,
    };
    // Tırmanış (önceki dört ölçüde enerji artışı) enerji artışından zayıf işarettir: her ön nakarat
    // da tırmanır.
    let lift = unit(rise / DROP_SURE_ENERGY_RISE)
        .max(DROP_CLIMB_WEIGHT * unit(climb / DROP_SURE_ENERGY_RISE));
    let boundary = if cuts.iter().any(|&c| c > 0 && c.abs_diff(k) <= 1) {
        1.0
    } else {
        0.0
    };
    let sustained = mean(&signals.energy[k..(k + DROP_SUSTAIN_BARS).min(n)]);
    let sustain = unit((sustained - 0.45) / 0.3);
    (0.35 * low_end + 0.30 * lift + 0.20 * boundary + 0.15 * sustain) as f32
}

fn distance(a: &[f64], b: &[f64]) -> f64 {
    a.iter()
        .zip(b)
        .map(|(x, y)| (x - y).powi(2))
        .sum::<f64>()
        .sqrt()
}

fn gauss(x: f64, width: f64) -> f64 {
    (-0.5 * (x / (0.5 * width)).powi(2)).exp()
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn std_dev(values: &[f64]) -> f64 {
    let m = mean(values);
    mean(&values.iter().map(|v| (v - m).powi(2)).collect::<Vec<_>>()).sqrt()
}

fn zscores(values: &[f64]) -> Vec<f64> {
    let m = mean(values);
    let s = std_dev(values).max(1e-9);
    values.iter().map(|v| (v - m) / s).collect()
}

fn percentile_range(values: &[f32], low: f64, high: f64) -> (f64, f64) {
    let mut sorted: Vec<f64> = values.iter().map(|&v| f64::from(v)).collect();
    sorted.sort_by(f64::total_cmp);
    if sorted.is_empty() {
        return (0.0, 1.0);
    }
    let at = |p: f64| sorted[((sorted.len() - 1) as f64 * p).round() as usize];
    (at(low), at(high))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::beats::tests::{drum_track, Lcg};
    use crate::analysis::spectrogram::{analyze, Spectrogram};
    use crate::audio::decode::Decoder;
    use crate::audio::test_util::{temp_path, write_wav};
    use std::f64::consts::PI;
    use std::sync::Arc;

    fn analyze_samples(samples: &[f64], rate: u32) -> Arc<Spectrogram> {
        let path = temp_path("yapi.wav");
        write_wav(&path, rate, 1, samples.len(), |f, _| {
            samples[f].clamp(-1.0, 1.0)
        });
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        std::fs::remove_file(&path).ok();
        spectrogram
    }

    #[test]
    fn olcu_basi_bas_notasinin_degistigi_vurus() {
        // Davul kaydında bas notası her ölçünün ilk vuruşunda değişir (kick 1 ve 3'te).
        let rate = 22_050;
        let (samples, truth) = drum_track(120.0, 0.8, 32.0, rate, 4);
        let spectrogram = analyze_samples(&samples, rate);
        let map = spectrogram.song_map().expect("yapı bulunmalı");
        assert_eq!(map.meter, 4);
        let on_bar_start = map
            .downbeats
            .iter()
            .filter(|&&d| {
                let i = truth
                    .iter()
                    .enumerate()
                    .min_by(|a, b| (a.1 - d).abs().total_cmp(&(b.1 - d).abs()))
                    .unwrap()
                    .0;
                (truth[i] - d).abs() < 0.07 && i % 4 == 0
            })
            .count();
        assert!(
            on_bar_start as f64 >= 0.9 * map.downbeats.len() as f64,
            "{on_bar_start}/{} ölçü başı doğru",
            map.downbeats.len()
        );
    }

    #[test]
    fn aksak_dokuz_sekizlikte_vurus_ve_olcu_baslari_dogru() {
        let rate = 22_050;
        let (samples, truth, downbeats) =
            crate::analysis::meter::tests::aksak_drums(270.0, &[2, 2, 2, 3], 40.0, rate);
        let spectrogram = analyze_samples(&samples, rate);
        let map = spectrogram.song_map().expect("yapı bulunmalı");
        assert_eq!(map.grouping, vec![2, 2, 2, 3]);
        assert_eq!(map.meter, 4, "ölçüde 4 (uzun ve kısa) vuruş");
        assert!(map.bars_confident(), "{}", map.meter_confidence);
        // Vuruşlar grup başları (takipçinin eşit aralıklı vuruşları değil).
        let grid = spectrogram.beat_grid().unwrap();
        let f = crate::analysis::evaluate::f_measure(&grid.beats, &truth, 0.05);
        assert!(f > 0.95, "F {f}");
        // Ölçü başları gerçek ölçü başlarına oturur.
        let hits = map
            .downbeats
            .iter()
            .filter(|&&d| downbeats.iter().any(|t| (t - d).abs() < 0.05))
            .count();
        assert!(
            hits as f64 >= 0.9 * map.downbeats.len() as f64,
            "{hits}/{}",
            map.downbeats.len()
        );
        // Her ölçü başı, vuruşların `meter` aralıklı dizisinde (ölçüdeki yer = 1).
        let first = grid
            .beats
            .iter()
            .position(|&b| (b - map.downbeats[1]).abs() < 1e-9)
            .unwrap();
        assert_eq!(map.bar_beat(first), 1);
        assert_eq!(map.bar_beat(first + 3), 4);
        assert_eq!(map.bar_beat(first + 4), 1);
    }

    #[test]
    fn olcu_basi_tutarsiz_kayitta_olcu_vurgusu_kapanir() {
        // Aynı davul; birinde ölçü başı her ölçüde aynı yerde, ötekinde her ölçüde başka vuruşta.
        let rate = 22_050;
        let (samples, _, _) =
            crate::analysis::meter::tests::aksak_drums(240.0, &[2, 2, 2, 2], 60.0, rate);
        let accented = analyze_samples(&samples, rate).song_map().unwrap();
        assert!(accented.bars_confident(), "{}", accented.meter_confidence);
        let shifting = crate::analysis::meter::tests::shifting_drums(240.0, 60.0, rate);
        let unsure = analyze_samples(&shifting, rate).song_map().unwrap();
        assert!(!unsure.bars_confident(), "{}", unsure.meter_confidence);
        assert!(unsure.grouping.is_empty());
    }

    /// Elektronik müzik kalıbı: ana kısım (8 ölçü) → sakin kısım (8) → yükseliş (4)
    /// → drop (8) → kapanış (4). 128 BPM, 0,5 sn sessiz başlangıç.
    fn edm_track(rate: u32) -> (Vec<f64>, f64, f64) {
        let bpm = 128.0;
        let beat = 60.0 / bpm;
        let start = 0.5;
        let bars = 32;
        let n = ((start + bars as f64 * 4.0 * beat + 1.0) * f64::from(rate)) as usize;
        let mut out = vec![0.0f64; n];
        let mut rng = Lcg(11);
        let r = f64::from(rate);
        let mut add = |at: f64, len: f64, f: &mut dyn FnMut(f64) -> f64| {
            let s0 = (at * r) as usize;
            for i in 0..((len * r) as usize).min(n.saturating_sub(s0)) {
                out[s0 + i] += f(i as f64 / r);
            }
        };
        for bar in 0..bars {
            let section = match bar {
                0..=7 => "ana",
                8..=15 => "sakin",
                16..=19 => "yukselis",
                20..=27 => "drop",
                _ => "kapanis",
            };
            for b in 0..4 {
                let t = start + (bar * 4 + b) as f64 * beat;
                let full = section == "ana" || section == "drop";
                let gain = if section == "drop" { 1.0 } else { 0.8 };
                if full {
                    let mut phase = 0.0;
                    add(t, 0.25, &mut |x| {
                        phase += 2.0 * PI * (45.0 + 70.0 * (-x * 30.0).exp()) / r;
                        0.6 * gain * phase.sin() * (-x * 12.0).exp()
                    });
                    let note = [55.0, 55.0, 49.0, 65.4][bar % 4];
                    add(t, beat * 0.9, &mut |x| {
                        0.3 * gain * (2.0 * PI * note * x).sin()
                    });
                }
                if section != "kapanis" {
                    // Hi-hat: sekizlikler.
                    for half in [0.0, 0.5] {
                        let mut previous = 0.0;
                        let mut noise = Lcg(rng.0.wrapping_add((bar * 8 + b * 2) as u64));
                        add(t + half * beat, 0.04, &mut |x| {
                            let v = noise.next();
                            let hp = v - previous;
                            previous = v;
                            0.08 * hp * (-x * 90.0).exp()
                        });
                    }
                }
                if section == "yukselis" {
                    // Yükselen gürültü ve sıklaşan trampet.
                    let progress = ((bar - 16) * 4 + b) as f64 / 16.0;
                    let mut noise = Lcg(rng.0 ^ (bar * 4 + b) as u64);
                    add(t, beat, &mut |_| 0.05 * (0.3 + progress) * noise.next());
                }
            }
            // Akor (her yerde; sakin kısımda daha belirgin).
            let pad = if section == "sakin" || section == "kapanis" {
                0.12
            } else {
                0.05
            };
            let t = start + (bar * 4) as f64 * beat;
            add(t, 4.0 * beat, &mut |x| {
                pad * [220.0, 261.6, 329.6]
                    .iter()
                    .map(|f| (2.0 * PI * f * x).sin())
                    .sum::<f64>()
            });
        }
        let _ = rng.next();
        let drop_time = start + 20.0 * 4.0 * beat;
        (out, drop_time, 4.0 * beat)
    }

    #[test]
    fn drop_ve_bolumler_dogru_yerde() {
        let rate = 22_050;
        let (samples, drop_time, bar) = edm_track(rate);
        let spectrogram = analyze_samples(&samples, rate);
        let map = spectrogram.song_map().expect("yapı bulunmalı");
        eprintln!(
            "ölçü {} · droplar {:?} · bölümler {:?}",
            map.meter,
            map.drops,
            map.sections
                .iter()
                .map(|s| (s.start, s.energy, s.label))
                .collect::<Vec<_>>()
        );
        assert_eq!(map.drops.len(), 1, "tek drop: {:?}", map.drops);
        // Sakin kısımdan sonra bas ve enerji birden dönüyor, yeni bölüm başlıyor, enerji
        // sürüyor: drop güveni yüksek (drop sayacı gösterilir).
        assert_eq!(map.drop_confidence.len(), map.drops.len());
        assert!(
            map.drop_confidence[0] >= 0.8,
            "güven {:?}",
            map.drop_confidence
        );
        // Benzer bölümler aynı etiketi alır: ana kısım ve drop aynı, sakin kısım farklı.
        let label_at = |t: f64| map.sections[map.section_at(t).unwrap()].label;
        assert_eq!(label_at(5.0), label_at(drop_time + 5.0));
        assert_ne!(label_at(20.0), label_at(drop_time + 5.0));
        assert!(
            (map.drops[0] - drop_time).abs() < 0.6 * bar / 4.0 * 4.0,
            "drop {:?}",
            map.drops
        );
        // Bölüm sınırları: 8, 16, 20, 28. ölçüler (±1 ölçü). En az üçü bulunmalı, fazlası olmamalı.
        let expected = [8.0, 16.0, 20.0, 28.0].map(|b| 0.5 + b * bar);
        let found = expected
            .iter()
            .filter(|&&e| {
                map.sections
                    .iter()
                    .any(|s| (s.start - e).abs() <= bar * 1.01)
            })
            .count();
        assert!(found >= 3, "bulunan sınır {found}/4: {:?}", map.sections);
        assert!(map.sections.len() <= 7, "{:?}", map.sections);
        // Drop bölümü sakin bölümden daha enerjik.
        let energy_at = |t: f64| map.sections[map.section_at(t).unwrap()].energy;
        assert!(energy_at(drop_time + 2.0) > energy_at(drop_time - 10.0) + 0.2);
        assert!(map.energy_at(drop_time + 2.0).unwrap() > 0.6);

        // Görsel Yönetmen aynı analizden kurulur: droptan önce gerilim, drop'ta açılım.
        let director = spectrogram.choreography().expect("koreografi kurulmalı");
        let before = director.frame_at(drop_time - 0.5, false).rhythm;
        let after = director.frame_at(drop_time + 0.1, false).rhythm;
        assert!(
            before.anticipation > 0.8 && before.release == 0.0,
            "{before:?}"
        );
        assert!(after.release > 0.9, "{after:?}");
        assert_eq!(
            director
                .frame_at(drop_time - 20.0, false)
                .rhythm
                .anticipation,
            0.0
        );
    }

    #[test]
    fn olcudeki_vurus_sirasi() {
        let map = SongMap {
            meter: 4,
            downbeat_phase: 2,
            grouping: Vec::new(),
            meter_confidence: 1.0,
            downbeats: vec![],
            sections: vec![],
            drops: vec![],
            drop_confidence: vec![],
            energy: vec![0.1, 0.9],
        };
        assert_eq!(
            (0..7).map(|i| map.bar_beat(i)).collect::<Vec<_>>(),
            [3, 4, 1, 2, 3, 4, 1]
        );
        assert_eq!(map.energy_at(1.5), Some(0.9));
        assert_eq!(map.energy_at(9.0), None);
    }

    /// Bas ve enerjiden ölçü işaretleri: kick sabit (değişmiyor), ses yüksekliği duyulur düzeyde.
    fn bars<'a>(bass: &'a [f64], energy: &'a [f64]) -> BarSignals<'a> {
        let kick: &'static [f64] = &[0.1; 64];
        let db: &'static [f64] = &[-20.0; 64];
        BarSignals {
            bass,
            kick: &kick[..bass.len()],
            energy,
            db: &db[..bass.len()],
        }
    }

    #[test]
    fn sakin_giristen_sonra_grubun_girisi_drop_sessizlikten_sonraki_degil() {
        // Rock: dört ölçü yalnız gitar (bas bantlarında biraz gitar, şarkıya göre çok sessiz ama
        // duyulur), sonra bütün grup. Sakin giriş drop'u engellemez.
        let mut bass = vec![0.40; 4];
        bass.extend([0.65; 12]);
        let mut energy = vec![0.04; 4];
        energy.extend([0.80; 12]);
        let kick = [0.1; 16];
        let mut db = vec![-35.0; 4];
        db.extend([-10.0; 12]);
        let signals = BarSignals {
            bass: &bass,
            kick: &kick,
            energy: &energy,
            db: &db,
        };
        assert_eq!(find_drops(&signals), [4]);
        // Öncesi gerçekten sessizse (şarkının başı) drop değildir.
        let mut silent = vec![-70.0; 4];
        silent.extend([-10.0; 12]);
        let signals = BarSignals {
            db: &silent,
            ..signals
        };
        assert!(find_drops(&signals).is_empty());
    }

    #[test]
    fn bas_surerken_davulun_donusu_drop_sayilir() {
        // Melodik drop: yükselişte bas uzun notalarla sürüyor, davul yok; drop davulu getiriyor.
        let bass = [0.55; 20];
        let mut kick = vec![0.03; 8];
        kick.extend([0.30; 12]);
        let mut energy = vec![0.50, 0.50, 0.50, 0.50, 0.55, 0.62, 0.70, 0.76];
        energy.extend([0.80; 12]);
        let db = [-12.0; 20];
        let signals = BarSignals {
            bass: &bass,
            kick: &kick,
            energy: &energy,
            db: &db,
        };
        assert_eq!(find_drops(&signals), [8]);
        let confidence = drop_confidence(8, &signals, &[0, 8]);
        assert!(confidence >= DROP_CONFIDENCE_MIN, "{confidence}");
    }

    #[test]
    fn yukselis_droptan_yuksekse_de_drop_bulunur_ve_guvenilir() {
        // Sıkıştırılmış kayıt: 8 ölçü sakin, 8 ölçü gittikçe yükselen yükseliş (en yüksek yeri
        // yükselişin sonu), sonra bas gelen ama yükselişten biraz kısık drop.
        let mut bass = vec![0.10; 8];
        bass.extend([0.10, 0.12, 0.15, 0.18, 0.20, 0.24, 0.26, 0.30]);
        bass.extend([0.60; 12]);
        let mut energy = vec![0.30; 8];
        energy.extend([0.50, 0.55, 0.60, 0.70, 0.78, 0.85, 0.93, 1.0]);
        energy.extend([0.64; 12]);
        let signals = bars(&bass, &energy);
        assert_eq!(find_drops(&signals), [16]);
        let confidence = drop_confidence(16, &signals, &[0, 8, 16]);
        assert!(confidence >= DROP_CONFIDENCE_MIN, "{confidence}");
    }

    #[test]
    fn drop_ani_olcu_basindan_basin_dondugu_kareye_oturur() {
        // Saniyede 60 kare, 120 BPM (vuruş 0,5 sn, ölçü 2 sn). Bas 20,3. saniyede dönüyor (ızgara
        // kaymış: ölçü başı yarım ölçüye kadar önde ya da geride sanılıyor) ve vuruşlarda atıyor.
        let fps = 60.0;
        let onset = (20.3 * fps) as usize;
        let bass = |f: usize| {
            if f < onset {
                0.2
            } else if (f - onset) % 30 < 6 {
                0.8
            } else {
                0.6
            }
        };
        for bar_start in [19.4, 20.0, 21.2] {
            let at = refine_drop(bar_start, 2.0, 0.5, fps, 3600, &bass);
            assert!((at - 20.3).abs() <= 1.5 / fps, "{bar_start} → {at}");
        }
        // Drop tam ölçü başındaysa yerinde kalır.
        let on_grid = |f: usize| if f < 1200 { 0.2 } else { 0.7 };
        assert!((refine_drop(20.0, 2.0, 0.5, fps, 3600, &on_grid) - 20.0).abs() <= 1.5 / fps);
        // Pencere şarkının başına ya da sonuna taşmaz.
        assert!(refine_drop(0.2, 2.0, 0.5, fps, 3600, &bass) >= 0.0);
        assert!(refine_drop(59.9, 2.0, 0.5, fps, 3600, &bass) <= 60.0);
    }

    #[test]
    fn yukselisin_sonundaki_kick_rulosu_dropu_erkene_cekmez() {
        // 120 BPM, drop 40,0 sn'de (ölçü başı). Önceki ölçüde (38–40 sn) on altılık kick rulosu:
        // bas bantlarında yoğun, drop kadar güçlü vuruşlar. An ruloya kaymaz.
        let fps = 60.0;
        let drop = (40.0 * fps) as usize;
        let roll = (38.0 * fps) as usize;
        let bass = |f: usize| {
            if f >= drop {
                if (f - drop) % 30 < 6 {
                    0.85
                } else {
                    0.65
                }
            } else if f >= roll {
                if (f - roll) % 7 < 3 {
                    0.70
                } else {
                    0.35
                }
            } else {
                0.25
            }
        };
        let at = refine_drop(40.0, 2.0, 0.5, fps, 4800, &bass);
        assert!((at - 40.0).abs() <= 0.1, "{at}");
    }

    #[test]
    fn drop_bolumu_drop_aninda_baslar() {
        // Ölçü 2 sn; bölümler 0, 8 ve 16. ölçüde. Drop 8. ölçüde ama an 16,3 sn'ye oturdu.
        let section = |start: f64, end: f64| Section {
            start,
            end,
            energy: 0.5,
            label: 0,
        };
        let mut sections = vec![section(0.0, 16.0), section(16.0, 32.0), section(32.0, 48.0)];
        align_sections_to_drops(&mut sections, &[0, 8, 16], &[8], &[16.3]);
        assert_eq!((sections[0].end, sections[1].start), (16.3, 16.3));
        assert_eq!((sections[1].end, sections[2].start), (32.0, 32.0));
        // Sınırı drop'a uzak bölüm (drop 12. ölçüde) ve ilk bölüm kıpırdamaz.
        let mut far = vec![section(0.0, 16.0), section(16.0, 32.0)];
        align_sections_to_drops(&mut far, &[0, 8], &[12, 0], &[24.0, 0.2]);
        assert_eq!((far[0].start, far[0].end, far[1].start), (0.0, 16.0, 16.0));
    }

    #[test]
    fn rulolu_olcu_degil_ardindan_gelen_olcu_drop_secilir() {
        // 8 ölçü bassız yükseliş, 8. ölçüde kick rulosu (bas bantlarında drop kadar güçlü), drop 9.
        let mut bass = vec![0.20; 8];
        bass.push(0.65);
        bass.extend([0.70; 12]);
        let mut kick = vec![0.05; 8];
        kick.push(0.30);
        kick.extend([0.28; 12]);
        let mut energy = vec![0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90];
        energy.extend([0.85; 12]);
        let db = [-12.0; 21];
        let signals = BarSignals {
            bass: &bass,
            kick: &kick,
            energy: &energy,
            db: &db,
        };
        assert_eq!(find_drops(&signals), [9]);
    }

    #[test]
    fn belirgin_bas_donusu_yoksa_drop_olcu_basinda_kalir() {
        // Bas baştan sona aynı (sürekli alt bas): kayacak bir an yok, ölçü başı korunur.
        let flat = |f: usize| if f % 30 < 6 { 0.7 } else { 0.6 };
        let at = refine_drop(40.0, 2.0, 0.5, 60.0, 4800, &flat);
        assert!((at - 40.0).abs() <= 1.5 / 60.0, "{at}");
    }

    #[test]
    fn belirgin_drop_yuksek_sinirda_aday_dusuk_guven_alir() {
        // Ölçü başına bas ve enerji: 8 ölçü sakin (bas yok), sonra 12 ölçü tam drop.
        let mut bass = vec![0.15; 8];
        bass.extend([0.55; 12]);
        let mut energy = vec![0.35; 8];
        energy.extend([0.95; 12]);
        let drops = find_drops(&bars(&bass, &energy));
        assert_eq!(drops, [8]);
        let strong = drop_confidence(8, &bars(&bass, &energy), &[0, 8]);
        assert!(strong > 0.95, "belirgin drop: {strong}");

        // Zaten yüksek bir kısımda bas biraz artıyor (eşiğin hemen üstünde), bölüm sınırı yok,
        // iki ölçü sonra enerji düşüyor: drop sayılır ama güveni düşük (sayaç gösterilmez).
        let mut bass = vec![0.40; 8];
        bass.extend([0.53, 0.53, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40]);
        let mut energy = vec![0.60; 8];
        energy.extend([0.72, 0.72, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40, 0.40]);
        assert_eq!(find_drops(&bars(&bass, &energy)), [8]);
        let weak = drop_confidence(8, &bars(&bass, &energy), &[0]);
        assert!(weak < 0.4, "sınırdaki aday: {weak}");
        // Güven her zaman 0..1.
        assert!((0.0..=1.0).contains(&strong) && (0.0..=1.0).contains(&weak));
    }

    #[test]
    fn yalnizca_guveni_yeterli_droplar_drop_sayilir() {
        let map = SongMap {
            meter: 4,
            downbeat_phase: 0,
            grouping: Vec::new(),
            meter_confidence: 1.0,
            downbeats: vec![],
            sections: vec![],
            drops: vec![30.0, 60.0, 90.0, 120.0],
            // Güveni eksik olan son drop da sayılmaz (eski kayıt).
            drop_confidence: vec![0.2, 0.6, 0.95],
            energy: vec![],
        };
        assert_eq!(map.confident_drops().collect::<Vec<_>>(), [60.0, 90.0]);
    }

    #[test]
    fn drop_guven_esigi_arayuzdekiyle_ayni() {
        // Arayüz (sayaç, şerit) ile Görsel Yönetmen aynı droplara bakmalı.
        let source = include_str!("../../../src/lib/songMap.ts");
        let line = source
            .lines()
            .find(|l| l.starts_with("export const DROP_CONFIDENCE_MIN ="))
            .expect("songMap.ts'te DROP_CONFIDENCE_MIN yok");
        let value: f32 = line
            .split('=')
            .nth(1)
            .unwrap()
            .trim()
            .trim_end_matches(';')
            .parse()
            .unwrap();
        assert_eq!(value, DROP_CONFIDENCE_MIN);
    }

    #[test]
    fn duz_sarkida_drop_yok() {
        let rate = 22_050;
        let (samples, _) = drum_track(120.0, 0.5, 30.0, rate, 8);
        let map = analyze_samples(&samples, rate).song_map().unwrap();
        assert!(map.drops.is_empty(), "{:?}", map.drops);
        assert_eq!(map.section_at(-1.0), None);
    }
}
