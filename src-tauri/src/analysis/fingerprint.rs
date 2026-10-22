//! Ses parmak izi: aynı kaydın farklı dosyalarını (MP3, FLAC, AAC; farklı ad ve etiket) tanır,
//! farklı kayıtları (canlı, remaster, başka şarkı) ayırır. Şarkı haritası dosyalarının doğru
//! şarkıya uygulanması için kullanılır ([`super::map_file`]). Dış kütüphane kullanılmaz; şarkı
//! yeniden çözülmez: parmak izi analizin zaten çıkardığı verilerden hesaplanır.
//!
//! İki kanalı vardır; ikisi de tutmadıkça şarkı "aynı" sayılmaz:
//!
//! **Bantlar** (zaman ve tını; Haitsma ve Kalker 2002'nin bit kuralı). Analizin bant kareleri
//! (60 kare/sn, 32 logaritmik bant, desibel) 133 ms'lik pencerelerle 15 kare/sn'ye indirilir. Her
//! kare için ~55 Hz–7,3 kHz arasındaki 25 bandın komşu farklarının zamandaki değişiminin işareti
//! bir bittir:
//!
//! ```text
//! bit(n, m) = 1  ⇔  Δ = (E[n, m] − E[n, m+1]) − (E[n−1, m] − E[n−1, m+1]) > 0
//! ```
//!
//! Enerjiler desibel olduğu için ses düzeyi ve sabit bir ekolayzer eğimi Δ'da birbirini götürür;
//! kodlayıcıların kestiği tizlere dayanılmaz. |Δ| küçükse (sessize yakın bant) bitin işareti
//! gürültüye bağlıdır: yerel şarkıda yalnızca |Δ| ≥ 0,7 dB olan bitler sayılır. Hizalama ±10 sn
//! içinde, yerel tarafta dört fazla 1/60 sn çözünürlükte aranır.
//!
//! **Kroma** (armoni). Ton analizinin saniye başına 12 perde sınıfından, o saniyenin
//! ortalamasının üstündekiler (çalan notalar) 12 bit olur. Bantlar davulun ritmini çok iyi
//! görür; aynı tempoda, aynı davullu iki şarkıyı ancak akorlar ayırır.
//!
//! Ölçülen bit hata oranları (0 = aynı, 0,5 = ilgisiz; sentetik şarkılarla, testlerde ve
//! `docs/SARKI-HARITASI.md`'de):
//!
//! | Durum                                      | Bantlar | Kroma |
//! | ------------------------------------------ | ------- | ----- |
//! | Aynı kayıt, kayıplı kodlama (+25 ms)       | 0,07    | 0,00  |
//! | Aynı kayıt, 22 kHz dosya                   | 0,22    | 0,00  |
//! | Başka şarkı, aynı davul ve tempo           | 0,34    | 0,29  |
//!
//! Karar: bantlarda ≤ [`BAND_MAX_ERROR`] ve kromada ≤ [`CHROMA_MAX_ERROR`]; kroma yoksa (eski
//! analiz) bantlarda ≤ [`BAND_ONLY_MAX_ERROR`].

use super::spectrogram::{band_edges, BANDS, FRAMES_PER_SECOND};

