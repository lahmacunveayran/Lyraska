//! Oturum geçişi (yeni şarkı, sarma, durdurma, aygıt değişimi, kör testten dönüş): eski
//! oturumun sesi kilit altında kısılmaya başlar ([`Player::begin_transition`]), yeni oturum kilit
//! dışında hazırlanır ([`Player::prepare`]) ve kilit altında takılır ([`Player::install`]).

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use super::session::{wait_for_fade_out, Session, FADE_OUT_TIMEOUT};
use super::{Analysis, AnalysisContext, PlaybackState, Player};
use crate::analysis::spectrogram::Spectrogram;
use crate::audio::decode::TrackInfo;
use crate::audio::render::RenderControls;
use crate::audio::AudioError;
use crate::diagnostics;

/// Kilit **dışında** yapılacak oturum geçişi: eski oturumun kısılıp kapanması, analizin
/// başlatılması, dosyanın açılması, ön dolum ve ses aygıtının açılması yüzlerce ms sürer
/// (yavaş diskte saniyeler). Arayüzün durum ve görsel sorguları bu sırada beklemesin diye
/// oynatıcı yalnızca [`Player::begin_transition`] ve [`Player::install`] sırasında kilitlenir;
/// aradaki [`Player::prepare`] ayrı bir iş parçacığında çalışır (SES-02, KUT-08).
pub struct Transition {
    seq: u64,
    path: PathBuf,
    autoplay: bool,
    start_secs: Option<f64>,
    /// Kapatılacak eski oturum (kısılması bekleyip düşürülür).
    old: Option<Session>,
    /// Artık gerekmeyen analizler (iş parçacıkları kilit dışında bırakılır).
    stale: Vec<Analysis>,
    analysis: AnalysisPlan,
    context: AnalysisContext,
    next: Option<PathBuf>,
    controls: RenderControls,
    bit_perfect: bool,
}

/// Geçişte şarkının analizi nereden gelir.
enum AnalysisPlan {
    /// Oynatıcıdaki analiz aynı şarkının (sarma, durdurma): yerinde kalır.
    Keep(Option<Arc<Spectrogram>>),
    /// Önceden başlatılmış analiz (sıradaki şarkı) oynatıcıdan alındı.
    Use(Analysis),
    /// Kilit dışında yeni analiz başlatılır.
    Start,
}

/// Hazırlanmış geçiş: [`Player::install`] ile oynatıcıya takılır.
pub struct Prepared {
    seq: u64,
    analysis: Option<Analysis>,
    outcome: Result<Session, AudioError>,
}

/// Geçiş sürerken durum sorgusuna verilen cevap (eski oturum kapandı, yenisi henüz yok).
pub(super) struct PendingTransition {
    pub(super) seq: u64,
    /// Açılmakta olan şarkı.
    pub(super) path: PathBuf,
    pub(super) track: Option<TrackInfo>,
    pub(super) position_secs: f64,
    pub(super) playing: bool,
}

/// Aygıt değişiminde art arda en fazla bu kadar otomatik yeniden açma denenir; sonra hata
/// durumunda kalınır (aygıt sürekli kopuyorsa döngüye girilmez).
pub(super) const MAX_DEVICE_RECOVERIES: u8 = 3;

impl Player {
    /// Oturumu yeniden kurar (yeni şarkı, sarma, durdurma için ortak yol): geçişin üç adımı
    /// art arda, aynı iş parçacığında.
    pub(super) fn restart(
        &mut self,
        path: &Path,
        autoplay: bool,
        start_secs: Option<f64>,
    ) -> Result<TrackInfo, AudioError> {
        let transition = self.begin_transition(path, autoplay, start_secs);
        self.install(Self::prepare(transition))
    }

