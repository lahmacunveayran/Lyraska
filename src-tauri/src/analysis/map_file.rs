//! Açık şarkı haritası biçimi: Lyraska'nın şarkı haritasının (vuruşlar, ölçü, bölümler, droplar,
//! enerji, ton) belgelenmiş, sürümlü JSON dosyası. Biçim belgesi: `docs/SARKI-HARITASI.md`.
//!
//! - **Ses ve şarkı sözü içermez** (telif): yalnızca zamanlar ve sayılar, şarkının adı ve süresi.
//!   Dosya yolu da yoktur (başkasının bilgisayarına gidebilir).
//! - **Ses parmak iziyle eşleşir** ([`super::fingerprint`]): dosya adı ya da etiket değil, sesin
//!   kendisi. Aynı kaydın MP3'ü ile FLAC'ı eşleşir; canlı kayıt ya da başka şarkı eşleşmez.
//!   Eşleşmede bulunan kayma (başka baskıda başa eklenmiş sessizlik gibi) zamanlara uygulanır.
//! - **İnsanların düzelttiği haritalar** paylaşılabilir: işaretleme aracıyla işaretlenmiş
//!   vuruşlar ve droplar dışa aktarılırken analizin yerine geçer (`source: "edited"`).
//! - İçe aktarılan harita programın analizinin **önüne geçer** (görseller, bilgi kartı, şarkı
//!   haritası şeridi) ama analiz önbelleğine yazılmaz: kaldırılınca programın analizi geri gelir.
//! - Kötü niyetli dosyaya karşı: boyut, sayı ve değer aralığı sınırları, artan sıra denetimi
//!   ([`MapFile::validate`]). Daha yeni bir sürümün dosyası anlaşılır bir hatayla reddedilir.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::annotation::{fnv1a, Annotation};
use super::beats::BeatGrid;
use super::cache::FileStamp;
use super::fingerprint::{self, BandPrint, ChromaPrint, TrackPrint, Verdict};
use super::key::MusicalKey;
use super::structure::{Section, SongMap};

/// Dosyanın biçim adı (`format` alanı).
pub const FORMAT_NAME: &str = "lyraska-sarki-haritasi";
/// Bu programın yazdığı ve okuyabildiği en yeni sürüm.
pub const VERSION: u32 = 1;
/// Okunan dosyanın en büyük boyutu (bayt). 4 saatlik bir şarkının haritası ~1,5 MB.
pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
/// Dosyadaki şarkının en uzun süresi (saniye).
const MAX_DURATION_SECS: f64 = 4.0 * 3600.0;
const MAX_BEATS: usize = 60_000;
const MAX_SECTIONS: usize = 2_000;
const MAX_DROPS: usize = 1_000;
const MAX_LABEL: usize = 1_000;
const MAX_METER: usize = 16;
const MAX_GROUPS: usize = 16;
/// Dosyada zamanlar saniyenin bu kadarına yuvarlanır (mikrosaniye): senkron hedefinin (±20 ms) çok
/// altında; dosya kısa ve okunur kalır.
const TIME_STEPS_PER_SECOND: f64 = 1e6;
/// Zamanların şarkı süresini aşabileceği pay (saniye).
const TIME_SLACK: f64 = 0.5;
/// Dosyadaki süre ile yerel şarkının süresi en çok bu kadar (ya da %1) farklı olabilir: bir
/// "radio edit"in haritası albüm sürümüne uygulanmasın.
const DURATION_TOLERANCE_SECS: f64 = 2.0;

/// Şarkı haritası dosyası (sürüm 1). Alanların anlamı `docs/SARKI-HARITASI.md`'de.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapFile {
    pub format: String,
    pub version: u32,
    pub app_version: String,
    pub saved_at: String,
    pub track: MapTrack,
    pub fingerprint: MapFingerprint,
    pub source: MapSource,
    pub tempo: MapTempo,
    /// Vuruşlar (saniye, artan).
    pub beats: Vec<f64>,
    pub meter: MapMeter,
    /// Ölçü başları (saniye, artan).
    pub downbeats: Vec<f64>,
    pub sections: Vec<MapSection>,
    pub drops: Vec<MapDrop>,
    /// Saniye başına enerji (0..1).
    pub energy: Vec<f32>,
    #[serde(default)]
    pub key: Option<MapKey>,
}

/// Şarkının bilgisi (yalnızca gösterim için; eşleşme parmak iziyle yapılır).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTrack {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    pub duration_secs: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapFingerprint {
    /// Yöntem ([`fingerprint::METHOD`]).
    pub method: String,
    /// Bant parmak izi: 15 kare/sn, kare başına 6 onaltılık rakam.
    pub bands: String,
    /// Kroma: saniye başına 3 onaltılık rakam (yoksa `null`).
    #[serde(default)]
    pub chroma: Option<String>,
}

