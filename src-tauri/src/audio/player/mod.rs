//! Oynatıcı: çözme ve çıkış iş parçacıklarını yönetir, arayüzden gelen
//! komutları (aç, çal, duraklat, durdur) karşılar.
//!
//! Her açılan şarkı için bir "oturum" kurulur:
//!
//! ```text
//! çözme iş parçacığı ──► halka tampon (2 sn, f64) ──► çıkış iş parçacığı (WASAPI)
//!          ├──────────── SharedState (atomik işaretler) ───────────┘
//!          └──► dalga biçimi dokunuşu (44,1 kHz kopya) ◄── komut iş parçacığı (görseller)
//! ```
//!
//! İş parçacıkları birbirleriyle yalnızca kilitsiz halka tampon ve atomik
//! değişkenler üzerinden konuşur; gerçek zamanlı çıkış hiçbir zaman beklemez.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use serde::Serialize;

use super::abx::AbxTest;
use super::crossfeed::{CrossfeedControl, CrossfeedSettings};
use super::decode::{Decoder, TrackInfo};
use super::eq::{EqControl, EqSettings, EqState};
use super::normalize::{LoudnessControl, TrackLevels};
use super::peq::{HeadphoneSettings, ParametricSettings, PeqControl};
use super::render::RenderControls;
use super::AudioError;
use crate::analysis::spectrogram::BANDS;

mod bit_perfect;
mod blind_test;
mod decode_thread;
mod next_track;
mod normalization;
mod session;
mod song_maps;
mod track_analysis;
mod transition;
mod visuals;

use session::Session;
pub use session::SharedState;
pub(crate) use session::{wait_for_fade_out, wait_for_prefill, FADE_OUT_TIMEOUT};
use track_analysis::{Analysis, AnalysisContext};
use transition::PendingTransition;
pub use transition::{Prepared, Transition};
pub use visuals::{StructureNow, VisualData};

/// Oynatıcının durumu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub enum PlaybackState {
    /// Şarkı açılmadı.
    Idle,
    Playing,
    Paused,
    /// Şarkı sonuna kadar çaldı.
    Ended,
    Error,
}

/// Arayüzün düzenli aralıklarla sorguladığı durum özeti.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct PlaybackStatus {
    pub state: PlaybackState,
    pub track: Option<TrackInfo>,
    pub position_secs: f64,
    #[cfg_attr(test, ts(type = "number"))]
    pub underruns: u64,
    pub error: Option<String>,
    /// Şarkının temposu (BPM); analiz bitene kadar ya da belirgin ritim yoksa `None`.
    pub bpm: Option<f64>,
    /// Sesin aygıta giden yolu; şarkı açık değilse `None`.
    pub output: Option<SignalPath>,
}

/// Sesin şarkıdan hoparlöre giden yolu (profesyonel çalarlardaki "sinyal yolu").
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct SignalPath {
    /// Aygıtın adı (ör. "Hoparlörler (Realtek(R) Audio)"); bilinmiyorsa boş.
    pub device_name: String,
    /// Aygıta giden örnekleme hızı ve kanal sayısı.
    pub sample_rate: u32,
    pub channels: usize,
    /// Şarkı aygıtın hızına Lyraska'nın yüksek kaliteli dönüştürücüsüyle çevriliyor mu?
    pub resampled: bool,
    /// Ses yüksekliği eşitlemesinin uyguladığı kazanç (dB); eşitleme kapalıysa ya da
    /// şarkı henüz ölçülmediyse `None`.
    pub normalization_db: Option<f64>,
    /// Bit-perfect: aygıt özel modda, şarkının örnekleri değişmeden gidiyor.
    pub bit_perfect: bool,
    /// Özel modda aygıta giden örneğin anlamlı bit sayısı (16, 24, 32).
    pub bit_depth: Option<u16>,
    /// Bit-perfect istendiği hâlde açılamadıysa nedeni (ses normal yoldan çalar).
    pub notice: Option<String>,
}

