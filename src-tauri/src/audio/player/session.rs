//! Oturum: bir şarkının çalınması için kurulan iş parçacıkları (çözme, çıkış), aralarındaki
//! halka tampon ve paylaşılan durum ([`SharedState`]). Oturumda çalınan şarkılar
//! ([`Segment`]) duyulan anın hangi şarkıya ve konuma denk geldiğini verir.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rtrb::RingBuffer;

use super::bit_perfect::{output_mode, signal_path};
use super::decode_thread::decode_loop;
use super::{PlaybackState, SignalPath};
use crate::analysis::spectrogram::Spectrogram;
use crate::audio::decode::{Decoder, TrackInfo};
use crate::audio::normalize::TrackLevels;
use crate::audio::output::{self, OutputMode, OutputSpec};
use crate::audio::render::RenderControls;
use crate::audio::resample::Converter;
use crate::audio::waveform::WaveformTap;
use crate::audio::AudioError;

/// Halka tamponun süresi. Çözme iş parçacığı bu kadar önden gider.
pub(super) const RING_SECONDS: usize = 2;
/// Çıkış başlamadan önce tamponda olması istenen ses (takılmasız başlangıç için).
pub(super) const PREFILL_SECONDS: f64 = 0.25;
/// Ön dolum için en fazla bu kadar beklenir.
const PREFILL_TIMEOUT: Duration = Duration::from_secs(3);
/// Tampon doluyken çözme iş parçacığının bekleme aralığı.
pub(super) const DECODE_IDLE: Duration = Duration::from_millis(5);
/// Şarkı değiştirirken, sararken ya da durdururken sesin kısılmasının hoparlöre
/// ulaşması için en fazla bu kadar beklenir (aygıt arabelleği ~100 ms + geçiş).
pub(crate) const FADE_OUT_TIMEOUT: Duration = Duration::from_millis(300);

/// İş parçacıkları arasında paylaşılan durum. Yalnızca atomik değişkenler
/// gerçek zamanlı yolda kullanılır; `error` kilidi yalnızca hata anında alınır.
#[derive(Debug, Default)]
pub struct SharedState {
    /// Kullanıcı duraklattı.
    pub paused: AtomicBool,
    /// Oturum kapanıyor; iş parçacıkları çıkmalı.
    pub stop: AtomicBool,
    /// Tamponda çalmaya başlamaya yetecek kadar veri var.
    pub prefilled: AtomicBool,
    /// Dosyanın sonuna gelindi (ya da çözme hatayla bitti).
    pub decode_done: AtomicBool,
    /// Son örnek de hoparlörden çıktı.
    pub ended: AtomicBool,
    /// Duraklatma geçişi hoparlöre ulaştı (ses tamamen sustu): oturum "tık" sesi
    /// olmadan kapatılabilir. Çıkış iş parçacığı yazar.
    pub faded_out: AtomicBool,
    /// Oturum başından beri hoparlörden çıkan çıkış karesi sayısı (aygıt hızında).
    /// Çıkış iş parçacığı yazar; şarkı konumu buradan [`Segment`]'lerle hesaplanır.
    pub output_heard: AtomicU64,
    /// [`Self::output_heard`]'ün ölçüldüğü an (Unix zamanı, mikrosaniye; 0: yazılıyor ya da henüz
    /// ölçülmedi). Arayüz konumu bu ana bağlar: sorgunun gidiş-dönüşü ve ses aygıtının dönemi
    /// boyunca sayacın bayatlığı konumu geride bırakmaz. Yalnızca [`Self::record_heard`] yazar.
    pub output_heard_at_us: AtomicU64,
    /// Oturumda çalınan şarkılar: boşluksuz geçişte çözme iş parçacığı yenisini ekler.
    /// Gerçek zamanlı yolda kullanılmaz.
    pub(super) segments: Mutex<Vec<Segment>>,
    /// Boşluksuz geçiş için sıradaki şarkı; çözme iş parçacığı şarkı bitince alır.
    pub(super) next_path: Mutex<Option<PathBuf>>,
    /// Çalma sırasında veri yetişmediği tur sayısı (hedef: her zaman 0).
    pub underruns: AtomicU64,
    /// Varsayılan ses aygıtı değişti ya da koptu (kulaklık takıldı/çıkarıldı): oynatıcı oturumu
    /// yeni varsayılan aygıtta kaldığı yerden yeniden açar. Çıkış tarafı yazar (SES-01).
    pub device_changed: AtomicBool,
    /// Ses işlemenin ayarları: ekolayzer, kulaklık düzeltmesi, eşitleme (oynatıcı boyunca
    /// aynı; her oturum paylaşır) ve bu oturumdaki şarkıların ses yükseklikleri.
    pub controls: RenderControls,
    /// Görseller için dalga biçimi: çözme iş parçacığı yazar, komut iş parçacığı okur. Gerçek
    /// zamanlı yolda kullanılmaz. Oturuma aittir: sarmada ve şarkı açılınca yenisi kurulur.
    pub(super) waveform: WaveformTap,
    error: Mutex<Option<String>>,
}

