//! Söz modelinin emisyonlarının önbelleği (bağımsız denetimin "emisyon önbelleği",
//! `docs/arastirma/soz-hizalama/denetim/DENETIM.md` §6).
//!
//! Emisyonlar ("bu karede hangi harf") yalnızca sese bağlıdır, söz metnine bağlı değildir. Saklanırsa
//! kullanıcı sözü düzelttiğinde model (4 dk şarkıda ~1,5 dk) yeniden çalışmaz; hizalama önbellekten
//! birkaç saniyede yeniden yapılır. Kayıt kütüphane veritabanında (`lyrics_emissions`, göç 9); anahtar
//! dosya yolu + damga + modelin SHA-256'sı + [`EMISSIONS_VERSION`]. Şarkı kütüphaneden çıkınca kaydı
//! da silinir (analizlerdeki gibi).
//!
//! - **Yalnızca gereken sütunlar:** model her kare için 410 harfin (Latin, Yunan, Kiril) log-olasılığını
//!   verir; hepsi 4 dk şarkıda ~7,5 MB tutar. Saklanan: blank, kelime ayırıcısı, Türkçe ve İngilizce
//!   alfabe ([`BASE_LETTERS`]) ve o anki sözün harfleri (~40 sütun). Kayıpsızdır: log-olasılıklar bütün
//!   simgelere göre normalleştirilmiş gelir, sütun seçmek değerleri değiştirmez. Kayıt modelin bütün
//!   harf listesini de taşır: söze sonradan modelin tanıdığı ama saklanmamış bir harf girerse kayıt
//!   kullanılmaz (model yeniden çalışır); modelin hiç tanımadığı harf (ör. Çince) kaydı bozmaz. Bunu
//!   bilmek için model açılmaz.
//! - **Yarım duyarlık (f16):** değerler [−1000, 0] aralığına kırpılıp f16'ya yuvarlanır; göreli hata
//!   ≤ 2⁻¹¹ (−28 nat'ta 0,008 nat). Yuvarlama saklamadan önce yapılır ([`StoredEmissions::select`]):
//!   hizalama yeni hesaplanmış emisyonla da önbellekten okunanla da aynı sayılarla çalışır. Ölçüm
//!   (31 Ekim 2026, konuşma kaydı, temiz ve gürültülü): f32 ile 6 satırın başı, kelimeleri, güveni ve
//!   hüküm birebir aynı.
//! - **Sıkıştırma:** önce bütün f16'ların üst baytları, sonra alt baytları (komşu değerlerin üst
//!   baytları benzer), deflate. Ölçüm: gerçek şarkıda dakikada 0,145 MB (4 dk ≈ 0,6 MB; karıştırmadan
//!   0,181 MB).
//! - Okunan kayıt güvenilmez sayılır: boyutlar, harf listeleri ve değerler denetlenir; bozuksa yok
//!   sayılır. Harfler, sıkıştırılmış veri açılmadan önce denetlenir.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use half::f16;
use rusqlite::{params, OptionalExtension};

use super::cache::{AnalysisCache, CacheError, FileStamp};
use super::lyrics_align::{Emissions, Vocabulary};
use super::lyrics_model::{FRAME_SAMPLES, MAX_SECS, SAMPLE_RATE};

/// Emisyon hesabının sürümü (pencere, adım, çarpım yolu, simge listesi). Hesap değişince artırılır:
/// eski kayıtlar kullanılmaz. 1: 30 / 20 sn pencere, tamsayı çarpımları ondalıklı.
pub const EMISSIONS_VERSION: i64 = 1;

/// Sözde geçmese de her zaman saklanan harfler: Türkçe ve İngilizce alfabe, düzeltme işaretli ünlüler,
/// kesme işareti. Kullanıcı sözü düzeltirken bunlardan birini eklerse model yeniden çalışmaz.
pub const BASE_LETTERS: &str = "abcçdefgğhıijklmnoöpqrsştuüvwxyzâîû'";

/// Saklanan en küçük log-olasılık: e⁻¹⁰⁰⁰ hizalama için sıfırdan farksızdır; f16'nın sınırı (−65504)
/// aşılmaz.
const MIN_LOG_PROB: f32 = -1000.0;

/// Sözlerin en uzun şarkısının (`MAX_SECS`) kare sayısı.
const MAX_FRAMES: usize = MAX_SECS * SAMPLE_RATE as usize / FRAME_SAMPLES + 1;

/// Saklanan sütun sayısının üst sınırı (dışlayıcı; modelin harfleri ~410).
const MAX_COLUMNS: usize = 1024;

/// Sütun adlarında kelime ayırıcısı.
const SPACE: char = ' ';

const COMPRESSION_LEVEL: u8 = 6;

/// Önbelleğe giren emisyonlar ve sütunlarının harfleri. Sütun 0 blank'tır; ayırıcı varsa sütun 1.
#[derive(Debug, Clone)]
pub struct StoredEmissions {
    pub emissions: Emissions,
    pub vocabulary: Vocabulary,
    /// Modelin tanıdığı bütün harfler (saklanmayanlar da): söze yeni giren harfin modelde olup
    /// olmadığı model açılmadan bilinir.
    pub model_letters: HashSet<char>,
}

impl StoredEmissions {
    /// Modelin emisyonlarından saklanacak sütunlar: blank, ayırıcı, [`BASE_LETTERS`] ve `lyrics`'in
    /// harfleri (modelin tanıdıkları; gerisi yok sayılır). Değerler saklanacak duyarlığa yuvarlanır.
    /// Girdi tutarsızsa (sütun matrisin dışında, iki simge aynı sütunda, harf olarak boşluk, boyutlar
    /// saklanamayacak kadar büyük) `None`.
    pub fn select(
        full: &Emissions,
        vocabulary: &Vocabulary,
        lyrics: impl IntoIterator<Item = char>,
    ) -> Option<Self> {
        let used: Vec<usize> = std::iter::once(vocabulary.blank)
            .chain(vocabulary.space)
            .chain(vocabulary.letters.values().copied())
            .collect();
        let distinct: HashSet<usize> = used.iter().copied().collect();
        if full.columns == 0
            || full.log_probs.len() != full.frames * full.columns
            || !storable(full.frames, full.frame_secs)
            || distinct.len() != used.len()
            || used.iter().any(|&k| k >= full.columns)
            || vocabulary.letters.contains_key(&SPACE)
        {
            return None;
        }
        let mut wanted: Vec<(usize, char)> = BASE_LETTERS
            .chars()
            .chain(lyrics)
            .filter_map(|c| vocabulary.letters.get(&c).map(|&column| (column, c)))
            .collect();
        // Modelin sütun sırası: aynı harf kümesi her zaman aynı kayda dönüşür.
        wanted.sort_unstable();
        wanted.dedup();
        let mut source = vec![vocabulary.blank];
        let space = vocabulary.space.map(|column| {
            source.push(column);
            1
        });
        let mut letters = HashMap::new();
        for (column, c) in wanted {
            letters.insert(c, source.len());
            source.push(column);
        }
        let columns = source.len();
        if columns >= MAX_COLUMNS {
            return None;
        }
        let mut log_probs = Vec::with_capacity(full.frames * columns);
        for row in full.log_probs.chunks_exact(full.columns) {
            log_probs.extend(source.iter().map(|&k| quantize(row[k])));
        }
        Some(Self {
            emissions: Emissions {
                frames: full.frames,
                columns,
                log_probs,
                frame_secs: full.frame_secs,
            },
            vocabulary: Vocabulary {
                blank: 0,
                space,
                letters,
            },
            model_letters: vocabulary.letters.keys().copied().collect(),
        })
    }