/// Yöntemin adı (dosyada saklanır; başka bir yöntemle üretilmiş parmak izi karşılaştırılmaz).
pub const METHOD: &str = "lyraska-pi1";
/// Parmak izi karesinin adımı (analiz karesi).
const DECIMATION: usize = 4;
/// Parmak izi karesinin penceresi (analiz karesi; 133 ms): adımın iki katı, kareler yarı yarıya
/// örtüşür. Kodlayıcı gecikmesi kadar kayma (~25 ms) pencerenin küçük bir kısmı kalır.
const WINDOW: usize = 8;
/// Parmak izinin kare hızı (kare/sn).
pub const FRAMES_PER_SECOND_FP: f64 = FRAMES_PER_SECOND / DECIMATION as f64;
/// Kullanılan bantlar (dahil): standart ızgarada ~55 Hz – ~7,3 kHz (25 bant, 24 bit).
const FIRST_BAND: usize = 3;
const LAST_BAND: usize = 27;
/// Kare başına bit sayısı (komşu bant çifti sayısı).
pub const BITS: u32 = (LAST_BAND - FIRST_BAND) as u32;
/// Bitin güvenilir sayıldığı en küçük |Δ| (seviye birimi; 255 birim = 60 dB, yani ~0,7 dB).
const RELIABLE_DELTA: f32 = 3.0;
/// Bu seviyenin (0..255) altındaki ortalama: sessiz kare, kelime üretmez.
const SILENT_LEVEL: f32 = 12.0;
/// Hizalamada denenen en büyük kayma (saniye).
pub const MAX_OFFSET_SECONDS: f64 = 10.0;
/// Eşleşme için ikisinde de geçerli en az örtüşme (saniye).
pub const MIN_OVERLAP_SECONDS: f64 = 10.0;
/// Bantlarda aynı kayıt sayılan en büyük bit hata oranı.
pub const BAND_MAX_ERROR: f64 = 0.30;
/// Kromada aynı kayıt sayılan en büyük bit hata oranı.
pub const CHROMA_MAX_ERROR: f64 = 0.15;
/// Kroma yoksa bantlarda gereken (daha sıkı) eşik.
pub const BAND_ONLY_MAX_ERROR: f64 = 0.20;
/// Parmak izinin standart bant ızgarasının örnekleme hızı (44,1 kHz ve üstünde bütün hızların
/// ızgarası aynıdır).
const STANDARD_RATE: f64 = 44_100.0;
/// Kroma bitinin güvenilir sayıldığı en küçük uzaklık (0..255; o saniyenin en güçlüsü 255).
const CHROMA_RELIABLE: f32 = 25.0;
/// Kroma karşılaştırmasında gereken en az saniye.
const CHROMA_MIN_SECONDS: usize = 10;
/// Kroma kelimesinin bitleri.
const PITCH_CLASSES: usize = 12;

/// Bir şarkının parmak izi: bantlar ve (varsa) kroma.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackPrint {
    pub bands: BandPrint,
    pub chroma: Option<ChromaPrint>,
}

/// Dosyadaki parmak izinin yerel şarkıyla karşılaştırılması.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Verdict {
    /// Dosyadaki t anı yerel şarkıda t + `offset_secs` anına denk gelir.
    pub offset_secs: f64,
    /// Bantlarda bit hata oranı (0 = aynı, ~0,5 = ilgisiz).
    pub band_error: f64,
    /// Kromada bit hata oranı (karşılaştırılamadıysa `None`).
    pub chroma_error: Option<f64>,
    /// Karşılaştırılan süre (saniye).
    pub overlap_secs: f64,
}

impl Verdict {
    /// Aynı kayıt mı?
    pub fn is_match(&self) -> bool {
        if self.overlap_secs < MIN_OVERLAP_SECONDS {
            return false;
        }
        match self.chroma_error {
            Some(chroma) => self.band_error <= BAND_MAX_ERROR && chroma <= CHROMA_MAX_ERROR,
            None => self.band_error <= BAND_ONLY_MAX_ERROR,
        }
    }

    /// Ekranda gösterilen benzerlik (0..1): hata oranı 0 → 1, 0,5 (ilgisiz) → 0. İki kanalın
    /// kötüsü.
    pub fn similarity(&self) -> f64 {
        let worst = self.band_error.max(self.chroma_error.unwrap_or(0.0));
        (1.0 - 2.0 * worst).clamp(0.0, 1.0)
    }
}

impl TrackPrint {
    /// Analiz karelerinden ve (varsa) ton analizinin kromasından.
    pub fn of(levels: &[u8], sample_rate: u32, chroma: Option<&[[u8; PITCH_CLASSES]]>) -> Self {
        Self {
            bands: BandPrint::from_levels(levels, sample_rate),
            chroma: chroma.map(|c| ChromaPrint::from_chroma(c, 0.0)),
        }
    }

    /// Dosyadaki parmak izini (`self`) yerel şarkıyla karşılaştırır: önce bantlarla hizalanır,
    /// kroma bulunan kaymada karşılaştırılır. Yeterli örtüşme yoksa `None`.
    pub fn verify(
        &self,
        levels: &[u8],
        sample_rate: u32,
        chroma: Option<&[[u8; PITCH_CLASSES]]>,
    ) -> Option<Verdict> {
        let aligned = self.bands.align_to_levels(levels, sample_rate)?;
        let chroma_error = self.chroma.as_ref().zip(chroma).and_then(|(file, local)| {
            file.compare(&ChromaPrint::from_chroma(local, aligned.offset_secs))
                .map(|(error, _)| error)
        });
        Some(Verdict {
            offset_secs: aligned.offset_secs,
            band_error: aligned.bit_error_rate,
            chroma_error,
            overlap_secs: aligned.overlap_secs,
        })
    }
}

