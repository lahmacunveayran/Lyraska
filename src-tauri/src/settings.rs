//! Kullanıcı ayarları: uygulama veri klasöründe `settings.json`.
//!
//! Dosya yoksa ya da bozuksa varsayılan ayarlarla başlanır (program her
//! durumda açılır). Kaydetme önce geçici dosyaya yazar, sonra adını değiştirir:
//! yazma sırasında elektrik kesilse bile eski ayarlar bozulmaz.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::audio::crossfeed::CrossfeedSettings;
use crate::audio::eq::EqSettings;
use crate::audio::peq::{HeadphoneSettings, ParametricSettings};
use crate::audio::PlaybackOptions;

/// Kalıcı ayarlar. Yeni alanlar eklendiğinde eski dosyalar varsayılanla tamamlanır.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub equalizer: EqSettings,
    /// Kulaklık düzeltmesi (AutoEq profili).
    pub headphone: HeadphoneSettings,
    /// Elle parametrik ekolayzer.
    pub parametric: ParametricSettings,
    /// Crossfeed (kulaklıkta hoparlörden dinler gibi).
    pub crossfeed: CrossfeedSettings,
    /// Epilepsi güvenli modu: görseller daha seyrek nabız atar, parlaklık yarı hızla değişir.
    pub visual_safe: bool,
    /// Ses aygıtının ek gecikmesi (ms; ör. Bluetooth): görseller bu kadar geriden okunur.
    pub audio_delay_ms: i32,
    /// Çalma seçenekleri (ses yüksekliği eşitlemesi vb.).
    pub playback: PlaybackOptions,
}

/// Ayarları bellekte tutar ve her değişiklikte diske yazar.
pub struct SettingsStore {
    /// `None`: yalnızca bellekte (uygulama veri klasörü bulunamadıysa).
    path: Option<PathBuf>,
    current: Mutex<Settings>,
}

impl SettingsStore {
    /// Ayarları dosyadan okur; okunamazsa varsayılanlarla başlar. Tek bir alan bozuksa yalnızca
    /// o alan varsayılana döner (ekolayzer, kulaklık profili ve gecikme birbirini götürmez); dosya
    /// hiç JSON değilse `settings.json.bozuk` olarak saklanır ve günlüğe yazılır.
    pub fn open(path: &Path) -> Self {
        let (settings, path) = match std::fs::read_to_string(path) {
            Ok(text) => (parse_lenient(&text, path), Some(path.to_path_buf())),
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                (Settings::default(), Some(path.to_path_buf()))
            }
            // Dosya var ama okunamıyor (izin, paylaşım ihlali): varsayılanlarla başlanır ama
            // kullanıcının eski ayarlarının üstüne yazılmaz; bu oturumda yalnızca bellekte (KUT-06).
            Err(e) => {
                crate::diagnostics::error(&format!(
                    "Ayar dosyası okunamadı ({}): {e}. Bu oturumda ayarlar kaydedilmeyecek.",
                    path.display()
                ));
                (Settings::default(), None)
            }
        };
        Self {
            path,
            current: Mutex::new(Settings {
                equalizer: settings.equalizer.sanitized(),
                headphone: settings.headphone.sanitized(),
                parametric: settings.parametric.sanitized(),
                crossfeed: settings.crossfeed.sanitized(),
                visual_safe: settings.visual_safe,
                audio_delay_ms: crate::visual_bridge::clamp_audio_delay_ms(settings.audio_delay_ms),
                playback: settings.playback,
            }),
        }
    }

    /// Diske yazmayan ayar deposu.
    pub fn in_memory() -> Self {
        Self {
            path: None,
            current: Mutex::new(Settings::default()),
        }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// Ayarları değiştirir ve kaydeder.
    pub fn update(&self, change: impl FnOnce(&mut Settings)) -> io::Result<Settings> {
        let mut current = self
            .current
            .lock()
            .map_err(|_| io::Error::other("ayarlar kilitlenemedi"))?;
        change(&mut current);
        if let Some(path) = &self.path {
            save(path, &current)?;
        }
        Ok(current.clone())
    }
}

