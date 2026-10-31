//! Sözleri sese oturtma işi: bir şarkının zamansız sözünü zamanlar ve sonucu saklar
//! (`docs/arastirma/soz-hizalama/`, RAPOR §8 PR 4).
//!
//! Akış ([`align_track`]): söz hazırlanır (`lyrics_text`), emisyonlar önbellekten okunur
//! (`lyrics_cache`; söz düzeltilince model yeniden çalışmaz); yoksa model açılır ([`ModelSlot`]), şarkı
//! çözülür, emisyonlar hesaplanıp saklanır. Ardından yerleşim (`lyrics_align`) ve sonuç saklanır
//! (`lyrics_alignments`, göç 10). Anahtar: yol, dosya damgası, modelin SHA-256'sı, [`ALIGN_VERSION`],
//! emisyon sürümü ve söz metninin SHA-256'sı; şarkı başına bir kayıt (son metin). Kullanıcının metnine
//! ve müzik dosyasına dokunulmaz.
//!
//! - **Model yalnızca gerekince:** açık model ~2,5 GB bellek tutar. Önbellekte emisyon varsa hiç
//!   açılmaz; açıldıysa iş bitince bırakılabilir ([`ModelSlot::release`]).
//! - **Harfler birikir:** emisyonlar yeniden hesaplanınca eski kaydın harfleri de saklanır; iki söz
//!   sürümü arasında gidip gelmek modeli yeniden çalıştırmaz.
//! - **Gösterim** ([`auto_lyrics`]): satırlar hazırlanan sözün satırlarıdır (nakarat ve "(x2)" açılmış,
//!   boşluklar teke indirilmiş); kelime zamanları modelden. Ekrandaki her kelime kendi söylenen
//!   kelimelerinin zamanını alır (`AlignLine::spans`): "Twenty-one" iki söylenen kelimenin başından
//!   sonuna, "21:30" üçünün; hiç söylenmeyen "—" önceki kelimenin bittiği anda, sıfır uzunlukta. Güveni
//!   düşük ya da şarkıda bulunamayan satır `uncertain` (ekranda "tahmini"); bulunamayan satırın
//!   kelimeleri satır içinde hece sayısıyla dağıtılır.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::cache::{AnalysisCache, CacheError, FileStamp};
use super::lyrics_align::{align, AlignError, Alignment, Verdict, LOW_CONFIDENCE};
use super::lyrics_cache::{StoredEmissions, EMISSIONS_VERSION};
use super::lyrics_model::{decode_mono, LyricsModel, ModelError, MODEL_SHA256, TOKENS_SHA256};
use super::lyrics_text::{prepare, AlignLine, MAX_LINES};
use crate::audio::lyrics::{
    estimate_words, AutoVerdict, LyricLine, LyricWord, Lyrics, LyricsSource,
};

/// Hizalama hesabının sürümü (metin hazırlığı, yerleşim, güven). Değişince artırılır: saklanan
/// sonuçlar kullanılmaz, önbellekteki emisyonlardan yeniden hesaplanır (model çalışmaz).
pub const ALIGN_VERSION: i64 = 1;

// Kayıt sürümü `ALIGN_VERSION * 1000 + EMISSIONS_VERSION`: emisyon sürümü 1000'e varmamalı.
const _: () = assert!(EMISSIONS_VERSION < 1000);

/// Söz modeli: ilk gerektiğinde açılır, istenince bırakılır.
pub struct ModelSlot {
    dir: PathBuf,
    model_sha256: String,
    tokens_sha256: String,
    model: Option<LyricsModel>,
    opened: usize,
}

impl ModelSlot {
    /// `dir`: "Söz paketi"nin klasörü; dosyalar bu özetlerle aynı değilse model açılmaz.
    pub fn new(dir: PathBuf, model_sha256: &str, tokens_sha256: &str) -> Self {
        Self {
            dir,
            model_sha256: model_sha256.to_owned(),
            tokens_sha256: tokens_sha256.to_owned(),
            model: None,
            opened: 0,
        }
    }

    /// Programın bildiği söz paketi.
    pub fn product(dir: PathBuf) -> Self {
        Self::new(dir, MODEL_SHA256, TOKENS_SHA256)
    }

    /// Önbellek anahtarındaki model özeti.
    pub fn model_sha256(&self) -> &str {
        &self.model_sha256
    }

    fn get(&mut self) -> Result<&LyricsModel, ModelError> {
        if self.model.is_none() {
            self.model = Some(LyricsModel::open(
                &self.dir,
                &self.model_sha256,
                &self.tokens_sha256,
            )?);
            self.opened += 1;
        }
        self.model
            .as_ref()
            .ok_or_else(|| ModelError::Run("model açılamadı".into()))
    }

    /// Modeli bırakır (bellek); sonraki iş yeniden açar.
    pub fn release(&mut self) {
        self.model = None;
    }

    pub fn is_loaded(&self) -> bool {
        self.model.is_some()
    }

    /// Model bu yuvada kaç kez açıldı (testler ve günlük için).
    pub fn times_opened(&self) -> usize {
        self.opened
    }
}

/// Bir satırın saklanan zamanı.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoLine {
    /// Ekranda görünecek metin (hazırlanan sözün satırı; boşluklar teke indirilmiş).
    pub text: String,
    /// Ekrandaki her kelimenin kaç söylenen kelimeye açıldığı (`AlignLine::spans`).
    pub spans: Vec<usize>,
    pub start: f64,
    pub end: f64,
    /// Söylenen kelimelerin başı ve sonu (sn).
    pub words: Vec<(f64, f64)>,
    pub confidence: f64,
    pub skipped: bool,
}

/// Bir şarkının otomatik zamanlanmış sözü.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoAlignment {
    pub verdict: AutoVerdict,
    pub lines: Vec<AutoLine>,
}

impl AutoAlignment {
    fn new(prepared: &[AlignLine], alignment: &Alignment) -> Self {
        Self {
            verdict: match alignment.verdict {
                Verdict::Good => AutoVerdict::Good,
                Verdict::PartlyEstimated => AutoVerdict::PartlyEstimated,
                Verdict::Unaligned => AutoVerdict::Unaligned,
            },
            lines: prepared
                .iter()
                .zip(&alignment.lines)
                .map(|(line, timing)| AutoLine {
                    text: line.text.split_whitespace().collect::<Vec<_>>().join(" "),
                    spans: line.spans.clone(),
                    start: timing.start,
                    end: timing.end,
                    words: timing.words.iter().map(|w| (w.start, w.end)).collect(),
                    confidence: timing.confidence,
                    skipped: timing.skipped,
                })
                .collect(),
        }
    }

