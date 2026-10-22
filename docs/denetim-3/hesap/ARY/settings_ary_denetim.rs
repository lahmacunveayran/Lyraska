
// ---- ARY denetim kanıt testleri (src-tauri/src/settings.rs sonuna eklenir) ----
#[cfg(test)]
mod ary_denetim {
    use super::*;
    use crate::audio::test_util::temp_path;

    /// Kullanıcının 7 bantlı parametrik ayarı; 7. bandın türü bu sürümün tanımadığı bir tür
    /// (gelecek sürümün eklediği tür ya da elle düzenleme).
    const SEVEN_BANDS_ONE_UNKNOWN: &str = r#"{
      "visualSafe": true,
      "parametric": {"enabled": true, "design": "rbj", "bands": [
        {"kind":"lowShelf","freqHz":90,"gainDb":4,"q":0.7,"enabled":true},
        {"kind":"peaking","freqHz":200,"gainDb":-2,"q":1.2,"enabled":true},
        {"kind":"peaking","freqHz":800,"gainDb":1.5,"q":2,"enabled":true},
        {"kind":"peaking","freqHz":2500,"gainDb":-3,"q":3,"enabled":true},
        {"kind":"peaking","freqHz":6000,"gainDb":2,"q":4,"enabled":true},
        {"kind":"highShelf","freqHz":11000,"gainDb":-1.5,"q":0.7,"enabled":true},
        {"kind":"tilt","freqHz":1000,"gainDb":1,"q":1,"enabled":true}
      ]}
    }"#;

    #[test]
    fn ary_tek_bant_bozuksa_parametrik_ayarin_tamami_gider() {
        let path = temp_path("ary-settings.json");
        std::fs::write(&path, SEVEN_BANDS_ONE_UNKNOWN).unwrap();
        let store = SettingsStore::open(&path);
        let p = store.get().parametric;
        println!(
            "okunan parametrik: {} bant, ilk bant {:?} {} Hz {} dB, tasarım {:?}",
            p.bands.len(),
            p.bands[0].kind,
            p.bands[0].freq_hz,
            p.bands[0].gain_db,
            p.design
        );
        // Kullanıcı bir şeye dokununca dosya yeniden yazılır:
        store.update(|s| s.visual_safe = false).unwrap();
        let on_disk = std::fs::read_to_string(&path).unwrap();
        let kept_backup = path.with_extension("json.bozuk").exists();
        println!(
            "diskte 6000 Hz'lik bant duruyor mu: {}; .bozuk yedeği var mı: {kept_backup}",
            on_disk.contains("6000")
        );
        assert!(
            p.bands.len() >= 6,
            "tanınan 6 bant da kayboldu (bant başına değil alan başına geri dönüş)"
        );
    }

    #[test]
    fn ary_tek_filtre_bozuksa_kulaklik_profili_gider() {
        let path = temp_path("ary-settings-hp.json");
        std::fs::write(
            &path,
            r#"{"headphone":{"enabled":true,"profile":{"name":"HD 600","preampDb":-6,
                "filters":[{"kind":"lowShelf","freqHz":105,"gainDb":5.5,"q":0.7},
                           {"kind":"peaking","freqHz":1923,"gainDb":-3.2,"q":1.31},
                           {"kind":"peaking","freqHz":3500,"gainDb":4,"q":null}]}}}"#,
        )
        .unwrap();
        let hp = SettingsStore::open(&path).get().headphone;
        println!("kulaklık: açık={} profil={:?}", hp.enabled, hp.profile.as_ref().map(|p| &p.name));
        assert!(hp.profile.is_some(), "bir filtrenin q'su bozuk diye profilin tamamı gitti");
    }

    // ---- Sürüm düşürme: 0.0.52'nin (git 9dc0b82) ayar yapısının birebir kopyası ----
    mod v0052 {
        use serde::{Deserialize, Serialize};
        #[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        pub enum FilterKind {
            Peaking,
            LowShelf,
            HighShelf,
        }
        #[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        pub struct PeqFilter {
            pub kind: FilterKind,
            pub freq_hz: f64,
            pub gain_db: f64,
            pub q: f64,
        }
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        pub struct HeadphoneProfile {
            pub name: String,
            pub preamp_db: f64,
            pub filters: Vec<PeqFilter>,
        }
        #[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase", default)]
        pub struct HeadphoneSettings {
            pub enabled: bool,
            pub profile: Option<HeadphoneProfile>,
        }
        #[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase", default)]
        pub struct Settings {
            pub equalizer: serde_json::Value,
            pub headphone: HeadphoneSettings,
            pub visual_safe: bool,
            pub audio_delay_ms: i32,
            pub playback: serde_json::Value,
        }
    }

    #[test]
    fn ary_surum_dusurme_ve_geri_yukseltme() {
        // Yeni sürüm: crossfeed açık, parametrik ayarlı, kulaklık profilinde bir yüksek geçiren.
        let path = temp_path("ary-downgrade.json");
        let store = SettingsStore::open(&path);
        let profile = crate::audio::peq::HeadphoneProfile::parse(
            "Preamp: -6 dB\nFilter 1: ON HP Fc 20 Hz Q 0.7\nFilter 2: ON PK Fc 1000 Hz Gain 3 dB Q 1\n",
            "HD 600",
        )
        .unwrap();
        store
            .update(|s| {
                s.crossfeed.enabled = true;
                s.parametric.bands[2].gain_db = -4.0;
                s.headphone.enabled = true;
                s.headphone.profile = Some(profile);
            })
            .unwrap();
        let new_text = std::fs::read_to_string(&path).unwrap();

        // Eski program (0.0.52) dosyayı okur: alan alan okuma onda da var.
        let old: v0052::Settings = serde_json::from_str(&new_text).unwrap_or_else(|_| {
            let map: serde_json::Map<String, serde_json::Value> =
                serde_json::from_str(&new_text).unwrap();
            v0052::Settings {
                equalizer: map.get("equalizer").cloned().unwrap_or_default(),
                headphone: map
                    .get("headphone")
                    .and_then(|v| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_default(),
                visual_safe: false,
                audio_delay_ms: 0,
                playback: map.get("playback").cloned().unwrap_or_default(),
            }
        });
        println!(
            "eski program okudu: kulaklık profili {}",
            if old.headphone.profile.is_some() { "var" } else { "YOK" }
        );
        // Eski program bir ayara dokununca kendi yapısını yazar:
        std::fs::write(&path, serde_json::to_string_pretty(&old).unwrap()).unwrap();

        // Kullanıcı yeni sürüme geri döner:
        let back = SettingsStore::open(&path).get();
        println!(
            "geri yükseltmede: crossfeed açık={}, parametrik bant 3 = {} dB, kulaklık profili {}",
            back.crossfeed.enabled,
            back.parametric.bands[2].gain_db,
            if back.headphone.profile.is_some() { "var" } else { "YOK" }
        );
        assert!(back.crossfeed.enabled && back.parametric.bands[2].gain_db == -4.0);
    }
}