/// Dosyayı alan alan çözer: bozuk alan varsayılana döner ve günlüğe yazılır; JSON bile değilse
/// dosya `.bozuk` uzantısıyla kenara alınır (ilk kayıt üstüne yazmadan önce iz kalsın).
fn parse_lenient(text: &str, path: &Path) -> Settings {
    if let Ok(settings) = serde_json::from_str::<Settings>(text) {
        return settings;
    }
    let value = match serde_json::from_str::<serde_json::Value>(text) {
        Ok(serde_json::Value::Object(map)) => map,
        _ => {
            let backup = path.with_extension("json.bozuk");
            let kept = std::fs::copy(path, &backup).is_ok();
            crate::diagnostics::error(&format!(
                "Ayar dosyası okunamadı, varsayılanlarla başlandı{}: {}",
                if kept {
                    " (bozuk dosya .bozuk olarak saklandı)"
                } else {
                    ""
                },
                path.display()
            ));
            return Settings::default();
        }
    };
    fn field<T: serde::de::DeserializeOwned + Default>(
        map: &serde_json::Map<String, serde_json::Value>,
        name: &str,
    ) -> T {
        match map.get(name) {
            None => T::default(),
            Some(value) => serde_json::from_value(value.clone()).unwrap_or_else(|e| {
                crate::diagnostics::error(&format!(
                    "Ayar dosyasında '{name}' alanı bozuk, varsayılana döndü: {e}"
                ));
                T::default()
            }),
        }
    }
    Settings {
        equalizer: field(&value, "equalizer"),
        headphone: field(&value, "headphone"),
        parametric: field(&value, "parametric"),
        crossfeed: field(&value, "crossfeed"),
        visual_safe: field(&value, "visualSafe"),
        audio_delay_ms: field(&value, "audioDelayMs"),
        playback: field(&value, "playback"),
    }
}