    /// Okunan kaydın değerleri anlamlı mı (kayıt güvenilmez sayılır)? Hizalayıcının çıktısı gibi:
    /// zamanlar sonlu, satır başları azalmaz, kelimeler satırın içinde ve sırayla.
    fn valid(&self) -> bool {
        let span = |start: f64, end: f64| {
            start.is_finite() && end.is_finite() && 0.0 <= start && start <= end
        };
        self.lines.len() <= MAX_LINES
            && self.lines.windows(2).all(|w| w[0].start <= w[1].start)
            && self.lines.iter().all(|line| {
                span(line.start, line.end)
                    && (0.0..=1.0).contains(&line.confidence)
                    && line
                        .words
                        .iter()
                        .all(|&(s, e)| span(s, e) && line.start <= s && e <= line.end)
                    && line.words.windows(2).all(|w| w[0].1 <= w[1].0)
            })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum JobError {
    #[error("sözde hizalanacak kelime yok")]
    NoLyrics,
    #[error("şarkı dosyası bulunamadı")]
    FileGone,
    #[error("şarkı dosyası iş sürerken değişti")]
    FileChanged,
    #[error("emisyonlar saklanamadı")]
    Unstorable,
    #[error("{0}")]
    Model(#[from] ModelError),
    #[error("{0}")]
    Align(#[from] AlignError),
    #[error("{0}")]
    Cache(#[from] CacheError),
}

/// Şarkının `text` sözünü zamanlar. Aynı metin aynı dosya için zaten zamanlandıysa saklanan sonuç;
/// emisyonlar önbellekteyse model açılmaz. `cancel` şarkı çözülürken, model pencereleri arasında ve
/// yerleşimden önce denetlenir.
pub fn align_track(
    cache: &AnalysisCache,
    path: &Path,
    text: &str,
    slot: &mut ModelSlot,
    cancel: &AtomicBool,
) -> Result<AutoAlignment, JobError> {
    let stamp = FileStamp::of(path).ok_or(JobError::FileGone)?;
    let sha = slot.model_sha256().to_owned();
    if let Some(done) = cache.load_alignment(path, stamp, &sha, text)? {
        return Ok(done);
    }
    let prepared = prepare(text);
    let words: Vec<Vec<String>> = prepared.iter().map(|l| l.words.clone()).collect();
    let letters: Vec<char> = words
        .iter()
        .flatten()
        .flat_map(|w| w.chars())
        .collect::<BTreeSet<char>>()
        .into_iter()
        .collect();
    if letters.is_empty() {
        return Err(JobError::NoLyrics);
    }
    let stored = match cache.load_emissions(path, stamp, &sha, &letters)? {
        Some(stored) => stored,
        None => {
            let previous = cache.emission_letters(path, stamp, &sha)?;
            // Önce çözülür: çözülemeyen şarkı için ~2,5 GB'lık model boşuna açılmaz.
            let audio = decode_mono(path, cancel)?;
            let model = slot.get()?;
            let full = model.emissions(&audio, cancel)?;
            // İş sürerken dosya değiştiyse sonuç eski damgayla saklanmaz.
            if FileStamp::of(path) != Some(stamp) {
                return Err(JobError::FileChanged);
            }
            let stored = StoredEmissions::select(
                &full,
                model.vocabulary(),
                letters.iter().copied().chain(previous),
            )
            .ok_or(JobError::Unstorable)?;
            cache.store_emissions(path, stamp, &sha, &stored)?;
            stored
        }
    };
    if cancel.load(Ordering::Relaxed) {
        return Err(ModelError::Cancelled.into());
    }
    let alignment = align(&stored.emissions, &stored.vocabulary, &words)?;
    let result = AutoAlignment::new(&prepared, &alignment);
    cache.store_alignment(path, stamp, &sha, text, &result)?;
    Ok(result)
}

/// Ekranda gösterilecek sözler. `source`: metnin geldiği yer (kullanıcının düzenlediği, yan dosya,
/// gömülü).
pub fn auto_lyrics(result: &AutoAlignment, source: LyricsSource) -> Lyrics {
    let lines = result
        .lines
        .iter()
        .map(|line| {
            let tokens: Vec<&str> = line.text.split_whitespace().collect();
            let text = tokens.join(" ");
            let (words, estimated) = match spoken_spans(line, tokens.len()) {
                Some(ranges) => {
                    let last = tokens.len().saturating_sub(1);
                    let words = tokens
                        .iter()
                        .zip(ranges)
                        .enumerate()
                        .map(|(i, (token, (start, end)))| LyricWord {
                            start,
                            end,
                            text: if i < last {
                                format!("{token} ")
                            } else {
                                (*token).to_owned()
                            },
                        })
                        .collect();
                    (words, false)
                }
                None => (estimate_words(&text, line.start, line.end), true),
            };
            LyricLine {
                start: line.start,
                end: line.end,
                text,
                translation: None,
                words,
                estimated,
                uncertain: line.skipped || line.confidence < LOW_CONFIDENCE,
            }
        })
        .collect();
    Lyrics {
        source,
        synced: true,
        lines,
        auto: Some(result.verdict),
    }
}

/// Ekrandaki her kelimenin zamanı: kendi söylenen kelimelerinin ilkinin başından sonuncusunun sonuna;
/// söylenmeyen kelime önceki kelimenin bittiği anda (satırın ilkiyse satırın başında) sıfır uzunlukta.
/// Satır bulunamadıysa ya da sayılar tutmuyorsa `None`.
fn spoken_spans(line: &AutoLine, tokens: usize) -> Option<Vec<(f64, f64)>> {
    if line.skipped
        || line.spans.len() != tokens
        || line.spans.iter().sum::<usize>() != line.words.len()
    {
        return None;
    }
    let mut next = 0;
    let mut at = line.start;
    let ranges = line
        .spans
        .iter()
        .map(|&count| {
            if count == 0 {
                return (at, at);
            }
            let start = line.words[next].0;
            let end = line.words[next + count - 1].1;
            next += count;
            at = end;
            (start, end)
        })
        .collect();
    Some(ranges)
}

/// Zamansız sözün otomatik zamanlanmışı (varsa; şarkı ve metin değişmemişse); yoksa olduğu gibi.
/// `text`: sözlerin ham metni (`audio::lyrics::text_for_track`).
pub fn with_auto(
    cache: &AnalysisCache,
    path: &Path,
    lyrics: Lyrics,
    text: &str,
    model_sha256: &str,
) -> Lyrics {
    if lyrics.synced {
        return lyrics;
    }
    let found = FileStamp::of(path).and_then(|stamp| {
        cache
            .load_alignment(path, stamp, model_sha256, text)
            .ok()
            .flatten()
    });
    match found {
        Some(result) => auto_lyrics(&result, lyrics.source),
        None => lyrics,
    }
}

fn text_sha256(text: &str) -> String {
    Sha256::digest(text.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Hizalama kaydının sürümü: hizalayıcının ve emisyonların hesabı birlikte.
fn version() -> i64 {
    ALIGN_VERSION * 1000 + EMISSIONS_VERSION
}

impl AnalysisCache {
    /// Hizalama sonucunu saklar (şarkının eski kaydının yerini alır).
    pub fn store_alignment(
        &self,
        path: &Path,
        stamp: FileStamp,
        model_sha256: &str,
        text: &str,
        result: &AutoAlignment,
    ) -> Result<(), CacheError> {
        let Ok(json) = serde_json::to_string(result) else {
            return Ok(());
        };
        self.lock()?.execute(
            "INSERT OR REPLACE INTO lyrics_alignments
                 (path, file_size, modified, model_sha256, version, text_sha256, result)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                path.to_string_lossy(),
                stamp.size as i64,
                stamp.modified,
                model_sha256,
                version(),
                text_sha256(text),
                json,
            ],
        )?;
        Ok(())
    }

    /// `text`'in saklanan hizalaması: dosya, model, hesap ve metin aynıysa.
    pub fn load_alignment(
        &self,
        path: &Path,
        stamp: FileStamp,
        model_sha256: &str,
        text: &str,
    ) -> Result<Option<AutoAlignment>, CacheError> {
        let json: Option<String> = self
            .lock()?
            .query_row(
                "SELECT result FROM lyrics_alignments
                 WHERE path = ?1 AND file_size = ?2 AND modified = ?3 AND model_sha256 = ?4
                   AND version = ?5 AND text_sha256 = ?6",
                params![
                    path.to_string_lossy(),
                    stamp.size as i64,
                    stamp.modified,
                    model_sha256,
                    version(),
                    text_sha256(text),
                ],
                |r| r.get(0),
            )
            .optional()?;
        Ok(json
            .and_then(|j| serde_json::from_str::<AutoAlignment>(&j).ok())
            .filter(AutoAlignment::valid))
    }

    /// Şarkının saklanan emisyonlarının harfleri (kayıt yoksa boş): emisyonlar yeniden hesaplanınca
    /// bunlar da saklanır.
    fn emission_letters(
        &self,
        path: &Path,
        stamp: FileStamp,
        model_sha256: &str,
    ) -> Result<Vec<char>, CacheError> {
        let columns: Option<String> = self
            .lock()?
            .query_row(
                "SELECT columns FROM lyrics_emissions
                 WHERE path = ?1 AND file_size = ?2 AND modified = ?3 AND model_sha256 = ?4
                   AND version = ?5",
                params![
                    path.to_string_lossy(),
                    stamp.size as i64,
                    stamp.modified,
                    model_sha256,
                    EMISSIONS_VERSION
                ],
                |r| r.get(0),
            )
            .optional()?;
        Ok(columns
            .map(|c| c.chars().filter(|&c| c != ' ').collect())
            .unwrap_or_default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::lyrics_align::{Emissions, Vocabulary};
    use crate::analysis::lyrics_model::{
        file_sha256, FRAME_SAMPLES, MODEL_FILE, SAMPLE_RATE, TOKENS_FILE,
    };
    use crate::audio::test_util::{temp_path, write_wav};

    /// Blok uzunluğu (kare): deneme modelinde artı blok 'a', eksi blok 'b' (bkz. `lyrics_model` testleri).
    const BLOCK: usize = 37;

    const LYRICS: &str = "ab ab\nab ab";

    fn model_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/soz-modeli")
    }

    fn slot() -> ModelSlot {
        let dir = model_dir();
        let model = file_sha256(&dir.join(MODEL_FILE)).unwrap();
        let tokens = file_sha256(&dir.join(TOKENS_FILE)).unwrap();
        ModelSlot::new(dir, &model, &tokens)
    }

    /// Modeli açamayan yuva (aynı anahtar): iş modele ihtiyaç duyarsa hata verir.
    fn no_model() -> ModelSlot {
        let real = slot();
        ModelSlot::new(temp_path("olmayan-soz-paketi"), real.model_sha256(), "yok")
    }

    /// `blocks` blok: çift sıradakiler 'a', tekler 'b' (16 kHz mono WAV).
    fn song(name: &str, blocks: usize) -> PathBuf {
        let path = temp_path(name).with_extension("wav");
        write_song(&path, blocks);
        path
    }

    fn write_song(path: &Path, blocks: usize) {
        write_wav(
            path,
            SAMPLE_RATE,
            1,
            blocks * BLOCK * FRAME_SAMPLES,
            |i, _| {
                if (i / FRAME_SAMPLES / BLOCK).is_multiple_of(2) {
                    0.5
                } else {
                    -0.5
                }
            },
        );
    }

    fn run(
        cache: &AnalysisCache,
        path: &Path,
        text: &str,
        slot: &mut ModelSlot,
    ) -> Result<AutoAlignment, JobError> {
        align_track(cache, path, text, slot, &AtomicBool::new(false))
    }

    #[test]
    fn soz_sese_oturur_satirlar_bloklarda() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-oturur", 8);
        let mut slot = slot();
        let result = run(&cache, &path, LYRICS, &mut slot).unwrap();
        assert_eq!(slot.times_opened(), 1);
        assert_eq!(result.lines.len(), 2);
        let block = BLOCK as f64 * 0.02;
        // İkinci satır dördüncü blokta başlar; her kelime bir 'a' ve bir 'b' bloğu.
        assert!(result.lines[0].start < 0.1, "{:?}", result.lines[0]);
        assert!(
            (result.lines[1].start - 4.0 * block).abs() < 0.1,
            "{:?}",
            result.lines[1]
        );
        assert!(
            (result.lines[0].words[1].0 - 2.0 * block).abs() < 0.1,
            "{:?}",
            result.lines[0]
        );
        assert_eq!(result.lines[0].text, "ab ab");
        assert!(result.valid());
    }

    #[test]
    fn ayni_soz_ikinci_kez_hesaplanmaz() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-ikinci", 8);
        let first = run(&cache, &path, LYRICS, &mut slot()).unwrap();
        let mut none = no_model();
        let again = run(&cache, &path, LYRICS, &mut none).unwrap();
        assert_eq!(again, first);
        assert_eq!(none.times_opened(), 0);
    }

    #[test]
    fn soz_duzeltilince_model_yeniden_calismaz() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-duzelt", 8);
        run(&cache, &path, LYRICS, &mut slot()).unwrap();
        // Satırlar birleşti: yeni metin, aynı emisyonlar; model açılmaz.
        let mut none = no_model();
        let edited = run(&cache, &path, "ab ab ab ab", &mut none).unwrap();
        assert_eq!(none.times_opened(), 0);
        assert_eq!(edited.lines.len(), 1);
        let stamp = FileStamp::of(&path).unwrap();
        let sha = none.model_sha256();
        assert!(cache
            .load_alignment(&path, stamp, sha, "ab ab ab ab")
            .unwrap()
            .is_some());
        // Şarkı başına tek kayıt: eski metnin sonucu artık yok.
        assert!(cache
            .load_alignment(&path, stamp, sha, LYRICS)
            .unwrap()
            .is_none());
    }

    #[test]
    fn dosya_degisince_yeniden_hesaplanir() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-degisen", 8);
        let mut real = slot();
        run(&cache, &path, LYRICS, &mut real).unwrap();
        // Aynı ad, başka uzunluk: damga değişir, önbellek kullanılmaz.
        write_song(&path, 10);
        let stamp = FileStamp::of(&path).unwrap();
        assert!(cache
            .load_alignment(&path, stamp, real.model_sha256(), LYRICS)
            .unwrap()
            .is_none());
        assert!(matches!(
            run(&cache, &path, LYRICS, &mut no_model()),
            Err(JobError::Model(_))
        ));
        assert!(run(&cache, &path, LYRICS, &mut real).is_ok());
    }

    #[test]
    fn kelimesiz_soz_eksik_dosya_ve_iptal() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-hatalar", 8);
        assert!(matches!(
            run(&cache, &path, "[Nakarat]\n...\n", &mut slot()),
            Err(JobError::NoLyrics)
        ));
        assert!(matches!(
            run(&cache, &temp_path("olmayan-sarki.wav"), LYRICS, &mut slot()),
            Err(JobError::FileGone)
        ));
        assert!(matches!(
            align_track(&cache, &path, LYRICS, &mut slot(), &AtomicBool::new(true)),
            Err(JobError::Model(ModelError::Cancelled))
        ));
        // İptal edilen iş sonuç bırakmaz.
        let stamp = FileStamp::of(&path).unwrap();
        assert!(cache
            .load_alignment(&path, stamp, slot().model_sha256(), LYRICS)
            .unwrap()
            .is_none());
    }

    #[test]
    fn model_birakilinca_gerekince_yeniden_acilir() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let mut slot = slot();
        run(&cache, &song("soz-is-birak-1", 8), LYRICS, &mut slot).unwrap();
        assert!(slot.is_loaded());
        slot.release();
        assert!(!slot.is_loaded());
        run(&cache, &song("soz-is-birak-2", 8), LYRICS, &mut slot).unwrap();
        assert_eq!(slot.times_opened(), 2);
    }

    /// Satırın `spans`'ı metnin gerçek hazırlığından ("21:30" üç söylenen kelime).
    fn line(text: &str, words: Vec<(f64, f64)>, confidence: f64, skipped: bool) -> AutoLine {
        AutoLine {
            text: text.to_owned(),
            spans: prepare(text)
                .first()
                .map_or_else(Vec::new, |l| l.spans.clone()),
            start: words.first().map_or(5.0, |w| w.0),
            end: words.last().map_or(6.0, |w| w.1),
            words,
            confidence,
            skipped,
        }
    }

    #[test]
    fn gosterim_kelimeleri_kendi_zamanini_alir_tutmazsa_dagitir_guveni_dusukse_tahmini() {
        let result = AutoAlignment {
            verdict: AutoVerdict::PartlyEstimated,
            lines: vec![
                line("Gece uzun,", vec![(1.0, 1.4), (1.5, 2.0)], 0.9, false),
                // "21:30" üç kelime okunur: üçünün başından sonuna.
                line(
                    "21:30 geldi",
                    vec![(3.0, 3.2), (3.2, 3.4), (3.4, 3.6), (3.7, 4.0)],
                    0.9,
                    false,
                ),
                line(
                    "az güvenli",
                    vec![(5.0, 5.5), (5.6, 6.0)],
                    LOW_CONFIDENCE / 2.0,
                    false,
                ),
                line("bulunamadı", Vec::new(), 0.0, true),
                // Sayılar tutmuyor (bozuk kayıt): satır içinde dağıtılır.
                AutoLine {
                    spans: vec![1, 1],
                    ..line(
                        "iki kelime",
                        vec![(7.0, 7.5), (7.5, 8.0), (8.0, 8.5)],
                        0.9,
                        false,
                    )
                },
            ],
        };
        let lyrics = auto_lyrics(&result, LyricsSource::User);
        assert_eq!(lyrics.source, LyricsSource::User);
        assert!(lyrics.synced);
        assert_eq!(lyrics.auto, Some(AutoVerdict::PartlyEstimated));
        let first = &lyrics.lines[0];
        assert!(!first.estimated && !first.uncertain);
        let words: Vec<(f64, f64, &str)> = first
            .words
            .iter()
            .map(|w| (w.start, w.end, w.text.as_str()))
            .collect();
        assert_eq!(words, [(1.0, 1.4, "Gece "), (1.5, 2.0, "uzun,")]);
        let second = &lyrics.lines[1];
        assert!(!second.estimated && !second.uncertain);
        let words: Vec<(f64, f64, &str)> = second
            .words
            .iter()
            .map(|w| (w.start, w.end, w.text.as_str()))
            .collect();
        assert_eq!(words, [(3.0, 3.6, "21:30 "), (3.7, 4.0, "geldi")]);
        assert!(lyrics.lines[2].uncertain && !lyrics.lines[2].estimated);
        assert!(lyrics.lines[3].uncertain && lyrics.lines[3].estimated);
        let broken = &lyrics.lines[4];
        assert!(broken.estimated && !broken.uncertain);
        assert_eq!(broken.words.len(), 2);
        assert!(broken.words.iter().all(|w| w.start >= 7.0 && w.end <= 8.5));
    }

    #[test]
    fn zamansiz_soz_otomatik_zamanlisiyla_degisir() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-gosterim", 8);
        let mut slot = slot();
        run(&cache, &path, LYRICS, &mut slot).unwrap();
        let sha = slot.model_sha256().to_owned();
        let plain = crate::audio::lyrics::parse(LYRICS, LyricsSource::Embedded, None);
        assert!(!plain.synced);
        let shown = with_auto(&cache, &path, plain.clone(), LYRICS, &sha);
        assert!(shown.synced);
        assert_eq!(shown.source, LyricsSource::Embedded);
        assert!(shown.auto.is_some());
        // Başka metin, başka model ya da zaten zamanlı söz: olduğu gibi.
        assert_eq!(with_auto(&cache, &path, plain.clone(), "ab", &sha), plain);
        assert_eq!(
            with_auto(&cache, &path, plain.clone(), LYRICS, "baska"),
            plain
        );
        let timed = crate::audio::lyrics::parse("[00:01.00]ab", LyricsSource::File, None);
        assert_eq!(with_auto(&cache, &path, timed.clone(), LYRICS, &sha), timed);
    }