    /// Geçişin kilit altındaki ilk adımı (hiç beklemez): eski oturumun sesi kısılmaya başlar ve
    /// oynatıcıdan alınır, analiz planlanır. Dönen değer [`Self::prepare`]'e verilir.
    pub fn begin_transition(
        &mut self,
        path: &Path,
        autoplay: bool,
        start_secs: Option<f64>,
    ) -> Transition {
        // Kör test açıksa kapanır: ses aygıtı şarkıya geçer.
        self.abx = None;
        self.abx_resume = None;
        self.last_error = None;
        // Sıradaki şarkı açılan şarkının kendisiyse (boşluksuz geçiş sonrası) artık sırada değil.
        if self.next_path.as_deref() == Some(path) {
            self.next_path = None;
        }
        self.transition_seq += 1;
        let seq = self.transition_seq;
        let old = self.session.take();
        let mut pending = PendingTransition {
            seq,
            path: path.to_path_buf(),
            track: None,
            position_secs: start_secs.unwrap_or(0.0),
            playing: autoplay,
        };
        if let Some(session) = &old {
            if matches!(
                session.state(),
                PlaybackState::Playing | PlaybackState::Paused
            ) {
                // Kısılma hemen başlar; hoparlöre ulaşması `prepare`'de beklenir.
                session.shared.paused.store(true, Ordering::Release);
            }
            let (track, _) = session.now_playing();
            if track.path == path {
                pending.track = Some(track);
            }
        }
        self.pending = Some(pending);
        let mut stale = Vec::new();
        let analysis = if self.analysis.as_ref().is_some_and(|a| a.path == path) {
            AnalysisPlan::Keep(self.analysis.as_ref().map(|a| Arc::clone(&a.spectrogram)))
        } else {
            stale.extend(self.analysis.take());
            match self.next_analysis.take() {
                Some(next) if next.path == path => AnalysisPlan::Use(next),
                other => {
                    stale.extend(other);
                    AnalysisPlan::Start
                }
            }
        };
        Transition {
            seq,
            path: path.to_path_buf(),
            autoplay,
            start_secs,
            old,
            stale,
            analysis,
            context: self.analysis_context.clone(),
            next: self.next_path.clone(),
            controls: self.render_controls(),
            bit_perfect: self.bit_perfect,
        }
    }

    /// Çalan şarkıda sarma geçişini başlatır; şarkı yoksa `None`.
    pub fn begin_seek(&mut self, seconds: f64) -> Option<Transition> {
        let session = self.session.as_ref()?;
        let path = session.now_playing().0.path;
        let resume = session.state() == PlaybackState::Playing;
        Some(self.begin_transition(&path, resume, Some(seconds)))
    }

    /// Geçişin bloklayan orta adımı; oynatıcı kilidi **olmadan** çağrılır (ayrı iş parçacığı).
    pub fn prepare(transition: Transition) -> Prepared {
        let Transition {
            seq,
            path,
            autoplay,
            start_secs,
            old,
            stale,
            analysis,
            context,
            next,
            controls,
            bit_perfect,
        } = transition;
        // Eski oturum: kısılma hoparlöre ulaşınca kapanır ("tık" olmasın); ses aygıtı serbest
        // kalır, iki şarkı üst üste çalmaz.
        if let Some(session) = old {
            if session.shared.paused.load(Ordering::Acquire)
                && !session.shared.ended.load(Ordering::Acquire)
                && session.shared.error().is_none()
            {
                wait_for_fade_out(&session.shared, FADE_OUT_TIMEOUT);
            }
            drop(session);
        }
        drop(stale);
        // Analiz önce kurulur: ses yüksekliği ölçümü hazırsa ilk örnekten uygulanır.
        let (analysis, spectrogram) = match analysis {
            AnalysisPlan::Keep(spectrogram) => (None, spectrogram),
            AnalysisPlan::Use(analysis) => {
                let spectrogram = Arc::clone(&analysis.spectrogram);
                (Some(analysis), Some(spectrogram))
            }
            AnalysisPlan::Start => {
                let analysis = Analysis::start(&path, &context, None);
                let spectrogram = analysis.as_ref().map(|a| Arc::clone(&a.spectrogram));
                (analysis, spectrogram)
            }
        };
        let start = |bit_perfect: bool| {
            Session::start(
                &path,
                autoplay,
                start_secs,
                next.clone(),
                &controls,
                spectrogram.clone(),
                bit_perfect,
            )
        };
        let outcome = match start(bit_perfect) {
            // Aygıt özel moda alınamadı (ör. başka program tutuyor): normal yoldan çal,
            // nedeni sinyal yolunda göster.
            Err(AudioError::Exclusive(reason)) => start(false).map(|mut session| {
                session.path.notice = Some(reason);
                session
            }),
            other => other,
        };
        Prepared {
            seq,
            analysis,
            outcome,
        }
    }

