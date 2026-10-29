//! Kör dinleme testi (ABX) oynatıcıda: test kurulurken çalan şarkı durur (ses aygıtı teste
//! geçer), test bitince kaldığı yerde duraklatılmış açılır. Testin kendisi `audio::abx`'te.

use super::{Player, Transition};
use crate::audio::abx::{AbxChoice, AbxRequest, AbxSource, AbxStatus, AbxTest, PreparedAbx};
use crate::audio::AudioError;

impl Player {
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
}