/// Bant parmak izi: [`FRAMES_PER_SECOND_FP`] kare/sn, kare başına [`BITS`] bit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BandPrint {
    pub words: Vec<u32>,
    /// Güvenilir bitler; yalnızca yerel şarkıda bilinir, dosyada saklanmaz. Boşsa hepsi.
    pub reliable: Vec<u32>,
}

/// İki bant parmak izinin en iyi hizalanması.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Alignment {
    /// `a`'daki t anı `b`'de t + `offset_secs` anına denk gelir.
    pub offset_secs: f64,
    pub bit_error_rate: f64,
    /// Karşılaştırılan süre (saniye).
    pub overlap_secs: f64,
}

impl BandPrint {
    /// Analiz karelerinden (kare başına [`BANDS`] seviye, 0..255). `sample_rate` şarkının
    /// örnekleme hızıdır: 33,7 kHz'in altında bant ızgarası farklıdır ve seviyeler standart
    /// ızgaraya logaritmik frekansta ara değerlenir.
    pub fn from_levels(levels: &[u8], sample_rate: u32) -> Self {
        Self::from_levels_at(levels, sample_rate, 0)
    }

    /// `phase` analiz karesi geç başlayan parmak izi (0..[`DECIMATION`]).
    fn from_levels_at(levels: &[u8], sample_rate: u32, phase: usize) -> Self {
        let levels = &levels[(phase * BANDS).min(levels.len())..];
        let frames = levels.len() / BANDS;
        let grid = BandMap::new(f64::from(sample_rate));
        let blocks = if frames >= WINDOW {
            (frames - WINDOW) / DECIMATION + 1
        } else {
            0
        };
        let mut words = Vec::with_capacity(blocks);
        let mut reliable = Vec::with_capacity(blocks);
        let mut previous: Option<[f32; BANDS]> = None;
        for block in 0..blocks {
            let mut mean = [0f32; BANDS];
            for frame in 0..WINDOW {
                let start = (block * DECIMATION + frame) * BANDS;
                let standard = grid.standard(&levels[start..start + BANDS]);
                for (sum, value) in mean.iter_mut().zip(standard) {
                    *sum += value / WINDOW as f32;
                }
            }
            let used = &mean[FIRST_BAND..=LAST_BAND];
            let silent = used.iter().sum::<f32>() / used.len() as f32 <= SILENT_LEVEL;
            let (word, mask) = match previous {
                Some(prev) if !silent => band_word(&prev, &mean),
                _ => (0, 0),
            };
            words.push(word);
            reliable.push(mask);
            previous = (!silent).then_some(mean);
        }
        Self { words, reliable }
    }

    /// Dosyada saklanan biçim: kare başına 6 onaltılık rakam.
    pub fn to_hex(&self) -> String {
        self.words.iter().map(|w| format!("{w:06x}")).collect()
    }

    /// [`BandPrint::to_hex`]'in tersi; biçim bozuksa `None`.
    pub fn from_hex(text: &str) -> Option<Self> {
        let words = parse_hex(text, 6)?;
        Some(Self {
            words,
            reliable: Vec::new(),
        })
    }

    /// Dosyadaki parmak izini (`self`) yerel şarkının analiz kareleriyle hizalar: yerel parmak
    /// izi dört fazda hesaplanır, en iyisi seçilir. Kayma çözünürlüğü 1/60 sn.
    pub fn align_to_levels(&self, levels: &[u8], sample_rate: u32) -> Option<Alignment> {
        (0..DECIMATION)
            .filter_map(|phase| {
                let local = Self::from_levels_at(levels, sample_rate, phase);
                self.align(&local).map(|a| Alignment {
                    offset_secs: a.offset_secs + phase as f64 / FRAMES_PER_SECOND,
                    ..a
                })
            })
            .min_by(|a, b| a.bit_error_rate.total_cmp(&b.bit_error_rate))
    }

