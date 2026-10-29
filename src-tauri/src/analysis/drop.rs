//! Drop bulma modeli (2. sürüm): kanıtları vuruş düzeyinde birleştiren iki aşamalı lojistik model.
//!
//! Her vuruş "drop burada başlıyor" adayıdır; aday ölçü başına yapıştırılmaz (vuruş ızgarasının
//! ölçü fazı kayabilir: yarım tempo, sessizlik), ölçü başı yalnızca bir kanıttır. Aday `i` için 8
//! kanıt `x` ölçülür ([`FEATURES`]).
//!
//! 1. **Sıralama:** `z = b + Σ wⱼ·xⱼ` (vuruş düzeyinde lojistik model: "drop tam bu vuruşta mı").
//!    Birbirine 32 vuruştan (8 ölçü) yakın adaylardan en yüksek puanlısı kalır.
//! 2. **Karar:** kalan adayın güveni `σ(c₀ + c_z·z + Σ cⱼ·xⱼ)` (yalnızca böyle seçilen adaylarla
//!    uydurulmuş lojistik model: "bu aday gerçek bir drop mu"). Güven bir olasılıktır.
//!
//! Her ağırlık kanıtın fiziksel yönündedir ya da sıfırdır (işaret kısıtlı uydurma): üretilen deneme
//! setinin bir alışkanlığı ters işaretli bir ağırlık olarak modele sızamaz. Ölçü güveni bilinmeyen
//! şarkı (güven 0) eğitimde ayrıca temsil edilir; drop'u bastırmaz.
//!
//! Drop anı seçilen vuruşun yarım vuruş öncesiyle sonrası arasında basın döndüğü karedir
//! ([`super::structure`]'daki ince ayar). Izgaradan önceki kısım (ritimsiz giriş, sessizlik)
//! [`LEAD_IN`] uydurulan vuruşla doldurulur; şarkının başındaki drop da aday olur.
//!
//! Kanıtlar (B: bas, H: tiz, S: 32 bant; hepsi vuruş ortalaması, dB; `[a, b)` vuruş aralığı, adayın
//! vuruşu 0):
//!
//! | Kanıt       | Tanım                                               | Yön | Anlamı                                |
//! | ----------- | --------------------------------------------------- | --- | ------------------------------------- |
//! | `bass_jump` | B[0,8) − B[−8,0)                                    | +   | bas döndü                             |
//! | `bass_far`  | B[0,8) − B[−12,−4)                                  | +   | bas, son ölçüden öncesine göre döndü  |
//! | `accent`    | H[0,4) − H[4,8)                                     | +   | ilk ölçü vurgulu (crash, impact)      |
//! | `full`      | min(0, H[0,8) − Hᵦ)                                 | +   | sonrası tam, boğuk değil              |
//! | `level`     | min(0, B[0,8) − B₉₀)                                | +   | sonrası şarkının en güçlü bası        |
//! | `sustain`   | B[0,32)'nin B[0,4) − 6 dB üstünde kalan payı         | +   | drop sürüyor (sahte drop değil)       |
//! | `downbeat`  | ölçü güveni × (ölçü başıysa 0,75, değilse −0,25)    | +   | ölçü başı (olasılık, yapıştırma değil) |
//! | `inhomog`   | orta bantlarda (8–23) ortalama \|S[0,4) − S[4,12)\|  | −   | ilk ölçü sonrakilere benzemiyor (rulo) |
//!
//! Hᵦ: şarkının bası güçlü (%70 yüzdeliğin üstü) vuruşlarındaki ortanca tiz (bassız yükselişin parlak
//! riser'ı ölçüyü yükseltmez); B₉₀: vuruşlardaki bas düzeyinin %90 yüzdeliği. Kanıtlar tür
//! dışarıda bırakılarak yapılan çapraz doğrulamayla seçildi; ağırlıklar, gerekçeleri ve ölçüm:
//! `docs/arastirma/drop/MODEL.md`. Ağırlıklar yalnızca geliştirme setinden
//! (`docs/arastirma/drop/uret2.py`, tohum 1–3) uyduruldu (`docs/arastirma/drop/uydur.py`).
//!
//! Bant seviyeleri (0..1) 60 dB'lik ölçektedir; burada × 60 ile desibele çevrilmiş gelir.

