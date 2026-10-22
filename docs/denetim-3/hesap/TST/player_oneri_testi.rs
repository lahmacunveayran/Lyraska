    /// TST-04 önerisi (player.rs `mod tests` içine): A/B telafisi ve korumaya bildirilen yükseltme
    /// oynatıcıdan ses yolunun kanalına doğru işaretle ve doğru değerle ulaşır.
    #[test]
    fn tst_parametrik_karsilastirma_ve_yukseltme_ses_yoluna_ulasir() {
        use crate::audio::peq::{
            DesignMethod, FilterKind, ParametricBand, ParametricSettings, PeqProcessor,
        };
        let mut player = Player::new();
        let applied = player.set_parametric(ParametricSettings {
            enabled: true,
            bands: vec![ParametricBand {
                kind: FilterKind::Peaking,
                freq_hz: 1000.0,
                gain_db: 6.0,
                q: 1.0,
                enabled: true,
            }],
            design: DesignMethod::Matched,
        });
        // Korumaya bildirilen yükseltme ayarın kendi tepesidir (yaklaşık +6 dB).
        assert!(applied.boost_db() > 5.9);
        assert!((player.parametric_control.boost_db() - applied.boost_db()).abs() < 1e-12);
        // Karşılaştırmada ekolayzersiz ses, ekolayzerli sesin yüksekliğine YÜKSELTİLİR.
        player.set_parametric_compare(true);
        let loudness_db = applied.loudness_db();
        assert!(loudness_db > 0.5, "{loudness_db}");
        let mut processor = PeqProcessor::new(Arc::clone(&player.parametric_control), 1, 48_000);
        let mut frame = [0.5];
        processor.process_frame(&mut frame);
        let expected = 0.5 * 10f64.powf(loudness_db / 20.0);
        assert!((frame[0] - expected).abs() < 1e-12, "{} != {expected}", frame[0]);
    }