impl SharedState {
    pub(super) fn new(paused: bool, first: Segment, controls: RenderControls) -> Self {
        let state = Self {
            controls,
            segments: Mutex::new(vec![first]),
            waveform: WaveformTap::new(),
            ..Self::default()
        };
        state.paused.store(paused, Ordering::Release);
        state
    }

    /// Şarkı bilgisi olmayan bir oturum için (ör. kör dinleme testi).
    pub(crate) fn with_controls(paused: bool, controls: RenderControls) -> Self {
        let state = Self {
            controls,
            ..Self::default()
        };
        state.paused.store(paused, Ordering::Release);
        state
    }

    /// Çıkış iş parçacığı: duyulan çıkış karesini ve ölçüldüğü anı birlikte yazar. Önce an
    /// silinir, sonra sayaç, sonra yeni an: okuyan ([`Self::heard_with_time`]) yarım yazılmış
    /// çifti tanır. Gerçek zamanlı yolda: bellek ayırmaz, kilit beklemez. `monotonic`: sayaç
    /// geri gitmez (aygıt tamponunun tahmini bir an geriye kayabilir).
    pub fn record_heard(&self, frames: u64, monotonic: bool) {
        self.output_heard_at_us.store(0, Ordering::SeqCst);
        if monotonic {
            self.output_heard.fetch_max(frames, Ordering::SeqCst);
        } else {
            self.output_heard.store(frames, Ordering::SeqCst);
        }
        self.output_heard_at_us
            .store(unix_micros().max(1), Ordering::SeqCst);
    }

    /// Duyulan çıkış karesi ve ölçüldüğü an (Unix mikrosaniye) tutarlı bir çift olarak; yazma
    /// sürerken birkaç kez yeniden okunur, yine olmazsa an bilinmez (`None`).
    pub(super) fn heard_with_time(&self) -> (u64, Option<u64>) {
        for _ in 0..4 {
            let before = self.output_heard_at_us.load(Ordering::SeqCst);
            let heard = self.output_heard.load(Ordering::SeqCst);
            let after = self.output_heard_at_us.load(Ordering::SeqCst);
            if before != 0 && before == after {
                return (heard, Some(before));
            }
        }
        (self.output_heard.load(Ordering::Acquire), None)
    }

    /// Şu an duyulan şarkı ve o şarkıdaki konumu (saniye).
    pub(super) fn now_playing(&self) -> Option<(TrackInfo, f64)> {
        self.playing_at(0.0)
    }

    /// Şu an duyulan şarkı, konumu ve konumun ölçüldüğü an (Unix mikrosaniye; bilinmiyorsa `None`).
    pub(super) fn now_playing_timed(&self) -> Option<(TrackInfo, f64, Option<u64>)> {
        let (heard, at) = self.heard_with_time();
        let (info, seconds) = self.playing_at_frame(heard, 0.0)?;
        Some((info, seconds, at))
    }

    /// Duyulan andan `offset_secs` ötedeki (eksi: önceki) şarkı ve konumu. Görseller ekran
    /// gecikmesi kadar ileriden, ses aygıtının ek gecikmesi kadar geriden okunur; boşluksuz
    /// geçişte şarkı da bu kaydırılmış ana göre seçilir ki Bluetooth'ta yeni şarkının ilk
    /// 200 ms'inde eski şarkının sonu gösterilsin, yeni şarkı 0. karede donmasın.
    pub(super) fn playing_at(&self, offset_secs: f64) -> Option<(TrackInfo, f64)> {
        self.playing_at_frame(self.output_heard.load(Ordering::Acquire), offset_secs)
    }

    /// `heard` çıkış karesinden `offset_secs` ötedeki şarkı ve konumu.
    fn playing_at_frame(&self, heard: u64, offset_secs: f64) -> Option<(TrackInfo, f64)> {
        let segments = self.segments.lock().ok()?;
        let first = segments.first()?;
        // Aygıt hızı oturum boyunca sabittir: şarkı hızı / oran.
        let device_rate = f64::from(first.info.sample_rate.max(1)) / first.rate_ratio.max(1e-9);
        let target = (heard as f64 + offset_secs * device_rate).max(0.0);
        let segment = segments
            .iter()
            .rev()
            .find(|s| s.first_output_frame as f64 <= target)
            .unwrap_or(first);
        let frames = segment.start_frame as f64
            + (target - segment.first_output_frame as f64).max(0.0) * segment.rate_ratio;
        let mut seconds = frames / f64::from(segment.info.sample_rate.max(1));
        if let Some(duration) = segment.info.duration_secs {
            seconds = seconds.min(duration);
        }
        Some((segment.info.clone(), seconds))
    }