    /// `other` (yerel şarkı) ile ±[`MAX_OFFSET_SECONDS`] içinde en iyi hizalama; yalnızca
    /// `other`'ın güvenilir bitleri sayılır. Yeterli örtüşme yoksa `None`.
    pub fn align(&self, other: &Self) -> Option<Alignment> {
        let max_shift = (MAX_OFFSET_SECONDS * FRAMES_PER_SECOND_FP).round() as isize;
        // Örtüşme süresi, karşılaştırılan bitlerden: güvenilir bitlerin ortalama payı kadar kare.
        let share = other.reliable_share();
        let bits_per_second = FRAMES_PER_SECOND_FP * f64::from(BITS) * share;
        let mut best: Option<(f64, isize, u64)> = None;
        for shift in -max_shift..=max_shift {
            let (errors, bits) = self.errors_at(other, shift);
            if bits == 0 || (bits as f64) < MIN_OVERLAP_SECONDS * bits_per_second {
                continue;
            }
            let ber = errors as f64 / bits as f64;
            if best.is_none_or(|(b, _, _)| ber < b) {
                best = Some((ber, shift, bits));
            }
        }
        best.map(|(ber, shift, bits)| Alignment {
            offset_secs: shift as f64 / FRAMES_PER_SECOND_FP,
            bit_error_rate: ber,
            overlap_secs: bits as f64 / bits_per_second,
        })
    }

    /// `self[i]` ile `other[i + shift]` arasındaki farklı bit sayısı ve karşılaştırılan bit
    /// sayısı (`other`'ın güvenilir bitleri, ikisi de sessiz olmayan karelerde).
    fn errors_at(&self, other: &Self, shift: isize) -> (u64, u64) {
        let all = (1u32 << BITS) - 1;
        let (mut errors, mut bits) = (0u64, 0u64);
        for (i, &a) in self.words.iter().enumerate() {
            let Some(j) = i.checked_add_signed(shift) else {
                continue;
            };
            let Some(&b) = other.words.get(j) else {
                continue;
            };
            if a != 0 && b != 0 {
                let mask = other.reliable.get(j).copied().unwrap_or(all);
                errors += u64::from(((a ^ b) & mask).count_ones());
                bits += u64::from(mask.count_ones());
            }
        }
        (errors, bits)
    }

    /// Sessiz olmayan karelerde güvenilir bitlerin payı (0..1].
    fn reliable_share(&self) -> f64 {
        let all = (1u32 << BITS) - 1;
        let (mut bits, mut frames) = (0u64, 0u64);
        for (i, &w) in self.words.iter().enumerate() {
            if w != 0 {
                bits += u64::from(self.reliable.get(i).copied().unwrap_or(all).count_ones());
                frames += 1;
            }
        }
        if frames == 0 {
            1.0
        } else {
            (bits as f64 / (frames as f64 * f64::from(BITS))).max(1e-3)
        }
    }
}

/// Kromanın saniye başına kelimesi: 12 perde sınıfından o saniyenin ortalamasının üstünde olanlar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChromaPrint {
    pub words: Vec<u16>,
    /// Güvenilir bitler (ortalamadan [`CHROMA_RELIABLE`]'den uzak); yalnızca yerel şarkıda.
    pub reliable: Vec<u16>,
}

impl ChromaPrint {
    /// Saniye başına kromadan (ton analizinin çıktısı). Dosyadaki t saniyesi yerel şarkıda
    /// t + `offset_secs` anına denk gelir: yerel kroma o anlarda ara değerlenir (ilk kelime
    /// dosyanın 0. saniyesinin karşılığıdır).
    pub fn from_chroma(chroma: &[[u8; PITCH_CLASSES]], offset_secs: f64) -> Self {
        let seconds = (chroma.len() as f64 - offset_secs).floor().max(0.0) as usize;
        let mut words = Vec::with_capacity(seconds);
        let mut reliable = Vec::with_capacity(seconds);
        for s in 0..seconds {
            let t = s as f64 + offset_secs;
            let (word, mask) = if t < 0.0 {
                (0, 0)
            } else {
                let lower = t.floor() as usize;
                let frac = (t - lower as f64) as f32;
                let next = (lower + 1).min(chroma.len().saturating_sub(1));
                match (chroma.get(lower), chroma.get(next)) {
                    (Some(a), Some(b)) => {
                        let mixed: [f32; PITCH_CLASSES] = std::array::from_fn(|c| {
                            f32::from(a[c]) * (1.0 - frac) + f32::from(b[c]) * frac
                        });
                        chroma_word(&mixed)
                    }
                    _ => (0, 0),
                }
            };
            words.push(word);
            reliable.push(mask);
        }
        Self { words, reliable }
    }

