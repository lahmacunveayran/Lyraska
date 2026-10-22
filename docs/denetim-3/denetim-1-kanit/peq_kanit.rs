
#[cfg(test)]
mod denetim1_kanit {
    use super::*;

    /// D1-e: Nyquist'e yakın bant ekranda var, 44,1/48 kHz'te seste yok; korumaya da bildirilmez.
    #[test]
    fn d1e_nyquist_yakini_bant_ekranda_var_seste_yok() {
        let settings = ParametricSettings {
            enabled: true,
            bands: vec![ParametricBand {
                kind: FilterKind::Peaking,
                freq_hz: 23_000.0,
                gain_db: 24.0,
                q: 1.0,
                enabled: true,
            }],
            design: DesignMethod::Matched,
        };
        let state = ParametricState::new(settings.clone(), false);
        let i20k = state.curve_hz.len() - 1;
        let shown = state.curve_db[i20k];
        let filter = settings.filters()[0];
        let heard = |rate: f64| design(&filter, rate, DesignMethod::Matched)
            .response_db(2.0 * PI * 20_000.0 / rate);
        println!(
            "D1-e: ekranda 20 kHz {shown:.1} dB; seste 44,1k {:.1} dB, 48k {:.1} dB, 96k {:.1} dB; korumaya bildirilen {:.1} dB",
            heard(44_100.0), heard(48_000.0), heard(96_000.0), settings.boost_db()
        );
        assert!((shown - heard(48_000.0)).abs() < 1.0, "ekran {shown:.1} dB, ses {:.1} dB", heard(48_000.0));
    }

    /// D1-i: 20 bantlık eşlenmiş tasarım ses iş parçacığında ne kadar sürüyor?
    #[test]
    fn d1i_tasarim_suresi_ses_blogu_icinde() {
        let filters: Vec<PeqFilter> = (0..MAX_FILTERS)
            .map(|i| PeqFilter {
                kind: if i % 3 == 0 { FilterKind::HighShelf } else { FilterKind::Peaking },
                freq_hz: 30.0 * 1.4f64.powi(i as i32),
                gain_db: if i % 2 == 0 { 6.0 } else { -4.0 },
                q: 1.0 + (i as f64) * 0.3,
            })
            .collect();
        let control = PeqControl::default();
        control.set_filters(&filters, -6.0, 0.0, DesignMethod::Matched, true);
        let mut bank = Bank::new(2);
        let runs = 50;
        let start = std::time::Instant::now();
        for _ in 0..runs {
            control.design(48_000.0, &mut bank);
        }
        let us = start.elapsed().as_secs_f64() * 1e6 / runs as f64;
        let rbj = PeqControl::default();
        rbj.set_filters(&filters, -6.0, 0.0, DesignMethod::Rbj, true);
        let start = std::time::Instant::now();
        for _ in 0..runs {
            rbj.design(48_000.0, &mut bank);
        }
        let us_rbj = start.elapsed().as_secs_f64() * 1e6 / runs as f64;
        let settings = ParametricSettings {
            enabled: true,
            bands: filters.iter().map(|f| ParametricBand { kind: f.kind, freq_hz: f.freq_hz, gain_db: f.gain_db, q: f.q, enabled: true }).collect(),
            design: DesignMethod::Matched,
        };
        let start = std::time::Instant::now();
        for _ in 0..10 {
            let _ = ParametricState::new(settings.clone(), false);
        }
        println!("D1-b: ParametricState::new (20 bant, eşlenmiş) {:.1} ms (oynatıcı kilidi altında)", start.elapsed().as_secs_f64() * 100.0);
        println!("D1-i: 20 süzgeç eşlenmiş {us:.0} µs, RBJ {us_rbj:.0} µs (10 ms'lik blokta %{:.1})", us / 100.0);
    }

    /// D1-f: Equalizer APO'nun "Channel:" bölümleri: sol ve sağ kanalın ayrı filtreleri iki
    /// kanala birden, toplanarak uygulanır; birden çok "Preamp:" toplanmaz.
    #[test]
    fn d1f_channel_bolumleri_toplanmamali() {
        let text = "Preamp: -3 dB\nChannel: L\nFilter 1: ON PK Fc 1000 Hz Gain 6 dB Q 1\nChannel: R\nFilter 2: ON PK Fc 1000 Hz Gain 6 dB Q 1\nPreamp: -3 dB\n";
        let profile = HeadphoneProfile::parse(text, "deneme").unwrap();
        let at_1k = profile.response_db(&[1000.0], 48_000.0)[0] - profile.preamp_db;
        println!("D1-f: filtre sayısı {}, 1 kHz'te her kanala {at_1k:.1} dB (APO'da sol 6, sağ 6), ön kazanç {:.1} dB (APO'da −6)", profile.filters.len(), profile.preamp_db);
        assert!((at_1k - 6.0).abs() < 0.5, "her kanal {at_1k:.1} dB");
    }

    /// D1-o: Ekranda çizilen eğri (96 kHz) ile 44,1 kHz'te duyulan eğrinin farkı, tipik bantlarda.
    #[test]
    fn d1o_ekran_egrisi_ile_duyulan_44k() {
        let cases = [
            (FilterKind::HighShelf, 10_000.0, 6.0, 0.7),
            (FilterKind::Peaking, 16_000.0, 6.0, 2.0),
            (FilterKind::Peaking, 18_000.0, -8.0, 4.0),
            (FilterKind::Peaking, 12_000.0, 10.0, 6.0),
        ];
        let mut worst: f64 = 0.0;
        for method in [DesignMethod::Matched, DesignMethod::Rbj] {
            for (kind, f, g, q) in cases {
                let settings = ParametricSettings {
                    enabled: true,
                    bands: vec![ParametricBand { kind, freq_hz: f, gain_db: g, q, enabled: true }],
                    design: method,
                };
                let state = ParametricState::new(settings.clone(), false);
                let heard = settings.response_db(&state.curve_hz, 44_100.0);
                let (i, d) = state.curve_db.iter().zip(&heard).enumerate()
                    .map(|(i, (a, b))| (i, (a - b).abs()))
                    .fold((0, 0.0f64), |m, x| if x.1 > m.1 { x } else { m });
                println!("D1-o {method:?} {kind:?} {f} Hz {g:+} dB Q{q}: en büyük fark {d:.2} dB @ {:.0} Hz", state.curve_hz[i]);
                if method == DesignMethod::Matched { worst = worst.max(d); }
            }
        }
        assert!(worst < 0.5, "eşlenmişte ekran–ses farkı {worst:.2} dB");
    }
}