/// Arayüzün kullandığı oynatıcı. Tauri tarafında bir `Mutex` içinde tutulur.
#[derive(Default)]
pub struct Player {
    session: Option<Session>,
    /// Çalan şarkının spektrumu. Sarma ve durdurmada (aynı şarkı) korunur.
    analysis: Option<Analysis>,
    /// Boşluksuz geçiş için sıradaki şarkı ve önceden başlatılan analizi.
    next_path: Option<PathBuf>,
    next_analysis: Option<Analysis>,
    /// Son açma girişimi başarısız olduysa nedeni.
    last_error: Option<String>,
    /// Ekolayzer ayarları; bütün oturumların ses çıkışı buradan okur.
    eq: Arc<EqControl>,
    /// Kulaklık düzeltmesi: ses çıkışının okuduğu kanal ve son ayar.
    headphone_control: Arc<PeqControl>,
    /// Elle parametrik ekolayzer: ses çıkışının okuduğu kanal, son ayar ve karşılaştırma.
    parametric_control: Arc<PeqControl>,
    parametric: ParametricSettings,
    parametric_compare: bool,
    /// Crossfeed: ses çıkışının okuduğu kanal ve son ayar.
    crossfeed_control: Arc<CrossfeedControl>,
    crossfeed: CrossfeedSettings,
    /// Ses yüksekliği eşitlemesi açık mı (ses çıkışı okur).
    loudness: Arc<LoudnessControl>,
    /// Bit-perfect (özel mod) isteniyor mu? Yeni oturumlarda uygulanır.
    bit_perfect: bool,
    headphone: HeadphoneSettings,
    /// Epilepsi güvenli modu: Görsel Yönetmen nabızları saniyede en fazla bire indirir.
    visual_safe: bool,
    /// Analiz önbelleği ve süren analiz sayacı.
    analysis_context: AnalysisContext,
    /// Ses aygıtının ek gecikmesi (ms): görseller bu kadar geriden okunur.
    audio_delay_ms: i32,
    /// Görsellere uygulanan ekolayzer tepkisi (dB, spektrum bantları için) ve en büyük
    /// yükseltme, hangi ayar sürümü ve örnekleme hızı için hesaplandığıyla birlikte.
    visual_eq: Option<(u64, u32, [f64; BANDS], f64, super::bass::BassBoost)>,
    /// Kurulu kör dinleme testi. Ses aygıtını kullanırken şarkı çalmaz.
    abx: Option<AbxTest>,
    /// Kör test başlarken çalan şarkı ve konumu: test bitince orada duraklatılmış açılır.
    abx_resume: Option<(PathBuf, f64)>,
    /// Son başlatılan geçişin sırası: eskisi sonradan bitse de takılmaz.
    transition_seq: u64,
    /// Kilit dışında süren geçiş (durum sorgusu için).
    pending: Option<PendingTransition>,
    /// Aygıt değişiminde art arda yapılan otomatik yeniden açma sayısı.
    device_recoveries: u8,
}

impl Player {
    pub fn new() -> Self {
        Self::default()
    }

    /// Şarkıyı açar. `autoplay` ise hemen çalmaya başlar, değilse başında duraklatılmış bekler.
    /// Kilit altında bloklar; arayüz komutu bunun yerine [`Self::begin_transition`] →
    /// [`Self::prepare`] → [`Self::install`] üçlüsünü kullanır.
    pub fn load(&mut self, path: &Path, autoplay: bool) -> Result<TrackInfo, AudioError> {
        // Açılamayan dosya çalan şarkıyı da susturmasın: yeni dosya önce yoklanır, eski oturum
        // ancak yoklama başarılıysa kapanır. Çalan oturum yoksa mevcut yol izlenir (hata durumu
        // gösterilir).
        if self.has_session() {
            Decoder::open(path)?;
        }
        self.device_recoveries = 0;
        self.restart(path, autoplay, None)
    }

    /// Açık bir şarkı oturumu var mı (çalıyor, duraklatılmış ya da bitmiş).
    pub fn has_session(&self) -> bool {
        self.session.is_some()
    }

