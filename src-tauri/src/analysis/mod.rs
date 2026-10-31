//! Şarkı haritası analizi.
//!
//! - [`spectrogram`]: şarkının her anı için frekans bantları ve kanal seviyeleri (Faz 1).
//! - [`levels`]: VU ibreleri için sol/sağ seviyeler ve şarkıya göre 0 VU referansı.
//! - [`beats`]: vuruşlar ve tempo (BPM), spektrogramla aynı geçişte.
//! - [`annotation`]: kullanıcının işaretlediği beat ve drop anları (ses içermez).
//! - [`structure`]: ölçü başları, bölümler, droplar ve enerji eğrisi.
//! - [`meter`]: aksak ölçüler (5/8, 7/8, 9/8): sekizlik ızgarası ve gruplama.
//! - [`key`]: ton tespiti (kroma, Krumhansl–Kessler profilleri, Camelot kodu, bölüm bölüm).
//! - [`evaluate`]: analizin doğruluğunu insan işaretlerine göre ölçme (F-ölçüsü).
//! - [`cache`]: analiz sonuçlarının SQLite önbelleği (yol + boyut + değiştirilme
//!   zamanı; her parçanın kendi sürümü: spektrum, ritim, ses yüksekliği, bas tepeleri).
//! - [`lyrics_align`], [`lyrics_model`], [`lyrics_text`], [`lyrics_cache`], [`lyrics_job`]: sözleri
//!   sese oturtma (hizalama, model, metin hazırlığı, emisyon önbelleği, işin kendisi ve sonucu).
//! - [`background`]: kütüphanenin arka planda, düşük öncelikle analizi.
//!
//! Analiz şarkı çalmadan önce yapılır ve sonuç SQLite'ta saklanır; böylece
//! görseller şarkıyı "önceden bilir" ve bir şarkı yalnızca bir kez analiz edilir.

pub mod annotation;
pub mod background;
pub mod beats;
pub mod cache;
pub mod evaluate;
pub mod fingerprint;
pub mod key;
pub mod levels;
pub mod lyrics_align;
pub mod lyrics_cache;
pub mod lyrics_job;
pub mod lyrics_model;
pub mod lyrics_text;
pub mod map_file;
pub mod meter;
pub mod spectrogram;
pub mod structure;
pub mod tempo;

/// Analiz modülünün durumu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisStatus {
    /// Spektrogram ve beat takibi var; şarkı haritasının geri kalanı yolda.
    SpectrumAndBeats,
}

impl AnalysisStatus {
    /// Kullanıcıya gösterilen Türkçe durum metni.
    pub fn label(self) -> &'static str {
        match self {
            Self::SpectrumAndBeats => "spektrum ve beat takibi (şarkı haritası yolda)",
        }
    }
}

/// Analiz modülünün şu anki durumu.
pub fn status() -> AnalysisStatus {
    AnalysisStatus::SpectrumAndBeats
}