/// Bölünmez yazma (`atomic_file`): yazma ya da yeniden adlandırma sırasında elektrik kesilse de
/// eski ayarlar bozulmaz.
fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    let text = serde_json::to_string_pretty(settings).map_err(io::Error::other)?;
    crate::atomic_file::write(path, text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;

    #[test]
    fn ayarlar_kaydedilir_ve_yeniden_okunur() {
        let path = temp_path("ayarlar").join("alt/settings.json");
        let store = SettingsStore::open(&path);
        assert_eq!(store.get(), Settings::default());

        store
            .update(|s| {
                s.equalizer.gains_db[0] = 4.5;
                s.equalizer.enabled = false;
                s.parametric.bands[2].gain_db = -3.5;
                s.crossfeed.enabled = true;
                s.crossfeed.level_db = 4.5;
            })
            .unwrap();
        let reopened = SettingsStore::open(&path);
        assert_eq!(reopened.get().equalizer.gains_db[0], 4.5);
        assert!(!reopened.get().equalizer.enabled);
        // Parametrik ekolayzer de kalıcı (alan alan okumada da).
        assert_eq!(reopened.get().parametric.bands[2].gain_db, -3.5);
        assert!(reopened.get().crossfeed.enabled);
        assert_eq!(reopened.get().crossfeed.level_db, 4.5);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn bozuk_ya_da_eksik_dosya_varsayilanla_acilir() {
        let path = temp_path("bozuk-ayarlar.json");
        std::fs::write(&path, "{ bu json değil").unwrap();
        assert_eq!(SettingsStore::open(&path).get(), Settings::default());

        // Eski sürümün yazdığı eksik alanlı dosya: olanlar alınır, gerisi varsayılan.
        std::fs::write(&path, r#"{"equalizer":{"gainsDb":[1,2,3,4,5,6,7,8,9,99]}}"#).unwrap();
        let settings = SettingsStore::open(&path).get();
        assert!(settings.equalizer.enabled);
        assert_eq!(settings.equalizer.gains_db[2], 3.0);
        assert_eq!(
            settings.equalizer.gains_db[9], 12.0,
            "sınır dışı değer kırpılır"
        );
    }

    #[test]
    fn tek_alani_bozuk_dosyada_digerleri_korunur() {
        // Gecikme alanı yanlış türde (gelecek sürüm ya da elle düzenleme): ekolayzer ve kulaklık
        // ayarları kaybolmaz, yalnızca gecikme varsayılana döner.
        let path = temp_path("yari-bozuk-ayarlar.json");
        std::fs::write(
            &path,
            r#"{"equalizer":{"enabled":false,"gainsDb":[1,2,3,4,5,6,7,8,9,10],"bassDb":6},
                "visualSafe":true,"audioDelayMs":"x"}"#,
        )
        .unwrap();
        let settings = SettingsStore::open(&path).get();
        assert!(!settings.equalizer.enabled);
        assert_eq!(settings.equalizer.gains_db[2], 3.0);
        assert_eq!(settings.equalizer.bass_db, 6.0);
        assert!(settings.visual_safe);
        assert_eq!(
            settings.audio_delay_ms, 0,
            "yalnızca bozuk alan varsayılana döner"
        );
    }

    #[test]
    fn crossfeed_alani_bozuksa_digerleri_korunur_sinir_disi_kirpilir() {
        // Eski sürümün dosyasında crossfeed yok: kapalı başlar.
        let path = temp_path("crossfeed-ayarlar.json");
        std::fs::write(&path, r#"{"visualSafe":true}"#).unwrap();
        assert_eq!(
            SettingsStore::open(&path).get().crossfeed,
            CrossfeedSettings::default()
        );
        // Yanlış türde crossfeed alanı: yalnızca o varsayılana döner.
        std::fs::write(
            &path,
            r#"{"visualSafe":true,"crossfeed":{"enabled":"evet"}}"#,
        )
        .unwrap();
        let settings = SettingsStore::open(&path).get();
        assert!(settings.visual_safe);
        assert_eq!(settings.crossfeed, CrossfeedSettings::default());
        // Sınır dışı değerler okurken sınıra çekilir.
        std::fs::write(
            &path,
            r#"{"crossfeed":{"enabled":true,"cutoffHz":50000,"levelDb":-3}}"#,
        )
        .unwrap();
        let crossfeed = SettingsStore::open(&path).get().crossfeed;
        assert!(crossfeed.enabled);
        assert_eq!(crossfeed.cutoff_hz, crate::audio::crossfeed::MAX_CUTOFF_HZ);
        assert_eq!(crossfeed.level_db, crate::audio::crossfeed::MIN_LEVEL_DB);
    }

    #[test]
    fn json_olmayan_dosya_kenara_alinir() {
        let path = temp_path("cop-ayarlar.json");
        std::fs::write(&path, "\u{0}\u{0}bozuk").unwrap();
        assert_eq!(SettingsStore::open(&path).get(), Settings::default());
        assert!(
            path.with_extension("json.bozuk").exists(),
            "bozuk dosya silinmeden önce yedeklenir"
        );
    }

    #[test]
    fn okunamayan_dosya_ustune_yazilmaz() {
        // Dosya var ama okunamıyor (paylaşım ihlali, izin): varsayılanla başlanır ama ilk ayar
        // değişikliğinde eski ayarların üstüne yazılmaz; bu oturumda kayıt yapılmaz (KUT-06).
        let path = temp_path("kilitli-ayarlar.json");
        std::fs::create_dir_all(&path).unwrap(); // klasör: okunamaz ama "yok" da değil
        let store = SettingsStore::open(&path);
        assert_eq!(store.get(), Settings::default());
        store.update(|s| s.visual_safe = true).unwrap();
        assert!(path.is_dir(), "dosyaya dokunulmaz");
        assert!(store.get().visual_safe, "bellekte sürer");
    }

    #[test]
    fn bellekteki_depo_diske_yazmaz() {
        let store = SettingsStore::in_memory();
        let saved = store.update(|s| s.equalizer.gains_db[1] = -3.0).unwrap();
        assert_eq!(saved.equalizer.gains_db[1], -3.0);
        assert_eq!(store.get().equalizer.gains_db[1], -3.0);
    }
}