    /// Geçişin kilit altındaki son adımı (hiç beklemez): hazırlanan oturum takılır. Bu arada
    /// daha yeni bir geçiş başladıysa hazırlanan oturum kapatılır ve yenisi beklenir.
    pub fn install(&mut self, prepared: Prepared) -> Result<TrackInfo, AudioError> {
        let Prepared {
            seq,
            analysis,
            outcome,
        } = prepared;
        if seq != self.transition_seq {
            return match outcome {
                Ok(session) => {
                    session.shared.stop.store(true, Ordering::Release);
                    Ok(session.info.clone())
                }
                Err(error) => Err(error),
            };
        }
        if self.pending.as_ref().is_some_and(|p| p.seq == seq) {
            self.pending = None;
        }
        if let Some(analysis) = analysis {
            self.analysis = Some(analysis);
        }
        match outcome {
            Ok(session) => {
                let info = session.info.clone();
                self.session = Some(session);
                Ok(info)
            }
            Err(error) => {
                self.last_error = Some(error.to_string());
                Err(error)
            }
        }
    }

    /// Varsayılan ses aygıtı değişti ya da koptuysa (kulaklık takıldı/çıkarıldı) çalan şarkıyı
    /// yeni varsayılan aygıtta kaldığı yerden sürdürür (duraklatılmışsa duraklatılmış). Durum
    /// sorgusunda ve her görsel karede bakılır (SES-01). Art arda çok tekrarlanırsa durur:
    /// aygıt gerçekten yoksa hata durumu gösterilir.
    pub fn recover_device(&mut self) {
        if let Some(transition) = self.begin_device_recovery() {
            // Açılamazsa (aygıt hiç yok) hata durumu gösterilir; kullanıcı "çal" ile yeniden dener.
            let _ = self.install(Self::prepare(transition));
        }
    }

    /// Aygıt değiştiyse (kulaklık takıldı/çıkarıldı) şarkıyı yeni aygıtta kaldığı yerden sürdürecek
    /// geçişin kilit altındaki adımı (hiç beklemez). Ses aygıtını açmak ve ön dolum yüzlerce ms
    /// sürer: geçiş kilit dışında hazırlanır (`commands::finish_transition`), görsel kareleri ve
    /// durum sorguları beklemez (DENETIM-FAZ0 ISK-02, ikinci tur). Gerek yoksa `None`.
    pub fn begin_device_recovery(&mut self) -> Option<Transition> {
        let session = self.session.as_ref()?;
        if !session.shared.device_changed.swap(false, Ordering::AcqRel) {
            return None;
        }
        if session.shared.ended.load(Ordering::Acquire)
            || self.device_recoveries >= MAX_DEVICE_RECOVERIES
        {
            return None;
        }
        self.device_recoveries += 1;
        let (track, position) = session.now_playing();
        let resume = !session.shared.paused.load(Ordering::Acquire);
        diagnostics::info(&format!(
            "Ses aygıtı değişti; \"{}\" yeni aygıtta {position:.1}. saniyeden sürdürülüyor",
            track.file_name
        ));
        Some(self.begin_transition(&track.path, resume, Some(position)))
    }

    /// Çalmanın kilit altındaki adımı (hiç beklemez). Duraklatılmış oturum hemen sürer (`None`).
    /// Bitmiş ya da hatalı oturumun yeniden kurulması gerekir: dönen geçiş kilit dışında
    /// [`Self::prepare`] ile hazırlanıp [`Self::install`] ile kurulur (bkz. `open_track`).
    pub fn begin_play(&mut self) -> Option<Transition> {
        self.device_recoveries = 0;
        let session = self.session.as_ref()?;
        match session.state() {
            PlaybackState::Ended => {
                let path = session.now_playing().0.path;
                Some(self.begin_transition(&path, true, None))
            }
            PlaybackState::Error => {
                // Ör. aygıt koptu (kulaklık çıkarıldı): o anki varsayılan aygıtta kalınan
                // yerden sürer.
                let (track, position) = session.now_playing();
                Some(self.begin_transition(&track.path, true, Some(position)))
            }
            _ => {
                session.shared.paused.store(false, Ordering::Release);
                None
            }
        }
    }

    /// Durdurmanın kilit altındaki adımı: şarkı başa sarılıp duraklatılmış açılacak (geçiş kilit
    /// dışında hazırlanır). Oturum yoksa `None`.
    pub fn begin_stop(&mut self) -> Option<Transition> {
        let path = self.session.as_ref()?.now_playing().0.path;
        self.device_recoveries = 0;
        Some(self.begin_transition(&path, false, None))
    }
}
