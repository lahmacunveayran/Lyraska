//! Oturum geçişi (yeni şarkı, sarma, durdurma, aygıt değişimi, kör testten dönüş): eski
//! oturumun sesi kilit altında kısılmaya başlar ([`Player::begin_transition`]), yeni oturum kilit
//! dışında hazırlanır ([`Player::prepare`]) ve kilit altında takılır ([`Player::install`]).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};

use super::session::{wait_for_fade_out, Session, SharedState, FADE_OUT_TIMEOUT};
use super::{Analysis, AnalysisContext, PlaybackState, Player};
use crate::analysis::spectrogram::Spectrogram;
use crate::audio::decode::Decoder;
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
    /// Geçişlerin sırası (RTS-01): hazırlıklar sırayla yapılır, eskimiş olan aygıt açmaz.
    gate: Arc<TransitionGate>,
    path: PathBuf,
    autoplay: bool,
    start_secs: Option<f64>,
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
    gate: Arc<TransitionGate>,
    /// Oturumun aldığı sıradaki şarkı (geçiş başladığı andaki).
    next: Option<PathBuf>,
    analysis: Option<Analysis>,
    outcome: Outcome,
}

/// Hazırlığın sonucu.
enum Outcome {
    Started(Session),
    Failed(AudioError),
    /// Hazırlık sürerken daha yeni bir geçiş başladı: oturum açılmadı (ya da kısılıp kapatıldı).
    Superseded(TrackInfo),
}

/// Geçişlerin sırası (Denetim 3, RTS-01). Arayüz sarmayı ve şarkı açmayı ayrı kuyruklardan gönderir;
/// "Önceki"ye iki hızlı basış iki geçişi üst üste başlatır. Eskiden iki hazırlık aynı anda ses aygıtını
/// açıp çalıyor, eskimiş olanı takılırken kısılmadan kesiliyordu (tık; bit-perfect'te özel modu
/// tutup yenisinin açılmasını engelleyebilir). Şimdi ses aygıtında aynı anda tek oturum vardır:
/// - hazırlıklar sırayla yapılır: yeni hazırlık, ondan önce başlamış ve süren hazırlığın bitmesini
///   bekler (`preparing`);
/// - geçişin kapattığı oturum geçişte değil, burada durur (`retired`): hangi hazırlık önce başlarsa
///   onu kısarak kapatır, ses aygıtını ancak ondan sonra açar;
/// - daha yeni bir geçiş başlamışsa hazırlık ses aygıtını hiç açmaz; açtıktan sonra eskidiyse oturumu
///   kısarak kapatır; takılırken eskimiş çıkan oturum da kilit dışında kısılarak kapanır, sonraki
///   hazırlık onun kapanmasını bekler (`closing`).
///
/// Bekleme oynatıcı kilidini almaz (hazırlıklar kilit dışındadır); sınırı vardır, takılan bir
/// hazırlık sonrakileri sonsuza dek durdurmaz.
#[derive(Default)]
pub(super) struct TransitionGate {
    /// En son başlatılan geçişin sırası.
    latest: AtomicU64,
    state: Mutex<GateState>,
    turn: Condvar,
}

#[derive(Default)]
struct GateState {
    /// Hazırlığı süren geçişler.
    preparing: BTreeSet<u64>,
    /// Geçişlerin kapattığı, kısılması başlamış oturumlar: sıradaki hazırlık kapatır.
    retired: Vec<Session>,
    /// Hazırlanmış ama henüz takılmamış oturumlar ile kilit dışında (ayrı iş parçacığında)
    /// kapanmakta olanlar: sonraki hazırlık, takılmaları ya da kapanmaları bitene kadar bekler.
    unsettled: Vec<Weak<SharedState>>,
}

/// Yeni hazırlık, önceki hazırlık bitmezse en çok bu kadar bekler.
const TURN_TIMEOUT: Duration = Duration::from_secs(10);
/// Kilit dışında kapanan oturumun bitmesi en çok bu kadar beklenir (kısılma + iş parçacıkları).
const CLOSING_TIMEOUT: Duration = Duration::from_millis(500);

