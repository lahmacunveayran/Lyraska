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

use super::abx::{AbxChoice, AbxRequest, AbxSource, AbxStatus, AbxTest, PreparedAbx};
use super::crossfeed::{CrossfeedControl, CrossfeedSettings};
use super::decode::{Decoder, TrackInfo};
use super::eq::{protection_db, Design, EqControl, EqSettings, EqState};
use super::normalize::{LoudnessControl, TrackLevels};
use super::peq::{HeadphoneSettings, ParametricSettings, PeqControl};
use super::render::RenderControls;
use super::spectrum;
use super::waveform;
use super::AudioError;
use crate::analysis::beats::BeatPosition;
use crate::analysis::levels::ChannelLevels;
use crate::analysis::spectrogram::{self, BANDS};

mod bit_perfect;
mod decode_thread;
mod next_track;
mod normalization;
mod session;
mod song_maps;
mod track_analysis;
mod transition;

use session::Session;
pub use session::SharedState;
pub(crate) use session::{wait_for_fade_out, wait_for_prefill, FADE_OUT_TIMEOUT};
use track_analysis::{Analysis, AnalysisContext};
use transition::PendingTransition;
pub use transition::{Prepared, Transition};

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

/// Şu an duyulan anın görsel verisi (önceden yapılmış analizden).
#[derive(Debug, Clone, PartialEq)]
pub struct VisualData {
    /// Verinin ait olduğu çalma konumu (saniye).
    pub seconds: f64,
    /// Frekans bantları (0..1), ekolayzerin etkisi eklenmiş.
    pub bands: [f32; BANDS],
    /// Sol/sağ kanal seviyeleri (ekolayzerden önce).
    pub levels: ChannelLevels,
    /// 0 VU'ya denk gelen seviye (dBFS); analiz bitene kadar `None`.
    pub vu_reference_db: Option<f32>,
    /// Tempo ve o anın vuruş ızgarasındaki yeri; analiz bitene kadar ya da
    /// belirgin ritim yoksa `None`.
    pub beat: Option<(f64, BeatPosition)>,
    /// Şarkı yapısından o an: vuruşun ölçüdeki yeri, enerji, bölüm (analiz bitince).
    pub structure: Option<StructureNow>,
    /// Görsel Yönetmen'in o anki notu (analiz bitince).
    pub director: Option<crate::director::DirectorFrame>,
}