    /// Dosyadaki kromayı (`self`) yerel kromayla (`local`, kaymayla hesaplanmış) karşılaştırır:
    /// bit hata oranı ve karşılaştırılan saniye; yeterli saniye yoksa `None`.
    pub fn compare(&self, local: &Self) -> Option<(f64, usize)> {
        let all = (1u16 << PITCH_CLASSES) - 1;
        let (mut errors, mut bits, mut seconds) = (0u32, 0u32, 0usize);
        for (i, (&a, &b)) in self.words.iter().zip(&local.words).enumerate() {
            if a == 0 || b == 0 {
                continue;
            }
            let mask = local.reliable.get(i).copied().unwrap_or(all);
            errors += ((a ^ b) & mask).count_ones();
            bits += mask.count_ones();
            seconds += 1;
        }
        (seconds >= CHROMA_MIN_SECONDS && bits > 0)
            .then(|| (f64::from(errors) / f64::from(bits), seconds))
    }

    /// Dosyada saklanan biçim: saniye başına 3 onaltılık rakam.
    pub fn to_hex(&self) -> String {
        self.words.iter().map(|w| format!("{w:03x}")).collect()
    }

    /// [`ChromaPrint::to_hex`]'in tersi; biçim bozuksa `None`.
    pub fn from_hex(text: &str) -> Option<Self> {
        let words = parse_hex(text, 3)?
            .into_iter()
            .map(|w| u16::try_from(w).ok())
            .collect::<Option<Vec<u16>>>()?;
        Some(Self {
            words,
            reliable: Vec::new(),
        })
    }
}

/// `digits` onaltılık rakamlık kelimeler; uzunluk ya da rakam bozuksa `None`.
fn parse_hex(text: &str, digits: usize) -> Option<Vec<u32>> {
    if !text.is_ascii() || text.len() % digits != 0 {
        return None;
    }
    text.as_bytes()
        .chunks_exact(digits)
        .map(|chunk| {
            std::str::from_utf8(chunk)
                .ok()
                .filter(|s| s.bytes().all(|b| b.is_ascii_hexdigit()))
                .and_then(|s| u32::from_str_radix(s, 16).ok())
        })
        .collect()
}

/// Bir karenin kelimesi (komşu bant farklarının bir önceki kareye göre değişiminin işaretleri)
/// ve güvenilir bitleri.
fn band_word(previous: &[f32; BANDS], current: &[f32; BANDS]) -> (u32, u32) {
    let (mut word, mut reliable) = (0u32, 0u32);
    for (bit, band) in (FIRST_BAND..LAST_BAND).enumerate() {
        let now = current[band] - current[band + 1];
        let before = previous[band] - previous[band + 1];
        let delta = now - before;
        if delta > 0.0 {
            word |= 1 << bit;
        }
        if delta.abs() >= RELIABLE_DELTA {
            reliable |= 1 << bit;
        }
    }
    (word, reliable)
}

/// Bir saniyenin kroma kelimesi ve güvenilir bitleri; sessiz ya da düz saniye (0, 0).
fn chroma_word(chroma: &[f32; PITCH_CLASSES]) -> (u16, u16) {
    let mean = chroma.iter().sum::<f32>() / PITCH_CLASSES as f32;
    if mean <= 0.0 {
        return (0, 0);
    }
    let (mut word, mut reliable) = (0u16, 0u16);
    for (c, &value) in chroma.iter().enumerate() {
        if value > mean {
            word |= 1 << c;
        }
        if (value - mean).abs() >= CHROMA_RELIABLE {
            reliable |= 1 << c;
        }
    }
    (word, reliable)
}

/// Şarkının bant ızgarasından standart ızgaraya geçiş (44,1 kHz ve üstünde birebir).
struct BandMap {
    /// Standart her bandın ortası, şarkının ızgarasında kesirli bant sırası; `None`: aynı ızgara.
    positions: Option<[f32; BANDS]>,
}

impl BandMap {
    fn new(sample_rate: f64) -> Self {
        let own = band_edges(BANDS, sample_rate);
        let standard = band_edges(BANDS, STANDARD_RATE);
        if own
            .iter()
            .zip(&standard)
            .all(|(a, b)| (a / b - 1.0).abs() < 1e-9)
        {
            return Self { positions: None };
        }
        // Bantlar logaritmik eşit aralıklı: bir frekansın kesirli bant sırası, alt sınıra
        // uzaklığın logaritmasının bant genişliğine oranıdır (bant ortası = sıra + 0,5).
        let (low, step) = (own[0].ln(), (own[BANDS] / own[0]).ln() / BANDS as f64);
        let positions = std::array::from_fn(|i| {
            let center = (standard[i] * standard[i + 1]).sqrt();
            ((center.ln() - low) / step - 0.5) as f32
        });
        Self {
            positions: Some(positions),
        }
    }

