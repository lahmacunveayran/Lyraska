
// ---- ARY denetim kanıt testleri (src-tauri/src/audio/peq.rs sonuna eklenir) ----
#[cfg(test)]
mod ary_denetim {
    use super::*;

    fn band(kind: FilterKind, freq_hz: f64, gain_db: f64, q: f64) -> ParametricBand {
        ParametricBand {
            kind,
            freq_hz,
            gain_db,
            q,
            enabled: true,
        }
    }

    /// ARY: Ekolayzer kapalıyken kaydedilen dosya geri yüklenemiyor.
    #[test]
    fn ary_kapali_ekolayzer_kaydedilip_geri_yuklenir() {
        let mut settings = ParametricSettings::default();
        settings.bands[1].gain_db = 4.0;
        settings.enabled = false; // kullanıcı A/B yerine ana anahtarla kapatmış
        let text = settings.to_apo();
        println!("--- dışa aktarılan ---\n{text}---");
        let back = HeadphoneProfile::parse(&text, "");
        println!("geri okuma: {back:?}");
        assert!(
            back.is_ok(),
            "Lyraska'nın kendi yazdığı dosya Lyraska'ya geri yüklenemiyor: {back:?}"
        );
    }

    /// ARY: Kapalı bant gidiş-dönüşte kayboluyor, tasarım yöntemi değişiyor.
    #[test]
    fn ary_gidis_donus_kayipsiz() {
        let mut settings = ParametricSettings::default();
        settings.bands[1].gain_db = 4.0;
        settings.bands[2].gain_db = -3.0;
        settings.bands[2].enabled = false; // ayarı duran, kapalı bant
        settings.bands[3].gain_db = 2.5;
        let text = settings.to_apo();
        let back = ParametricSettings::from_profile(&HeadphoneProfile::parse(&text, "").unwrap());
        println!(
            "önce: {} bant, tasarım {:?}; sonra: {} bant, tasarım {:?}",
            settings.bands.len(),
            settings.design,
            back.bands.len(),
            back.design
        );
        assert_eq!(back.bands.len(), settings.bands.len(), "kapalı bant kayboldu");
        assert_eq!(back.design, settings.design, "tasarım yöntemi değişti");
    }

    /// ARY: Equalizer APO'nun `Channel:` bölümleri yok sayılıyor; iki kanalın filtreleri üst üste
    /// iki kanala birden uygulanıyor.
    #[test]
    fn ary_channel_bolumleri() {
        let text = "Preamp: -6 dB\n\
                    Channel: L\n\
                    Filter 1: ON PK Fc 1000 Hz Gain 6 dB Q 1\n\
                    Channel: R\n\
                    Filter 2: ON PK Fc 1000 Hz Gain 6 dB Q 1\n";
        let profile = HeadphoneProfile::parse(text, "").unwrap();
        let settings = ParametricSettings::from_profile(&profile);
        let at_1k = settings.response_db(&[1000.0], 48_000.0)[0];
        println!(
            "filtre sayısı {}, 1 kHz'te uygulanan kazanç {at_1k:.2} dB (Equalizer APO: her kanalda 6 dB)",
            profile.filters.len()
        );
        assert!(
            (at_1k - 6.0).abs() < 0.1,
            "Channel: L/R bölümleri birleştirildi: 1 kHz'te {at_1k:.2} dB"
        );
    }

    /// ARY: Equalizer APO'da birden fazla `Preamp:` satırı toplanır; Lyraska sonuncuyu alır.
    #[test]
    fn ary_birden_fazla_preamp() {
        let text = "Preamp: -4 dB\nPreamp: -4 dB\nFilter 1: ON PK Fc 1000 Hz Gain 1 dB Q 1\n";
        let profile = HeadphoneProfile::parse(text, "").unwrap();
        println!("ön kazanç {} dB (Equalizer APO: −8 dB)", profile.preamp_db);
        assert!((profile.preamp_db + 8.0).abs() < 1e-9);
    }

    /// ARY: Sınır dışı/anlamsız değerler sessizce kabul edilir (hata yerine sınıra çekme).
    #[test]
    fn ary_anlamsiz_degerler_sessizce_kabul() {
        for line in [
            "Filter 1: ON PK Fc -1000 Hz Gain 6 dB Q 1",
            "Filter 1: ON PK Fc 1000 Hz Gain 1e308 dB Q 1",
            "Filter 1: ON PK Fc 1000 Hz Gain 6 dB Q 0",
            "Filter 1: ON PK Fc 1000 Hz Gain 6 dB Q -5",
        ] {
            let r = HeadphoneProfile::parse(line, "")
                .map(|p| ParametricSettings::from_profile(&p).bands[0]);
            println!("{line:<48} → {r:?}");
        }
    }