/// Haritanın kaynağı.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub enum MapSource {
    /// Programın analizi.
    Analysis,
    /// Bir insanın düzelttiği (işaretleme aracıyla vuruş, drop ya da ton).
    Edited,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTempo {
    pub bpm: f64,
    #[serde(default)]
    pub variable: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapMeter {
    /// Ölçüdeki vuruş sayısı (aksak ölçüde grup sayısı).
    pub beats_per_bar: usize,
    /// İlk tam ölçünün başladığı vuruşun sırası (0..beatsPerBar).
    pub first_downbeat: usize,
    /// Aksak ölçünün sekizlik gruplaması (ör. [2, 2, 2, 3] = 9/8); düzenli ölçüde boş.
    #[serde(default)]
    pub grouping: Vec<u8>,
    /// Ölçü başlarının güveni (0..1).
    pub confidence: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapSection {
    pub start: f64,
    pub end: f64,
    pub energy: f32,
    /// Benzer bölümler aynı etiketi alır (ilk görülme sırasıyla 0, 1, 2…).
    pub label: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapDrop {
    pub time: f64,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapKey {
    /// 0 = Do (C) … 11 = Si (B).
    pub tonic: u8,
    pub minor: bool,
    pub confidence: f32,
}

/// Dosya okuma, doğrulama ve eşleşme hataları (kullanıcıya gösterilir).
#[derive(Debug, thiserror::Error, PartialEq)]
pub enum MapError {
    #[error("Dosya okunamadı: {0}")]
    Read(String),
    #[error("Dosya çok büyük ({0} MB); şarkı haritası en fazla 8 MB olabilir.")]
    TooLarge(u64),
    #[error("Bu bir Lyraska şarkı haritası değil.")]
    NotAMap,
    #[error(
        "Bu harita daha yeni bir Lyraska sürümüyle kaydedilmiş (sürüm {0}); programı güncelleyin."
    )]
    NewerVersion(u32),
    #[error("Haritada geçersiz değer: {0}.")]
    Invalid(&'static str),
    #[error("Haritanın parmak izi bu sürümün tanımadığı bir yöntemle ({0}) üretilmiş.")]
    UnknownMethod(String),
    #[error("Şarkının analizi henüz bitmedi; biraz sonra yeniden deneyin.")]
    NotAnalyzed,
    #[error("Bu şarkıda ritim bulunamadı; haritası yok.")]
    NoRhythm,
    #[error(
        "Bu harita bu şarkıya ait değil: süreler farklı (harita {map:.0} sn, şarkı {track:.0} sn)."
    )]
    DurationMismatch { map: f64, track: f64 },
    #[error("Bu harita bu şarkıya ait değil (benzerlik %{0:.0}).")]
    NoMatch(f64),
}

/// Dışa aktarmak için çalan şarkının analizi.
pub struct AnalysisSnapshot<'a> {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub duration_secs: f64,
    pub sample_rate: u32,
    pub levels: &'a [u8],
    pub meters: &'a [u8],
    pub chroma: Option<&'a [[u8; 12]]>,
    pub beats: &'a BeatGrid,
    pub map: &'a SongMap,
    pub key: Option<MusicalKey>,
    /// Etkin harita bir insanın düzelttiği bir harita (içe aktarılmış) mı?
    pub edited: bool,
}

impl MapFile {
    /// Analizden (ve varsa kullanıcının işaretlerinden) harita. İşaretlenmiş vuruşlar (en az 8)
    /// analizin vuruşlarının yerine geçer ve ölçü, bölüm, drop onlara göre yeniden hesaplanır;
    /// işaretlenmiş droplar ve ton da analizinkinin yerine geçer.
    pub fn from_analysis(snapshot: &AnalysisSnapshot, marks: Option<&Annotation>) -> Self {
        let marked_beats = marks.filter(|m| m.beats.len() >= 8).map(marked_grid);
        let edited_structure = marked_beats.as_ref().and_then(|grid| {
            super::spectrogram::structure_for_beats(snapshot.levels, snapshot.meters, grid, None)
        });
        let (grid, map) = match (&marked_beats, &edited_structure) {
            (Some(grid), Some(map)) => (grid, map),
            _ => (snapshot.beats, snapshot.map),
        };
        let mut edited = snapshot.edited || edited_structure.is_some();
        let mut drops: Vec<MapDrop> = map
            .drops
            .iter()
            .zip(&map.drop_confidence)
            .map(|(&time, &confidence)| MapDrop { time, confidence })
            .collect();
        if let Some(marked) = marks.filter(|m| !m.drops.is_empty()) {
            drops = marked
                .drops
                .iter()
                .map(|&time| MapDrop {
                    time,
                    confidence: 1.0,
                })
                .collect();
            edited = true;
        }
        let key = match marks.and_then(|m| m.key) {
            Some(marked) => {
                edited = true;
                Some(MapKey {
                    tonic: marked.tonic,
                    minor: marked.minor,
                    confidence: 1.0,
                })
            }
            None => snapshot.key.map(|k| MapKey {
                tonic: k.tonic,
                minor: k.minor,
                confidence: k.confidence,
            }),
        };
        let print = TrackPrint::of(snapshot.levels, snapshot.sample_rate, snapshot.chroma);
        let times =
            |values: &[f64]| -> Vec<f64> { values.iter().map(|&t| round_time(t)).collect() };
        for drop in &mut drops {
            drop.time = round_time(drop.time);
        }
        Self {
            format: FORMAT_NAME.to_owned(),
            version: VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_owned(),
            saved_at: crate::diagnostics::timestamp(),
            track: MapTrack {
                title: snapshot.title.clone(),
                artist: snapshot.artist.clone(),
                duration_secs: snapshot.duration_secs,
            },
            fingerprint: MapFingerprint {
                method: fingerprint::METHOD.to_owned(),
                bands: print.bands.to_hex(),
                chroma: print.chroma.map(|c| c.to_hex()),
            },
            source: if edited {
                MapSource::Edited
            } else {
                MapSource::Analysis
            },
            tempo: MapTempo {
                bpm: (grid.bpm * 1e4).round() / 1e4,
                variable: grid.variable_tempo,
            },
            beats: times(&grid.beats),
            meter: MapMeter {
                beats_per_bar: map.meter,
                first_downbeat: map.downbeat_phase,
                grouping: map.grouping.clone(),
                confidence: map.meter_confidence,
            },
            downbeats: times(&map.downbeats),
            sections: map
                .sections
                .iter()
                .map(|s| MapSection {
                    start: round_time(s.start),
                    end: round_time(s.end),
                    energy: s.energy,
                    label: s.label,
                })
                .collect(),
            drops,
            energy: map.energy.clone(),
            key,
        }
    }