    /// Bir karenin standart ızgaradaki seviyeleri (şarkının ızgarasının dışında kalan bant 0).
    fn standard(&self, frame: &[u8]) -> [f32; BANDS] {
        let Some(positions) = &self.positions else {
            return std::array::from_fn(|i| f32::from(frame[i]));
        };
        std::array::from_fn(|i| {
            let x = positions[i];
            if !(0.0..=(BANDS - 1) as f32).contains(&x) {
                return 0.0;
            }
            let lower = x.floor() as usize;
            let upper = (lower + 1).min(BANDS - 1);
            let t = x - lower as f32;
            f32::from(frame[lower]) * (1.0 - t) + f32::from(frame[upper]) * t
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::analysis::spectrogram::{analyze, Spectrogram};
    use crate::audio::decode::Decoder;
    use crate::audio::test_util::{temp_path, write_wav};
    use std::f64::consts::PI;
    use std::sync::Arc;

    /// Sentetik bir "şarkı": davul (kick, trampet, hi-hat), bas, akorlar. Tohum akor dizisini ve
    /// davul gürültüsünü, `bpm` tempoyu değiştirir.
    pub(crate) fn song(seed: u64, bpm: f64, seconds: f64, rate: u32) -> Vec<f64> {
        let n = (seconds * f64::from(rate)) as usize;
        let beat = 60.0 / bpm;
        let mut noise = seed.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
        let mut rand = move || {
            noise = noise
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            ((noise >> 33) as f64 / f64::from(1u32 << 31)) - 1.0
        };
        // Tohuma göre akor dizisi (dört akor, ölçü başına bir).
        let roots: Vec<f64> = (0..4)
            .map(|i| 110.0 * 2f64.powf(((seed as usize * 7 + i * 5) % 12) as f64 / 12.0))
            .collect();
        (0..n)
            .map(|i| {
                let t = i as f64 / f64::from(rate);
                let in_beat = t % beat;
                let beat_index = (t / beat) as usize;
                let root = roots[(beat_index / 4) % 4];
                let kick = if beat_index % 2 == 0 {
                    (2.0 * PI * 55.0 * in_beat).sin() * (-in_beat * 18.0).exp()
                } else {
                    0.0
                };
                let snare = if beat_index % 2 == 1 {
                    rand() * (-in_beat * 25.0).exp() * 0.5
                } else {
                    0.0
                };
                let hat = rand() * (-(t % (beat / 2.0)) * 60.0).exp() * 0.15;
                let bass = (2.0 * PI * root / 2.0 * t).sin() * 0.3;
                let chord: f64 = [1.0, 1.26, 1.5, 2.0]
                    .iter()
                    .map(|r| (2.0 * PI * root * 2.0 * r * t).sin())
                    .sum::<f64>()
                    * 0.06
                    * (0.6 + 0.4 * (2.0 * PI * t / (beat * 4.0)).cos());
                0.45 * (kick + snare + hat + bass + chord)
            })
            .collect()
    }

    pub(crate) fn analyze_samples(samples: &[f64], rate: u32, name: &str) -> Arc<Spectrogram> {
        let path = temp_path(name);
        write_wav(&path, rate, 1, samples.len(), |f, _| {
            samples[f].clamp(-1.0, 1.0)
        });
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        std::fs::remove_file(&path).ok();
        spectrogram
    }

    /// Şarkının parmak izi ve yerel karşılaştırma için analizi.
    struct Analyzed {
        levels: Vec<u8>,
        chroma: Vec<[u8; PITCH_CLASSES]>,
        rate: u32,
    }

    impl Analyzed {
        fn of(samples: &[f64], rate: u32, name: &str) -> Self {
            let spectrogram = analyze_samples(samples, rate, name);
            Self {
                levels: spectrogram.saved().unwrap().levels,
                chroma: spectrogram.key().unwrap().chroma.clone(),
                rate,
            }
        }

        fn print(&self) -> TrackPrint {
            TrackPrint::of(&self.levels, self.rate, Some(&self.chroma))
        }

        fn verify(&self, file: &TrackPrint) -> Option<Verdict> {
            file.verify(&self.levels, self.rate, Some(&self.chroma))
        }
    }

    /// Kayıplı kodlamanın etkileri: tiz kesimi (birinci dereceden iki kez), düzey farkı, −50 dB
    /// gürültü (nicemleme), kodlayıcı gecikmesi kadar kayma.
    fn degrade(samples: &[f64], rate: u32, cutoff_hz: f64, gain_db: f64, delay: usize) -> Vec<f64> {
        let a = (-2.0 * PI * cutoff_hz / f64::from(rate)).exp();
        let gain = 10f64.powf(gain_db / 20.0);
        let (mut y1, mut y2) = (0.0, 0.0);
        let mut seed = 12_345u64;
        let mut out = vec![0.0; delay];
        out.extend(samples.iter().map(|&x| {
            y1 = (1.0 - a) * x + a * y1;
            y2 = (1.0 - a) * y1 + a * y2;
            seed = seed
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let noise = ((seed >> 33) as f64 / f64::from(1u32 << 31) - 1.0) * 10f64.powf(-2.5);
            y2 * gain + noise
        }));
        out
    }

    #[test]
    fn ayni_kayit_kayipli_kodlamada_da_eslesir() {
        let rate = 44_100;
        let original = song(1, 124.0, 40.0, rate);
        let file = Analyzed::of(&original, rate, "pi-asil.wav").print();
        // MP3 64 kbps'in tiz kesimi, −3 dB düzey farkı, 1105 örneklik (25 ms) gecikme.
        let lossy = Analyzed::of(
            &degrade(&original, rate, 11_000.0, -3.0, 1105),
            rate,
            "pi-kayipli.wav",
        );
        let found = lossy.verify(&file).unwrap();
        assert!(found.is_match(), "{found:?}");
        assert!(found.band_error < 0.12, "{found:?}");
        assert!(found.chroma_error.unwrap() < 0.05, "{found:?}");
        // Gecikme 25 ms: 1/60 sn çözünürlükte bulunur.
        assert!((found.offset_secs - 0.025).abs() < 0.02, "{found:?}");
        assert!(found.similarity() > 0.7);
    }

    #[test]
    fn baska_sarki_eslesmez_ayni_davul_ve_tempoda_bile() {
        let rate = 44_100;
        let file = Analyzed::of(&song(1, 124.0, 40.0, rate), rate, "pi-bir.wav").print();
        // Aynı tempo ve davul, başka akorlar: bantlar sınırda kalabilir, kroma ayırır.
        let other = Analyzed::of(&song(5, 124.0, 40.0, rate), rate, "pi-iki.wav");
        let found = other.verify(&file).unwrap();
        assert!(!found.is_match(), "{found:?}");
        assert!(
            found.chroma_error.unwrap() > 2.0 * CHROMA_MAX_ERROR - 0.05,
            "{found:?}"
        );
        // Aynı akorların başka tempoda çalınışı (canlı kayıt gibi): bantlar ayırır.
        let live = Analyzed::of(&song(1, 131.0, 40.0, rate), rate, "pi-uc.wav");
        let found = live.verify(&file).unwrap();
        assert!(!found.is_match(), "{found:?}");
        assert!(found.band_error > BAND_MAX_ERROR + 0.05, "{found:?}");
    }

    #[test]
    fn kayma_bulunur() {
        // Başına 3 sn sessizlik eklenmiş sürüm (başka bir baskı): kayma +3 sn.
        let rate = 44_100;
        let original = song(2, 100.0, 40.0, rate);
        let mut shifted = vec![0.0; 3 * rate as usize];
        shifted.extend_from_slice(&original);
        let file = Analyzed::of(&original, rate, "pi-kayma-a.wav").print();
        let found = Analyzed::of(&shifted, rate, "pi-kayma-b.wav")
            .verify(&file)
            .unwrap();
        assert!(found.is_match(), "{found:?}");
        assert!((found.offset_secs - 3.0).abs() < 0.02, "{found:?}");
    }

    #[test]
    fn farkli_ornekleme_hizinda_eslesir() {
        // 22,05 kHz'lik dosyanın bant ızgarası farklı; standart ızgaraya ara değerlenir.
        let file = Analyzed::of(&song(3, 110.0, 40.0, 44_100), 44_100, "pi-44.wav").print();
        let found = Analyzed::of(&song(3, 110.0, 40.0, 22_050), 22_050, "pi-22.wav")
            .verify(&file)
            .unwrap();
        assert!(found.is_match(), "{found:?}");
    }

    #[test]
    fn kroma_yoksa_bantlar_daha_siki() {
        let verdict = |band_error, chroma_error| Verdict {
            offset_secs: 0.0,
            band_error,
            chroma_error,
            overlap_secs: 40.0,
        };
        assert!(verdict(0.25, Some(0.05)).is_match());
        assert!(!verdict(0.25, None).is_match(), "kroma yoksa 0,20");
        assert!(verdict(0.15, None).is_match());
        assert!(!verdict(0.10, Some(0.2)).is_match(), "armoni tutmuyor");
        assert!(!Verdict {
            overlap_secs: 5.0,
            ..verdict(0.0, Some(0.0))
        }
        .is_match());
    }

    #[test]
    fn sessizlik_ve_kisa_ses_eslesme_saymaz() {
        let rate = 44_100;
        let silence = Analyzed::of(&vec![0.0; 30 * rate as usize], rate, "pi-sessiz.wav");
        assert!(silence.print().bands.words.iter().all(|&w| w == 0));
        let file = Analyzed::of(&song(1, 124.0, 40.0, rate), rate, "pi-uzun.wav").print();
        assert_eq!(silence.verify(&file), None, "geçerli örtüşme yok");
        let short = Analyzed::of(&song(1, 124.0, 6.0, rate), rate, "pi-kisa.wav");
        assert_eq!(short.verify(&file), None, "10 sn'den kısa örtüşme");
    }

    #[test]
    fn onaltilik_bicim_gidip_gelir_bozugu_reddeder() {
        let bands = BandPrint {
            words: vec![0, 1, 0xff_ffff, 0x12_3456],
            reliable: Vec::new(),
        };
        assert_eq!(bands.to_hex().len(), 24);
        assert_eq!(BandPrint::from_hex(&bands.to_hex()), Some(bands));
        let chroma = ChromaPrint {
            words: vec![0, 0xfff, 0x5a5],
            reliable: Vec::new(),
        };
        assert_eq!(chroma.to_hex(), "000fff5a5");
        assert_eq!(ChromaPrint::from_hex(&chroma.to_hex()), Some(chroma));
        for bad in ["abc", "zzzzzz", "çççççç", "+12345", "-12345"] {
            assert_eq!(BandPrint::from_hex(bad), None, "{bad}");
        }
        assert_eq!(ChromaPrint::from_hex("ab"), None);
    }

    /// Gerçek kodlayıcılarla ölçüm (ffmpeg gerekir; CI'da yok): `cargo test --lib
    /// gercek_kodlayicilarla_olcum -- --ignored --nocapture`. Sonuçlar `docs/SARKI-HARITASI.md`'de.
    #[test]
    #[ignore = "ffmpeg gerekir"]
    fn gercek_kodlayicilarla_olcum() {
        let rate = 44_100;
        let original = song(1, 124.0, 60.0, rate);
        let wav = temp_path("pi-kaynak.wav");
        write_wav(&wav, rate, 1, original.len(), |f, _| original[f]);
        let file = Analyzed::of(&original, rate, "pi-kaynak-analiz.wav").print();
        for (name, args) in [
            ("mp3-320", &["-c:a", "libmp3lame", "-b:a", "320k"][..]),
            ("mp3-128", &["-c:a", "libmp3lame", "-b:a", "128k"][..]),
            ("mp3-64", &["-c:a", "libmp3lame", "-b:a", "64k"][..]),
            ("aac-96", &["-c:a", "aac", "-b:a", "96k"][..]),
            ("vorbis-q0", &["-c:a", "libvorbis", "-q:a", "0"][..]),
        ] {
            let ext = if name.starts_with("aac") {
                "m4a"
            } else if name.starts_with("vorbis") {
                "ogg"
            } else {
                "mp3"
            };
            let out = temp_path(&format!("pi-{name}.{ext}"));
            let status = std::process::Command::new("ffmpeg")
                .args(["-y", "-loglevel", "error", "-i"])
                .arg(&wav)
                .args(args)
                .arg(&out)
                .status()
                .unwrap();
            assert!(status.success());
            let spectrogram = Spectrogram::new();
            analyze(Decoder::open(&out).unwrap(), &spectrogram);
            let levels = spectrogram.saved().unwrap().levels;
            let chroma = spectrogram.key().unwrap().chroma.clone();
            let found = file.verify(&levels, rate, Some(&chroma)).unwrap();
            eprintln!("ÖLÇÜM {name}: {found:?} eşleşme: {}", found.is_match());
            assert!(found.is_match(), "{name}: {found:?}");
            std::fs::remove_file(out).ok();
        }
        std::fs::remove_file(wav).ok();
    }
}