    /// ARY: UTF-16 (Windows Not Defteri'nin "Unicode" kaydı) dosya: hata metni İngilizce.
    #[test]
    fn ary_utf16_dosya() {
        let text = "Preamp: -3 dB\r\nFilter 1: ON PK Fc 1000 Hz Gain 3 dB Q 1\r\n";
        let mut bytes = vec![0xFF, 0xFE];
        for unit in text.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let path = crate::audio::test_util::temp_path("utf16.txt");
        std::fs::write(&path, bytes).unwrap();
        // parametric_import / headphone_import ile aynı çağrı ve aynı hata biçimi:
        let shown = std::fs::read_to_string(&path)
            .map_err(|e| format!("Dosya okunamadı: {e}"))
            .unwrap_err();
        println!("arayüzde görünen hata: {shown}");
        // CRLF ve BOM'lu UTF-8 sorunsuz:
        let crlf = format!("\u{feff}{text}");
        assert!(HeadphoneProfile::parse(&crlf, "").is_ok());
    }

    /// ARY: Bulanık (fuzz benzeri) deneme: rastgele satırlar paniğe yol açmaz, sonuç sınırlar
    /// içindedir; kaydet → yükle → kaydet ikinci turda sabittir.
    #[test]
    fn ary_bulanik_okuma_ve_gidis_donus() {
        let mut seed: u64 = 0x9e37_79b9_7f4a_7c15;
        let mut next = move || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        let kinds = [
            "PK", "LS", "HS", "LSC", "HSC", "LP", "HP", "LPQ", "HPQ", "BP", "NO", "AP", "pk", "XX",
        ];
        let numbers = [
            "0", "-0", "1", "-1", "0.5", "5,5", "1e308", "-1e308", "1e-308", "NaN", "inf", "-inf",
            "24000", "30000", "10", "5", "abc", "", "1.2.3", "１０００",
        ];
        let (mut ok, mut err, mut stable) = (0, 0, 0);
        let mut unstable = Vec::new();
        for _ in 0..20_000 {
            let lines = 1 + (next() % 6) as usize;
            let mut text = String::new();
            for _ in 0..lines {
                let pick = |v: &[&'static str], r: u64| v[(r % v.len() as u64) as usize];
                let line = match next() % 6 {
                    0 => format!("Preamp: {} dB", pick(&numbers, next())),
                    1 => format!("# yorum {}", pick(&numbers, next())),
                    2 => format!(
                        "Filter {}: ON {} {} dB Fc {} Hz Gain {} dB Q {}",
                        next() % 30,
                        pick(&kinds, next()),
                        pick(&numbers, next()),
                        pick(&numbers, next()),
                        pick(&numbers, next()),
                        pick(&numbers, next())
                    ),
                    3 => format!(
                        "Filter: ON {} Fc {} Hz Gain {} dB BW Oct {}",
                        pick(&kinds, next()),
                        pick(&numbers, next()),
                        pick(&numbers, next()),
                        pick(&numbers, next())
                    ),
                    4 => format!(
                        "Filter {}: ON {} Fc {} Hz Q {}",
                        next() % 9,
                        pick(&kinds, next()),
                        pick(&numbers, next()),
                        pick(&numbers, next())
                    ),
                    _ => "Channel: L\r".to_owned(),
                };
                text.push_str(&line);
                text.push('\n');
            }
            match HeadphoneProfile::parse(&text, "x") {
                Ok(profile) => {
                    ok += 1;
                    assert!(profile.preamp_db.is_finite() && profile.preamp_db <= 0.0);
                    let settings = ParametricSettings::from_profile(&profile);
                    for b in &settings.bands {
                        assert!(b.freq_hz.is_finite() && (10.0..=24_000.0).contains(&b.freq_hz));
                        assert!(b.gain_db.abs() <= 24.0 && b.q >= 0.1 && b.q <= 30.0);
                    }
                    let state = ParametricState::new(settings.clone(), false);
                    assert!(state.curve_db.iter().all(|x| x.is_finite()), "{text}");
                    // Kaydet → yükle → kaydet: ikinci metin birinciyle aynı olmalı.
                    let first = settings.to_apo();
                    let again = ParametricSettings::from_profile(
                        &HeadphoneProfile::parse(&first, "").unwrap(),
                    );
                    if again.to_apo() == first {
                        stable += 1;
                    } else if unstable.len() < 3 {
                        unstable.push((first, again.to_apo()));
                    }
                }
                Err(_) => err += 1,
            }
        }
        println!("okunan {ok}, reddedilen {err}, gidiş-dönüşte sabit {stable}/{ok}; panik yok");
        for (a, b) in &unstable {
            println!("--- kararsız örnek ---\n{a}--- ikinci tur ---\n{b}");
        }
        assert_eq!(stable, ok, "kaydet→yükle→kaydet sabit değil");
    }

    /// ARY: Ekranda çizilen eğri (96 kHz'te tasarlanmış) ile çalan hızdaki (44,1 / 48 kHz) gerçek
    /// eğri arasındaki fark (20 Hz – 20 kHz, 241 nokta).
    #[test]
    fn ary_ekrandaki_egri_duyulan_egri() {
        let cases: Vec<(&str, Vec<ParametricBand>)> = vec![
            (
                "PK 16 kHz +6 dB Q 2",
                vec![band(FilterKind::Peaking, 16_000.0, 6.0, 2.0)],
            ),
            (
                "HS 10 kHz +6 dB Q 0,707",
                vec![band(FilterKind::HighShelf, 10_000.0, 6.0, std::f64::consts::FRAC_1_SQRT_2)],
            ),
            (
                "PK 12 kHz −8 dB Q 4",
                vec![band(FilterKind::Peaking, 12_000.0, -8.0, 4.0)],
            ),
            (
                "AutoEq benzeri (LSC 105, PK 1923, PK 3500, HSC 10k)",
                vec![
                    band(FilterKind::LowShelf, 105.0, 5.5, 0.7),
                    band(FilterKind::Peaking, 1923.0, -3.2, 1.31),
                    band(FilterKind::Peaking, 3500.0, 4.0, 2.0),
                    band(FilterKind::HighShelf, 10_000.0, 2.0, 0.7),
                ],
            ),
        ];
        let mut worst_rbj: f64 = 0.0;
        for design in [DesignMethod::Rbj, DesignMethod::Matched] {
            for (name, bands) in &cases {
                let settings = ParametricSettings {
                    enabled: true,
                    bands: bands.clone(),
                    design,
                };
                let shown = ParametricState::new(settings.clone(), false);
                for rate in [44_100.0, 48_000.0] {
                    let heard = settings.response_db(&shown.curve_hz, rate);
                    let (i, diff) = shown
                        .curve_db
                        .iter()
                        .zip(&heard)
                        .map(|(a, b)| (a - b).abs())
                        .enumerate()
                        .fold((0, 0.0), |m, (i, d)| if d > m.1 { (i, d) } else { m });
                    println!(
                        "{design:?} {rate:>7} Hz  {name:<52} en büyük fark {diff:5.2} dB @ {:>7.0} Hz (ekranda {:+.2}, duyulan {:+.2})",
                        shown.curve_hz[i], shown.curve_db[i], heard[i]
                    );
                    if design == DesignMethod::Rbj {
                        worst_rbj = worst_rbj.max(diff);
                    }
                }
            }
        }
        // Kulaklık düzeltmesinin eğrisi 48 kHz'e göre çiziliyor; 44,1 kHz'te çalarken:
        let profile = HeadphoneProfile::parse(
            "Preamp: -6 dB\nFilter 1: ON PK Fc 16000 Hz Gain 6 dB Q 2\n",
            "",
        )
        .unwrap();
        let hs = HeadphoneState::new(HeadphoneSettings {
            enabled: true,
            profile: Some(profile.clone()),
        });
        let heard = profile.response_db(&hs.curve_hz, 44_100.0);
        let diff = hs
            .curve_db
            .iter()
            .zip(&heard)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0, f64::max);
        println!("Kulaklık PK 16 kHz +6 Q2: ekranda (48 kHz) – duyulan (44,1 kHz) en büyük fark {diff:.2} dB");
        assert!(
            worst_rbj < 1.0,
            "\"Equalizer APO ile aynı\" tasarımda ekrandaki eğri duyulandan {worst_rbj:.2} dB sapıyor"
        );
    }
}