/// Kanıtların adları (sırası [`WEIGHTS`] ile aynı).
pub const FEATURES: [&str; FEATURE_COUNT] = [
    "bass_jump",
    "bass_far",
    "accent",
    "full",
    "level",
    "sustain",
    "downbeat",
    "inhomog",
];
pub const FEATURE_COUNT: usize = 8;
/// Kanıtların fiziksel yönü (+1 drop olasılığını artırır, −1 azaltır): ağırlıklar bu yöndedir.
pub const SIGNS: [f64; FEATURE_COUNT] = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, -1.0];

/// 1. aşama (sıralama) ağırlıkları ve sabiti.
const WEIGHTS: [f64; FEATURE_COUNT] =
    [0.1017, 0.03788, 0.1451, 0.5047, 0.2938, 3.05, 2.505, -0.559];
const BIAS: f64 = -6.173;
/// 2. aşama (karar): güven = σ(DECISION_BIAS + DECISION_SCORE·z + Σ DECISION_WEIGHTS·x).
const DECISION_WEIGHTS: [f64; FEATURE_COUNT] =
    [0.0, 0.09638, 0.008679, 0.3408, 0.8121, 4.897, 0.0, -0.4538];
const DECISION_SCORE: f64 = 0.215;
const DECISION_BIAS: f64 = -3.893;
/// Sıralama puanı bunun altındaki vuruş aday sayılmaz (güveni ≈ 0).
const MIN_SCORE: f64 = -12.0;
/// Güveni bunun altındaki aday listelenmez (şarkı haritasında hiç görünmez). Gösterilmek için
/// gereken güven ayrıdır ([`super::structure::DROP_CONFIDENCE_MIN`], 0,6); 0,2–0,6 arası adaylar
/// haritada güveniyle durur (dışa aktarılan haritada, ölçümde görünür).
const MIN_CONFIDENCE: f32 = 0.2;
/// Adayın basının, yakın (8 vuruş) ya da uzak (12–4 vuruş önce) öncesine göre en az dönüşü (dB).
/// Değer tür dışarıda bırakılarak yapılan çapraz doğrulamayla seçildi (3, 6, 9 dB denendi).
const MIN_BASS_RETURN_DB: f64 = 3.0;
/// `bass_jump` ve `bass_far` kanıtlarının sırası.
const BASS_JUMP: usize = 0;
const BASS_FAR: usize = 1;
/// Aday, şarkının duyulur ilk vuruşundan en az bu kadar sonra olmalı (`bass_far`'ın penceresi 12
/// vuruş geriye bakar): şarkının başlangıcı (sessizlikten sonraki ilk ses) drop sayılmaz. Drop'tan
/// önceki kısa boşluk (1–4 vuruş) bunu etkilemez; ritimsiz giriş de şarkının parçasıdır.
const MIN_PLAYED_BEFORE: usize = 12;
/// Duyulur sayılmak için vuruşun bant ortalaması (dB, 60 dB'lik ölçekte tabanın üstü).
const AUDIBLE_DB: f64 = 3.0;

/// İki drop arası en az (vuruş).
const MIN_GAP_BEATS: usize = 32;