    /// Şu an duyulan şarkının oturumdaki sırası.
    pub(super) fn now_playing_index(&self) -> Option<usize> {
        let heard = self.output_heard.load(Ordering::Acquire);
        let segments = self.segments.lock().ok()?;
        Some(
            segments
                .iter()
                .rposition(|s| s.first_output_frame <= heard)
                .unwrap_or(0),
        )
    }

    /// İlk hatayı kaydeder (sonrakiler genellikle ilkinin sonucudur).
    pub fn fail(&self, message: String) {
        if let Ok(mut error) = self.error.lock() {
            if error.is_none() {
                crate::diagnostics::error(&format!("Çalma hatası: {message}"));
            }
            error.get_or_insert(message);
        }
    }

    pub fn error(&self) -> Option<String> {
        self.error.lock().ok().and_then(|e| e.clone())
    }
}

/// Bir oturumda çalınan bir şarkı: çıkış akışında nerede başladığı ve konumun
/// nasıl hesaplanacağı.
#[derive(Debug, Clone)]
pub(super) struct Segment {
    pub(super) info: TrackInfo,
    /// Şarkının ilk karesinin çıkış akışındaki yeri (aygıt karesi).
    pub(super) first_output_frame: u64,
    /// O noktadaki şarkı konumu (şarkı karesi; sarmada sıfırdan farklı).
    pub(super) start_frame: u64,
    /// Bir çıkış karesinin kaç şarkı karesine denk geldiği (şarkı hızı / aygıt hızı).
    pub(super) rate_ratio: f64,
}

/// Bir şarkının çalınması için kurulan iş parçacıkları ve durumları.
pub(super) struct Session {
    /// Oturumun açıldığı şarkı (boşluksuz geçişten sonra çalan şarkı farklı olabilir).
    pub(super) info: TrackInfo,
    pub(super) path: SignalPath,
    pub(super) shared: Arc<SharedState>,
    decode: Option<JoinHandle<()>>,
    output: Option<JoinHandle<()>>,
}

