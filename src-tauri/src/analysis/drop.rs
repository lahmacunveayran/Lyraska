//! Drop bulma modeli (2. sürüm): kanıtları vuruş düzeyinde birleştiren iki aşamalı lojistik model.
//!
//! Her vuruş "drop burada başlıyor" adayıdır; aday ölçü başına yapıştırılmaz (vuruş ızgarasının
//! ölçü fazı kayabilir: yarım tempo, sessizlik), ölçü başı yalnızca bir kanıttır. Aday `i` için 12
//! kanıt `x` ölçülür ([`FEATURES`]).
//!
//! 1. **Sıralama:** `z = b + Σ wⱼ·xⱼ` (vuruş düzeyinde lojistik model: "drop tam bu vuruşta mı").
//!    Birbirine 32 vuruştan (8 ölçü) yakın adaylardan en yüksek puanlısı kalır.
//! 2. **Karar:** kalan adayın güveni `σ(c₀ + c_z·z + Σ cⱼ·xⱼ)` (yalnızca böyle seçilen adaylarla
//!    uydurulmuş lojistik model: "bu aday gerçek bir drop mu"). Güven bir olasılıktır.
//!
//! Drop anı seçilen vuruşun yarım vuruş öncesiyle sonrası arasında basın döndüğü karedir
//! ([`super::structure`]'daki ince ayar).
//!
//! Kanıtlar (B: bas, H: tiz, L: ses yüksekliği, S: 32 bant; hepsi vuruş ortalaması, dB; `[a, b)`
//! vuruş aralığı, adayın vuruşu 0):
//!
//! | Kanıt       | Tanım                                               | Anlamı                              |
//! | ----------- | --------------------------------------------------- | ----------------------------------- |
//! | `bass_jump` | B[0,8) − B[−8,0)                                    | bas döndü                           |
//! | `bass_far`  | B[0,8) − B[−12,−4)                                  | bas, son ölçüden önceye göre döndü  |
//! | `gain`      | bantlarda ortalama max(0, S[0,8) − S[−8,0))         | yeni bantlar doldu                  |
//! | `hi_jump`   | H[0,8) − H[−8,0)                                    | tizler arttı (yalnızca tiz: yükseliş) |
//! | `gap`       | max(0, L[−8,−2) − min(L₋₂, L₋₁))                    | hemen önce boşluk ya da kısılma     |
//! | `accent`    | H[0,4) − H[4,8)                                     | ilk ölçü vurgulu (crash, impact)    |
//! | `full`      | min(0, H[0,8) − H₈₀)                                | sonrası tam, boğuk değil            |
//! | `level`     | min(0, B[0,8) − B₉₀)                                | sonrası şarkının en güçlü bası      |
//! | `sustain`   | B[0,32)'nin B[0,4) − 6 dB üstünde kalan payı         | drop sürüyor (sahte drop değil)     |
//! | `downbeat`  | ölçü güveni × (ölçü başıysa 0,75, değilse −0,25)    | ölçü başı (olasılık, yapıştırma değil) |
//! | `inhomog`   | orta bantlarda (8–23) ortalama \|S[0,4) − S[4,12)\|  | ilk ölçü sonrakilere benzemiyor (rulo) |
//! | `spec_step` | bantlarda ortalama \|S[0,2) − S[−2,0)\|              | değişim tam bu vuruşta (an)         |
//!
//! H₈₀, B₉₀: şarkının vuruşlarındaki tiz ve bas düzeylerinin %80 ve %90 yüzdelikleri.
//! Ağırlıklar, gerekçeleri ve ölçüm: `docs/arastirma/drop/MODEL.md`. Ağırlıklar yalnızca
//! geliştirme setinden (`docs/arastirma/drop/uret2.py`, tohum 1–3) L2 cezalı en büyük
//! olabilirlikle uyduruldu (`docs/arastirma/drop/uydur.py`); doğrulama ve son sınama setleri
//! ağırlıkların uydurulmasında kullanılmadı.
//!
//! Bant seviyeleri (0..1) 60 dB'lik ölçektedir; burada × 60 ile desibele çevrilmiş gelir.