    /// Sözün harfleri için bu kayıt yeter mi: modelin tanıdığı her harfi saklanmış mı?
    pub fn covers(&self, lyrics: &[char]) -> bool {
        covered(&self.vocabulary.letters, &self.model_letters, lyrics)
    }

    /// Sütun 1'den başlayarak sütunların adları (ayırıcı boşlukla).
    fn column_names(&self) -> String {
        let mut names = vec![SPACE; self.emissions.columns.saturating_sub(1)];
        for (&c, &column) in &self.vocabulary.letters {
            if let Some(slot) = column.checked_sub(1).and_then(|i| names.get_mut(i)) {
                *slot = c;
            }
        }
        names.into_iter().collect()
    }

    /// Modelin harfleri, kayıtta (sıralı).
    fn model_letter_names(&self) -> String {
        let mut letters: Vec<char> = self.model_letters.iter().copied().collect();
        letters.sort_unstable();
        letters.into_iter().collect()
    }

    /// Kayıttan geri kurar; boyutlar, adlar ya da değerler tutmazsa `None`.
    fn decode(
        frames: i64,
        frame_secs: f64,
        names: &str,
        model_letters: &str,
        data: &[u8],
    ) -> Option<Self> {
        let frames = usize::try_from(frames).ok()?;
        if !storable(frames, frame_secs) {
            return None;
        }
        let header = Header::parse(names, model_letters)?;
        let columns = names.chars().count() + 1;
        let cells = frames * columns;
        let bytes = miniz_oxide::inflate::decompress_to_vec_with_limit(data, cells * 2).ok()?;
        if bytes.len() != cells * 2 {
            return None;
        }
        let (high, low) = bytes.split_at(cells);
        let log_probs: Vec<f32> = high
            .iter()
            .zip(low)
            .map(|(&h, &l)| f16::from_bits(u16::from_be_bytes([h, l])).to_f32())
            .collect();
        if log_probs
            .iter()
            .any(|&v| !(MIN_LOG_PROB..=0.0).contains(&v))
        {
            return None;
        }
        Some(Self {
            emissions: Emissions {
                frames,
                columns,
                log_probs,
                frame_secs,
            },
            vocabulary: Vocabulary {
                blank: 0,
                space: header.space,
                letters: header.letters,
            },
            model_letters: header.model_letters,
        })
    }

    fn encode(&self) -> Vec<u8> {
        let bits: Vec<u16> = self
            .emissions
            .log_probs
            .iter()
            .map(|&v| f16::from_f32(quantize(v)).to_bits())
            .collect();
        let mut bytes = Vec::with_capacity(bits.len() * 2);
        bytes.extend(bits.iter().map(|b| b.to_be_bytes()[0]));
        bytes.extend(bits.iter().map(|b| b.to_be_bytes()[1]));
        miniz_oxide::deflate::compress_to_vec(&bytes, COMPRESSION_LEVEL)
    }

    /// `decode`'un geri kuracağı kayıt mı (alanlar elle tutarsız kurulmuş olabilir)?
    fn consistent(&self) -> bool {
        let e = &self.emissions;
        storable(e.frames, e.frame_secs)
            && e.log_probs.len() == e.frames * e.columns
            && self.vocabulary.blank == 0
            && Header::parse(&self.column_names(), &self.model_letter_names()).is_some_and(|h| {
                h.space == self.vocabulary.space && h.letters == self.vocabulary.letters
            })
    }
}

/// Kaydın harf listeleri: sütunlar ve modelin harfleri.
struct Header {
    space: Option<usize>,
    letters: HashMap<char, usize>,
    model_letters: HashSet<char>,
}

impl Header {
    /// Sütun adları (her biri bir kez, ayırıcı en çok bir kez) ve modelin harfleri (saklanan her harfi
    /// içerir, boşluk içermez); tutmazsa `None`.
    fn parse(names: &str, model_letters: &str) -> Option<Self> {
        let mut space = None;
        let mut letters = HashMap::new();
        for (i, c) in names.chars().enumerate() {
            let column = i + 1;
            let fresh = if c == SPACE {
                space.replace(column).is_none()
            } else {
                letters.insert(c, column).is_none()
            };
            if !fresh || column >= MAX_COLUMNS {
                return None;
            }
        }
        let model_letters: HashSet<char> = model_letters.chars().collect();
        if model_letters.contains(&SPACE) || letters.keys().any(|c| !model_letters.contains(c)) {
            return None;
        }
        Some(Self {
            space,
            letters,
            model_letters,
        })
    }
}

/// Sözün modelin tanıdığı her harfi saklanmış mı?
fn covered(letters: &HashMap<char, usize>, model_letters: &HashSet<char>, lyrics: &[char]) -> bool {
    lyrics
        .iter()
        .all(|c| letters.contains_key(c) || !model_letters.contains(c))
}

/// Kare sayısı ve süresi kayda uygun mu?
fn storable(frames: usize, frame_secs: f64) -> bool {
    frames > 0
        && frames <= MAX_FRAMES
        && frame_secs.is_finite()
        && frame_secs > 0.0
        && frame_secs <= 1.0
}

/// Saklanan duyarlık: [−1000, 0] aralığı, f16. Yuvarlanmış değeri yeniden yuvarlamak onu değiştirmez.
fn quantize(v: f32) -> f32 {
    let v = if v.is_nan() {
        MIN_LOG_PROB
    } else {
        v.clamp(MIN_LOG_PROB, 0.0)
    };
    f16::from_f32(v).to_f32()
}

impl AnalysisCache {
    /// Şarkının emisyonlarını saklar (aynı yolun eski kaydının yerini alır). Geri okunamayacak kayıt
    /// (alanları elle tutarsız kurulmuş) saklanmaz.
    pub fn store_emissions(
        &self,
        path: &Path,
        stamp: FileStamp,
        model_sha256: &str,
        stored: &StoredEmissions,
    ) -> Result<(), CacheError> {
        if !stored.consistent() {
            return Ok(());
        }
        let data = stored.encode();
        self.lock()?.execute(
            "INSERT OR REPLACE INTO lyrics_emissions
                 (path, file_size, modified, model_sha256, version, frames, frame_secs, columns,
                  model_letters, data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                path.to_string_lossy(),
                stamp.size as i64,
                stamp.modified,
                model_sha256,
                EMISSIONS_VERSION,
                stored.emissions.frames as i64,
                stored.emissions.frame_secs,
                stored.column_names(),
                stored.model_letter_names(),
                data,
            ],
        )?;
        Ok(())
    }