impl Session {
    /// Oturumu başlatır. `start_secs` verilirse şarkının o noktasından başlar.
    /// `controls`: oynatıcının ayarları (oturumun şarkı seviyeleri burada kurulur);
    /// `analysis`: ilk şarkının analizi (ses yüksekliği ölçümü buradan okunur);
    /// `bit_perfect`: aygıtı özel modda, şarkının kendi hızında açmayı dene. Aygıt bu
    /// biçimi desteklemiyorsa paylaşımlı modda açılır ve nedeni sinyal yolunda yazar;
    /// destekliyor ama akış açılamıyorsa [`AudioError::Exclusive`] döner.
    pub(super) fn start(
        path: &Path,
        autoplay: bool,
        start_secs: Option<f64>,
        next: Option<PathBuf>,
        controls: &RenderControls,
        analysis: Option<Arc<Spectrogram>>,
        bit_perfect: bool,
    ) -> Result<Self, AudioError> {
        let mut decoder = Decoder::open(path)?;
        let start_frame = match start_secs {
            Some(secs) if secs > 0.0 => decoder.seek(secs)?,
            _ => 0,
        };
        let info = decoder.info().clone();
        let device = output::device_info();
        let channels = Converter::output_channels(info.channels);
        let (mode, notice) = output_mode(bit_perfect, &decoder, &info, channels);
        let spec = OutputSpec {
            sample_rate: match mode {
                // Bit-perfect: şarkının kendi hızında, dönüştürme yok.
                OutputMode::Exclusive(_) => info.sample_rate,
                // Aygıtın kendi hızında çal: dönüştürmeyi Windows değil, biz yaparız.
                OutputMode::Shared => device.as_ref().map_or(info.sample_rate, |d| d.sample_rate),
            },
            channels,
            mode,
        };
        let converter = Converter::new(
            info.sample_rate,
            info.channels,
            spec.sample_rate,
            spec.channels,
        )?;
        let mut path = signal_path(device, &info, spec);
        path.notice = notice;
        let capacity = spec.sample_rate as usize * spec.channels * RING_SECONDS;
        let (producer, consumer) = RingBuffer::new(capacity);
        let first = Segment {
            info: info.clone(),
            first_output_frame: 0,
            start_frame,
            rate_ratio: f64::from(info.sample_rate) / f64::from(spec.sample_rate),
        };
        let levels = Arc::new(TrackLevels::new());
        // Ölçüm hazırsa (önbellek, sarma) ilk örnekten uygulanır; yalnızca erken tahmin varsa
        // onunla başlanır, kesin ölçüm gelince kazanç yumuşakça düzelir.
        match analysis.as_ref() {
            Some(a) => match a.measured_loudness() {
                Some(measured) => levels.set_loudness(0, measured),
                None => {
                    if let Some(early) = a.early_loudness() {
                        levels.set_loudness_estimate(0, early);
                    }
                }
            },
            // Analiz hiç başlatılamadı (dosya ikinci kez açılamadı): ölçüm gelmeyecek; ilk ses
            // boşuna bekletilmez, eşitleme bu şarkıya uygulanmaz (SES-04).
            None => levels.set_loudness(0, None),
        }
        if let Some(peaks) = analysis.as_ref().and_then(|a| a.bass_peaks()) {
            levels.set_bass_peaks(0, &peaks);
        }
        let shared = Arc::new(SharedState::new(
            !autoplay,
            first,
            RenderControls {
                levels,
                bit_perfect: matches!(mode, OutputMode::Exclusive(_)),
                ..controls.clone()
            },
        ));
        shared.set_next(next);

        let decode_shared = Arc::clone(&shared);
        let decode = std::thread::Builder::new()
            .name("lyraska-cozme".to_owned())
            .spawn(move || {
                decode_loop(decoder, converter, spec, producer, &decode_shared, analysis)
            })
            .map_err(|e| AudioError::Decode(e.to_string()))?;

        wait_for_prefill(&shared, PREFILL_TIMEOUT);

        let output = match output::spawn(spec, consumer, Arc::clone(&shared)) {
            Ok(handle) => handle,
            Err(error) => {
                shared.stop.store(true, Ordering::Release);
                let _ = decode.join();
                return Err(error);
            }
        };

        Ok(Self {
            info,
            path,
            shared,
            decode: Some(decode),
            output: Some(output),
        })
    }

    /// Şu an duyulan şarkı ve konumu.
    pub(super) fn now_playing(&self) -> (TrackInfo, f64) {
        self.shared
            .now_playing()
            .unwrap_or_else(|| (self.info.clone(), 0.0))
    }

    /// Şu an duyulan şarkı, konumu ve konumun ölçüldüğü an (Unix mikrosaniye).
    pub(super) fn now_playing_timed(&self) -> (TrackInfo, f64, Option<u64>) {
        self.shared
            .now_playing_timed()
            .unwrap_or_else(|| (self.info.clone(), 0.0, None))
    }

    /// Duyulan andan `offset_secs` ötedeki şarkı ve konumu (görseller için).
    pub(super) fn playing_at(&self, offset_secs: f64) -> (TrackInfo, f64) {
        self.shared
            .playing_at(offset_secs)
            .unwrap_or_else(|| (self.info.clone(), 0.0))
    }

    pub(super) fn state(&self) -> PlaybackState {
        derive_state(
            self.shared.error().is_some(),
            self.shared.ended.load(Ordering::Acquire),
            self.shared.paused.load(Ordering::Acquire),
        )
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.shared.stop.store(true, Ordering::Release);
        // Önce çıkış: ses aygıtı hemen bırakılsın.
        if let Some(handle) = self.output.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.decode.take() {
            let _ = handle.join();
        }
    }
}

/// Oturum işaretlerinden kullanıcıya gösterilecek durumu çıkarır.
pub(super) fn derive_state(has_error: bool, ended: bool, paused: bool) -> PlaybackState {
    if has_error {
        PlaybackState::Error
    } else if ended {
        PlaybackState::Ended
    } else if paused {
        PlaybackState::Paused
    } else {
        PlaybackState::Playing
    }
}

pub(crate) fn wait_for_fade_out(shared: &SharedState, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while !shared.faded_out.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(2));
    }
}

pub(crate) fn wait_for_prefill(shared: &SharedState, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while !shared.prefilled.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(2));
    }
}

/// Şimdiki an (Unix zamanı, mikrosaniye; saat 1970'ten önceyse 0). Arayüzün saati
/// (`performance.timeOrigin + performance.now()`) aynı duvar saatine bağlıdır.
pub(crate) fn unix_micros() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| u64::try_from(d.as_micros()).ok())
        .unwrap_or(0)
}