impl TransitionGate {
    fn state(&self) -> MutexGuard<'_, GateState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(super) fn begin(&self, seq: u64) {
        self.latest.store(seq, Ordering::Release);
    }

    fn superseded(&self, seq: u64) -> bool {
        self.latest.load(Ordering::Acquire) != seq
    }

    /// Kapatılacak oturum (kısılması başlamış olmalı): sıradaki hazırlık kapatır.
    fn retire(&self, session: Session) {
        self.state().retired.push(session);
    }

    /// Hazırlanan oturum takılana (ya da eskimişse kapanana) kadar sonraki hazırlık bekler.
    fn unsettled(&self, shared: &Arc<SharedState>) {
        self.state().unsettled.push(Arc::downgrade(shared));
    }

    /// Hazırlanan oturum takıldı: artık oynatıcının oturumu (sonraki geçiş onu kapatır).
    fn settled(&self, shared: &Arc<SharedState>) {
        self.state()
            .unsettled
            .retain(|weak| !std::ptr::eq(weak.as_ptr(), Arc::as_ptr(shared)));
    }

    /// Sırayı bekler: `seq`'ten önce başlamış, süren hazırlık kalmayınca döner.
    fn enter(&self, seq: u64) -> Turn<'_> {
        let deadline = Instant::now() + TURN_TIMEOUT;
        let mut state = self.state();
        while state.preparing.first().is_some_and(|&first| first < seq) {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            state = match self.turn.wait_timeout(state, deadline - now) {
                Ok((state, _)) => state,
                Err(poisoned) => poisoned.into_inner().0,
            };
        }
        state.preparing.insert(seq);
        Turn { gate: self, seq }
    }

    /// Havuzdaki kapatılan oturumları kısarak kapatır (oynatıcı kapanırken ve kör test başlarken de).
    pub(super) fn close_retired(&self) {
        let retired = std::mem::take(&mut self.state().retired);
        for session in retired {
            close_quietly(session);
        }
    }

    /// Kapatılan oturumları kısarak kapatır; hazırlanmış ama takılmamış ve kilit dışında kapanan
    /// oturumları bekler: dönünce ses aygıtında eski oturum kalmamıştır.
    fn clear_device(&self) {
        self.close_retired();
        let deadline = Instant::now() + CLOSING_TIMEOUT;
        loop {
            let busy = {
                let mut state = self.state();
                state.unsettled.retain(|weak| weak.strong_count() > 0);
                !state.unsettled.is_empty()
            };
            if !busy || Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    }
}

/// Süren hazırlık: bitince (düşürülünce) sıradaki hazırlık başlar.
struct Turn<'a> {
    gate: &'a TransitionGate,
    seq: u64,
}

impl Drop for Turn<'_> {
    fn drop(&mut self) {
        self.gate.state().preparing.remove(&self.seq);
        self.gate.turn.notify_all();
    }
}

/// Oturumu kısarak kapatır: kısılma hoparlöre ulaşınca düşürülür ("tık" olmasın).
fn close_quietly(session: Session) {
    session.shared.paused.store(true, Ordering::Release);
    if !session.shared.ended.load(Ordering::Acquire) && session.shared.error().is_none() {
        wait_for_fade_out(&session.shared, FADE_OUT_TIMEOUT);
    }
    drop(session);
}