    /// Dosyadan okur ve doğrular.
    pub fn read(path: &Path) -> Result<Self, MapError> {
        let size = std::fs::metadata(path)
            .map_err(|e| MapError::Read(e.to_string()))?
            .len();
        if size > MAX_FILE_BYTES {
            return Err(MapError::TooLarge(size.div_ceil(1024 * 1024)));
        }
        let text = std::fs::read_to_string(path).map_err(|e| MapError::Read(e.to_string()))?;
        Self::parse(&text)
    }

    /// Metinden okur ve doğrular. Önce biçim adı ve sürüm okunur: daha yeni sürümün dosyası,
    /// alanları bilinmese de anlaşılır bir hatayla reddedilir.
    pub fn parse(text: &str) -> Result<Self, MapError> {
        if text.len() as u64 > MAX_FILE_BYTES {
            return Err(MapError::TooLarge(
                (text.len() as u64).div_ceil(1024 * 1024),
            ));
        }
        #[derive(Deserialize)]
        struct Header {
            format: String,
            version: u32,
        }
        let header: Header = serde_json::from_str(text).map_err(|_| MapError::NotAMap)?;
        if header.format != FORMAT_NAME {
            return Err(MapError::NotAMap);
        }
        if header.version > VERSION {
            return Err(MapError::NewerVersion(header.version));
        }
        let map: Self = serde_json::from_str(text).map_err(|_| MapError::Invalid("alanlar"))?;
        map.validate()?;
        Ok(map)
    }