/// Kanıtların adları (sırası [`WEIGHTS`] ile aynı).
pub const FEATURES: [&str; FEATURE_COUNT] = [
    "bass_jump",
    "bass_far",
    "gain",
    "hi_jump",
    "gap",
    "accent",
    "full",
    "level",
    "sustain",
    "downbeat",
    "inhomog",
    "spec_step",
];
pub const FEATURE_COUNT: usize = 12;

/// 1. aşama (sıralama) ağırlıkları ve sabiti.
const WEIGHTS: [f64; FEATURE_COUNT] = [
    0.1738, -0.02596, -0.09134, -0.1424, -0.01309, 0.1859, 0.2815, 0.1438, 5.042, 3.838, -1.118,
    0.3679,
];
const BIAS: f64 = -11.64;
/// 2. aşama (karar): güven = σ(DECISION_BIAS + DECISION_SCORE·z + Σ DECISION_WEIGHTS·x).
const DECISION_WEIGHTS: [f64; FEATURE_COUNT] = [
    0.04252, 0.06307, 0.09696, -0.1121, 0.01125, 0.07967, 0.1218, 0.1381, 3.57, 2.307, -0.3117,
    -0.01409,
];
const DECISION_SCORE: f64 = 0.2259;
const DECISION_BIAS: f64 = -6.419;
/// Sıralama puanı bunun altındaki vuruş aday sayılmaz (güveni ≈ 0).
const MIN_SCORE: f64 = -12.0;
/// Güveni bunun altındaki aday listelenmez (şarkı haritasında hiç görünmez). Gösterilmek için
/// gereken güven ayrıdır ([`super::structure::DROP_CONFIDENCE_MIN`], 0,6); 0,2–0,6 arası adaylar
/// haritada güveniyle durur (dışa aktarılan haritada, ölçümde görünür).
const MIN_CONFIDENCE: f32 = 0.2;
/// İki drop arası en az (vuruş).
const MIN_GAP_BEATS: usize = 32;

/// Pencereler (vuruş): öncesi ve sonrası 8 (iki ölçü), sürme 32 (sekiz ölçü). Adayın öncesinde en
/// az `FIRST`, sonrasında en az `LAST` vuruş olmalı.
const BEFORE: usize = 8;
const AFTER: usize = 8;
const SUSTAIN: usize = 32;
const FIRST: usize = 16;
const LAST: usize = 12;
/// Drop sonrası bas, ilk ölçüsünün bu kadar (dB) altına inmeden sürmeli.
const SUSTAIN_DROP_DB: f64 = 6.0;
/// Tizlerin ve basın şarkıya göre yüzdelikleri ("tam", "en güçlü bas").
const FULL_PERCENTILE: f64 = 0.80;
const LEVEL_PERCENTILE: f64 = 0.90;

/// Vuruş başına sinyaller (dB).
pub struct BeatSignals {
    /// Bas bantları (~30–150 Hz) ortalaması.
    pub bass: Vec<f64>,
    /// Tiz bantlar (son dörtte bir, ~4–16 kHz) ortalaması.
    pub high: Vec<f64>,
    /// Ses yüksekliği (dBFS).
    pub loud: Vec<f64>,
    /// Bütün bantlar (vuruş ortalaması).
    pub spectra: Vec<Vec<f64>>,
}

/// Vuruş ızgarası bilgisi.
pub struct BeatContext<'a> {
    /// Vuruş ölçü başı mı.
    pub downbeat: &'a [bool],
    /// Ölçü güveni (0..1).
    pub meter_confidence: f64,
}