    /// Şarkının saklanan emisyonları: dosya değişmemişse, aynı modelle ve bu sürümün hesabıyla
    /// üretilmişse ve sözün (`lyrics`: sözün harfleri; tekrar ve modelde olmayan harf olabilir) modelin
    /// tanıdığı her harfi saklanmışsa.
    pub fn load_emissions(
        &self,
        path: &Path,
        stamp: FileStamp,
        model_sha256: &str,
        lyrics: &[char],
    ) -> Result<Option<StoredEmissions>, CacheError> {
        let conn = self.lock()?;
        let row: Option<(i64, f64, String, String, Vec<u8>)> = conn
            .query_row(
                "SELECT frames, frame_secs, columns, model_letters, data FROM lyrics_emissions
                 WHERE path = ?1 AND file_size = ?2 AND modified = ?3 AND model_sha256 = ?4
                   AND version = ?5",
                params![
                    path.to_string_lossy(),
                    stamp.size as i64,
                    stamp.modified,
                    model_sha256,
                    EMISSIONS_VERSION
                ],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()?;
        drop(conn);
        Ok(
            row.and_then(|(frames, frame_secs, names, model_letters, data)| {
                // Harfler yetmiyorsa veri açılmaz.
                let header = Header::parse(&names, &model_letters)?;
                if !covered(&header.letters, &header.model_letters, lyrics) {
                    return None;
                }
                StoredEmissions::decode(frames, frame_secs, &names, &model_letters, &data)
            }),
        )
    }
}

/// Testlerde: sütun adlarındaki harfler (modelin harf listesi yerine; ayırıcı hariç).
#[cfg(test)]
fn letters_of(names: &str) -> String {
    names.chars().filter(|&c| c != SPACE).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::lyrics_align::align;

    const SHA: &str = "aa";

    fn stamp() -> FileStamp {
        FileStamp {
            size: 1000,
            modified: 1_700_000_000,
        }
    }

    /// Modelinkine benzer sözlük: blank 0, ayırıcı 1, sonra `alphabet` harfleri.
    fn vocabulary(alphabet: &str) -> Vocabulary {
        Vocabulary {
            blank: 0,
            space: Some(1),
            letters: alphabet.chars().zip(2..).collect(),
        }
    }

    /// `text`'i karelere yayan emisyonlar: her harf 3 kare, arada 2 kare blank, kelime arasında ayırıcı.
    /// Diğer sütunlar karede rastgele (tohumlu) düşük değerler; satırlar log-olasılık gibi normalleşir.
    fn emissions_for(text: &str, vocab: &Vocabulary, columns: usize) -> Emissions {
        let mut targets = vec![0usize; 10];
        for (w, word) in text.split(' ').enumerate() {
            if w > 0 {
                targets.extend([1, 1]);
            }
            for c in word.chars() {
                targets.extend([vocab.letters[&c]; 3]);
                targets.extend([0, 0]);
            }
        }
        targets.extend([0; 10]);
        let mut seed = 0x2545_f491_4f6c_dd1du64;
        let mut log_probs = Vec::with_capacity(targets.len() * columns);
        for &target in &targets {
            let row: Vec<f64> = (0..columns)
                .map(|k| {
                    seed ^= seed << 13;
                    seed ^= seed >> 7;
                    seed ^= seed << 17;
                    let noise = (seed % 1000) as f64 / 1000.0;
                    if k == target {
                        6.0 + noise
                    } else {
                        noise * 4.0 - 2.0
                    }
                })
                .collect();
            let log_z = row.iter().map(|v| v.exp()).sum::<f64>().ln();
            log_probs.extend(row.iter().map(|v| (v - log_z) as f32));
        }
        Emissions {
            frames: targets.len(),
            columns,
            log_probs,
            frame_secs: 0.02,
        }
    }

    /// Latin + Yunan + Kiril'e benzer büyük alfabe (modelde ~410 sütun).
    fn big_alphabet() -> String {
        BASE_LETTERS
            .chars()
            .chain("äéëèàáíóúñßøåæœ".chars())
            .chain('α'..='ω')
            .chain('а'..='я')
            .collect()
    }

    fn words(text: &str) -> Vec<Vec<String>> {
        text.lines()
            .map(|l| l.split(' ').map(str::to_string).collect())
            .collect()
    }

    #[test]
    fn yalnizca_gereken_sutunlar_saklanir_degerler_ayni_kalir() {
        let alphabet = big_alphabet();
        let vocab = vocabulary(&alphabet);
        let full = emissions_for("ab", &vocab, alphabet.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, "αñ".chars()).unwrap();
        // blank + ayırıcı + temel alfabe + sözün iki harfi.
        assert_eq!(
            stored.emissions.columns,
            2 + BASE_LETTERS.chars().count() + 2
        );
        assert!(stored.covers(&['ş', 'α', 'ñ', '\'']));
        assert!(!stored.covers(&['β']));
        // Her saklanan sütun modelin aynı sütununun f16'ya yuvarlanmışı.
        let column_of = |c: char| (vocab.letters[&c], stored.vocabulary.letters[&c]);
        for (from, to) in [
            (0, 0),
            (1, 1),
            column_of('ş'),
            column_of('α'),
            column_of('x'),
        ] {
            for t in 0..full.frames {
                let a = full.log_probs[t * full.columns + from];
                let b = stored.emissions.log_probs[t * stored.emissions.columns + to];
                assert!((a - b).abs() <= a.abs() / 2048.0 + 1e-7, "{a} {b}");
                assert_eq!(b, quantize(a));
            }
        }
    }

    #[test]
    fn modelin_tanimadigi_harf_yok_sayilir() {
        let vocab = vocabulary("abc");
        let full = emissions_for("ab", &vocab, 5);
        let stored = StoredEmissions::select(&full, &vocab, "a木".chars()).unwrap();
        assert_eq!(stored.emissions.columns, 5);
        // Modelin tanımadığı harf hizalamada zaten atlanır: kaydı kullanılmaz yapmaz.
        assert!(stored.covers(&['木', 'a']));
        assert!(stored.model_letters.contains(&'c') && !stored.model_letters.contains(&'木'));
    }

    #[test]
    fn saklanan_okunur_hizalama_ayni() {
        let alphabet = big_alphabet();
        let vocab = vocabulary(&alphabet);
        let text = "gece uzun yol geniş\nşarkı çağırıyor beni";
        let full = emissions_for(
            &text.replace('\n', " "),
            &vocab,
            alphabet.chars().count() + 2,
        );
        let stored = StoredEmissions::select(&full, &vocab, text.chars()).unwrap();
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = Path::new("/müzik/şarkı.flac");
        cache.store_emissions(path, stamp(), SHA, &stored).unwrap();
        let needed: Vec<char> = text.chars().filter(|c| c.is_alphabetic()).collect();
        let loaded = cache
            .load_emissions(path, stamp(), SHA, &needed)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.emissions.log_probs, stored.emissions.log_probs);
        assert_eq!(loaded.emissions.frames, stored.emissions.frames);
        assert_eq!(loaded.emissions.columns, stored.emissions.columns);
        assert_eq!(loaded.emissions.frame_secs, stored.emissions.frame_secs);
        assert_eq!(loaded.vocabulary.space, stored.vocabulary.space);
        assert_eq!(loaded.vocabulary.letters, stored.vocabulary.letters);
        // Saklanmadan önceki alt küme ile okunan birebir aynı sonucu verir; tam f32 emisyonla
        // yerleşim aynı, güven yalnızca yuvarlama kadar farklı.
        let lines = words(text);
        let fresh = align(&stored.emissions, &stored.vocabulary, &lines).unwrap();
        assert_eq!(
            align(&loaded.emissions, &loaded.vocabulary, &lines).unwrap(),
            fresh
        );
        let reference = align(&full, &vocab, &lines).unwrap();
        assert_eq!(fresh.verdict, reference.verdict);
        for (a, b) in fresh.lines.iter().zip(&reference.lines) {
            assert_eq!(
                (a.start, a.end, &a.words, a.skipped),
                (b.start, b.end, &b.words, b.skipped)
            );
            assert!((a.confidence - b.confidence).abs() < 1e-6);
        }
    }