/// Şarkı yapısında o an.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StructureNow {
    /// Vuruşun ölçüdeki yeri (1 = ölçü başı).
    pub bar_beat: Option<usize>,
    /// Ölçüdeki vuruş sayısı (3 ya da 4).
    pub meter: usize,
    pub energy: Option<f32>,
    pub section: Option<usize>,
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

    /// Kör dinleme testini kurar. Çalan şarkı durur (ses aygıtı teste geçer); test bitince
    /// kaldığı yerde duraklatılmış açılır.
    pub fn abx_start(&mut self, request: &AbxRequest) -> Result<AbxStatus, AudioError> {
        self.abx_install(AbxTest::prepare(request))
    }

    /// Hazırlığı (uzun sürebilir: iki dosya çözülür, hizalanır) oynatıcının kilidi **dışında**
    /// yapılmış testi kurar; görseller ve durum sorguları hazırlık boyunca beklemez (#81).
    /// Hazırlık başarısızsa şarkı kesilmez; süren bir test yeniden kuruluyorduysa o test kapanır
    /// ve sakladığı şarkı kaldığı yerde geri gelir.
    pub fn abx_install(
        &mut self,
        prepared: Result<PreparedAbx, AudioError>,
    ) -> Result<AbxStatus, AudioError> {
        self.abx = None;
        let prepared = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                self.abx_stop();
                return Err(error);
            }
        };
        // Kilit dışında hazırlanan bir şarkı geçişi sürüyorsa iptal edilir: kurulduğunda oturumunu
        // kendisi kapatır (daha yeni bir geçiş var sayar), kör testle üst üste çalmaz. Test bitince
        // dönülecek şarkı, açılmakta olan şarkıdır.
        let pending = self.pending.take();
        if pending.is_some() {
            self.transition_seq += 1;
        }
        if self.abx_resume.is_none() {
            self.abx_resume = self
                .session
                .as_ref()
                .map(|s| {
                    let (track, position) = s.now_playing();
                    (track.path, position)
                })
                .or_else(|| pending.map(|p| (p.path, p.position_secs)));
        }
        self.close_session();
        match prepared.start() {
            Ok(test) => {
                let status = test.status();
                self.abx = Some(test);
                Ok(status)
            }
            Err(error) => {
                // Ses aygıtı açılamadı: şarkı kaldığı yerde geri gelir.
                self.abx_stop();
                Err(error)
            }
        }
    }

    /// Testte A, B ya da X'i çalar.
    pub fn abx_select(&mut self, choice: AbxChoice) -> AbxStatus {
        if let Some(test) = &mut self.abx {
            test.select(choice);
        }
        self.abx_status()
    }

    pub fn abx_pause(&mut self) -> AbxStatus {
        if let Some(test) = &mut self.abx {
            test.pause();
        }
        self.abx_status()
    }

    /// "X, A'dır" ya da "X, B'dir".
    pub fn abx_answer(&mut self, guess: AbxSource) -> AbxStatus {
        if let Some(test) = &mut self.abx {
            test.answer(guess);
        }
        self.abx_status()
    }

    /// Testi kapatır; test başlarken çalan şarkı kaldığı yerde duraklatılmış açılır.
    pub fn abx_stop(&mut self) -> AbxStatus {
        if let Some(transition) = self.begin_abx_stop() {
            // Açılamazsa (ör. dosya silindi) hata durumu gösterilir; test yine kapanır.
            let _ = self.install(Self::prepare(transition));
        }
        AbxStatus::inactive()
    }

    /// Testi kapatmanın kilit altındaki adımı (hiç beklemez): şarkıya dönülecekse geçiş başlar;
    /// ses aygıtını açmak kilit dışında yapılır (`commands::abx_stop`).
    pub fn begin_abx_stop(&mut self) -> Option<Transition> {
        self.abx = None;
        let (path, position) = self.abx_resume.take()?;
        Some(self.begin_transition(&path, false, Some(position)))
    }

    pub fn abx_status(&self) -> AbxStatus {
        self.abx
            .as_ref()
            .map_or_else(AbxStatus::inactive, AbxTest::status)
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

    /// Şu an duyulan anın görsel verisi. Analiz o ana yetişmediyse `None`.
    /// Spektrum ekolayzerden önce çıkarıldığı için ekolayzerin etkisi burada eklenir:
    /// görseller duyulanı gösterir.
    pub fn visual_now(&mut self) -> Option<VisualData> {
        // Boşluksuz geçişle gelen şarkının ölçümü de vaktinde ses yoluna yazılsın.
        self.sync_levels();
        // Gecikme telafisi: ekranda görüneceği an ve ses aygıtının ek gecikmesi. Boşluksuz
        // geçişte şarkı da bu kaydırılmış ana göre seçilir (A3).
        let offset = crate::visual_bridge::visual_offset_secs(self.audio_delay_ms);
        let (track, seconds) = self.session.as_ref()?.playing_at(offset);
        // Boşluksuz geçişle şarkı değiştiyse analizi de değiştir.
        self.adopt_analysis(&track.path);
        let rate = track.sample_rate;
        let spectrogram = &self.analysis.as_ref()?.spectrogram;
        let mut bands = spectrogram.frame_at(seconds)?;
        let levels = spectrogram.meters_at(seconds)?;
        let vu_reference_db = spectrogram.vu_reference_db();
        let beat = spectrogram
            .beat_grid()
            .and_then(|grid| Some((grid.bpm, grid.position_at(seconds)?)));
        let director = spectrogram
            .choreography()
            .map(|c| c.frame_at(seconds, self.visual_safe));
        let structure = spectrogram.song_map().map(|map| StructureNow {
            bar_beat: beat.map(|(_, position)| map.bar_beat(position.index)),
            meter: map.meter,
            energy: map.energy_at(seconds),
            section: map.section_at(seconds),
        });
        // Bit-perfect oturumda ekolayzer sese uygulanmaz; görsellere de eklenmez.
        let bit_perfect = self.session.as_ref().is_some_and(|s| s.path.bit_perfect);
        if !bit_perfect {
            let offsets = self.visual_eq_offsets(rate);
            for (level, &db) in bands.iter_mut().zip(&offsets) {
                *level = spectrogram::shift_level(*level, db);
            }
        }
        Some(VisualData {
            seconds,
            bands,
            levels,
            vu_reference_db,
            beat,
            structure,
            director,
        })
    }

    /// Şu an duyulan anın ham dalga biçimi (MilkDrop sahnesi): 3 × 1024 bayt — karışım, sol,
    /// sağ; 44,1 kHz; 128 = sessizlik. Görsel karelerle aynı an (ekran ve ses aygıtı gecikmesi
    /// telafi edilerek). Duraklatılmışsa ya da şarkı bittiyse sessizlik; çalan oturum yoksa
    /// (açılıyor, sarılıyor, kör test, hata) `None`.
    pub fn visual_waveform(&self) -> Option<Vec<u8>> {
        let session = self.session.as_ref()?;
        match session.state() {
            PlaybackState::Playing => {}
            PlaybackState::Paused | PlaybackState::Ended => return Some(waveform::silence()),
            PlaybackState::Idle | PlaybackState::Error => return None,
        }
        // Boşluksuz geçişle gelen şarkının ölçümü de kazanca yansısın.
        self.sync_levels();
        let heard = session.shared.output_heard.load(Ordering::Acquire);
        let offset = crate::visual_bridge::visual_offset_secs(self.audio_delay_ms);
        session.shared.waveform_at(heard, offset)
    }

    /// Şu an duyulan anın ince spektrum çubukları ("Kendi resmin" sahnesi): [`spectrum::BARS`]
    /// seviye (0..1, bas solda; [`spectrum::bar_levels`]). Görsel karelerle aynı an (gecikme
    /// telafili). Duraklatılmışsa ya da şarkı bittiyse hepsi 0; çalan oturum yoksa `None`.
    pub fn visual_spectrum(&self) -> Option<Vec<f32>> {
        let session = self.session.as_ref()?;
        match session.state() {
            PlaybackState::Playing => {}
            PlaybackState::Paused | PlaybackState::Ended => return Some(spectrum::silence()),
            PlaybackState::Idle | PlaybackState::Error => return None,
        }
        self.sync_levels();
        let heard = session.shared.output_heard.load(Ordering::Acquire);
        let offset = crate::visual_bridge::visual_offset_secs(self.audio_delay_ms);
        session.shared.spectrum_at(heard, offset)
    }

    /// Ses aygıtının ek gecikmesi (ms).
    pub fn audio_delay_ms(&self) -> i32 {
        self.audio_delay_ms
    }

    /// Ses gecikmesini ayarlar (sınırlar içine alınır) ve uygulanan değeri döndürür.
    pub fn set_audio_delay_ms(&mut self, ms: i32) -> i32 {
        self.audio_delay_ms = crate::visual_bridge::clamp_audio_delay_ms(ms);
        self.audio_delay_ms
    }

    /// Epilepsi güvenli modu açık mı?
    pub fn visual_safe(&self) -> bool {
        self.visual_safe
    }

    pub fn set_visual_safe(&mut self, safe: bool) {
        self.visual_safe = safe;
    }

    /// Ekolayzerin ve bas düğmesinin spektrum bantlarındaki toplam kazancı (dB): filtrelerin
    /// tepkisi ve ses yolundaki gibi, şarkının boşluğunun yetmediği kadar taşma koruması
    /// kısması. (Küçük hoparlörün harmonikleri doğrusal olmadığı için eklenmez.)
    /// Tepki, ayar ya da örnekleme hızı değişmedikçe yeniden hesaplanmaz.
    fn visual_eq_offsets(&mut self, rate: u32) -> [f64; BANDS] {
        // Grafik ve parametrik ekolayzerin sürümleri birlikte (biri değişince yeniden hesaplanır).
        let version = self.eq.version() ^ self.parametric_control.version().rotate_left(32);
        let (response, eq_db, bass) = match self.visual_eq {
            Some((v, r, response, eq_db, bass)) if v == version && r == rate => {
                (response, eq_db, bass)
            }
            _ => {
                let settings = self.eq.settings();
                let (response, eq_db) = if settings.is_active() {
                    let rate_hz = f64::from(rate);
                    let design = Design::new(&settings.gains_db, rate_hz);
                    let (bass_db, small_speaker) = settings.effective_bass();
                    let response = spectrogram::band_centers(rate_hz).map(|hz| {
                        design.response_db(hz, rate_hz)
                            + super::bass::response_db(bass_db, small_speaker, hz, rate_hz)
                    });
                    (response, -design.preamp_db)
                } else {
                    ([0.0; BANDS], 0.0)
                };
                // Parametrik ekolayzer de görsellerde: çizilen spektrum duyulan sese uysun.
                let (response, eq_db) =
                    if self.parametric.is_active() && !self.parametric_comparing() {
                        let rate_hz = f64::from(rate);
                        let centers = spectrogram::band_centers(rate_hz);
                        let curve = self.parametric.response_db(&centers, rate_hz);
                        let mut combined = response;
                        for (value, db) in combined.iter_mut().zip(curve) {
                            *value += db;
                        }
                        (combined, eq_db + self.parametric.boost_db())
                    } else {
                        (response, eq_db)
                    };
                let bass = settings.bass_boost();
                self.visual_eq = Some((version, rate, response, eq_db, bass));
                (response, eq_db, bass)
            }
        };
        // Ses yolundaki gibi: bas, şarkının ölçülmüş bas tepelerine göre.
        let level = self.current_level();
        let headroom = level.map_or(0.0, |l| l.headroom_db);
        let peaks = level.and_then(|l| l.bass_peaks);
        let protection = protection_db(eq_db + bass.rise_db(peaks.as_ref()), headroom);
        response.map(|db| db + protection)
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