/// Pencereler (vuruş): öncesi ve sonrası 8 (iki ölçü), sürme 32 (sekiz ölçü). Adayın öncesinde en
/// az `FIRST`, sonrasında en az `LAST` vuruş olmalı.
const BEFORE: usize = 8;
const AFTER: usize = 8;
const SUSTAIN: usize = 32;
const FIRST: usize = 16;
/// Izgaradan önce uydurulan vuruş sayısı: şarkının başındaki (ritimsiz girişten hemen sonraki) drop da
/// aday olabilsin.
pub const LEAD_IN: usize = FIRST;
const LAST: usize = 12;
/// Drop sonrası bas, ilk ölçüsünün bu kadar (dB) altına inmeden sürmeli.
const SUSTAIN_DROP_DB: f64 = 6.0;
/// "Tam" tizin ölçüsü bası bu yüzdelikten güçlü vuruşlardan; "en güçlü bas" bu yüzdelik.
const FULL_BASS_PERCENTILE: f64 = 0.70;
const LEVEL_PERCENTILE: f64 = 0.90;

/// Vuruş başına sinyaller (dB).
pub struct BeatSignals {
    /// Bas bantları (~30–150 Hz) ortalaması.
    pub bass: Vec<f64>,
    /// Tiz bantlar (son dörtte bir, ~4–16 kHz) ortalaması.
    pub high: Vec<f64>,
    /// Bütün bantlar (vuruş ortalaması).
    pub spectra: Vec<Vec<f64>>,
}

/// Vuruş ızgarası bilgisi.
pub struct BeatContext<'a> {
    /// İlk gerçek vuruşun sırası. Öncesi ızgaradan önceki kısım için uydurulan vuruşlardır (ritimsiz
    /// giriş, sessizlik; [`LEAD_IN`]): pencereleri doldurur, aday olmaz.
    pub first: usize,
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
    // "Tam" tizin ölçüsü, şarkının bası güçlü vuruşlarındaki tipik (ortanca) tiz: bassız yükselişin
    // parlak riser'ı ölçüyü yükseltmez (yükselişi parlak şarkıda drop boğuk sayılmasın).
    // Yüzdelikler yalnızca gerçek vuruşlardan (ızgara öncesi uydurulanlar hariç).
    let real = c.first.min(n);
    let bass_floor = percentile(&s.bass[real..], FULL_BASS_PERCENTILE);
    let bassy_high: Vec<f64> = s.high[real..]
        .iter()
        .zip(&s.bass[real..])
        .filter(|&(_, &b)| b >= bass_floor)
        .map(|(&h, _)| h)
        .collect();
    let full_ref = if bassy_high.is_empty() {
        percentile(&s.high[real..], 0.5)
    } else {
        percentile(&bassy_high, 0.5)
    };
    let level_ref = percentile(&s.bass[real..], LEVEL_PERCENTILE);
    let song_start = s
        .spectra
        .iter()
        .position(|v| v.iter().sum::<f64>() / v.len().max(1) as f64 >= AUDIBLE_DB)
        .unwrap_or(n);
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
            if i < FIRST.max(c.first) || i + LAST.max(AFTER) > n {
                return None;
            }
            // Şarkı en az MIN_PLAYED_BEFORE vuruştur çalıyor olmalı (pencereler şarkı başlamadan
            // önceki sessizliğe taşmasın: şarkının başlangıcı drop değildir).
            if i < song_start + MIN_PLAYED_BEFORE {
                return None;
            }
            let k = i as isize;
            let (b, h) = (&s.bass[..], &s.high[..]);
            let after = mean(b, k, k + AFTER as isize);
            let bass_jump = after - mean(b, k - BEFORE as isize, k);
            let bass_far = after - mean(b, k - 12, k - 4);
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
            Some([
                bass_jump, bass_far, accent, full, level, sustain, downbeat, inhomog,
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
        .filter_map(|(i, x)| x.as_ref().map(|x| (i, x, score(x))))
        // Aday kapısı: drop'un bir şeyden "düşmesi" gerekir. Bas yakın ya da uzak öncesine göre en
        // az MIN_BASS_RETURN_DB dönmeyen vuruş (pop'ta nakaratın başı gibi) aday olmaz.
        .filter(|(_, x, _)| x[BASS_JUMP].max(x[BASS_FAR]) >= MIN_BASS_RETURN_DB)
        .map(|(i, _, z)| (i, z))
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
            Some((beat_of_change(s, i), confidence(x, z)))
        })
        .filter(|&(_, c)| c >= MIN_CONFIDENCE)
        .collect()
}