    #[test]
    fn sozun_saklanmamis_harfi_varsa_kayit_kullanilmaz() {
        let alphabet = big_alphabet();
        let vocab = vocabulary(&alphabet);
        let full = emissions_for("ab", &vocab, alphabet.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, "ab".chars()).unwrap();
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = Path::new("/a.mp3");
        cache.store_emissions(path, stamp(), SHA, &stored).unwrap();
        // Temel alfabedeki harf eklenirse kayıt yeter; Yunan harfi eklenirse model yeniden çalışmalı.
        assert!(cache
            .load_emissions(path, stamp(), SHA, &['ğ', 'q'])
            .unwrap()
            .is_some());
        assert!(cache
            .load_emissions(path, stamp(), SHA, &['ğ', 'λ'])
            .unwrap()
            .is_none());
    }

    #[test]
    fn dosya_model_ya_da_surum_degisince_kayit_kullanilmaz() {
        let vocab = vocabulary(BASE_LETTERS);
        let full = emissions_for("ab", &vocab, BASE_LETTERS.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, std::iter::empty()).unwrap();
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = Path::new("/a.mp3");
        cache.store_emissions(path, stamp(), SHA, &stored).unwrap();
        let load = |p: &str, s: FileStamp, sha: &str| {
            cache.load_emissions(Path::new(p), s, sha, &[]).unwrap()
        };
        assert!(load("/a.mp3", stamp(), SHA).is_some());
        assert!(load("/b.mp3", stamp(), SHA).is_none());
        let changed = FileStamp {
            modified: stamp().modified + 1,
            ..stamp()
        };
        assert!(load("/a.mp3", changed, SHA).is_none());
        let resized = FileStamp {
            size: 999,
            ..stamp()
        };
        assert!(load("/a.mp3", resized, SHA).is_none());
        assert!(load("/a.mp3", stamp(), "bb").is_none());
        cache
            .lock_for_test()
            .execute("UPDATE lyrics_emissions SET version = version - 1", [])
            .unwrap();
        assert!(load("/a.mp3", stamp(), SHA).is_none());
    }

    #[test]
    fn yeni_kayit_eskisinin_yerini_alir() {
        let vocab = vocabulary(BASE_LETTERS);
        let columns = BASE_LETTERS.chars().count() + 2;
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = Path::new("/a.mp3");
        for text in ["ab", "abc abc"] {
            let full = emissions_for(text, &vocab, columns);
            let stored = StoredEmissions::select(&full, &vocab, std::iter::empty()).unwrap();
            cache.store_emissions(path, stamp(), SHA, &stored).unwrap();
        }
        let loaded = cache
            .load_emissions(path, stamp(), SHA, &[])
            .unwrap()
            .unwrap();
        assert_eq!(
            loaded.emissions.frames,
            emissions_for("abc abc", &vocab, columns).frames
        );
        let rows: i64 = cache
            .lock_for_test()
            .query_row("SELECT COUNT(*) FROM lyrics_emissions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1);
    }

    #[test]
    fn sarki_kutuphaneden_cikinca_kaydi_silinir() {
        let vocab = vocabulary(BASE_LETTERS);
        let full = emissions_for("ab", &vocab, BASE_LETTERS.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, std::iter::empty()).unwrap();
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = "/m/a.mp3";
        {
            let conn = cache.lock_for_test();
            conn.execute("INSERT INTO folders (id, path) VALUES (1, '/m')", [])
                .unwrap();
            conn.execute(
                "INSERT INTO tracks (folder_id, path, file_name, codec, sample_rate, channels,
                                     file_size, modified, sort_key, search)
                 VALUES (1, ?1, 'a.mp3', 'mp3', 44100, 2, 1000, 0, 'a', 'a')",
                [path],
            )
            .unwrap();
        }
        cache
            .store_emissions(Path::new(path), stamp(), SHA, &stored)
            .unwrap();
        cache
            .lock_for_test()
            .execute("DELETE FROM tracks WHERE path = ?1", [path])
            .unwrap();
        assert!(cache
            .load_emissions(Path::new(path), stamp(), SHA, &[])
            .unwrap()
            .is_none());
    }

    #[test]
    fn bozuk_kayit_yok_sayilir() {
        let vocab = vocabulary(BASE_LETTERS);
        let full = emissions_for("ab", &vocab, BASE_LETTERS.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, std::iter::empty()).unwrap();
        let names = stored.column_names();
        let data = stored.encode();
        let frames = stored.emissions.frames as i64;
        assert!(
            StoredEmissions::decode(frames, 0.02, &names, &letters_of(&names), &data).is_some()
        );
        // Kare sayısı veriyle uyuşmuyor, sıfır ya da sınırın üstünde.
        assert!(
            StoredEmissions::decode(frames + 1, 0.02, &names, &letters_of(&names), &data).is_none()
        );
        assert!(
            StoredEmissions::decode(frames - 1, 0.02, &names, &letters_of(&names), &data).is_none()
        );
        assert!(StoredEmissions::decode(0, 0.02, &names, &letters_of(&names), &data).is_none());
        assert!(StoredEmissions::decode(-1, 0.02, &names, &letters_of(&names), &data).is_none());
        assert!(StoredEmissions::decode(
            MAX_FRAMES as i64 + 1,
            0.02,
            &names,
            &letters_of(&names),
            &data
        )
        .is_none());
        // Kare süresi anlamsız.
        for secs in [0.0, -0.02, f64::NAN, f64::INFINITY, 2.0] {
            assert!(
                StoredEmissions::decode(frames, secs, &names, &letters_of(&names), &data).is_none()
            );
        }
        // Aynı harf ya da ayırıcı iki kez.
        let twice_letter = format!("{names}a");
        let twice_space = format!("{names} ");
        for bad in [&twice_letter, &twice_space] {
            assert!(StoredEmissions::decode(frames, 0.02, bad, &letters_of(bad), &data).is_none());
        }
        // Sıkıştırılmış veri bozuk ya da kesik.
        assert!(StoredEmissions::decode(
            frames,
            0.02,
            &names,
            &letters_of(&names),
            &data[..data.len() / 2]
        )
        .is_none());
        assert!(
            StoredEmissions::decode(frames, 0.02, &names, &letters_of(&names), b"bozuk").is_none()
        );
        // Değerler aralık dışında (pozitif, NaN, sonsuz).
        for bits in [f16::from_f32(1.0), f16::NAN, f16::NEG_INFINITY] {
            let cells = stored.emissions.log_probs.len();
            let mut raw = vec![0u8; cells * 2];
            let [h, l] = bits.to_bits().to_be_bytes();
            raw[0] = h;
            raw[cells] = l;
            let bad = miniz_oxide::deflate::compress_to_vec(&raw, 6);
            assert!(
                StoredEmissions::decode(frames, 0.02, &names, &letters_of(&names), &bad).is_none()
            );
        }
    }

    #[test]
    fn ayiricisiz_sozluk_de_saklanir() {
        let vocab = Vocabulary {
            space: None,
            ..vocabulary("ab")
        };
        let full = emissions_for("ab", &vocabulary("ab"), 4);
        let stored = StoredEmissions::select(&full, &vocab, std::iter::empty()).unwrap();
        let loaded = StoredEmissions::decode(
            stored.emissions.frames as i64,
            0.02,
            &stored.column_names(),
            &letters_of(&stored.column_names()),
            &stored.encode(),
        )
        .unwrap();
        assert_eq!(loaded.vocabulary.space, None);
        assert_eq!(loaded.vocabulary.letters, stored.vocabulary.letters);
        assert_eq!(loaded.emissions.log_probs, stored.emissions.log_probs);
    }

