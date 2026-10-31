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
//! - **Gösterim** ([`auto_lyrics`]): satırlar hazırlanan sözün satırlarıdır (nakarat ve "(x2)" açılmış);
//!   kelime zamanları modelden. Ekrandaki kelimeler söylenen kelimelerle bire bir eşleşmezse ("21:30"
//!   → "yirmi bir otuz") satırın kelimeleri satır içinde hece sayısıyla dağıtılır ("tahmini"). Güveni
//!   düşük ya da şarkıda bulunamayan satır `uncertain` (ekranda "tahmini").

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
            self.opened += 1;
            self.model = Some(LyricsModel::open(
                &self.dir,
                &self.model_sha256,
                &self.tokens_sha256,
            )?);
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
    /// Ekranda görünecek metin (hazırlanan sözün satırı).
    pub text: String,
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
                    text: line.text.clone(),
                    start: timing.start,
                    end: timing.end,
                    words: timing.words.iter().map(|w| (w.start, w.end)).collect(),
                    confidence: timing.confidence,
                    skipped: timing.skipped,
                })
                .collect(),
        }
    }

    /// Okunan kaydın değerleri anlamlı mı (kayıt güvenilmez sayılır)?
    fn valid(&self) -> bool {
        let span = |start: f64, end: f64| {
            start.is_finite() && end.is_finite() && 0.0 <= start && start <= end
        };
        self.lines.len() <= MAX_LINES
            && self.lines.iter().all(|line| {
                span(line.start, line.end)
                    && (0.0..=1.0).contains(&line.confidence)
                    && line.words.iter().all(|&(s, e)| span(s, e))
            })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum JobError {
    #[error("sözde hizalanacak kelime yok")]
    NoLyrics,
    #[error("şarkı dosyası bulunamadı")]
    FileGone,
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
            let model = slot.get()?;
            let audio = decode_mono(path, cancel)?;
            let full = model.emissions(&audio, cancel)?;
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
            let tokens: Vec<&str> = line
                .text
                .split_inclusive(' ')
                .filter(|w| !w.trim().is_empty())
                .collect();
            let (words, estimated) = if !line.skipped && tokens.len() == line.words.len() {
                let words = tokens
                    .iter()
                    .zip(&line.words)
                    .map(|(text, &(start, end))| LyricWord {
                        start,
                        end,
                        text: (*text).to_owned(),
                    })
                    .collect();
                (words, false)
            } else {
                (estimate_words(&line.text, line.start, line.end), true)
            };
            LyricLine {
                start: line.start,
                end: line.end,
                text: line.text.clone(),
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

    fn line(text: &str, words: Vec<(f64, f64)>, confidence: f64, skipped: bool) -> AutoLine {
        AutoLine {
            text: text.to_owned(),
            start: words.first().map_or(5.0, |w| w.0),
            end: words.last().map_or(6.0, |w| w.1),
            words,
            confidence,
            skipped,
        }
    }

    #[test]
    fn gosterim_kelimeleri_eslesmezse_dagitir_guveni_dusukse_tahmini() {
        let result = AutoAlignment {
            verdict: AutoVerdict::PartlyEstimated,
            lines: vec![
                line("Gece uzun,", vec![(1.0, 1.4), (1.5, 2.0)], 0.9, false),
                // "21:30" üç kelime okunur: ekrandaki iki kelimeyle eşleşmez.
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
        assert!(second.estimated && !second.uncertain);
        assert_eq!(second.words.len(), 2);
        assert!(second.words.iter().all(|w| w.start >= 3.0 && w.end <= 4.0));
        assert!(lyrics.lines[2].uncertain && !lyrics.lines[2].estimated);
        assert!(lyrics.lines[3].uncertain && lyrics.lines[3].estimated);
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