/// Her vuruşun özellikleri; pencereler sığmıyorsa `None` (şarkının başı ve sonu).
pub fn features(s: &BeatSignals, c: &BeatContext) -> Vec<Option<[f64; FEATURE_COUNT]>> {
    let n = s.bass.len();
    let mean = |x: &[f64], a: isize, b: isize| -> f64 {
        let a = a.max(0) as usize;
        let b = (b.max(0) as usize).min(x.len());
        if b > a {
            x[a..b].iter().sum::<f64>() / (b - a) as f64
        } else {
            0.0
        }
    };
    let full_ref = percentile(&s.high, FULL_PERCENTILE);
    let level_ref = percentile(&s.bass, LEVEL_PERCENTILE);
    let bands = s.spectra.first().map_or(0, Vec::len);
    let (mid_lo, mid_hi) = (BASS_BANDS.min(bands), bands * 3 / 4);
    let span_mean = |a: usize, b: usize, band: usize| {
        s.spectra[a..b]
            .iter()
            .map(|v| v.get(band).copied().unwrap_or(0.0))
            .sum::<f64>()
            / (b - a) as f64
    };
    (0..n)
        .map(|i| {
            if i < FIRST || i + LAST.max(AFTER) > n {
                return None;
            }
            let k = i as isize;
            let (b, h, l) = (&s.bass[..], &s.high[..], &s.loud[..]);
            let after = mean(b, k, k + 8);
            let bass_jump = after - mean(b, k - 8, k);
            let bass_far = after - mean(b, k - 12, k - 4);
            let gain = (0..bands)
                .map(|band| {
                    (span_mean(i, i + AFTER, band) - span_mean(i - BEFORE, i, band)).max(0.0)
                })
                .sum::<f64>()
                / bands.max(1) as f64;
            let hi_jump = mean(h, k, k + 8) - mean(h, k - 8, k);
            let gap = (mean(l, k - 8, k - 2) - l[i - 2].min(l[i - 1])).max(0.0);
            let accent = mean(h, k, k + 4) - mean(h, k + 4, k + 8);
            let full = (mean(h, k, k + 8) - full_ref).min(0.0);
            let level = (after - level_ref).min(0.0);
            let floor = mean(b, k, k + 4) - SUSTAIN_DROP_DB;
            let window = &b[i..(i + SUSTAIN).min(n)];
            let sustain =
                window.iter().filter(|&&v| v >= floor).count() as f64 / window.len() as f64;
            let on_bar = c.downbeat.get(i).copied().unwrap_or(false);
            let downbeat = c.meter_confidence * (if on_bar { 1.0 } else { 0.0 } - 0.25);
            let inhomog = if mid_hi > mid_lo {
                (mid_lo..mid_hi)
                    .map(|band| (span_mean(i, i + 4, band) - span_mean(i + 4, i + 12, band)).abs())
                    .sum::<f64>()
                    / (mid_hi - mid_lo) as f64
            } else {
                0.0
            };
            let spec_step = (0..bands)
                .map(|band| (span_mean(i, i + 2, band) - span_mean(i - 2, i, band)).abs())
                .sum::<f64>()
                / bands.max(1) as f64;
            Some([
                bass_jump, bass_far, gain, hi_jump, gap, accent, full, level, sustain, downbeat,
                inhomog, spec_step,
            ])
        })
        .collect()
}

/// Bas bantlarının sayısı ([`super::structure`] ile aynı).
const BASS_BANDS: usize = 8;

/// Sıralama puanı (1. aşama lojistik modelin doğrusal kısmı).
pub fn score(x: &[f64; FEATURE_COUNT]) -> f64 {
    BIAS + WEIGHTS.iter().zip(x).map(|(w, v)| w * v).sum::<f64>()
}

/// Seçilen adayın güveni (0..1; 2. aşama).
pub fn confidence(x: &[f64; FEATURE_COUNT], z: f64) -> f32 {
    let logit = DECISION_BIAS
        + DECISION_SCORE * z
        + DECISION_WEIGHTS
            .iter()
            .zip(x)
            .map(|(w, v)| w * v)
            .sum::<f64>();
    (1.0 / (1.0 + (-logit).exp())) as f32
}

