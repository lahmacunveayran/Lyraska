//! Ses işlemenin ayarları: ekolayzer, kulaklık düzeltmesi, elle parametrik EQ ve crossfeed.
//! Ayarlar oynatıcı boyunca aynı kanallardan (kilitsiz) bütün oturumların ses çıkışına ulaşır.

use std::sync::Arc;

use super::Player;
use crate::audio::crossfeed::CrossfeedSettings;
use crate::audio::eq::{EqSettings, EqState};
use crate::audio::normalize::TrackLevels;
use crate::audio::peq::{HeadphoneSettings, ParametricSettings};
use crate::audio::render::RenderControls;

impl Player {
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
    pub(super) fn render_controls(&self) -> RenderControls {
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
}