    #[test]
    fn yuvarlama_kirpar_ve_kararlidir() {
        assert_eq!(quantize(f32::NAN), MIN_LOG_PROB);
        assert_eq!(quantize(f32::NEG_INFINITY), MIN_LOG_PROB);
        assert_eq!(quantize(-1e6), MIN_LOG_PROB);
        assert_eq!(quantize(1e-7), 0.0);
        let mut seed = 7u64;
        for _ in 0..10_000 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let v = -((seed >> 11) as f64 / (1u64 << 53) as f64 * 40.0) as f32;
            let q = quantize(v);
            assert_eq!(quantize(q), q);
            assert!((q - v).abs() <= v.abs() / 2048.0 + 1e-7, "{v} {q}");
        }
    }

    #[test]
    fn sikistirma_dakikada_yarim_megabaytin_altinda() {
        // Gerçek modelde ölçülen: dakikada 0,145 MB. Rastgele gürültülü yapay matriste sınır gevşek
        // tutulur; amaç tam 410 sütunun (dakikada ~2,5 MB) ya da sıkıştırmasız saklamanın yakalanması.
        let alphabet = big_alphabet();
        let vocab = vocabulary(&alphabet);
        let text = "gece uzun yol geniş şarkı çağırıyor beni ".repeat(30);
        let full = emissions_for(text.trim(), &vocab, alphabet.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, text.chars()).unwrap();
        let minutes = full.frames as f64 * full.frame_secs / 60.0;
        let mb = stored.encode().len() as f64 / 1e6;
        assert!(mb / minutes < 0.5, "{:.3} MB/dk", mb / minutes);
    }

    /// İnceleme bulgusu 2: hangi harfin modelde olduğu kayıttan bilinir, model açılmaz. "cafe" →
    /// "café" düzeltmesinde 'é' modelde var ama saklanmamış: kayıt kullanılmaz. Çince harf modelde
    /// yok: kayıt kullanılır.
    #[test]
    fn modelin_harfleri_kayittan_bilinir() {
        let alphabet = big_alphabet();
        let vocab = vocabulary(&alphabet);
        let full = emissions_for("cafe", &vocab, alphabet.chars().count() + 2);
        let stored = StoredEmissions::select(&full, &vocab, "cafe".chars()).unwrap();
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = Path::new("/a.mp3");
        cache.store_emissions(path, stamp(), SHA, &stored).unwrap();
        let load = |lyrics: &str| {
            let letters: Vec<char> = lyrics.chars().collect();
            cache.load_emissions(path, stamp(), SHA, &letters).unwrap()
        };
        assert!(load("cafe").is_some());
        assert!(load("cafe 木 7!").is_some());
        assert!(load("café").is_none());
        let loaded = load("cafe").unwrap();
        assert_eq!(loaded.model_letters, stored.model_letters);
        assert_eq!(loaded.model_letters.len(), alphabet.chars().count());
    }

    /// İnceleme bulgusu 3: tutarsız sözlük ya da matris panik değil `None` (gerçek modelde oluşmaz).
    #[test]
    fn tutarsiz_girdi_reddedilir_panik_yok() {
        let vocab = vocabulary("ab");
        let full = emissions_for("ab", &vocab, 4);
        assert!(StoredEmissions::select(&full, &vocab, "ab".chars()).is_some());
        // İki harf aynı sütunda: CTC'de tekrar kuralı sütuna bakar, ayrı sütun sonucu değiştirirdi.
        let shared = Vocabulary {
            letters: [('a', 2), ('b', 2)].into_iter().collect(),
            ..vocab.clone()
        };
        assert!(StoredEmissions::select(&full, &shared, "ab".chars()).is_none());
        // Harf blank ya da ayırıcıyla aynı sütunda.
        let on_blank = Vocabulary {
            letters: [('a', 0), ('b', 3)].into_iter().collect(),
            ..vocab.clone()
        };
        assert!(StoredEmissions::select(&full, &on_blank, "ab".chars()).is_none());
        // Harf olarak boşluk (kayıtta ayırıcıyla karışırdı).
        let space_letter = Vocabulary {
            space: None,
            letters: [('a', 1), (' ', 2)].into_iter().collect(),
            ..vocab.clone()
        };
        assert!(StoredEmissions::select(&full, &space_letter, "a".chars()).is_none());
        // Sütun matrisin dışında.
        let outside = Vocabulary {
            letters: [('a', 2), ('b', 4)].into_iter().collect(),
            ..vocab.clone()
        };
        assert!(StoredEmissions::select(&full, &outside, "ab".chars()).is_none());
        // Matrisin boyutları tutmuyor, sütunsuz ya da saklanamayacak kadar uzun.
        let short = Emissions {
            log_probs: full.log_probs[1..].to_vec(),
            ..full.clone()
        };
        assert!(StoredEmissions::select(&short, &vocab, "ab".chars()).is_none());
        let empty = Emissions {
            columns: 0,
            log_probs: Vec::new(),
            ..full.clone()
        };
        assert!(StoredEmissions::select(&empty, &vocab, "ab".chars()).is_none());
        let long = Emissions {
            frames: MAX_FRAMES + 1,
            log_probs: vec![-1.0; (MAX_FRAMES + 1) * 4],
            ..full.clone()
        };
        assert!(StoredEmissions::select(&long, &vocab, "ab".chars()).is_none());
        for secs in [0.0, f64::NAN, 2.0] {
            let odd = Emissions {
                frame_secs: secs,
                ..full.clone()
            };
            assert!(StoredEmissions::select(&odd, &vocab, "ab".chars()).is_none());
        }
    }

    /// İnceleme notu: elle tutarsız kurulmuş kayıt saklanmaz (okunamayacak kayıt yazılmaz).
    #[test]
    fn okunamayacak_kayit_saklanmaz() {
        let vocab = vocabulary("ab");
        let full = emissions_for("ab", &vocab, 4);
        let good = StoredEmissions::select(&full, &vocab, "ab".chars()).unwrap();
        let mut unknown_letter = good.clone();
        unknown_letter.model_letters.clear();
        let mut wrong_size = good.clone();
        wrong_size.emissions.frames += 1;
        let mut moved_blank = good.clone();
        moved_blank.vocabulary.blank = 1;
        let cache = AnalysisCache::open_in_memory().unwrap();
        for (i, bad) in [unknown_letter, wrong_size, moved_blank].iter().enumerate() {
            let path = format!("/{i}.mp3");
            cache
                .store_emissions(Path::new(&path), stamp(), SHA, bad)
                .unwrap();
            assert!(cache
                .load_emissions(Path::new(&path), stamp(), SHA, &[])
                .unwrap()
                .is_none());
        }
        cache
            .store_emissions(Path::new("/iyi.mp3"), stamp(), SHA, &good)
            .unwrap();
        assert!(cache
            .load_emissions(Path::new("/iyi.mp3"), stamp(), SHA, &[])
            .unwrap()
            .is_some());
    }
}

