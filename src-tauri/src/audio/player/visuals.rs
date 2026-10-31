//! Görsellerin oynatıcıdan okuduğu veri: duyulan anın analiz karesi (ekolayzerin etkisi
//! eklenmiş), ham dalga biçimi ve ince spektrum (dalga dokunuşundan, şarkının eşitleme
//! kazancıyla), gecikme telafisi ve epilepsi güvenli modu.

use std::sync::atomic::Ordering;

use super::session::SharedState;
use super::{PlaybackState, Player};
use crate::analysis::beats::BeatPosition;
use crate::analysis::levels::ChannelLevels;
use crate::analysis::spectrogram::{self, BANDS};
use crate::audio::eq::{protection_db, Design};
use crate::audio::spectrum;
use crate::audio::waveform::{self, Window};

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

impl Player {
    /// Şu an duyulan anın görsel verisi. Analiz o ana yetişmediyse `None`.
    /// Spektrum ekolayzerden önce çıkarıldığı için ekolayzerin etkisi burada eklenir:
    /// görseller duyulanı gösterir.
    pub fn visual_now(&mut self) -> Option<VisualData> {
        self.visual_ahead(crate::visual_bridge::DISPLAY_LEAD_SECONDS)
    }

    /// [`Self::visual_now`], arayüzün ölçtüğü ekran gecikmesiyle (saniye; karenin ekrana çıkmasına
    /// kadar geçen süre, [`crate::visual_bridge::clamp_display_lead`] ile sınırlanır).
    pub fn visual_ahead(&mut self, display_lead_secs: f64) -> Option<VisualData> {
        // Boşluksuz geçişle gelen şarkının ölçümü de vaktinde ses yoluna yazılsın.
        self.sync_levels();
        // Gecikme telafisi: ekranda görüneceği an ve ses aygıtının ek gecikmesi. Boşluksuz
        // geçişte şarkı da bu kaydırılmış ana göre seçilir (A3).
        let offset =
            crate::visual_bridge::visual_offset_with_lead(self.audio_delay_ms, display_lead_secs);
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
        self.visual_waveform_ahead(crate::visual_bridge::DISPLAY_LEAD_SECONDS)
    }

    /// [`Self::visual_waveform`], arayüzün ölçtüğü ekran gecikmesiyle (bkz. [`Self::visual_ahead`]).
    pub fn visual_waveform_ahead(&self, display_lead_secs: f64) -> Option<Vec<u8>> {
        let session = self.session.as_ref()?;
        match session.state() {
            PlaybackState::Playing => {}
            PlaybackState::Paused | PlaybackState::Ended => return Some(waveform::silence()),
            PlaybackState::Idle | PlaybackState::Error => return None,
        }
        // Boşluksuz geçişle gelen şarkının ölçümü de kazanca yansısın.
        self.sync_levels();
        let heard = session.shared.output_heard.load(Ordering::Acquire);
        let offset =
            crate::visual_bridge::visual_offset_with_lead(self.audio_delay_ms, display_lead_secs);
        session.shared.waveform_at(heard, offset)
    }

    /// Şu an duyulan anın ince spektrum çubukları ("Kendi resmin" sahnesi): [`spectrum::BARS`]
    /// seviye (0..1, bas solda; [`spectrum::bar_levels`]). Görsel karelerle aynı an (gecikme
    /// telafili). Duraklatılmışsa ya da şarkı bittiyse hepsi 0; çalan oturum yoksa `None`.
    pub fn visual_spectrum(&self) -> Option<Vec<f32>> {
        self.visual_spectrum_ahead(crate::visual_bridge::DISPLAY_LEAD_SECONDS)
    }

    /// [`Self::visual_spectrum`], arayüzün ölçtüğü ekran gecikmesiyle (bkz. [`Self::visual_ahead`]).
    pub fn visual_spectrum_ahead(&self, display_lead_secs: f64) -> Option<Vec<f32>> {
        let session = self.session.as_ref()?;
        match session.state() {
            PlaybackState::Playing => {}
            PlaybackState::Paused | PlaybackState::Ended => return Some(spectrum::silence()),
            PlaybackState::Idle | PlaybackState::Error => return None,
        }
        self.sync_levels();
        let heard = session.shared.output_heard.load(Ordering::Acquire);
        let offset =
            crate::visual_bridge::visual_offset_with_lead(self.audio_delay_ms, display_lead_secs);
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
                            + crate::audio::bass::response_db(bass_db, small_speaker, hz, rate_hz)
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
}

impl SharedState {
    /// Akışın `heard`. karesinden `offset_secs` ötedeki ana kadarki son 1024 örneğin dalga
    /// biçimi (karışım, sol, sağ; [`waveform::to_bytes`]). Her örneğe ait olduğu şarkının
    /// −14 LUFS eşitleme kazancı uygulanır (kullanıcı eşitlemeyi kapatmış olsa da: sessiz
    /// kaydedilmiş şarkıda da dalga görünsün); boşluksuz geçişte kazanç tam şarkı sınırında
    /// değişir. Çözme henüz başlamadıysa `None`.
    pub(super) fn waveform_at(&self, heard: u64, offset_secs: f64) -> Option<Vec<u8>> {
        let window = self.waveform.read(heard, offset_secs)?;
        let gains = self.window_gains(&window)?;
        Some(waveform::to_bytes(&window, &gains))
    }

    /// Pencereye düşen şarkıların (ilk örneğin sırası, doğrusal kazanç) çiftleri: her şarkının
    /// −14 LUFS eşitleme kazancı ([`waveform::to_bytes`], [`waveform::mono_mix`]).
    fn window_gains<const N: usize>(&self, window: &Window<N>) -> Option<Vec<(i64, f64)>> {
        let levels = &self.controls.levels;
        let last = window.first + N as i64 - 1;
        let segments = self.segments.lock().ok()?;
        let starts: Vec<i64> = segments
            .iter()
            .map(|s| window.index_at_frame(s.first_output_frame))
            .collect();
        Some(
            starts
                .iter()
                .enumerate()
                // Yalnızca pencereye düşen şarkılar.
                .filter(|&(i, &start)| {
                    start <= last && starts.get(i + 1).is_none_or(|&next| next > window.first)
                })
                .map(|(i, &start)| {
                    let gain_db = levels.level(i, true).gain_db;
                    (start, 10f64.powf(gain_db / 20.0))
                })
                .collect(),
        )
    }

    /// Akışın `heard`. karesinden `offset_secs` ötedeki anın spektrum çubukları
    /// ([`spectrum::bar_levels`]): pencere o anın üstüne ortalanır, her örneğe kendi şarkısının
    /// eşitleme kazancı uygulanır ([`Self::waveform_at`] gibi). Çözme henüz başlamadıysa `None`.
    pub(super) fn spectrum_at(&self, heard: u64, offset_secs: f64) -> Option<Vec<f32>> {
        let half = (spectrum::WINDOW / 2) as f64 / f64::from(waveform::WAVEFORM_RATE);
        let window = self
            .waveform
            .read_window::<{ spectrum::WINDOW }>(heard, offset_secs + half)?;
        let gains = self.window_gains(&window)?;
        Some(spectrum::bar_levels(&waveform::mono_mix(&window, &gains)))
    }
}