    #[test]
    fn bozuk_hizalama_kaydi_yok_sayilir() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-bozuk", 4);
        let stamp = FileStamp::of(&path).unwrap();
        let good = AutoAlignment {
            verdict: AutoVerdict::Good,
            lines: vec![line("ab", vec![(1.0, 2.0)], 1.0, false)],
        };
        cache
            .store_alignment(&path, stamp, "m", "ab", &good)
            .unwrap();
        assert_eq!(
            cache.load_alignment(&path, stamp, "m", "ab").unwrap(),
            Some(good)
        );
        let bad_lines = [
            line("ab", vec![(2.0, 1.0)], 1.0, false),
            line("ab", vec![(-1.0, 1.0)], 1.0, false),
            line("ab", vec![(1.0, f64::INFINITY)], 1.0, false),
            line("ab", vec![(1.0, 2.0)], 1.5, false),
            AutoLine {
                start: 3.0,
                end: 2.0,
                ..line("ab", Vec::new(), 1.0, false)
            },
        ];
        for bad in bad_lines {
            let result = AutoAlignment {
                verdict: AutoVerdict::Good,
                lines: vec![bad.clone()],
            };
            cache
                .store_alignment(&path, stamp, "m", "ab", &result)
                .unwrap();
            assert!(
                cache
                    .load_alignment(&path, stamp, "m", "ab")
                    .unwrap()
                    .is_none(),
                "{bad:?}"
            );
        }
        cache
            .lock_for_test()
            .execute("UPDATE lyrics_alignments SET result = 'bozuk'", [])
            .unwrap();
        assert!(cache
            .load_alignment(&path, stamp, "m", "ab")
            .unwrap()
            .is_none());
    }

    #[test]
    fn emisyonlarin_eski_harfleri_okunur() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("soz-is-harfler", 4);
        let stamp = FileStamp::of(&path).unwrap();
        assert!(cache
            .emission_letters(&path, stamp, "m")
            .unwrap()
            .is_empty());
        let vocab = Vocabulary {
            blank: 0,
            space: Some(1),
            letters: "abλж".chars().zip(2..).collect(),
        };
        let full = Emissions {
            frames: 3,
            columns: 6,
            log_probs: vec![-1.0; 18],
            frame_secs: 0.02,
        };
        let stored = StoredEmissions::select(&full, &vocab, "λ".chars()).unwrap();
        cache.store_emissions(&path, stamp, "m", &stored).unwrap();
        let mut letters = cache.emission_letters(&path, stamp, "m").unwrap();
        letters.sort_unstable();
        assert_eq!(letters, ['a', 'b', 'λ']);
        // Başka damga ya da model: yok.
        let other = FileStamp {
            modified: stamp.modified + 1,
            ..stamp
        };
        assert!(cache
            .emission_letters(&path, other, "m")
            .unwrap()
            .is_empty());
        assert!(cache
            .emission_letters(&path, stamp, "n")
            .unwrap()
            .is_empty());
    }
}