    /// Dosya olarak yazılacak metin.
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }

    /// Bütün değerlerin aralıkta, sıralı ve sınırlar içinde olduğunu denetler.
    pub fn validate(&self) -> Result<(), MapError> {
        use MapError::Invalid;
        if self.fingerprint.method != fingerprint::METHOD {
            return Err(MapError::UnknownMethod(
                self.fingerprint.method.chars().take(40).collect(),
            ));
        }
        let duration = self.track.duration_secs;
        if !(duration.is_finite() && duration > 0.0 && duration <= MAX_DURATION_SECS) {
            return Err(Invalid("şarkı süresi"));
        }
        let in_track = |t: f64| t.is_finite() && (-TIME_SLACK..=duration + TIME_SLACK).contains(&t);
        let increasing = |times: &[f64]| {
            times.iter().all(|&t| in_track(t)) && times.windows(2).all(|w| w[0] < w[1])
        };
        let unit = |x: f32| x.is_finite() && (0.0..=1.0).contains(&x);
        if self.beats.len() > MAX_BEATS || !increasing(&self.beats) {
            return Err(Invalid("vuruşlar"));
        }
        if !(self.tempo.bpm.is_finite() && (20.0..=400.0).contains(&self.tempo.bpm)) {
            return Err(Invalid("tempo"));
        }
        let meter = &self.meter;
        if !(1..=MAX_METER).contains(&meter.beats_per_bar)
            || meter.first_downbeat >= meter.beats_per_bar
            || meter.grouping.len() > MAX_GROUPS
            || meter.grouping.iter().any(|&g| !(2..=4).contains(&g))
            || !unit(meter.confidence)
        {
            return Err(Invalid("ölçü"));
        }
        if self.downbeats.len() > self.beats.len().max(1) || !increasing(&self.downbeats) {
            return Err(Invalid("ölçü başları"));
        }
        if self.sections.len() > MAX_SECTIONS
            || self.sections.iter().any(|s| {
                !in_track(s.start) || !in_track(s.end) || s.start >= s.end || !unit(s.energy)
            })
            || self.sections.iter().any(|s| s.label > MAX_LABEL)
            || self
                .sections
                .windows(2)
                .any(|w| w[1].start < w[0].end - 1e-6)
        {
            return Err(Invalid("bölümler"));
        }
        let drop_times: Vec<f64> = self.drops.iter().map(|d| d.time).collect();
        if self.drops.len() > MAX_DROPS
            || !increasing(&drop_times)
            || self.drops.iter().any(|d| !unit(d.confidence))
        {
            return Err(Invalid("droplar"));
        }
        if self.energy.len() as f64 > duration.ceil() + 2.0 || !self.energy.iter().all(|&e| unit(e))
        {
            return Err(Invalid("enerji"));
        }
        if let Some(key) = self.key {
            if key.tonic >= 12 || !unit(key.confidence) {
                return Err(Invalid("ton"));
            }
        }
        let frames = duration * fingerprint::FRAMES_PER_SECOND_FP;
        let bands = BandPrint::from_hex(&self.fingerprint.bands).ok_or(Invalid("parmak izi"))?;
        if bands.words.len() as f64 > frames + 30.0 {
            return Err(Invalid("parmak izi"));
        }
        if let Some(chroma) = &self.fingerprint.chroma {
            let chroma = ChromaPrint::from_hex(chroma).ok_or(Invalid("parmak izi (kroma)"))?;
            if chroma.words.len() as f64 > duration + 2.0 {
                return Err(Invalid("parmak izi (kroma)"));
            }
        }
        Ok(())
    }

    /// Dosyadaki parmak izi.
    pub fn print(&self) -> Option<TrackPrint> {
        Some(TrackPrint {
            bands: BandPrint::from_hex(&self.fingerprint.bands)?,
            chroma: match &self.fingerprint.chroma {
                Some(text) => Some(ChromaPrint::from_hex(text)?),
                None => None,
            },
        })
    }

    /// Haritayı yerel şarkıyla eşleştirir: süre ve parmak izi. Eşleşirse karar (kayma dahil).
    pub fn verify(
        &self,
        track_duration_secs: f64,
        levels: &[u8],
        sample_rate: u32,
        chroma: Option<&[[u8; 12]]>,
    ) -> Result<Verdict, MapError> {
        let tolerance = DURATION_TOLERANCE_SECS.max(0.01 * track_duration_secs);
        if (self.track.duration_secs - track_duration_secs).abs() > tolerance {
            return Err(MapError::DurationMismatch {
                map: self.track.duration_secs,
                track: track_duration_secs,
            });
        }
        let print = self.print().ok_or(MapError::Invalid("parmak izi"))?;
        let verdict = print
            .verify(levels, sample_rate, chroma)
            .ok_or(MapError::NoMatch(0.0))?;
        if verdict.is_match() {
            Ok(verdict)
        } else {
            Err(MapError::NoMatch(100.0 * verdict.similarity()))
        }
    }

    /// Bütün zamanları `offset_secs` kaydırır; şarkının dışına (0'ın altına ya da `duration`
    /// sonrasına) düşenler atılır. Atılan vuruşlar ilk ölçü başının sırasını da kaydırır.
    pub fn shifted(&self, offset_secs: f64, duration_secs: f64) -> Self {
        let inside = |t: f64| (0.0..=duration_secs).contains(&t);
        let shift = |times: &[f64]| -> Vec<f64> {
            times
                .iter()
                .map(|t| t + offset_secs)
                .filter(|&t| inside(t))
                .collect()
        };
        let dropped_beats = self
            .beats
            .iter()
            .take_while(|&&t| t + offset_secs < 0.0)
            .count();
        let bar = self.meter.beats_per_bar.max(1);
        let mut out = self.clone();
        out.beats = shift(&self.beats);
        out.downbeats = shift(&self.downbeats);
        out.meter.first_downbeat = (self.meter.first_downbeat + bar - dropped_beats % bar) % bar;
        out.drops = self
            .drops
            .iter()
            .map(|d| MapDrop {
                time: d.time + offset_secs,
                ..d.clone()
            })
            .filter(|d| inside(d.time))
            .collect();
        out.sections = self
            .sections
            .iter()
            .map(|s| MapSection {
                start: (s.start + offset_secs).max(0.0),
                end: (s.end + offset_secs).min(duration_secs),
                ..s.clone()
            })
            .filter(|s| s.start < s.end)
            .collect();
        // Enerji saniye başına: tam saniyelik kayma kadar kaydırılır (kesir, saniyelik eğride
        // önemsiz).
        let whole = offset_secs.round() as isize;
        out.energy = if whole >= 0 {
            std::iter::repeat_n(self.energy.first().copied().unwrap_or(0.0), whole as usize)
                .chain(self.energy.iter().copied())
                .collect()
        } else {
            self.energy
                .iter()
                .copied()
                .skip((-whole) as usize)
                .collect()
        };
        out.track.duration_secs = duration_secs;
        out
    }

    /// Programın iç türlerine: vuruş ızgarası ve şarkı haritası.
    pub fn rhythm(&self) -> (BeatGrid, SongMap) {
        let grid = BeatGrid {
            bpm: self.tempo.bpm,
            beats: self.beats.clone(),
            variable_tempo: self.tempo.variable,
        };
        let map = SongMap {
            meter: self.meter.beats_per_bar,
            downbeat_phase: self.meter.first_downbeat,
            grouping: self.meter.grouping.clone(),
            meter_confidence: self.meter.confidence,
            downbeats: self.downbeats.clone(),
            sections: self
                .sections
                .iter()
                .map(|s| Section {
                    start: s.start,
                    end: s.end,
                    energy: s.energy,
                    label: s.label,
                })
                .collect(),
            drops: self.drops.iter().map(|d| d.time).collect(),
            drop_confidence: self.drops.iter().map(|d| d.confidence).collect(),
            energy: self.energy.clone(),
        };
        (grid, map)
    }

    /// Dosyadaki ton (programın türünde).
    pub fn musical_key(&self) -> Option<MusicalKey> {
        self.key
            .map(|k| MusicalKey::new(usize::from(k.tonic), k.minor, f64::from(k.confidence)))
    }
}

