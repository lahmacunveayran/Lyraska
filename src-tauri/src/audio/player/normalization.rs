//! Ses yüksekliği eşitlemesi (−14 LUFS): analizi biten şarkıların ölçümü oturumun seviye
//! tablosuna yazılır (boşluksuz geçişle eklenenler dahil); çalan şarkının eşitleme kazancı
//! ve tepesine kalan boşluk ekolayzerin taşma korumasına verilir.

use super::Player;
use crate::audio::normalize::TrackLevel;

impl Player {
    /// Analizi biten şarkıların ses yüksekliğini oturumun seviye tablosuna yazar
    /// (boşluksuz geçişle eklenen şarkılar dahil). Durum sorgusunda ve her görsel
    /// karede çağrılır; ses iş parçacığı yeni kazancı şarkının sınırından itibaren uygular.
    pub(super) fn sync_levels(&self) {
        let Some(session) = &self.session else {
            return;
        };
        let levels = &session.shared.controls.levels;
        let Ok(segments) = session.shared.segments.lock() else {
            return;
        };
        for (index, segment) in segments.iter().enumerate() {
            let known = levels.is_final(index);
            let bass_known = levels.has_bass_peaks(index);
            if known && bass_known {
                continue;
            }
            let Some(spectrogram) = self
                .analysis_for(&segment.info.path)
                .map(|a| &a.spectrogram)
            else {
                continue;
            };
            if !known {
                if let Some(measured) = spectrogram.measured_loudness() {
                    levels.set_loudness(index, measured);
                } else if !levels.is_known(index) {
                    if let Some(early) = spectrogram.early_loudness() {
                        levels.set_loudness_estimate(index, early);
                    }
                }
            }
            // Bas tepeleri tam analizle gelir: koruma o an yumuşakça gevşer.
            if !bass_known {
                if let Some(peaks) = spectrogram.bass_peaks() {
                    levels.set_bass_peaks(index, &peaks);
                }
            }
        }
    }

    /// Çalan şarkının eşitlemeden sonra tepesine kalan boşluk (dB): ekolayzer bu kadar
    /// yükseltirken sesi kısmaz. Şarkı yoksa ya da ölçülmediyse 0.
    pub fn headroom_db(&self) -> f64 {
        self.current_level().map_or(0.0, |level| level.headroom_db)
    }

    /// Çalan şarkının eşitleme kazancı ve boşluğu.
    pub(super) fn current_level(&self) -> Option<TrackLevel> {
        let session = self.session.as_ref()?;
        self.sync_levels();
        let index = session.shared.now_playing_index()?;
        let levels = &session.shared.controls.levels;
        levels
            .is_known(index)
            .then(|| levels.level(index, self.loudness.enabled()))
    }
}