#[cfg(test)]
impl Prepared {
    /// Hazırlığın açtığı oturumun paylaşılan durumu (açmadıysa `None`).
    pub(super) fn session_shared(&self) -> Option<Arc<super::session::SharedState>> {
        match &self.outcome {
            Outcome::Started(session) => Some(Arc::clone(&session.shared)),
            _ => None,
        }
    }
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
        // Sıradaki şarkı açılan şarkının kendisiyse (boşluksuz geçiş sonrası ya da ona geçildi) artık
        // sırada değil. Yalnızca çalan şarkı yeniden açılıyorsa (sarma, aygıt değişimi) ve sıradaki
        // henüz çalmadıysa sırada kalır: aynı şarkı art arda çalarken tekrar silinmez (hata avı A4).
        if self.next_path.as_deref() == Some(path) {
            let replay = self.session.as_ref().is_some_and(|session| {
                session.now_playing().0.path == path && !session.shared.next_consumed()
            });
            if !replay {
                self.next_path = None;
            }
        }
        self.transition_seq += 1;
        let seq = self.transition_seq;
        self.gate.begin(seq);
        let old = self.retire_session();
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
        // Eski oturum sıradaki hazırlıkça kapatılır (bu geçişinki olmayabilir: o daha önce başlarsa).
        if let Some(session) = old {
            self.gate.retire(session);
        }
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
            gate: Arc::clone(&self.gate),
            path: path.to_path_buf(),
            autoplay,
            start_secs,
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
            gate,
            path,
            autoplay,
            start_secs,
            stale,
            analysis,
            context,
            next,
            controls,
            bit_perfect,
        } = transition;
        // Önce başlamış hazırlık bitene kadar beklenir: iki hazırlık aynı anda aygıt açmaz.
        let turn = gate.enter(seq);
        drop(stale);
        // Daha yeni bir geçiş var: bu hazırlık ses aygıtına hiç dokunmaz (şarkının bilgisi yeter).
        // Eski oturumları da kapatmaz: onları en son geçişin hazırlığı kapatır (eskimiş hazırlık
        // havuzu alırsa, en son hazırlık havuzu boş bulup kapanma bitmeden aygıtı açabilirdi).
        if gate.superseded(seq) {
            drop(turn);
            let outcome = match Decoder::open(&path) {
                Ok(decoder) => Outcome::Superseded(decoder.info().clone()),
                Err(error) => Outcome::Failed(error),
            };
            return Prepared {
                seq,
                gate,
                next,
                analysis: None,
                outcome,
            };
        }
        // Eski oturumlar (bu geçişin ve önceki geçişlerin kapattıkları): kısılma hoparlöre ulaşınca
        // kapanır ("tık" olmasın); ses aygıtı serbest kalır, iki şarkı üst üste çalmaz.
        gate.clear_device();
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
        // Açılırken daha yeni bir geçiş başladıysa oturum kısılarak kapanır (sıra hâlâ bizde: yeni
        // hazırlık bu kapanmayı bekler).
        let outcome = match outcome {
            Ok(session) if gate.superseded(seq) => {
                let info = session.info.clone();
                close_quietly(session);
                Outcome::Superseded(info)
            }
            Ok(session) => {
                gate.unsettled(&session.shared);
                Outcome::Started(session)
            }
            Err(error) => Outcome::Failed(error),
        };
        drop(turn);
        Prepared {
            seq,
            gate,
            next,
            analysis,
            outcome,
        }
    }

    /// Geçişin kilit altındaki son adımı (hiç beklemez): hazırlanan oturum takılır. Bu arada
    /// daha yeni bir geçiş başladıysa hazırlanan oturum kapatılır ve yenisi beklenir.
    pub fn install(&mut self, prepared: Prepared) -> Result<TrackInfo, AudioError> {
        let Prepared {
            seq,
            gate,
            next,
            analysis,
            outcome,
        } = prepared;
        let outcome = match outcome {
            Outcome::Superseded(info) => return Ok(info),
            Outcome::Started(session) => Ok(session),
            Outcome::Failed(error) => Err(error),
        };
        if seq != self.transition_seq {
            return match outcome {
                Ok(session) => {
                    // Hazırlık bittikten sonra eskidi: oturum kilit dışında kısılarak kapanır, sonraki
                    // geçişler kısılmanın bitmesini bekler.
                    let info = session.info.clone();
                    session.shared.paused.store(true, Ordering::Release);
                    let closing = std::thread::Builder::new()
                        .name("lyraska-oturum-kapat".into())
                        .spawn(move || close_quietly(session));
                    if let Err(error) = closing {
                        diagnostics::info(&format!("Eski oturum kapatılamadı: {error}"));
                    }
                    Ok(info)
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
                // Geçiş sürerken arayüz sırayı değiştirdiyse yeni oturum güncel sırayı alır.
                if self.next_path != next {
                    session.shared.set_next(self.next_path.clone());
                }
                let info = session.info.clone();
                gate.settled(&session.shared);
                self.session = Some(session);
                self.refresh_parametric_rate();
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