/// Drop adayları: (vuruş sırası, güven), zamanda artan. Birbirine [`MIN_GAP_BEATS`]'ten yakın
/// adaylardan yalnızca puanı en yüksek olan kalır; güveni [`MIN_CONFIDENCE`]'ın altındakiler
/// listelenmez.
pub fn find(s: &BeatSignals, c: &BeatContext) -> Vec<(usize, f32)> {
    let features = features(s, c);
    let mut scored: Vec<(usize, f64)> = features
        .iter()
        .enumerate()
        .filter_map(|(i, x)| x.as_ref().map(|x| (i, score(x))))
        .filter(|(_, z)| z.is_finite() && *z >= MIN_SCORE)
        .collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    let mut chosen: Vec<(usize, f64)> = Vec::new();
    for (i, z) in scored {
        if chosen.iter().all(|&(c, _)| c.abs_diff(i) >= MIN_GAP_BEATS) {
            chosen.push((i, z));
        }
    }
    chosen.sort_unstable_by_key(|&(i, _)| i);
    chosen
        .into_iter()
        .filter_map(|(i, z)| {
            let x = features.get(i)?.as_ref()?;
            Some((beat_of_change(&features, i), confidence(x, z)))
        })
        .filter(|&(_, c)| c >= MIN_CONFIDENCE)
        .collect()
}

/// Ölçü başı bir kanıttır, yapıştırma değil: seçilen vuruşun komşusunda (bir vuruş önce ya da
/// sonra) ölçü başı kanıtı dışındaki puan açıkça ([`NEIGHBOR_MARGIN`]) yüksekse drop o vuruştur.
/// Ölçü fazı yanlış ama güveni yüksek bulunduğunda (yarım tempolu dubstep) drop ölçü başı sanılan
/// vuruşa kaymasın.
fn beat_of_change(features: &[Option<[f64; FEATURE_COUNT]>], i: usize) -> usize {
    let signal_score = |k: usize| {
        features
            .get(k)
            .and_then(Option::as_ref)
            .map(|x| score(x) - WEIGHTS[DOWNBEAT] * x[DOWNBEAT])
    };
    let Some(own) = signal_score(i) else {
        return i;
    };
    [i.checked_sub(1), Some(i + 1)]
        .into_iter()
        .flatten()
        .filter_map(|k| Some((k, signal_score(k)?)))
        .filter(|&(_, v)| v > own + NEIGHBOR_MARGIN)
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map_or(i, |(k, _)| k)
}

/// Komşu vuruşa geçmek için ölçü başı dışındaki puanın en az farkı (logit).
const NEIGHBOR_MARGIN: f64 = 1.0;
/// `downbeat` kanıtının sırası.
const DOWNBEAT: usize = 9;

