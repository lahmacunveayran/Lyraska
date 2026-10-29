//! Şarkı haritası dosyaları: çalan (ya da sıradaki) şarkının bitmiş analizini dışa aktarma,
//! okunmuş haritayı parmak iziyle eşleştirip uygulama ve saklama, kaldırma.

use std::path::Path;
use std::sync::Arc;

use super::Player;
use crate::analysis::annotation::Annotation;
use crate::analysis::cache::FileStamp;
use crate::analysis::map_file::{
    AnalysisSnapshot, ImportedMap, ImportedMapStatus, MapError, MapFile, MapSource, MapStore,
};
use crate::analysis::spectrogram::{self, Spectrogram};
use crate::audio::decode::TrackInfo;
use crate::diagnostics;

impl Player {
    /// Şarkının (çalan ya da sıradaki) bitmiş analizi.
    fn finished_analysis(&self, path: &Path) -> Result<&Arc<Spectrogram>, MapError> {
        self.analysis_for(path)
            .map(|a| &a.spectrogram)
            .filter(|s| s.is_done())
            .ok_or(MapError::NotAnalyzed)
    }

    /// Şarkının haritası (dışa aktarmak için): etkin harita (içe aktarılan varsa o, yoksa
    /// programın analizi) ve varsa kullanıcının işaretleri.
    pub fn export_song_map(
        &self,
        track: &TrackInfo,
        marks: Option<&Annotation>,
    ) -> Result<MapFile, MapError> {
        let spectrogram = self.finished_analysis(&track.path)?;
        let saved = spectrogram.saved().ok_or(MapError::NotAnalyzed)?;
        let (Some(beats), Some(map)) = (spectrogram.beat_grid(), spectrogram.song_map()) else {
            return Err(MapError::NoRhythm);
        };
        let imported = self.map_store().and_then(|maps| maps.load(&track.path));
        let duration = track
            .duration_secs
            .unwrap_or(saved.frames() as f64 / spectrogram::FRAMES_PER_SECOND);
        let snapshot = AnalysisSnapshot {
            title: track.title.clone(),
            artist: track.artist.clone(),
            duration_secs: duration,
            sample_rate: saved.sample_rate.unwrap_or(track.sample_rate),
            levels: &saved.levels,
            meters: &saved.meters,
            chroma: saved.key.as_ref().map(|k| &k.chroma[..]),
            beats: &beats,
            map: &map,
            key: spectrogram
                .imported_key()
                .or_else(|| saved.key.as_ref().and_then(|k| k.key)),
            edited: imported.is_some_and(|i| i.map.source == MapSource::Edited),
        };
        Ok(MapFile::from_analysis(&snapshot, marks))
    }

    /// Okunmuş (doğrulanmış) harita dosyasını şarkıya uygular: parmak iziyle eşleştirilir,
    /// bulunan kayma zamanlara uygulanır, saklanır ve analizin önüne geçer.
    pub fn import_song_map(
        &self,
        track: &TrackInfo,
        map: &MapFile,
        source_name: &str,
    ) -> Result<ImportedMapStatus, MapError> {
        let spectrogram = self.finished_analysis(&track.path)?;
        let saved = spectrogram.saved().ok_or(MapError::NotAnalyzed)?;
        let duration = track
            .duration_secs
            .unwrap_or(saved.frames() as f64 / spectrogram::FRAMES_PER_SECOND);
        let verdict = map.verify(
            duration,
            &saved.levels,
            saved.sample_rate.unwrap_or(track.sample_rate),
            saved.key.as_ref().map(|k| &k.chroma[..]),
        )?;
        let stamp = FileStamp::of(&track.path)
            .ok_or_else(|| MapError::Read("şarkı dosyası okunamadı".to_owned()))?;
        let imported = ImportedMap {
            track_path: track.path.clone(),
            size_bytes: stamp.size,
            modified: stamp.modified,
            imported_at: diagnostics::timestamp(),
            source_name: source_name.to_owned(),
            similarity: verdict.similarity(),
            offset_secs: verdict.offset_secs,
            map: map.shifted(verdict.offset_secs, duration),
        };
        if let Some(maps) = self.map_store() {
            maps.save(&imported)
                .map_err(|e| MapError::Read(format!("harita saklanamadı: {e}")))?;
        }
        let (grid, rhythm) = imported.map.rhythm();
        spectrogram.set_imported(grid, rhythm, imported.map.musical_key());
        Ok(imported.status())
    }

    /// Şarkıya içe aktarılmış ve uygulanan harita.
    pub fn imported_song_map(&self, path: &Path) -> Option<ImportedMapStatus> {
        let spectrogram = &self.analysis_for(path)?.spectrogram;
        if !spectrogram.has_imported() {
            return None;
        }
        self.map_store()?.load(path).map(|i| i.status())
    }

    /// İçe aktarılan haritayı kaldırır: programın analizi geri gelir.
    pub fn remove_song_map(&self, path: &Path) -> std::io::Result<()> {
        if let Some(maps) = self.map_store() {
            maps.remove(path)?;
        }
        if let Some(analysis) = self.analysis_for(path) {
            analysis.spectrogram.clear_imported();
        }
        Ok(())
    }

    fn map_store(&self) -> Option<&Arc<MapStore>> {
        self.analysis_context.maps.as_ref()
    }
}