    /// Çalan oturumu kapatır. Ses önce yumuşakça kısılır, kısılma hoparlöre ulaşınca oturum
    /// kapanır: "tık" sesi olmasın (aygıt arabelleği sesi ~100 ms önden tutar). Ses aygıtı
    /// serbest kalır; iki şarkı üst üste çalmaz.
    fn close_session(&mut self) {
        if let Some(session) = &self.session {
            if matches!(
                session.state(),
                PlaybackState::Playing | PlaybackState::Paused
            ) {
                session.shared.paused.store(true, Ordering::Release);
                wait_for_fade_out(&session.shared, FADE_OUT_TIMEOUT);
            }
        }
        self.session = None;
    }

    /// Program kapanırken: ses yumuşakça kısılır, oturum ve kör test kapanır, ses aygıtı bırakılır
    /// (süreç sonlanırken aygıtta yarım arabellek "tık"ı kalmasın).
    pub fn shutdown(&mut self) {
        self.abx = None;
        self.close_session();
    }

    /// Çalar ya da kaldığı yerden devam eder. Şarkı bittiyse baştan çalar.
    pub fn play(&mut self) -> Result<(), AudioError> {
        match self.begin_play() {
            Some(transition) => self.install(Self::prepare(transition)).map(|_| ()),
            None => Ok(()),
        }
    }

    /// Duraklatır (ses ~10 ms içinde yumuşakça kısılır).
    pub fn pause(&mut self) {
        if let Some(session) = &self.session {
            session.shared.paused.store(true, Ordering::Release);
        }
    }

    /// Çalıyorsa duraklatır, değilse çalar (testler; komut geçişi kilit dışında yapar).
    #[cfg(test)]
    pub fn toggle(&mut self) -> Result<(), AudioError> {
        if self.state() == PlaybackState::Playing {
            self.pause();
            Ok(())
        } else {
            self.play()
        }
    }

    /// Şarkıda verilen saniyeye atlar. Çalıyorsa çalmaya devam eder, değilse
    /// yeni noktada duraklatılmış bekler.
    pub fn seek(&mut self, seconds: f64) -> Result<(), AudioError> {
        match self.begin_seek(seconds) {
            Some(transition) => self.install(Self::prepare(transition)).map(|_| ()),
            None => Ok(()),
        }
    }

    /// Durdurur ve şarkının başına döner (duraklatılmış olarak).
    pub fn stop(&mut self) -> Result<(), AudioError> {
        match self.begin_stop() {
            Some(transition) => self.install(Self::prepare(transition)).map(|_| ()),
            None => Ok(()),
        }
    }

    pub fn state(&self) -> PlaybackState {
        match (&self.session, &self.pending) {
            (Some(session), _) => session.state(),
            (None, Some(pending)) if pending.playing => PlaybackState::Playing,
            (None, Some(_)) => PlaybackState::Paused,
            (None, None) if self.last_error.is_some() => PlaybackState::Error,
            (None, None) => PlaybackState::Idle,
        }
    }

    /// Kulaklık düzeltmesi ayarı.
    pub fn headphone(&self) -> HeadphoneSettings {
        self.headphone.clone()
    }

    /// Kulaklık düzeltmesini değiştirir; çalan ses ~30 ms içinde yumuşakça geçer.
    pub fn set_headphone(&mut self, settings: HeadphoneSettings) -> HeadphoneSettings {
        let settings = settings.sanitized();
        self.headphone_control
            .set(settings.profile.as_ref(), settings.enabled);
        self.headphone = settings.clone();
        settings
    }

    /// Elle parametrik ekolayzer ayarı.
    pub fn parametric(&self) -> ParametricSettings {
        self.parametric.clone()
    }

    /// Karşılaştırma (A/B) açık mı?
    pub fn parametric_comparing(&self) -> bool {
        self.parametric_compare && self.parametric.is_active()
    }

    /// Elle parametrik ekolayzeri değiştirir; çalan ses ~30 ms içinde yumuşakça geçer. En büyük
    /// yükseltme taşma korumasına bildirilir (şarkının boşluğu yetmiyorsa ses o kadar kısılır).
    pub fn set_parametric(&mut self, settings: ParametricSettings) -> ParametricSettings {
        let settings = settings.sanitized();
        self.parametric_control.set_filters(
            &settings.filters(),
            0.0,
            settings.boost_db(),
            settings.design,
            settings.enabled,
        );
        self.parametric = settings.clone();
        self.apply_parametric_compare();
        settings
    }