/// Ölçü başı bir kanıttır, yapıştırma değil: seçilen vuruşun komşusunda (bir vuruş önce ya da
/// sonra) bas kısa pencerede (iki vuruş öncesine göre iki vuruş sonrası) açıkça daha çok dönüyorsa
/// ([`NEIGHBOR_MARGIN_DB`]) drop o vuruştur. Ölçü fazı yanlış ama güveni yüksek bulunduğunda (yarım
/// tempolu dubstep) drop, ölçü başı sanılan vuruşa kaymasın.
fn beat_of_change(s: &BeatSignals, i: usize) -> usize {
    let step = |k: usize| -> Option<f64> {
        let (a, b) = (k.checked_sub(2)?, k + 2);
        let after = s.bass.get(k..b)?;
        let before = s.bass.get(a..k)?;
        Some(after.iter().sum::<f64>() / 2.0 - before.iter().sum::<f64>() / 2.0)
    };
    let Some(own) = step(i) else {
        return i;
    };
    [i.checked_sub(1), Some(i + 1)]
        .into_iter()
        .flatten()
        .filter_map(|k| Some((k, step(k)?)))
        .filter(|&(_, v)| v > own + NEIGHBOR_MARGIN_DB)
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map_or(i, |(k, _)| k)
}

/// Komşu vuruşa geçmek için kısa pencerede bas dönüşünün en az farkı (dB).
const NEIGHBOR_MARGIN_DB: f64 = 6.0;

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
    }

    fn part(beats: usize, bass: f64, mid: f64, high: f64) -> Part {
        Part {
            beats,
            bass: (bass, bass),
            mid: (mid, mid),
            high: (high, high),
        }
    }

    /// Bölümleri art arda dizip modeli çalıştırır. Ölçü başları her dört vuruşta bir (`phase`'ten).
    /// Bölümlerin başladığı vuruşları ve bulunan adayları (vuruş, güven) döndürür.
    fn run(parts: &[Part], phase: usize) -> (Vec<usize>, Vec<(usize, f32)>) {
        run_with(parts, phase, 1.0, 0)
    }

    /// `run`, ölçü güveni ve ızgara öncesi uydurulan vuruş sayısı (`first`) verilerek.
    fn run_with(
        parts: &[Part],
        phase: usize,
        meter_confidence: f64,
        first: usize,
    ) -> (Vec<usize>, Vec<(usize, f32)>) {
        let (mut bass, mut high, mut spectra) = (vec![], vec![], vec![]);
        let mut starts = Vec::new();
        for p in parts {
            starts.push(bass.len());
            for j in 0..p.beats {
                let x = j as f64 / (p.beats.max(2) - 1) as f64;
                let at = |r: (f64, f64)| r.0 + (r.1 - r.0) * x;
                let (b, m, h) = (at(p.bass), at(p.mid), at(p.high));
                bass.push(b);
                high.push(h);
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
            spectra,
        };
        let context = BeatContext {
            first,
            downbeat: &downbeat,
            meter_confidence,
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
        part(32, 34.0, 32.0, 40.0)
    }
    fn calm() -> Part {
        part(32, 12.0, 30.0, 34.0)
    }
    /// Yükseliş: bas yok, tizler (riser) ve ses yüksekliği gittikçe artar.
    fn build(beats: usize) -> Part {
        Part {
            beats,
            bass: (12.0, 16.0),
            mid: (30.0, 34.0),
            high: (36.0, 48.0),
        }
    }
    /// Drop: güçlü bas, dolu tizler; ilk ölçüsü crash ile vurgulu.
    fn drop_accent() -> Part {
        part(4, 41.0, 35.0, 47.0)
    }
    fn drop(beats: usize) -> Part {
        part(beats, 40.0, 35.0, 43.0)
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
        let silence = part(2, 0.0, 0.0, 0.0);
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
    fn tizleri_artiran_drop_cezalandirilmaz() {
        // Rock girişi gibi: sakin kısımdan sonra bas da tizler de birden artar (riser yok). Tizlerin
        // artması drop'u zayıflatmaz (`hi_jump` ağırlığı negatif olamaz).
        let quiet = part(32, 14.0, 28.0, 25.0);
        let band = part(64, 38.0, 34.0, 45.0);
        let parts = [quiet, band, quiet, band];
        let (starts, found) = run(&parts, 0);
        assert_eq!(shown(&found), [starts[1], starts[3]], "{found:?}");
    }

    #[test]
    fn olcu_guveni_yokken_drop_bastirilmaz() {
        // Ölçü bulunamadı (güven 0): ölçü başı kanıtı nötr, drop yine gösterilir.
        let parts = [
            groove(),
            calm(),
            build(32),
            drop_accent(),
            drop(60),
            groove(),
        ];
        let (starts, found) = run_with(&parts, 0, 0.0, 0);
        assert_eq!(shown(&found), [starts[3]], "{found:?}");
    }

    #[test]
    fn izgaradan_hemen_sonraki_drop_aday_olur() {
        // Ritimsiz giriş: ızgara drop'ta başlar; öncesi uydurulan vuruşlarla (sakin giriş) doldurulur.
        let intro = part(LEAD_IN, 10.0, 28.0, 30.0);
        let parts = [intro, drop_accent(), drop(60), calm(), build(32), drop(64)];
        let (starts, found) = run_with(&parts, 0, 1.0, LEAD_IN);
        assert_eq!(shown(&found)[0], starts[1], "{found:?}");
        // Uydurulan vuruşlar aday olmaz.
        assert!(found.iter().all(|&(i, _)| i >= LEAD_IN), "{found:?}");
    }

    #[test]
    fn sahte_drop_drop_sayilmaz() {
        // Yükselişten sonra iki vuruşluk patlama, sonra yükseliş sürer; asıl drop 16 vuruş sonra.
        let fake = part(2, 41.0, 35.0, 47.0);
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
        let verse = part(32, 32.0, 31.0, 38.0);
        let chorus = part(32, 34.0, 33.0, 41.0);
        let parts = [verse, verse, chorus, verse, chorus, verse, chorus, chorus];
        let (_, found) = run(&parts, 0);
        assert!(shown(&found).is_empty(), "{found:?}");
        // Not: baladda piyanodan sonra yumuşak davul ve basın girişi (bas +4 dB, şarkının doruğu,
        // sürüyor) bu kanıtlarla grubun büyük girişinden ayrılamıyor; drop sayılabiliyor
        // (`docs/arastirma/drop/MODEL.md`, "Kalanlar").
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
        // Her kanıtın ağırlığı fiziksel yönünde (ya da 0): `inhomog` azaltır, gerisi artırır.
        for (j, name) in FEATURES.iter().enumerate() {
            let sign = if *name == "inhomog" { -1.0 } else { 1.0 };
            assert!(
                sign * WEIGHTS[j] >= 0.0 && sign * DECISION_WEIGHTS[j] >= 0.0,
                "{name}"
            );
        }
        // Kısa şarkıda (pencereler sığmıyor) aday yok.
        let (_, found) = run(&[part(20, 40.0, 30.0, 40.0)], 0);
        assert!(found.is_empty());
    }

    #[test]
    fn yuzdelik_numpy_gibi_ara_deger_alir() {
        assert!((percentile(&[1.0, 2.0, 3.0, 4.0, 5.0], 0.8) - 4.2).abs() < 1e-12);
        assert_eq!(percentile(&[], 0.5), 0.0);
        assert_eq!(percentile(&[7.0], 0.9), 7.0);
    }
}