/// Bağımsız inceleme: söz zamanlama işinin karşı örnekleri (yazarın testlerinden ayrı). Rastgele
/// (tohumlu) söz metinleri → `prepare` → yapay emisyonlar → `align` → `AutoAlignment::new` →
/// `auto_lyrics`; kayıt/okuma ve deneme modeliyle uçtan uca.
#[cfg(test)]
mod inceleme_karsi_ornekler {
    use super::*;
    use crate::analysis::lyrics_align::{Emissions, Vocabulary};
    use crate::analysis::lyrics_cache::BASE_LETTERS;
    use crate::analysis::lyrics_model::{
        file_sha256, FRAME_SAMPLES, MODEL_FILE, SAMPLE_RATE, TOKENS_FILE,
    };
    use crate::analysis::lyrics_text::{detect_language, prepare_as, Language};
    use crate::audio::test_util::{temp_path, write_wav};

    const DT: f64 = 0.02;
    const EPS: f64 = 1e-9;

    /// Tohumlu xorshift.
    struct Rng(u64);

    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn below(&mut self, n: usize) -> usize {
            (self.next() % n as u64) as usize
        }
        fn chance(&mut self, p: f64) -> bool {
            (self.next() % 10_000) as f64 / 10_000.0 < p
        }
        fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
            items[self.below(items.len())]
        }
    }

    /// Söz satırları: Türkçe, İngilizce, rakamlı, tireli, emojili, başka alfabe, görünmez boşluklu,
    /// ayrışık harfli.
    const LYRIC_LINES: &[&str] = &[
        "Gece uzun, yollar ıssız",
        "Seni sevdim İstanbul'da",
        "Gel bana 21:30'da",
        "Saat 3'te buluşalım",
        "Yirmi yıl geçti 1990'dan beri",
        "Şu çılgın gönlüm",
        "Ah - of - aman",
        "Bir — iki — üç",
        "Twenty-one pilots — on stage",
        "Hip-hop & you don't stop",
        "This/that love",
        "I was born in 1984",
        "Rock 'n' roll all night",
        "We're the 99%",
        "Seni seviyorum ❤️",
        "😢 21 gece",
        "♪ la la la ♪",
        "Привет мир",
        "こんにちは 世界",
        "Ｅｖｅｒｙ ｎｉｇｈｔ",
        "Kalbim\u{a0}senin\u{200b}için",
        "Yar   gel\tbeni bul",
        "(Arka vokal burada)",
        "S\u{327}imdi I\u{307}stanbul",
    ];
    /// Söylenmeyen satırlar: başlık, künye, tekrar işareti, yalnızca noktalama, boş.
    const OTHER_LINES: &[&str] = &[
        "[Nakarat]",
        "Nakarat:",
        "[Verse 1: Biri & Öteki]",
        "[Chorus x2]",
        "Söz-Müzik: Biri",
        "(x2)",
        "Tekrar",
        "...",
        "—",
        "♪",
        "❤️❤️❤️",
        "",
        "",
    ];

    fn random_text(rng: &mut Rng) -> String {
        let count = 1 + rng.below(14);
        let newline = if rng.chance(0.4) { "\r\n" } else { "\n" };
        let mut out = String::new();
        if rng.chance(0.1) {
            out.push('\u{feff}');
        }
        for _ in 0..count {
            let line = if rng.chance(0.65) {
                let base = rng.pick(LYRIC_LINES).to_string();
                match rng.below(8) {
                    0 => format!("{base} (x2)"),
                    1 => format!("{base}  "),
                    _ => base,
                }
            } else {
                rng.pick(OTHER_LINES).to_string()
            };
            out.push_str(&line);
            out.push_str(newline);
        }
        if rng.chance(0.5) {
            out.truncate(out.trim_end().len());
        }
        out
    }

    fn vocabulary() -> Vocabulary {
        Vocabulary {
            blank: 0,
            space: Some(1),
            letters: BASE_LETTERS.chars().zip(2..).collect(),
        }
    }

    /// Yapay şarkı: satırların çoğu söylenir (harf başına 2–4 kare), bazıları atlanır; aralarda
    /// sessizlik, ara sıra gürültü harfi ve bulanık kare.
    fn emissions_for(rng: &mut Rng, lines: &[Vec<String>], vocab: &Vocabulary) -> Emissions {
        let columns = vocab.letters.len() + 2;
        let mut targets: Vec<usize> = vec![0; 5 + rng.below(30)];
        for line in lines {
            if !rng.chance(0.85) {
                continue;
            }
            for (w, word) in line.iter().enumerate() {
                if w > 0 {
                    targets.push(1);
                }
                for c in word.chars() {
                    if let Some(&col) = vocab.letters.get(&c) {
                        let frames = 2 + rng.below(3);
                        targets.extend(std::iter::repeat_n(col, frames));
                        targets.push(0);
                    }
                }
            }
            targets.extend(std::iter::repeat_n(0, 5 + rng.below(40)));
            if rng.chance(0.2) {
                targets.push(2 + rng.below(vocab.letters.len()));
                targets.push(0);
            }
        }
        targets.extend(std::iter::repeat_n(0, 10));
        let sharp = 0.97f64;
        let mut log_probs = Vec::with_capacity(targets.len() * columns);
        for &target in &targets {
            let fuzzy = rng.chance(0.05);
            for col in 0..columns {
                let p = if fuzzy {
                    1.0 / columns as f64
                } else if col == target {
                    sharp
                } else {
                    (1.0 - sharp) / (columns - 1) as f64
                };
                log_probs.push(p.ln() as f32);
            }
        }
        Emissions {
            frames: targets.len(),
            columns,
            log_probs,
            frame_secs: DT,
        }
    }

    fn tokens(text: &str) -> Vec<&str> {
        text.split_inclusive(' ')
            .filter(|w| !w.trim().is_empty())
            .collect()
    }

    /// Bir vaka: metin, hazırlanan satırlar, hizalama sonucu, gösterim, şarkının süresi.
    struct Case {
        text: String,
        prepared: Vec<AlignLine>,
        result: AutoAlignment,
        shown: Lyrics,
        total_secs: f64,
    }

    fn cases(count: usize, seed: u64) -> Vec<Case> {
        let mut rng = Rng(seed);
        let vocab = vocabulary();
        let mut out = Vec::new();
        for _ in 0..count {
            let text = random_text(&mut rng);
            let prepared = prepare(&text);
            let words: Vec<Vec<String>> = prepared.iter().map(|l| l.words.clone()).collect();
            let em = emissions_for(&mut rng, &words, &vocab);
            let total_secs = em.frames as f64 * em.frame_secs;
            let Ok(alignment) = align(&em, &vocab, &words) else {
                continue;
            };
            let result = AutoAlignment::new(&prepared, &alignment);
            let shown = auto_lyrics(&result, LyricsSource::User);
            out.push(Case {
                text,
                prepared,
                result,
                shown,
                total_secs,
            });
        }
        out
    }

    const SEED: u64 = 0x9e37_79b9_7f4a_7c15;

    #[test]
    fn uretec_degismezleri_tutar() {
        let cases = cases(400, SEED);
        assert!(cases.len() > 300, "çok az vaka hizalandı: {}", cases.len());
        let (mut matched, mut estimated, mut skipped) = (0, 0, 0);
        let cache = AnalysisCache::open_in_memory().unwrap();
        let stamp = FileStamp {
            size: 1,
            modified: 1,
        };
        for (n, case) in cases.iter().enumerate() {
            let ctx = format!("{:?}", case.text);
            let r = &case.result;
            // Hazırlanan satırlarla bire bir.
            assert_eq!(r.lines.len(), case.prepared.len(), "{ctx}");
            let mut previous_start = 0.0f64;
            for (line, prep) in r.lines.iter().zip(&case.prepared) {
                // Ekrandaki metin hazırlanan satırın boşlukları teke indirilmiş hali.
                let spaced: Vec<&str> = prep.text.split_whitespace().collect();
                assert_eq!(line.text, spaced.join(" "), "{ctx}");
                assert!(!line.text.contains('\r') && !line.text.is_empty(), "{ctx}");
                assert_eq!(line.words.len(), prep.words.len(), "{ctx}");
                assert!(line.start.is_finite() && line.end.is_finite(), "{ctx}");
                assert!(0.0 <= line.start && line.start <= line.end, "{ctx}");
                assert!(line.end <= case.total_secs + EPS, "{ctx}");
                assert!(
                    line.start + EPS >= previous_start,
                    "satır geri gitti: {ctx}"
                );
                previous_start = line.start;
                assert!((0.0..=1.0).contains(&line.confidence), "{ctx}");
                let mut cursor = line.start;
                for &(s, e) in &line.words {
                    assert!(
                        s <= e && s + EPS >= cursor,
                        "kelime geri gitti: {ctx} {line:?}"
                    );
                    assert!(
                        s + EPS >= line.start && e <= line.end + EPS,
                        "{ctx} {line:?}"
                    );
                    cursor = s;
                }
                if line.skipped {
                    skipped += 1;
                    assert_eq!(line.start, line.end, "{ctx}");
                    assert_eq!(line.confidence, 0.0, "{ctx}");
                }
            }
            assert!(r.valid(), "{ctx}");
            // Kayıt ve geri okuma.
            let path = PathBuf::from(format!("inceleme-{n}"));
            cache
                .store_alignment(&path, stamp, "m", &case.text, r)
                .unwrap();
            assert_eq!(
                cache
                    .load_alignment(&path, stamp, "m", &case.text)
                    .unwrap()
                    .as_ref(),
                Some(r),
                "{ctx}"
            );
            // Gösterim.
            let shown = &case.shown;
            assert!(shown.synced && shown.auto == Some(r.verdict), "{ctx}");
            assert_eq!(shown.lines.len(), r.lines.len(), "{ctx}");
            for (out, line) in shown.lines.iter().zip(&r.lines) {
                assert_eq!(
                    out.uncertain,
                    line.skipped || line.confidence < LOW_CONFIDENCE,
                    "{ctx}"
                );
                assert_eq!((out.start, out.end), (line.start, line.end), "{ctx}");
                let joined: String = out.words.iter().map(|w| w.text.as_str()).collect();
                assert_eq!(joined, tokens(&line.text).concat(), "{ctx}");
                let mut cursor = out.start;
                for w in &out.words {
                    assert!(w.start.is_finite() && w.end.is_finite(), "{ctx}");
                    assert!(w.start <= w.end && w.start + EPS >= cursor, "{ctx} {out:?}");
                    assert!(
                        w.start + EPS >= out.start && w.end <= out.end + EPS,
                        "{ctx}"
                    );
                    cursor = w.start;
                }
                if out.estimated {
                    estimated += 1;
                } else {
                    matched += 1;
                    assert!(!line.skipped, "{ctx}");
                    // Ekrandaki her kelimeye bir zaman (söylenen kelime sayısı farklı olabilir).
                    assert_eq!(out.words.len(), tokens(&line.text).len(), "{ctx}");
                }
            }
        }
        // Üretecin kapsamı: üç yol da sınandı.
        assert!(
            matched > 100 && estimated > 100 && skipped > 20,
            "{matched} {estimated} {skipped}"
        );
    }

    /// Ekrandaki bir kelimenin söylenen kaç kelimeye açıldığı (aynı dilde, tek başına hazırlanarak).
    fn spoken_count(token: &str, language: Language) -> usize {
        prepare_as(token.trim(), language)
            .first()
            .map_or(0, |l| l.words.len())
    }

    /// BULGU: ekrandaki kelime sayısı söylenen kelime sayısına tesadüfen eşitse ("Twenty-one" iki
    /// kelime, "—" sıfır kelime) zamanlar bire bir dağıtılır ve kayar. Düzeltmeden sonra (yazarın
    /// uyarlaması): tahmini olmayan her satırda ekrandaki her kelime, bağımsız sayılan kendi söylenen
    /// kelimelerinin ilkinin başından sonuncusunun sonuna; söylenmeyen kelime önceki kelimenin
    /// bittiği anda, sıfır uzunlukta.
    #[test]
    fn uretec_her_ekran_kelimesi_kendi_soylenen_kelimelerinin_zamanini_alir() {
        let mut checked = 0;
        for case in cases(400, SEED) {
            let language = detect_language(&case.text);
            for (out, line) in case.shown.lines.iter().zip(&case.result.lines) {
                if out.estimated {
                    continue;
                }
                let counts: Vec<usize> = tokens(&line.text)
                    .iter()
                    .map(|t| spoken_count(t, language))
                    .collect();
                assert_eq!(
                    counts.iter().sum::<usize>(),
                    line.words.len(),
                    "{:?}",
                    line.text
                );
                assert_eq!(out.words.len(), counts.len(), "{:?}", line.text);
                let mut next = 0;
                let mut at = line.start;
                for (word, &count) in out.words.iter().zip(&counts) {
                    let want = if count == 0 {
                        (at, at)
                    } else {
                        let span = (line.words[next].0, line.words[next + count - 1].1);
                        next += count;
                        at = span.1;
                        span
                    };
                    assert_eq!(
                        (word.start, word.end),
                        want,
                        "satır {:?}, kelime {:?}: sayılar {counts:?}",
                        line.text,
                        word.text
                    );
                }
                checked += 1;
            }
        }
        assert!(checked > 100, "yalnızca {checked} satır denetlendi");
    }

    /// Aynı bulgu, somut girdiyle: "—" "pilots"un zamanını, "pilots" "one"ın zamanını alır.
    #[test]
    fn tireli_kelime_ve_tek_basina_tire_zamanlari_kaydirmaz() {
        let prepared = prepare("Twenty-one pilots — on stage");
        assert_eq!(
            prepared[0].words,
            ["twenty", "one", "pilots", "on", "stage"]
        );
        let result = AutoAlignment {
            verdict: AutoVerdict::Good,
            lines: vec![AutoLine {
                text: prepared[0].text.clone(),
                spans: prepared[0].spans.clone(),
                start: 1.0,
                end: 6.0,
                words: vec![(1.0, 1.5), (1.5, 2.0), (2.0, 3.0), (4.0, 4.5), (4.5, 6.0)],
                confidence: 0.9,
                skipped: false,
            }],
        };
        let shown = auto_lyrics(&result, LyricsSource::User);
        let words: Vec<(&str, f64, f64)> = shown.lines[0]
            .words
            .iter()
            .map(|w| (w.text.as_str(), w.start, w.end))
            .collect();
        let pilots = words.iter().find(|w| w.0.trim() == "pilots").unwrap();
        assert_eq!(
            (pilots.1, pilots.2),
            (2.0, 3.0),
            "\"pilots\" kendi zamanını almalı: {words:?}"
        );
    }

    fn slot() -> ModelSlot {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/soz-modeli");
        let model = file_sha256(&dir.join(MODEL_FILE)).unwrap();
        let tokens = file_sha256(&dir.join(TOKENS_FILE)).unwrap();
        ModelSlot::new(dir, &model, &tokens)
    }

    /// Deneme modeli: artı blok 'a', eksi blok 'b' (37 kare).
    fn song(name: &str, blocks: usize) -> PathBuf {
        const BLOCK: usize = 37;
        let path = temp_path(name).with_extension("wav");
        write_wav(
            &path,
            SAMPLE_RATE,
            1,
            blocks * BLOCK * FRAME_SAMPLES,
            |i, _| {
                if (i / FRAME_SAMPLES / BLOCK).is_multiple_of(2) {
                    0.5
                } else {
                    -0.5
                }
            },
        );
        path
    }

    /// BULGU, uçtan uca deneme modeliyle: "ab-ab" iki söylenen kelime, "❤" hiç; ekranda üç kelime,
    /// sözde üç söylenen kelime. "ab-ab" iki kelimenin ikisini de kapsamalı.
    #[test]
    fn uctan_uca_tireli_kelime_iki_soylenen_kelimeyi_kapsar() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("inceleme-tireli", 8);
        let text = "ab-ab ❤ ab\nab";
        let result =
            align_track(&cache, &path, text, &mut slot(), &AtomicBool::new(false)).unwrap();
        assert_eq!(result.lines[0].words.len(), 3);
        let shown = auto_lyrics(&result, LyricsSource::User);
        let first = &shown.lines[0];
        assert_eq!(first.words[0].text, "ab-ab ");
        assert_eq!(
            first.words[0].end, result.lines[0].words[1].1,
            "\"ab-ab\" ikinci 'ab'nin sonunda bitmeli: {first:?} / {:?}",
            result.lines[0]
        );
    }

    /// Uçtan uca: modelin tanımadığı satır atlanır, zamanı komşularının arasında; hiç tanımadığı söz
    /// `NoLetters` verir ve modeli yeniden çalıştırmaz (emisyonlar önbellekte).
    #[test]
    fn uctan_uca_taninmayan_satir_ve_soz() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = song("inceleme-taninmayan", 8);
        let mut slot = slot();
        let text = "ab ab\r\nxyz qq\r\nab ab\r\n";
        let result = align_track(&cache, &path, text, &mut slot, &AtomicBool::new(false)).unwrap();
        assert_eq!(result.lines.len(), 3);
        assert!(result.lines[1].skipped);
        assert!(result.lines[1].start + EPS >= result.lines[0].end);
        assert!(result.lines[1].start <= result.lines[2].start + EPS);
        let shown = auto_lyrics(&result, LyricsSource::File);
        assert!(shown.lines[1].uncertain && shown.lines[1].estimated);
        assert!(result.valid());
        let opened = slot.times_opened();
        slot.release();
        let none = align_track(&cache, &path, "xyz qq", &mut slot, &AtomicBool::new(false));
        assert!(
            matches!(none, Err(JobError::Align(AlignError::NoLetters))),
            "{none:?}"
        );
        assert_eq!(slot.times_opened(), opened);
        // Anahtar ham metin: CRLF'li metnin sonucu LF'li metinle bulunmaz. Sonraki PR aynı metni
        // (`text_for_track`) hem işe hem `with_auto`'ya vermeli.
        let stamp = FileStamp::of(&path).unwrap();
        let sha = slot.model_sha256().to_owned();
        assert!(cache
            .load_alignment(&path, stamp, &sha, &text.replace("\r\n", "\n"))
            .unwrap()
            .is_none());
        assert!(cache
            .load_alignment(&path, stamp, &sha, text)
            .unwrap()
            .is_some());
    }

    /// BULGU (düşük): `valid` satırların sırasını ve kelimelerin satırın içinde olduğunu denetlemez.
    /// Geri giden satırlar arayüzün ikili aramasını (`lastStartedBefore`) bozar.
    #[test]
    fn sirasi_bozuk_ya_da_kelimesi_satir_disinda_kayit_yok_sayilir() {
        let cache = AnalysisCache::open_in_memory().unwrap();
        let path = PathBuf::from("inceleme-bozuk-sira");
        let stamp = FileStamp {
            size: 1,
            modified: 1,
        };
        let line = |start: f64, end: f64, words: Vec<(f64, f64)>| AutoLine {
            text: "ab".into(),
            spans: vec![1],
            start,
            end,
            words,
            confidence: 1.0,
            skipped: false,
        };
        let bad = [
            // Satırlar geri gidiyor.
            vec![
                line(5.0, 6.0, vec![(5.0, 6.0)]),
                line(1.0, 2.0, vec![(1.0, 2.0)]),
            ],
            // Kelime satırın dışında.
            vec![line(1.0, 2.0, vec![(8.0, 9.0)])],
        ];
        for lines in bad {
            let result = AutoAlignment {
                verdict: AutoVerdict::Good,
                lines,
            };
            cache
                .store_alignment(&path, stamp, "m", "ab", &result)
                .unwrap();
            assert!(
                cache
                    .load_alignment(&path, stamp, "m", "ab")
                    .unwrap()
                    .is_none(),
                "{result:?}"
            );
        }
    }
}
