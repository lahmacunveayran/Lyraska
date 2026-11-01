//! Boşluksuz geçiş: sıradaki şarkının bildirilmesi (analizi şimdiden başlar), çözme iş
//! parçacığının şarkı bitince onu açması ve aynı oturuma yeni bir şarkı ([`Segment`]) olarak
//! eklemesi. Ses akışı kesilmez; eşitleme kazancı tam şarkı sınırında değişir.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use super::session::{Segment, SharedState};
use super::{Analysis, Player};
use crate::audio::decode::{Decoder, TrackInfo};
use crate::audio::output::{OutputMode, OutputSpec};
use crate::audio::resample::Converter;

impl Player {
    /// Boşluksuz geçiş için sıradaki şarkıyı bildirir (`None`: sıra yok).
    /// Çalan şarkı bitince ses akışı kesilmeden bu şarkıyla devam eder; analizi de
    /// şimdiden başlar.
    pub fn set_next(&mut self, path: Option<PathBuf>) {
        // Oturuma her zaman yazılır: boşluksuz geçişte çözme iş parçacığı sıradakini aldı
        // (`take_next`); aynı şarkı yeniden bildirilince yine sıraya girmeli (hata avı A4).
        if let Some(session) = &self.session {
            session.shared.set_next(path.clone());
        }
        if self.next_path == path {
            return;
        }
        self.next_path = path.clone();
        self.next_analysis = match &path {
            Some(p) if self.next_analysis.as_ref().is_some_and(|a| &a.path == p) => {
                self.next_analysis.take()
            }
            Some(p) if self.analysis.as_ref().is_none_or(|a| &a.path != p) => {
                // Sıradaki şarkı, çalanın analizi bitince analiz edilir.
                let current = self.analysis.as_ref().map(|a| Arc::clone(&a.spectrogram));
                Analysis::start(p, &self.analysis_context, current)
            }
            _ => None,
        };
    }
}

impl SharedState {
    pub(super) fn set_next(&self, path: Option<PathBuf>) {
        if let Ok(mut next) = self.next_path.lock() {
            *next = path;
        }
    }

    pub(super) fn take_next(&self) -> Option<PathBuf> {
        self.next_path.lock().ok().and_then(|mut n| n.take())
    }

    /// Sıradaki şarkı çözme iş parçacığınca alındı ve o an duyuluyor (ya da açılamadı): oynatıcının
    /// bildirdiği sıradaki artık eskidir. Alınıp henüz akışa eklenmediyse ya da duyulmadıysa `false`.
    pub(super) fn next_consumed(&self) -> bool {
        let taken = self.next_path.lock().is_ok_and(|next| next.is_none())
            && !self.next_attaching.load(Ordering::Acquire);
        let segments = self.segments.lock().map_or(0, |segments| segments.len());
        taken
            && self
                .now_playing_index()
                .is_some_and(|index| index + 1 >= segments)
    }

    pub(super) fn push_segment(&self, segment: Segment) {
        if let Ok(mut segments) = self.segments.lock() {
            segments.push(segment);
        }
    }
}

/// Sıradaki şarkıyı açar. Sıra yoksa, açılamazsa ya da akışa uymuyorsa `None` (şarkı
/// normal biçimde biter).
pub(super) fn open_next(shared: &SharedState, spec: OutputSpec) -> Option<Decoder> {
    let path = shared.take_next()?;
    // Alındı ama akışta değil: bu arada sarılırsa sıradaki "çalındı" sayılmasın (`next_consumed`).
    shared.next_attaching.store(true, Ordering::Release);
    let decoder = open_checked(&path, spec);
    if decoder.is_none() {
        shared.next_attaching.store(false, Ordering::Release);
    }
    decoder
}

/// Sıradakini açar; akışa uymuyorsa `None`.
fn open_checked(path: &Path, spec: OutputSpec) -> Option<Decoder> {
    let decoder = Decoder::open(path).ok()?;
    let info = decoder.info();
    if Converter::output_channels(info.channels) != spec.channels {
        return None;
    }
    // Bit-perfect akış şarkının kendi hızında açıldı: hızı farklı şarkı dönüştürülmez,
    // oturum biter ve sıradaki şarkı kendi hızında yeni bir akışla açılır.
    if matches!(spec.mode, OutputMode::Exclusive(_)) && info.sample_rate != spec.sample_rate {
        return None;
    }
    // Aygıtın özel mod biçiminden derin şarkı orada bit bit aynı çıkamaz (ilk şarkıdaki denetim,
    // `bit_perfect::output_mode`): oturum biter, sıradaki kendi biçiminde açılır (Denetim 3, RTS-03).
    if let OutputMode::Exclusive(format) = spec.mode {
        if decoder
            .source_bits()
            .is_some_and(|bits| bits > u32::from(format.valid_bits))
        {
            return None;
        }
    }
    Some(decoder)
}

/// Sıradaki şarkıyı oturuma ekler: çıkış akışında `first_output_frame` karesinde başlar.
pub(super) fn attach_next(
    shared: &SharedState,
    spec: OutputSpec,
    info: TrackInfo,
    first_output_frame: u64,
) {
    shared.push_segment(Segment {
        rate_ratio: f64::from(info.sample_rate) / f64::from(spec.sample_rate),
        info,
        first_output_frame,
        start_frame: 0,
    });
    shared.next_attaching.store(false, Ordering::Release);
    // Eşitleme kazancı tam bu karede yeni şarkınınkine geçer (ölçümünü oynatıcı yazar).
    shared.controls.levels.begin_track(first_output_frame);
}