/// Bağımsız inceleme (31 Ekim 2026): yazarın testlerinden ayrı, kendi rastgele üreticisiyle karşı örnek
/// araması. Rastgele sözlükler (boyut, blank/ayırıcı yeri, ayırıcısız, karışık sütun sırası, çok baytlı
/// harfler), uç değerli emisyonlar, rastgele sözler; `decode`'a bozulmuş kayıtlar.
#[cfg(test)]
mod inceleme_karsi_ornekler {
    use super::*;
    use crate::analysis::lyrics_align::{align, AlignError};
    use std::collections::HashSet;

    /// splitmix64: tohumlu, tekrarlanabilir.
    struct Rng(u64);

    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut z = self.0;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        }
        fn below(&mut self, n: usize) -> usize {
            (self.next() % n.max(1) as u64) as usize
        }
        fn unit(&mut self) -> f64 {
            (self.next() >> 11) as f64 / (1u64 << 53) as f64
        }
        fn chance(&mut self, p: f64) -> bool {
            self.unit() < p
        }
        fn shuffle<T>(&mut self, v: &mut [T]) {
            for i in (1..v.len()).rev() {
                let j = self.below(i + 1);
                v.swap(i, j);
            }
        }
    }

    /// Sözlük harfleri havuzu: temel alfabe, Latin ekleri, Yunan, Kiril; genel `Vocabulary` için
    /// modelde olmayan büyük harfler, birleşen nokta, Çince, 4 baytlık simge de.
    fn letter_pool() -> Vec<char> {
        let mut seen = HashSet::new();
        BASE_LETTERS
            .chars()
            .chain("äéëèàáíóúñßøåæœĸǆǅʼ".chars())
            .chain('α'..='ω')
            .chain('а'..='я')
            .chain("İIÇŞĞÖÜ木水火月日🎵\u{0307}".chars())
            .filter(|c| seen.insert(*c))
            .collect()
    }

    /// Sözde geçebilecek ama sözlükte olmayabilecek karakterler.
    const STRAY: &str = "7-?!ZÉ’\u{0}\t";

    const EXTREMES: [f32; 26] = [
        f32::NAN,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::MIN,
        f32::MAX,
        -1e30,
        -1000.0,
        -1000.1,
        -999.75,
        -999.9,
        -65504.0,
        -65520.0,
        1e-7,
        1e-30,
        -1e-30,
        -1e-45,
        f32::MIN_POSITIVE,
        -f32::MIN_POSITIVE,
        -0.0,
        0.0,
        5.0,
        -5.96e-8,
        -2.98e-8,
        -3e-8,
        -6.1e-5,
        -28.0,
    ];

    struct Case {
        full: Emissions,
        vocab: Vocabulary,
        lyrics: String,
        lines: Vec<Vec<String>>,
    }

    fn random_case(rng: &mut Rng, pool: &[char]) -> Case {
        let mut letters_pool = pool.to_vec();
        rng.shuffle(&mut letters_pool);
        let n = if rng.chance(0.3) {
            rng.below(10)
        } else {
            rng.below(pool.len() + 1)
        };
        let chosen = &letters_pool[..n];
        let has_space = rng.chance(0.8);
        let extra = rng.below(4);
        let columns = 1 + usize::from(has_space) + n + extra;
        let mut perm: Vec<usize> = (0..columns).collect();
        rng.shuffle(&mut perm);
        let blank = perm[0];
        let space = has_space.then(|| perm[1]);
        let first_letter = 1 + usize::from(has_space);
        let letters: HashMap<char, usize> = chosen
            .iter()
            .copied()
            .zip(perm[first_letter..].iter().copied())
            .collect();
        let vocab = Vocabulary {
            blank,
            space,
            letters,
        };

        let frames = 1 + rng.below(160);
        let extreme_rate = if rng.chance(0.5) { 0.0 } else { 0.03 };
        let mut log_probs = Vec::with_capacity(frames * columns);
        for _ in 0..frames {
            let scale = if rng.chance(0.1) { 200.0 } else { 6.0 };
            let row: Vec<f64> = (0..columns).map(|_| rng.unit() * scale).collect();
            let max = row.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            let log_z = max + row.iter().map(|v| (v - max).exp()).sum::<f64>().ln();
            for v in row {
                let value = if rng.chance(extreme_rate) {
                    EXTREMES[rng.below(EXTREMES.len())]
                } else {
                    (v - log_z) as f32
                };
                log_probs.push(value);
            }
        }
        let full = Emissions {
            frames,
            columns,
            log_probs,
            frame_secs: [0.02, 0.01, 1.0, 1e-9][rng.below(4)],
        };

        let stray: Vec<char> = STRAY.chars().collect();
        let mut lines = Vec::new();
        for _ in 0..1 + rng.below(4) {
            let mut words = Vec::new();
            for _ in 0..1 + rng.below(5) {
                let mut word = String::new();
                for _ in 0..1 + rng.below(6) {
                    let c = if !chosen.is_empty() && rng.chance(0.75) {
                        chosen[rng.below(chosen.len())]
                    } else if rng.chance(0.5) {
                        stray[rng.below(stray.len())]
                    } else {
                        pool[rng.below(pool.len())]
                    };
                    word.push(c);
                }
                words.push(word);
            }
            lines.push(words);
        }
        let lyrics = lines
            .iter()
            .map(|l| l.join(" "))
            .collect::<Vec<_>>()
            .join("\n");
        Case {
            full,
            vocab,
            lyrics,
            lines,
        }
    }

    fn bits(v: &[f32]) -> Vec<u32> {
        v.iter().map(|x| x.to_bits()).collect()
    }

    fn assert_same(a: &StoredEmissions, b: &StoredEmissions, ctx: &str) {
        assert_eq!(a.emissions.frames, b.emissions.frames, "{ctx}");
        assert_eq!(a.emissions.columns, b.emissions.columns, "{ctx}");
        assert_eq!(
            a.emissions.frame_secs.to_bits(),
            b.emissions.frame_secs.to_bits(),
            "{ctx}"
        );
        assert_eq!(
            bits(&a.emissions.log_probs),
            bits(&b.emissions.log_probs),
            "{ctx}"
        );
        assert_eq!(a.vocabulary.blank, b.vocabulary.blank, "{ctx}");
        assert_eq!(a.vocabulary.space, b.vocabulary.space, "{ctx}");
        assert_eq!(a.vocabulary.letters, b.vocabulary.letters, "{ctx}");
    }

    /// Bağımsız kodlayıcı: f16 bitleri, önce üst baytlar sonra alt baytlar, deflate.
    fn my_encode(values: &[u16]) -> Vec<u8> {
        let mut raw: Vec<u8> = values.iter().map(|b| (b >> 8) as u8).collect();
        raw.extend(values.iter().map(|b| (b & 0xFF) as u8));
        miniz_oxide::deflate::compress_to_vec(&raw, 1)
    }

    fn stamp() -> FileStamp {
        FileStamp {
            size: 4096,
            modified: 1_760_000_000,
        }
    }

    #[test]
    fn rastgele_sozluk_ve_emisyonlarda_gidis_donus_ve_hizalama_ayni() {
        let pool = letter_pool();
        let base: HashSet<char> = BASE_LETTERS.chars().collect();
        let cache = AnalysisCache::open_in_memory().unwrap();
        let mut rng = Rng(0x1EE7_5EED);
        let (mut cases, mut aligned, mut align_err, mut missing_checked) = (0, 0, 0, 0);
        let mut no_space = 0;
        let mut extreme_cells = 0;
        for case_no in 0..400 {
            let case = random_case(&mut rng, &pool);
            let ctx = format!("durum {case_no}: söz {:?}", case.lyrics);
            cases += 1;
            no_space += usize::from(case.vocab.space.is_none());
            extreme_cells += case
                .full
                .log_probs
                .iter()
                .filter(|v| !v.is_finite() || **v > 0.0 || **v < MIN_LOG_PROB)
                .count();

            let stored =
                StoredEmissions::select(&case.full, &case.vocab, case.lyrics.chars()).unwrap();

            // Saklanan harf kümesi = (temel alfabe ∪ söz) ∩ sözlük.
            let expected: HashSet<char> = base
                .iter()
                .copied()
                .chain(case.lyrics.chars())
                .filter(|c| case.vocab.letters.contains_key(c))
                .collect();
            let got: HashSet<char> = stored.vocabulary.letters.keys().copied().collect();
            assert_eq!(got, expected, "{ctx}");
            for &c in &pool {
                // Modelin tanımadığı harf kaydı kullanılmaz yapmaz (yazarın düzeltmesi, bulgu 2).
                let expect = expected.contains(&c) || !case.vocab.letters.contains_key(&c);
                assert_eq!(stored.covers(&[c]), expect, "{ctx} {c:?}");
            }

            // Her saklanan değer, modelin aynı sütununun yuvarlanmışı (bit bit).
            let sc = stored.emissions.columns;
            assert_eq!(
                sc,
                1 + usize::from(case.vocab.space.is_some()) + expected.len()
            );
            assert_eq!(
                case.vocab.space.is_some(),
                stored.vocabulary.space.is_some()
            );
            let mut pairs = vec![(case.vocab.blank, stored.vocabulary.blank)];
            if let (Some(a), Some(b)) = (case.vocab.space, stored.vocabulary.space) {
                pairs.push((a, b));
            }
            for c in &expected {
                pairs.push((case.vocab.letters[c], stored.vocabulary.letters[c]));
            }
            for t in 0..case.full.frames {
                for &(from, to) in &pairs {
                    let a = case.full.log_probs[t * case.full.columns + from];
                    let b = stored.emissions.log_probs[t * sc + to];
                    assert_eq!(b.to_bits(), quantize(a).to_bits(), "{ctx} {a}");
                    assert!((MIN_LOG_PROB..=0.0).contains(&b), "{ctx} {b}");
                }
            }

            // Kayıt biçimi gidiş-dönüş.
            let names = stored.column_names();
            assert_eq!(names.chars().count() + 1, sc, "{ctx}");
            let decoded = StoredEmissions::decode(
                stored.emissions.frames as i64,
                stored.emissions.frame_secs,
                &names,
                &letters_of(&names),
                &stored.encode(),
            )
            .unwrap_or_else(|| panic!("{ctx}: decode None"));
            assert_same(&stored, &decoded, &ctx);

            // Önbellek: gerekenler saklananların alt kümesiyse bulunur, değilse bulunmaz.
            let path = format!("/k/{case_no}/şarkı.flac");
            cache
                .store_emissions(Path::new(&path), stamp(), "sha", &stored)
                .unwrap();
            let mut needed: Vec<char> = expected
                .iter()
                .copied()
                .filter(|_| rng.chance(0.5))
                .collect();
            needed.extend(needed.clone());
            let loaded = cache
                .load_emissions(Path::new(&path), stamp(), "sha", &needed)
                .unwrap()
                .unwrap_or_else(|| panic!("{ctx}: önbellekte yok"));
            assert_same(&stored, &loaded, &ctx);
            if let Some(&absent) = case.vocab.letters.keys().find(|c| !expected.contains(c)) {
                missing_checked += 1;
                let mut more = needed.clone();
                more.push(absent);
                assert!(cache
                    .load_emissions(Path::new(&path), stamp(), "sha", &more)
                    .unwrap()
                    .is_none());
            }

            // Hizalama: yuvarlanmış tam matris + tam sözlük = saklanan = okunan (bit bit aynı sonuç).
            let quantized_full = Emissions {
                log_probs: case.full.log_probs.iter().map(|&v| quantize(v)).collect(),
                ..case.full.clone()
            };
            let reference = align(&quantized_full, &case.vocab, &case.lines);
            let fresh = align(&stored.emissions, &stored.vocabulary, &case.lines);
            let again = align(&loaded.emissions, &loaded.vocabulary, &case.lines);
            assert_eq!(format!("{fresh:?}"), format!("{reference:?}"), "{ctx}");
            assert_eq!(format!("{again:?}"), format!("{fresh:?}"), "{ctx}");
            if fresh.is_ok() {
                aligned += 1;
            } else {
                align_err += 1;
            }
        }
        eprintln!(
            "inceleme: {cases} durum, {no_space} ayırıcısız, {extreme_cells} uç değerli hücre, \
             {aligned} hizalandı, {align_err} hizalama hatası (iki yolda aynı), \
             {missing_checked} eksik harf denetimi"
        );
        assert!(aligned > 100 && missing_checked > 100);
    }

    /// `decode` kabul ettiği her kaydı tutarlı kurmalı: boyutlar, aralık, sütunlar.
    fn check_decoded(d: &StoredEmissions, names: &str) {
        let e = &d.emissions;
        assert_eq!(e.log_probs.len(), e.frames * e.columns);
        assert_eq!(e.columns, names.chars().count() + 1);
        assert!(e.columns <= MAX_COLUMNS && e.frames <= MAX_FRAMES && e.frames > 0);
        assert!(e.log_probs.iter().all(|v| (MIN_LOG_PROB..=0.0).contains(v)));
        let mut used = HashSet::new();
        assert!(used.insert(d.vocabulary.blank));
        if let Some(s) = d.vocabulary.space {
            assert!(used.insert(s) && s < e.columns);
        }
        for &c in d.vocabulary.letters.values() {
            assert!(used.insert(c) && c < e.columns);
        }
        assert_eq!(d.column_names(), names);
        let again = StoredEmissions::decode(
            e.frames as i64,
            e.frame_secs,
            names,
            &letters_of(names),
            &d.encode(),
        )
        .unwrap();
        assert_same(d, &again, "yeniden kodlama");
        let line: Vec<Vec<String>> = vec![d
            .vocabulary
            .letters
            .keys()
            .take(3)
            .map(|c| c.to_string())
            .collect()];
        if !line[0].is_empty() {
            assert_ne!(
                align(e, &d.vocabulary, &line).err(),
                Some(AlignError::BadEmissions)
            );
        }
    }

    #[test]
    fn decode_bozulmus_kayitlarda_coker_ya_da_tutarsiz_kurmaz() {
        let pool = letter_pool();
        let mut rng = Rng(0xDEC0_DE00);
        let (mut tried, mut accepted) = (0usize, 0usize);
        for _ in 0..120 {
            let case = random_case(&mut rng, &pool);
            let stored =
                StoredEmissions::select(&case.full, &case.vocab, case.lyrics.chars()).unwrap();
            let names = stored.column_names();
            let data = stored.encode();
            let frames = stored.emissions.frames as i64;
            for _ in 0..40 {
                let mut f = frames;
                let mut secs = stored.emissions.frame_secs;
                let mut n = names.clone();
                let mut d = data.clone();
                match rng.below(9) {
                    0 => {
                        let i = rng.below(d.len());
                        d[i] ^= 1 << rng.below(8);
                    }
                    1 => d.truncate(rng.below(d.len())),
                    2 => d.extend((0..1 + rng.below(16)).map(|_| rng.next() as u8)),
                    3 => d = (0..rng.below(300)).map(|_| rng.next() as u8).collect(),
                    4 => {
                        f = [
                            i64::MIN,
                            -1,
                            0,
                            frames - 1,
                            frames + 1,
                            MAX_FRAMES as i64,
                            MAX_FRAMES as i64 + 1,
                            i64::MAX,
                        ][rng.below(8)]
                    }
                    5 => {
                        secs =
                            [0.0, -0.0, f64::NAN, f64::INFINITY, 1.0 + 1e-12, 5e-324][rng.below(6)]
                    }
                    6 => {
                        let mut chars: Vec<char> = n.chars().collect();
                        match rng.below(3) {
                            0 if !chars.is_empty() => {
                                chars.remove(rng.below(chars.len()));
                            }
                            1 => chars.insert(
                                rng.below(chars.len() + 1),
                                ['\u{0}', ' ', '\n', '\u{FFFF}', '🎵', 'a'][rng.below(6)],
                            ),
                            _ if !chars.is_empty() => {
                                let i = rng.below(chars.len());
                                chars[i] = pool[rng.below(pool.len())];
                            }
                            _ => {}
                        }
                        n = chars.into_iter().collect();
                    }
                    7 => {
                        n = ["", " ", "  ", "\u{0}", "\u{7}\u{1b}", "a a", "ab"][rng.below(7)]
                            .to_string()
                    }
                    _ => n = "x".repeat(rng.below(3000)),
                }
                tried += 1;
                if let Some(dec) = StoredEmissions::decode(f, secs, &n, &letters_of(&n), &d) {
                    accepted += 1;
                    check_decoded(&dec, &n);
                }
            }
        }
        eprintln!("inceleme: decode {tried} bozulmuş kayıt, {accepted} kabul (hepsi tutarlı)");
    }

    /// Kendi kodlayıcımızla kurulan kayıtlar: `decode` tam olarak geçerli olanları kabul etmeli.
    #[test]
    fn decode_gecerli_kaydi_kabul_eder_gecersizi_reddeder() {
        let mut rng = Rng(0x00DD_BA11);
        let interesting: [u16; 14] = [
            0x0000, // +0
            0x8000, // −0
            0x8001, // en küçük alt normal
            0x83FF, // en büyük alt normal
            0xBC00, // −1
            0xE3D0, // −1000
            0xE3D1, // −1000,5 (aralık dışı)
            0xFBFF, // −65504
            0xFC00, // −∞
            0x7C00, // +∞
            0x7E00, // NaN
            0xFE00, // −NaN
            0x3C00, // +1
            0x0001, // +alt normal
        ];
        let long_ok: String = std::iter::once(' ')
            .chain(
                (0x4E00u32..)
                    .filter_map(char::from_u32)
                    .take(MAX_COLUMNS - 2),
            )
            .collect();
        let long_bad: String = (0x4E00u32..)
            .filter_map(char::from_u32)
            .take(MAX_COLUMNS)
            .collect();
        let name_choices: Vec<String> = vec![
            String::new(),
            " ".into(),
            "  ".into(),
            "\u{0}".into(),
            " ab".into(),
            "a b".into(),
            "aa".into(),
            "İıiI".into(),
            "日本🎵".into(),
            "\u{0307}i".into(),
            long_ok,
            long_bad,
        ];
        let (mut ok_count, mut bad_count) = (0, 0);
        for _ in 0..600 {
            let names = &name_choices[rng.below(name_choices.len())];
            let columns = names.chars().count() + 1;
            let frames = if rng.chance(0.05) {
                0
            } else {
                1 + rng.below(4)
            };
            let secs = if rng.chance(0.1) { 1.5 } else { 0.02 };
            let cells = frames * columns;
            let values: Vec<u16> = (0..cells)
                .map(|_| {
                    if rng.chance(0.002) {
                        interesting[rng.below(interesting.len())]
                    } else {
                        // −1000 … 0 arası rastgele f16.
                        f16::from_f32(-(rng.unit() as f32) * 1000.0).to_bits()
                    }
                })
                .collect();
            let unique = {
                let mut seen = HashSet::new();
                names.chars().all(|c| seen.insert(c))
            };
            let values_ok = values
                .iter()
                .all(|&b| (MIN_LOG_PROB..=0.0).contains(&f16::from_bits(b).to_f32()));
            let expect = frames > 0 && secs <= 1.0 && unique && columns <= MAX_COLUMNS && values_ok;
            let got = StoredEmissions::decode(
                frames as i64,
                secs,
                names,
                &letters_of(names),
                &my_encode(&values),
            );
            assert_eq!(got.is_some(), expect, "{names:?} kare {frames}");
            if let Some(d) = got {
                ok_count += 1;
                let want: Vec<u32> = values
                    .iter()
                    .map(|&b| f16::from_bits(b).to_f32().to_bits())
                    .collect();
                assert_eq!(bits(&d.emissions.log_probs), want);
                check_decoded(&d, names);
            } else {
                bad_count += 1;
            }
        }
        eprintln!("inceleme: kendi kodlayıcı {ok_count} kabul, {bad_count} red (beklenenle aynı)");
    }

    #[test]
    fn yuvarlama_her_f32_desende_kararli_ve_aralikta() {
        let mut rng = Rng(42);
        let mut n = 0;
        for _ in 0..200_000 {
            let v = f32::from_bits(rng.next() as u32);
            let q = quantize(v);
            assert!((MIN_LOG_PROB..=0.0).contains(&q), "{v} {q}");
            assert_eq!(quantize(q).to_bits(), q.to_bits(), "{v}");
            // f16'ya kayıpsız gider.
            assert_eq!(f16::from_f32(q).to_f32().to_bits(), q.to_bits());
            n += 1;
        }
        for v in EXTREMES {
            let q = quantize(v);
            assert_eq!(quantize(q).to_bits(), q.to_bits(), "{v}");
        }
        eprintln!("inceleme: yuvarlama {n} rastgele bit deseni");
    }

    /// Bulgu (düşük): `lyrics_emissions` bir önbellek tablosu, ama `storage::cache_complete` /
    /// `rebuild_cache` yalnızca `analyses`'i tanıyor. Sürümü 9 olan dosyada tablo ya da tetikleyici
    /// eksikse (elle bozulmuş, aynı dalın eski bir geliştirme derlemesi) kendiliğinden kurulmaz:
    /// her `store_emissions` / `load_emissions` hata döner. `storage.rs` belgesinin önbellek için
    /// verdiği söz ("önbellek tablosu eksik ... yeniden kurulur") bu tabloya uymuyor; ileride V10 bu
    /// tabloyu `ALTER` ederse eksik tablo kütüphanenin açılmasını engeller ("no such table" sınıfı).
    #[test]
    fn emisyon_tablosu_kayipsa_onbellek_yeniden_kurulur() {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::storage::migrate(&mut conn).unwrap();
        conn.execute_batch(
            "DROP TRIGGER lyrics_emissions_follow_tracks; DROP TABLE lyrics_emissions;",
        )
        .unwrap();
        crate::storage::migrate(&mut conn).unwrap();
        let objects: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE name IN ('lyrics_emissions', 'lyrics_emissions_follow_tracks')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            objects, 2,
            "emisyon tablosu ve tetikleyicisi yeniden kurulmadı"
        );
    }
}