/// Doğrusal ara değerli yüzdelik (numpy'nin varsayılanı gibi).
fn percentile(values: &[f64], q: f64) -> f64 {
    let mut sorted: Vec<f64> = values.iter().copied().filter(|v| v.is_finite()).collect();
    if sorted.is_empty() {
        return 0.0;
    }
    sorted.sort_by(f64::total_cmp);
    let pos = (sorted.len() - 1) as f64 * q.clamp(0.0, 1.0);
    let lo = pos.floor() as usize;
    let hi = (lo + 1).min(sorted.len() - 1);
    sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::structure::DROP_CONFIDENCE_MIN;

    /// Bir bölümün vuruş başına düzeyleri (dB): bas, orta, tiz, ses yüksekliği; bölüm boyunca
    /// başından sonuna doğrusal değişir (yükseliş).
    #[derive(Clone, Copy)]
    struct Part {
        beats: usize,
        bass: (f64, f64),
        mid: (f64, f64),
        high: (f64, f64),
        loud: (f64, f64),
    }

    fn part(beats: usize, bass: f64, mid: f64, high: f64, loud: f64) -> Part {
        Part {
            beats,
            bass: (bass, bass),
            mid: (mid, mid),
            high: (high, high),
            loud: (loud, loud),
        }
    }

    /// Bölümleri art arda dizip modeli çalıştırır. Ölçü başları her dört vuruşta bir (`phase`'ten).
    /// Bölümlerin başladığı vuruşları ve bulunan adayları (vuruş, güven) döndürür.
    fn run(parts: &[Part], phase: usize) -> (Vec<usize>, Vec<(usize, f32)>) {
        let (mut bass, mut high, mut loud, mut spectra) = (vec![], vec![], vec![], vec![]);
        let mut starts = Vec::new();
        for p in parts {
            starts.push(bass.len());
            for j in 0..p.beats {
                let x = j as f64 / (p.beats.max(2) - 1) as f64;
                let at = |r: (f64, f64)| r.0 + (r.1 - r.0) * x;
                let (b, m, h) = (at(p.bass), at(p.mid), at(p.high));
                bass.push(b);
                high.push(h);
                loud.push(at(p.loud));
                spectra.push(
                    (0..32)
                        .map(|band| match band {
                            0..8 => b,
                            8..24 => m,
                            _ => h,
                        })
                        .collect(),
                );
            }
        }
        let downbeat: Vec<bool> = (0..bass.len()).map(|i| i % 4 == phase % 4).collect();
        let signals = BeatSignals {
            bass,
            high,
            loud,
            spectra,
        };
        let context = BeatContext {
            downbeat: &downbeat,
            meter_confidence: 1.0,
        };
        (starts, find(&signals, &context))
    }

    /// Gösterilen (güveni yeterli) dropların vuruşları.
    fn shown(found: &[(usize, f32)]) -> Vec<usize> {
        found
            .iter()
            .filter(|(_, c)| *c >= DROP_CONFIDENCE_MIN)
            .map(|&(i, _)| i)
            .collect()
    }

    // Bölümlerin düzeyleri geliştirme setindeki şarkılarda ölçülenlere yakındır (dB).
    fn groove() -> Part {
        part(32, 34.0, 32.0, 40.0, -10.0)
    }
    fn calm() -> Part {
        part(32, 12.0, 30.0, 34.0, -18.0)
    }
    /// Yükseliş: bas yok, tizler (riser) ve ses yüksekliği gittikçe artar.
    fn build(beats: usize) -> Part {
        Part {
            beats,
            bass: (12.0, 16.0),
            mid: (30.0, 34.0),
            high: (36.0, 48.0),
            loud: (-18.0, -9.0),
        }
    }
    /// Drop: güçlü bas, dolu tizler; ilk ölçüsü crash ile vurgulu.
    fn drop_accent() -> Part {
        part(4, 41.0, 35.0, 47.0, -5.0)
    }
    fn drop(beats: usize) -> Part {
        part(beats, 40.0, 35.0, 43.0, -6.0)
    }

    #[test]
    fn yukselisten_sonra_drop_yukselisin_bittigi_vurusta() {
        let parts = [
            groove(),
            calm(),
            build(32),
            drop_accent(),
            drop(60),
            calm(),
            build(32),
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (starts, found) = run(&parts, 0);
        assert_eq!(shown(&found), [starts[3], starts[7]], "{found:?}");
    }

    #[test]
    fn sessizlikten_sonraki_drop_bulunur() {
        // Yükselişin son iki vuruşu sessiz (eski yöntem bunu şarkının başı sanıp kaçırıyordu).
        let silence = part(2, 0.0, 0.0, 0.0, -70.0);
        let parts = [
            groove(),
            calm(),
            build(30),
            silence,
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (starts, found) = run(&parts, 0);
        assert_eq!(shown(&found), [starts[4]], "{found:?}");
    }

    #[test]
    fn vurgusuz_drop_da_bulunur() {
        // Crash ya da impact yok: drop yalnızca bas ve dolu tizlerle gelir.
        let parts = [groove(), calm(), build(32), drop(64), groove()];
        let (starts, found) = run(&parts, 0);
        assert_eq!(shown(&found), [starts[3]], "{found:?}");
    }

    #[test]
    fn sahte_drop_drop_sayilmaz() {
        // Yükselişten sonra iki vuruşluk patlama, sonra yükseliş sürer; asıl drop 16 vuruş sonra.
        let fake = part(2, 41.0, 35.0, 47.0, -5.0);
        let parts = [
            groove(),
            calm(),
            build(32),
            fake,
            build(14),
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (starts, found) = run(&parts, 0);
        assert_eq!(shown(&found), [starts[5]], "{found:?}");
    }

    #[test]
    fn yukselisin_sonundaki_rulo_dropu_erkene_cekmez() {
        // Yükselişin son ölçüsünde gittikçe güçlenen kick rulosu: bası drop kadar güçlü, ama orta
        // bantları droptan farklı (rulo yükselişin parçası). Drop rulodan sonraki vuruş.
        let roll = Part {
            beats: 4,
            bass: (30.0, 42.0),
            mid: (26.0, 27.0),
            high: (48.0, 48.0),
            loud: (-8.0, -5.0),
        };
        let parts = [
            groove(),
            calm(),
            build(28),
            roll,
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (starts, found) = run(&parts, 0);
        assert!(
            found.iter().all(|&(i, _)| i != starts[3]),
            "rulo drop sayılmamalı: {found:?}"
        );
        assert_eq!(shown(&found), [starts[4]], "{found:?}");
    }

    #[test]
    fn olcu_basi_kanittir_yapistirilmaz() {
        // Ölçü güveni tam ama ölçü başları bir vuruş kaymış: drop ölçü başına (bir vuruş sonraya)
        // çekilmez, basın döndüğü vuruşta kalır.
        let parts = [
            groove(),
            calm(),
            build(32),
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (starts, found) = run(&parts, 1);
        assert_eq!(shown(&found), [starts[3]], "{found:?}");
    }

    #[test]
    fn dropsuz_sarkida_guvenilir_drop_yok() {
        // Pop: kıta ve nakarat sırayla; nakarat biraz daha dolu, bas hep var, yükseliş yok.
        let verse = part(32, 32.0, 31.0, 38.0, -12.0);
        let chorus = part(32, 34.0, 33.0, 41.0, -10.0);
        let parts = [verse, verse, chorus, verse, chorus, verse, chorus, chorus];
        let (_, found) = run(&parts, 0);
        assert!(shown(&found).is_empty(), "{found:?}");
        // Balad: piyano girişinden sonra yumuşak davul ve bas.
        let piano = part(32, 24.0, 30.0, 28.0, -20.0);
        let band = part(64, 30.0, 31.0, 31.0, -17.0);
        let (_, found) = run(&[piano, piano, band, band], 0);
        assert!(shown(&found).is_empty(), "{found:?}");
    }

    #[test]
    fn iki_drop_birbirine_yakinsa_yalnizca_biri_kalir() {
        // İki aday 32 vuruştan yakın olamaz (sekiz ölçü): puanı yüksek olan kalır.
        let parts = [
            groove(),
            calm(),
            build(32),
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (_, found) = run(&parts, 0);
        for pair in found.windows(2) {
            assert!(pair[1].0 - pair[0].0 >= MIN_GAP_BEATS, "{found:?}");
        }
    }

    #[test]
    fn guven_olasiliktir() {
        let parts = [
            groove(),
            calm(),
            build(32),
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (_, found) = run(&parts, 0);
        assert!(found
            .iter()
            .all(|&(_, c)| (MIN_CONFIDENCE..=1.0).contains(&c)));
        assert_eq!(FEATURES.len(), WEIGHTS.len());
        assert_eq!(FEATURES.len(), DECISION_WEIGHTS.len());
        // Kısa şarkıda (pencereler sığmıyor) aday yok.
        let (_, found) = run(&[part(20, 40.0, 30.0, 40.0, -8.0)], 0);
        assert!(found.is_empty());
    }

    #[test]
    fn yuzdelik_numpy_gibi_ara_deger_alir() {
        assert!((percentile(&[1.0, 2.0, 3.0, 4.0, 5.0], 0.8) - 4.2).abs() < 1e-12);
        assert_eq!(percentile(&[], 0.5), 0.0);
        assert_eq!(percentile(&[7.0], 0.9), 7.0);
    }
}