    /// Karşılaştırmayı (A/B) açar ya da kapatır: açıkken parametrik ekolayzer atlanır, ses
    /// müziğe benzer seste ekolayzerli hâliyle aynı yükseklikte çalar.
    pub fn set_parametric_compare(&mut self, compare: bool) {
        self.parametric_compare = compare;
        self.apply_parametric_compare();
    }

    fn apply_parametric_compare(&self) {
        self.parametric_control
            .set_compare(self.parametric_comparing(), self.parametric.loudness_db());
    }

    /// Crossfeed ayarı.
    pub fn crossfeed(&self) -> CrossfeedSettings {
        self.crossfeed
    }

    /// Crossfeed'i değiştirir; çalan ses ~30 ms'lik çapraz geçişle değişir (tık yok). Hiçbir
    /// frekansı yükseltmediği için taşma korumasına pay bildirilmez. Bit-perfect oturumda ve
    /// mono/çok kanallı şarkıda ses işlenmez; ayar saklanır, sonraki stereo oturumda uygulanır.
    pub fn set_crossfeed(&mut self, settings: CrossfeedSettings) -> CrossfeedSettings {
        let settings = settings.sanitized();
        self.crossfeed_control.set(settings);
        self.crossfeed = settings;
        settings
    }

    /// Oturumların ses işlemesinin ayarları (şarkı seviyeleri her oturumda yeniden kurulur).
    fn render_controls(&self) -> RenderControls {
        RenderControls {
            eq: Arc::clone(&self.eq),
            headphone: Arc::clone(&self.headphone_control),
            parametric: Arc::clone(&self.parametric_control),
            crossfeed: Arc::clone(&self.crossfeed_control),
            loudness: Arc::clone(&self.loudness),
            levels: Arc::new(TrackLevels::new()),
            // Oturum, aygıtı özel modda açabildiyse kendisi açar.
            bit_perfect: false,
        }
    }

    /// Ekolayzer ayarları.
    pub fn equalizer(&self) -> EqSettings {
        self.eq.settings()
    }

    /// Arayüzün gösterdiği ekolayzer durumu: eğri ve çalan şarkıya göre taşma koruması
    /// (boşluk ve ölçülmüş bas tepeleri).
    pub fn equalizer_state(&self) -> EqState {
        let level = self.current_level();
        EqState::new(
            self.eq.settings(),
            level.map_or(0.0, |l| l.headroom_db),
            level.and_then(|l| l.bass_peaks).as_ref(),
        )
    }

    /// Ekolayzer ayarlarını değiştirir; çalan ses ~40 ms içinde yumuşakça uyar.
    /// Düzeltilmiş (±12 dB'ye kırpılmış) ayarları döndürür.
    pub fn set_equalizer(&mut self, settings: EqSettings) -> EqSettings {
        self.eq.set(settings)
    }

    pub fn status(&mut self) -> PlaybackStatus {
        let level = self.current_level();
        match &self.session {
            Some(session) => {
                let (track, position_secs) = session.now_playing();
                let bpm = self
                    .analysis_for(&track.path)
                    .and_then(|a| a.spectrogram.beat_grid())
                    .map(|grid| grid.bpm);
                let mut output = session.path.clone();
                output.resampled = output.sample_rate != track.sample_rate;
                output.normalization_db = level
                    .filter(|_| self.loudness.enabled() && !output.bit_perfect)
                    .map(|level| level.gain_db);
                PlaybackStatus {
                    state: session.state(),
                    track: Some(track),
                    position_secs,
                    underruns: session.shared.underruns.load(Ordering::Relaxed),
                    error: session.shared.error(),
                    bpm,
                    output: Some(output),
                }
            }
            // Geçiş sürüyor (yeni şarkı açılıyor ya da sarılıyor): hedef durum gösterilir.
            None => PlaybackStatus {
                state: self.state(),
                track: self.pending.as_ref().and_then(|p| p.track.clone()),
                position_secs: self.pending.as_ref().map_or(0.0, |p| p.position_secs),
                underruns: 0,
                error: self.last_error.clone(),
                bpm: None,
                output: None,
            },
        }
    }
}

#[cfg(test)]
mod tests;