/// Zamanı dosyanın hassasiyetine yuvarlar.
fn round_time(t: f64) -> f64 {
    (t * TIME_STEPS_PER_SECOND).round() / TIME_STEPS_PER_SECOND
}

/// İşaretlenmiş vuruşlardan ızgara: tempo vuruş aralıklarının ortancasından.
fn marked_grid(marks: &Annotation) -> BeatGrid {
    let mut intervals: Vec<f64> = marks.beats.windows(2).map(|w| w[1] - w[0]).collect();
    intervals.sort_by(f64::total_cmp);
    let median = intervals.get(intervals.len() / 2).copied().unwrap_or(0.5);
    BeatGrid {
        bpm: (60.0 / median.max(1e-3)).clamp(20.0, 400.0),
        beats: marks.beats.clone(),
        variable_tempo: false,
    }
}

/// Bir şarkıya uygulanmış (içe aktarılmış) harita: uygulama veri klasöründe `haritalar/`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedMap {
    /// Bu bilgisayardaki şarkı (başka yere gönderilmez).
    pub track_path: PathBuf,
    /// Şarkı dosyasının içe aktarma anındaki boyutu ve değişme zamanı: dosya değişirse harita
    /// artık uygulanmaz.
    pub size_bytes: u64,
    pub modified: i64,
    pub imported_at: String,
    /// İçe aktarılan dosyanın adı.
    pub source_name: String,
    pub similarity: f64,
    pub offset_secs: f64,
    /// Kaydırılmış (yerel şarkının zamanlarına çevrilmiş) harita.
    pub map: MapFile,
}

impl ImportedMap {
    /// Şarkı dosyası içe aktarıldığı gibi mi?
    pub fn is_current(&self) -> bool {
        FileStamp::of(&self.track_path)
            .is_some_and(|stamp| stamp.size == self.size_bytes && stamp.modified == self.modified)
    }

    pub fn status(&self) -> ImportedMapStatus {
        ImportedMapStatus {
            source_name: self.source_name.clone(),
            imported_at: self.imported_at.clone(),
            similarity: self.similarity,
            offset_secs: self.offset_secs,
            source: self.map.source,
            beats: self.map.beats.len(),
        }
    }
}

/// Arayüze: çalan şarkıda içe aktarılmış harita kullanılıyor mu?
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct ImportedMapStatus {
    pub source_name: String,
    pub imported_at: String,
    /// Parmak izi benzerliği (0..1).
    pub similarity: f64,
    /// Haritanın zamanlarına uygulanan kayma (saniye).
    pub offset_secs: f64,
    pub source: MapSource,
    #[cfg_attr(test, ts(type = "number"))]
    pub beats: usize,
}

/// İçe aktarılan haritaların deposu.
pub struct MapStore {
    dir: Option<PathBuf>,
}

impl MapStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir: Some(dir) }
    }

    /// Klasörü bilinmeyen depo (uygulama veri klasörü bulunamadıysa).
    pub fn unavailable() -> Self {
        Self { dir: None }
    }

    fn file_for(&self, track_path: &Path) -> Option<PathBuf> {
        let hash = fnv1a(track_path.to_string_lossy().as_bytes());
        Some(self.dir.as_ref()?.join(format!("{hash:016x}.json")))
    }

    /// Şarkıya uygulanmış harita; yoksa, okunamıyorsa, başka şarkınınkiyse (özet çakışması) ya
    /// da şarkı dosyası değiştiyse `None`.
    pub fn load(&self, track_path: &Path) -> Option<ImportedMap> {
        let text = std::fs::read_to_string(self.file_for(track_path)?).ok()?;
        let imported: ImportedMap = serde_json::from_str(&text).ok()?;
        (imported.track_path == track_path
            && imported.map.validate().is_ok()
            && imported.is_current())
        .then_some(imported)
    }

    /// Saklar (bölünmez yazma, `atomic_file`).
    pub fn save(&self, imported: &ImportedMap) -> std::io::Result<()> {
        let path = self
            .file_for(&imported.track_path)
            .ok_or_else(|| std::io::Error::other("uygulama veri klasörü bulunamadı"))?;
        let text = serde_json::to_string(imported).map_err(std::io::Error::other)?;
        crate::atomic_file::write(&path, text.as_bytes())
    }

    /// Şarkının haritasını kaldırır (yoksa bir şey yapmaz).
    pub fn remove(&self, track_path: &Path) -> std::io::Result<()> {
        match self.file_for(track_path) {
            Some(path) if path.exists() => std::fs::remove_file(path),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::fingerprint::tests::{analyze_samples, song};
    use crate::analysis::key::MarkedKey;
    use crate::analysis::spectrogram::{Spectrogram, FRAMES_PER_SECOND};
    use crate::audio::test_util::temp_path;
    use std::sync::Arc;

    const RATE: u32 = 44_100;

    /// Analizden dışa aktarılan harita.
    fn export(spectrogram: &Spectrogram, marks: Option<&Annotation>) -> MapFile {
        let saved = spectrogram.saved().unwrap();
        let beats = spectrogram.beat_grid().unwrap();
        let map = spectrogram.song_map().unwrap();
        let key = saved.key.as_ref().unwrap();
        MapFile::from_analysis(
            &AnalysisSnapshot {
                title: Some("Gece".into()),
                artist: Some("Lyraska Test".into()),
                duration_secs: saved.frames() as f64 / FRAMES_PER_SECOND,
                sample_rate: RATE,
                levels: &saved.levels,
                meters: &saved.meters,
                chroma: Some(&key.chroma),
                beats: &beats,
                map: &map,
                key: key.key,
                edited: false,
            },
            marks,
        )
    }

    /// Yerel şarkıyla eşleştirme.
    fn verify(map: &MapFile, local: &Spectrogram) -> Result<Verdict, MapError> {
        let saved = local.saved().unwrap();
        map.verify(
            saved.frames() as f64 / FRAMES_PER_SECOND,
            &saved.levels,
            RATE,
            saved.key.as_ref().map(|k| &k.chroma[..]),
        )
    }

    fn original() -> (Vec<f64>, Arc<Spectrogram>) {
        let samples = song(1, 120.0, 45.0, RATE);
        let spectrogram = analyze_samples(&samples, RATE, "harita-asil.wav");
        (samples, spectrogram)
    }

    #[test]
    fn disa_aktarilan_harita_baska_baskiya_kaymasiyla_uygulanir() {
        let (samples, spectrogram) = original();
        let map = export(&spectrogram, None);
        assert_eq!(map.source, MapSource::Analysis);
        // Metne yazılıp okunan dosya aynıdır.
        let text = map.to_json();
        assert!(!text.contains("harita-asil"), "dosyada yol yok");
        let read = MapFile::parse(&text).unwrap();
        assert_eq!(read, map);

        // Başka baskı: başına 1,5 sn sessizlik eklenmiş, sonundan 1,5 sn kesilmiş (süre aynı).
        let lead = (1.5 * f64::from(RATE)) as usize;
        let mut other = vec![0.0; lead];
        other.extend_from_slice(&samples[..samples.len() - lead]);
        let local = analyze_samples(&other, RATE, "harita-baski.wav");
        let verdict = verify(&read, &local).unwrap();
        assert!((verdict.offset_secs - 1.5).abs() < 0.02, "{verdict:?}");
        let duration = local.saved().unwrap().frames() as f64 / FRAMES_PER_SECOND;
        let shifted = read.shifted(verdict.offset_secs, duration);
        // Kaydırılan vuruşlar yerel analizin vuruşlarına oturur.
        let local_beats = &local.beat_grid().unwrap().beats;
        let near = shifted
            .beats
            .iter()
            .filter(|&&t| local_beats.iter().any(|&b| (b - t).abs() < 0.03))
            .count();
        assert!(
            near as f64 >= 0.9 * shifted.beats.len() as f64,
            "{near}/{}",
            shifted.beats.len()
        );
        assert!(shifted.beats.iter().all(|&t| (0.0..=duration).contains(&t)));
        assert!(shifted.validate().is_ok());
    }

    #[test]
    fn baska_sarkiya_ve_suresi_farkli_surume_uygulanmaz() {
        let (_, spectrogram) = original();
        let map = export(&spectrogram, None);
        let other = analyze_samples(&song(5, 120.0, 45.0, RATE), RATE, "harita-baska.wav");
        assert!(matches!(verify(&map, &other), Err(MapError::NoMatch(_))));
        let short = analyze_samples(&song(1, 120.0, 30.0, RATE), RATE, "harita-kisa.wav");
        assert!(matches!(
            verify(&map, &short),
            Err(MapError::DurationMismatch { .. })
        ));
    }

    #[test]
    fn isaretler_analizin_yerine_gecer() {
        let (_, spectrogram) = original();
        let analysis = export(&spectrogram, None);
        // Kullanıcı vuruşları yarım vuruş kaydırarak işaretlemiş, iki drop ve ton seçmiş.
        let beats: Vec<f64> = analysis.beats.iter().map(|t| t + 0.25).collect();
        let marks = Annotation::new(
            crate::analysis::annotation::AnnotatedTrack {
                path: "C:/x.flac".into(),
                file_name: "x".into(),
                title: None,
                artist: None,
                duration_secs: None,
                size_bytes: None,
            },
            beats.clone(),
            vec![10.0, 30.0],
            Some(MarkedKey {
                tonic: 9,
                minor: true,
            }),
        );
        let edited = export(&spectrogram, Some(&marks));
        assert_eq!(edited.source, MapSource::Edited);
        assert_eq!(edited.beats.len(), marks.beats.len());
        assert!(edited
            .beats
            .iter()
            .zip(&marks.beats)
            .all(|(a, b)| (a - b).abs() <= 0.5e-6));
        // Mikrosaniyeye yuvarlanmış zaman dosyada kısa yazılır.
        assert!(!edited.to_json().contains("99999999"));
        assert!(
            (edited.tempo.bpm - 120.0).abs() < 1.0,
            "{}",
            edited.tempo.bpm
        );
        assert_eq!(
            edited.drops,
            vec![
                MapDrop {
                    time: 10.0,
                    confidence: 1.0
                },
                MapDrop {
                    time: 30.0,
                    confidence: 1.0
                }
            ]
        );
        assert_eq!(
            edited.key,
            Some(MapKey {
                tonic: 9,
                minor: true,
                confidence: 1.0
            })
        );
        // Ölçü başları işaretlenen vuruşlardan seçilir.
        assert!(edited
            .downbeats
            .iter()
            .all(|d| edited.beats.iter().any(|b| (b - d).abs() < 1e-9)));
        assert!(edited.validate().is_ok());
        // Parmak izi işaretlerden etkilenmez.
        assert_eq!(edited.fingerprint, analysis.fingerprint);
    }

    /// Geçerli küçük bir harita (doğrulama testleri için).
    fn small() -> MapFile {
        MapFile {
            format: FORMAT_NAME.into(),
            version: VERSION,
            app_version: "0.0.0".into(),
            saved_at: "2026-10-22 10:00:00".into(),
            track: MapTrack {
                title: None,
                artist: None,
                duration_secs: 20.0,
            },
            fingerprint: MapFingerprint {
                method: fingerprint::METHOD.into(),
                bands: "000001".repeat(100),
                chroma: Some("001".repeat(20)),
            },
            source: MapSource::Analysis,
            tempo: MapTempo {
                bpm: 120.0,
                variable: false,
            },
            beats: (0..40).map(|i| 0.5 * f64::from(i)).collect(),
            meter: MapMeter {
                beats_per_bar: 4,
                first_downbeat: 1,
                grouping: Vec::new(),
                confidence: 0.9,
            },
            downbeats: (0..10).map(|i| 0.5 + 2.0 * f64::from(i)).collect(),
            sections: vec![
                MapSection {
                    start: 0.0,
                    end: 10.0,
                    energy: 0.4,
                    label: 0,
                },
                MapSection {
                    start: 10.0,
                    end: 20.0,
                    energy: 0.8,
                    label: 1,
                },
            ],
            drops: vec![MapDrop {
                time: 10.0,
                confidence: 0.8,
            }],
            energy: vec![0.5; 20],
            key: Some(MapKey {
                tonic: 0,
                minor: false,
                confidence: 0.6,
            }),
        }
    }

    #[test]
    fn bozuk_ve_kotu_niyetli_dosyalar_reddedilir() {
        assert!(small().validate().is_ok());
        assert_eq!(MapFile::parse("{ bu json değil"), Err(MapError::NotAMap));
        assert_eq!(
            MapFile::parse(r#"{"format":"baska","version":1}"#),
            Err(MapError::NotAMap)
        );
        // Daha yeni sürüm: alanları bilinmese de anlaşılır hata.
        assert_eq!(
            MapFile::parse(&format!(r#"{{"format":"{FORMAT_NAME}","version":2}}"#)),
            Err(MapError::NewerVersion(2))
        );
        assert_eq!(
            MapFile::parse(&"x".repeat(MAX_FILE_BYTES as usize + 1)),
            Err(MapError::TooLarge(9))
        );
        type Bozma = fn(&mut MapFile);
        let cases: [(&str, Bozma); 17] = [
            ("süre", |m| m.track.duration_secs = 1e9),
            ("tersine vuruş", |m| m.beats.swap(3, 4)),
            ("şarkı dışında vuruş", |m| m.beats.push(25.0)),
            ("çok vuruş", |m| {
                m.track.duration_secs = MAX_DURATION_SECS;
                m.beats = (0..MAX_BEATS + 1).map(|i| i as f64 * 0.1).collect();
            }),
            ("tempo", |m| m.tempo.bpm = 0.0),
            ("ölçü", |m| m.meter.beats_per_bar = 0),
            ("ilk ölçü başı", |m| m.meter.first_downbeat = 4),
            ("gruplama", |m| m.meter.grouping = vec![2, 9]),
            ("ölçü güveni", |m| m.meter.confidence = 1.5),
            ("ters bölüm", |m| m.sections[0].end = 0.0),
            ("üst üste bölüm", |m| m.sections[1].start = 5.0),
            ("bölüm etiketi", |m| m.sections[0].label = usize::MAX),
            ("drop güveni", |m| m.drops[0].confidence = -0.1),
            ("enerji", |m| m.energy = vec![0.5; 100]),
            ("ton", |m| {
                m.key = Some(MapKey {
                    tonic: 12,
                    minor: false,
                    confidence: 0.5,
                })
            }),
            ("parmak izi", |m| m.fingerprint.bands = "zz".into()),
            ("uzun parmak izi", |m| {
                m.fingerprint.bands = "000001".repeat(10_000)
            }),
        ];
        for (name, corrupt) in cases {
            let mut map = small();
            corrupt(&mut map);
            assert!(
                matches!(map.validate(), Err(MapError::Invalid(_))),
                "{name}: {:?}",
                map.validate()
            );
            // Metinden okunurken de reddedilir.
            assert!(MapFile::parse(&map.to_json()).is_err(), "{name}");
        }
        let mut unknown = small();
        unknown.fingerprint.method = "chromaprint".into();
        assert_eq!(
            unknown.validate(),
            Err(MapError::UnknownMethod("chromaprint".into()))
        );
    }

    #[test]
    fn kaydirma_atilan_vuruslari_ve_olcu_basini_dogru_tasir() {
        let map = small();
        // 1,2 sn geri: ilk üç vuruş (0, 0,5, 1,0) şarkının başından önceye düşer.
        let shifted = map.shifted(-1.2, 20.0);
        assert_eq!(shifted.beats.len(), map.beats.len() - 3);
        assert!((shifted.beats[0] - 0.3).abs() < 1e-9);
        // İlk tam ölçü 1. vuruştaydı; 3 vuruş atılınca sıra (1 + 4 − 3) % 4 = 2.
        assert_eq!(shifted.meter.first_downbeat, 2);
        assert!((shifted.downbeats[0] - 1.3).abs() < 1e-9);
        assert_eq!(shifted.sections[0].start, 0.0);
        assert!((shifted.sections[1].end - 18.8).abs() < 1e-9);
        assert_eq!(shifted.energy.len(), map.energy.len() - 1);
        assert!(shifted.validate().is_ok());
        // İleri kayma: sondakiler atılır, enerjinin başı ilk değerle doldurulur.
        let later = map.shifted(2.0, 20.0);
        assert!(later.beats.iter().all(|&t| t <= 20.0));
        assert_eq!(later.energy.len(), map.energy.len() + 2);
        assert!(later.validate().is_ok());
        // İç türlere çeviri: drop güveni drop sırasıyla.
        let (grid, rhythm) = map.rhythm();
        assert_eq!(grid.beats, map.beats);
        assert_eq!(rhythm.drop_confidence, vec![0.8]);
        assert_eq!(rhythm.downbeat_phase, 1);
        assert_eq!(map.musical_key().unwrap().camelot, 8);
    }

    /// Belgedeki biçim (`docs/SARKI-HARITASI.md`) ile alan adları aynı kalmalı: değişiklik sürümü
    /// artırmayı gerektirir.
    #[test]
    fn bicim_alanlari_sabit() {
        let value = serde_json::to_value(small()).unwrap();
        let keys = |v: &serde_json::Value| -> Vec<String> {
            let mut keys: Vec<String> = v.as_object().unwrap().keys().cloned().collect();
            keys.sort();
            keys
        };
        assert_eq!(
            keys(&value),
            [
                "appVersion",
                "beats",
                "downbeats",
                "drops",
                "energy",
                "fingerprint",
                "format",
                "key",
                "meter",
                "savedAt",
                "sections",
                "source",
                "tempo",
                "track",
                "version"
            ]
        );
        assert_eq!(keys(&value["track"]), ["artist", "durationSecs", "title"]);
        assert_eq!(keys(&value["fingerprint"]), ["bands", "chroma", "method"]);
        assert_eq!(keys(&value["tempo"]), ["bpm", "variable"]);
        assert_eq!(
            keys(&value["meter"]),
            ["beatsPerBar", "confidence", "firstDownbeat", "grouping"]
        );
        assert_eq!(
            keys(&value["sections"][0]),
            ["end", "energy", "label", "start"]
        );
        assert_eq!(keys(&value["drops"][0]), ["confidence", "time"]);
        assert_eq!(keys(&value["key"]), ["confidence", "minor", "tonic"]);
        assert_eq!(value["source"], "analysis");
        assert_eq!(value["format"], FORMAT_NAME);
    }

    #[test]
    fn depo_saklar_sarki_degisince_uygulamaz() {
        let dir = temp_path("haritalar-deposu");
        let store = MapStore::new(dir.clone());
        let track = temp_path("depo-sarki.flac");
        std::fs::write(&track, b"ses").unwrap();
        let stamp = FileStamp::of(&track).unwrap();
        let imported = ImportedMap {
            track_path: track.clone(),
            size_bytes: stamp.size,
            modified: stamp.modified,
            imported_at: "2026-10-22 10:00:00".into(),
            source_name: "gece.lyraska-harita.json".into(),
            similarity: 0.93,
            offset_secs: 0.0,
            map: small(),
        };
        assert_eq!(store.load(&track), None);
        store.save(&imported).unwrap();
        assert_eq!(store.load(&track), Some(imported.clone()));
        assert_eq!(store.load(&temp_path("baska.flac")), None);
        // Şarkı dosyası değişti (yeniden kodlandı, etiket düzenlendi): harita uygulanmaz.
        std::fs::write(&track, b"baska ses").unwrap();
        assert_eq!(store.load(&track), None);
        store.remove(&track).unwrap();
        store.remove(&track).unwrap();
        assert!(MapStore::unavailable().save(&imported).is_err());
        std::fs::remove_dir_all(dir).ok();
        std::fs::remove_file(track).ok();
    }
}
