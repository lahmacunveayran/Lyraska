//! DSP denetimi (Denetim 2): parametrik EQ ve kulaklık düzeltmesi kanıt testleri. Depoya girmez.
use super::*;

fn band(kind: FilterKind, freq_hz: f64, gain_db: f64, q: f64) -> ParametricBand {
    ParametricBand { kind, freq_hz, gain_db, q, enabled: true }
}

/// Bir sinüsün işlemciden geçmiş kararlı durum tepesi (doğrusal) ve RMS'ten kazancı (dB).
fn run_sine(processor: &mut PeqProcessor, hz: f64, rate: u32, amplitude: f64) -> (f64, f64) {
    let n = rate as usize;
    let w = 2.0 * PI * hz / f64::from(rate);
    let (mut peak, mut sum) = (0.0f64, 0.0);
    for i in 0..n {
        if i % 512 == 0 {
            processor.begin_block();
        }
        let x = amplitude * (w * i as f64).sin();
        let mut frame = [x, x];
        processor.process_frame(&mut frame);
        if i >= n / 2 {
            peak = peak.max(frame[0].abs());
            sum += frame[0] * frame[0];
        }
    }
    let db = 10.0 * (sum / (n / 2) as f64 * 2.0 / (amplitude * amplitude)).log10();
    (peak, db)
}

fn processor_for(settings: &ParametricSettings, rate: u32) -> (Arc<PeqControl>, PeqProcessor) {
    let control = Arc::new(PeqControl::default());
    control.set_filters(
        &settings.filters(),
        0.0,
        settings.boost_db(),
        settings.design,
        settings.enabled,
    );
    let processor = PeqProcessor::new(Arc::clone(&control), 2, rate);
    (control, processor)
}

/// Kanıt (DSP): ekranda çizilen parametrik eğri (96 kHz'te hesaplanır) 44,1 kHz'te duyulan eğri
/// değildir. MIMARI.md: "varsayılan eşlenmiş tasarım (çizilen eğri duyulan eğridir)".
#[test]
fn denetim_dsp_parametrik_cizilen_egri_duyulan_egri() {
    let cases: Vec<(&str, ParametricSettings)> = vec![
        (
            "eşlenmiş HS 10 kHz +6 (varsayılan bant)",
            ParametricSettings {
                enabled: true,
                bands: vec![band(FilterKind::HighShelf, 10_000.0, 6.0, std::f64::consts::FRAC_1_SQRT_2)],
                design: DesignMethod::Matched,
            },
        ),
        (
            "eşlenmiş PK 12 kHz +9 Q 2",
            ParametricSettings {
                enabled: true,
                bands: vec![band(FilterKind::Peaking, 12_000.0, 9.0, 2.0)],
                design: DesignMethod::Matched,
            },
        ),
        (
            "APO'dan içe aktarılmış (RBJ) HSC 10 kHz +6 + PK 16 kHz +6 Q 1.41",
            ParametricSettings {
                enabled: true,
                bands: vec![
                    band(FilterKind::HighShelf, 10_000.0, 6.0, 0.7),
                    band(FilterKind::Peaking, 16_000.0, 6.0, 1.41),
                ],
                design: DesignMethod::Rbj,
            },
        ),
        (
            "eşlenmiş HS 22 kHz +12 (hava bandı)",
            ParametricSettings {
                enabled: true,
                bands: vec![band(FilterKind::HighShelf, 22_000.0, 12.0, std::f64::consts::FRAC_1_SQRT_2)],
                design: DesignMethod::Matched,
            },
        ),
    ];
    let mut worst_all = 0.0f64;
    for (name, settings) in &cases {
        let state = ParametricState::new(settings.clone(), false);
        for rate in [44_100u32, 48_000] {
            let heard = settings.response_db(&state.curve_hz, f64::from(rate));
            let (mut worst, mut at) = (0.0f64, 0.0);
            for (i, &hz) in state.curve_hz.iter().enumerate() {
                let d = (state.curve_db[i] - heard[i]).abs();
                if d > worst {
                    worst = d;
                    at = hz;
                }
            }
            // İşlemciyle doğrudan ölçüm (en kötü frekansta).
            let (_c, mut p) = processor_for(settings, rate);
            let (_, measured) = run_sine(&mut p, at, rate, 0.1);
            let shown = state.curve_db[state.curve_hz.iter().position(|&h| h == at).unwrap()];
            println!(
                "{name} @ {rate}: en büyük fark {worst:.2} dB ({at:.0} Hz: çizilen {shown:+.2}, işlemciden ölçülen {measured:+.2})"
            );
            worst_all = worst_all.max(worst);
        }
    }
    assert!(worst_all < 0.5, "çizilen ile duyulan eğri arasında {worst_all:.2} dB fark");
}

/// Kanıt (DSP): A/B karşılaştırma telafisi 96 kHz'te hesaplanır; 48 kHz'te ses yolunda etkisiz
/// (Nyquist'e düşen) bir bant için telafi uygulanır ama ekolayzerli tarafta hiçbir şey değişmez.
#[test]
fn denetim_dsp_ab_telafisi_calan_hizdaki_sesle_uyusur() {
    let rate = 48_000u32;
    let settings = ParametricSettings {
        enabled: true,
        bands: vec![band(FilterKind::LowShelf, 24_000.0, 6.0, 0.707)],
        design: DesignMethod::Matched,
    };
    let (control, mut p) = processor_for(&settings, rate);
    let (_, eq_side) = run_sine(&mut p, 1000.0, rate, 0.1);
    control.set_compare(true, settings.loudness_db());
    let (_, compare_side) = run_sine(&mut p, 1000.0, rate, 0.1);
    println!(
        "loudness_db {:.2}, boost_db {:.2}; 1 kHz: ekolayzerli {eq_side:+.2} dB, karşılaştırma {compare_side:+.2} dB",
        settings.loudness_db(),
        settings.boost_db()
    );
    assert!(
        (eq_side - compare_side).abs() < 0.5,
        "A/B iki taraf {:.2} dB farklı",
        compare_side - eq_side
    );
}

/// Kanıt (DSP): kulaklık profilinin ön kazancı tepe taramasıyla bulunur (20 Hz'ten, oktavda 48
/// nokta). Dar (Q 30) bir tepe tarama noktalarının arasına, ya da 20 Hz'in altına düşerse ön kazanç
/// yetmez: tam ölçekli sinüs düzeltmeden sonra 0 dBFS'i aşar (yükseltme korumaya bildirilmez).
#[test]
fn denetim_dsp_kulaklik_on_kazanci_tepeyi_karsilar() {
    let rate = 48_000u32;
    let fs = f64::from(rate);
    // Tarama noktaları (coefs_peak_db ile aynı).
    let top = fs * 0.49;
    let octaves = (top / PEAK_SCAN_LOW_HZ).log2();
    let points = (octaves * PEAK_SCAN_PER_OCTAVE).ceil() as usize;
    let pt = |i: usize| PEAK_SCAN_LOW_HZ * 2f64.powf(octaves * i as f64 / points as f64);
    let mid = (pt(300) * pt(301)).sqrt(); // iki nokta arası (~2,7 kHz)
    let mut worst = 0.0f64;
    for (name, text) in [
        ("PK Q30 +12 iki tarama noktası arasında", format!("Filter 1: ON PK Fc {mid:.4} Hz Gain 12 dB Q 30\n")),
        ("PK Q10 +12 iki tarama noktası arasında", format!("Filter 1: ON PK Fc {mid:.4} Hz Gain 12 dB Q 10\n")),
        ("PK 14 Hz +12 Q 2 (20 Hz altı)", "Filter 1: ON PK Fc 14 Hz Gain 12 dB Q 2\n".to_string()),
        ("LSC 15 Hz +12 Q 2 (rezonanslı raf)", "Filter 1: ON LSC Fc 15 Hz Gain 12 dB Q 2\n".to_string()),
    ] {
        let profile = HeadphoneProfile::parse(&text, "x").unwrap();
        let f = profile.filters[0];
        // Gerçek tepe frekansı: sık tarama.
        let coefs = [design(&f, fs, profile.design)];
        let (mut best, mut best_hz) = (0.0f64, 0.0);
        for i in 0..200_000 {
            let hz = 5.0 * (top / 5.0f64).powf(f64::from(i) / 199_999.0);
            let g = coefs[0].power_gain(biquad::phi(2.0 * PI * hz / fs));
            if g > best {
                best = g;
                best_hz = hz;
            }
        }
        let control = Arc::new(PeqControl::default());
        control.set(Some(&profile), true);
        let mut p = PeqProcessor::new(Arc::clone(&control), 2, rate);
        let (peak, _) = run_sine(&mut p, best_hz, rate, 1.0);
        let over = 20.0 * peak.log10();
        println!(
            "{name}: ön kazanç {:.2} dB, gerçek tepe {:.2} dB @ {best_hz:.2} Hz, tam ölçekli sinüs çıkışı {over:+.2} dBFS",
            profile.preamp_db,
            10.0 * best.log10()
        );
        worst = worst.max(over);
    }
    assert!(worst <= 0.01, "kulaklık düzeltmesi tam ölçekli sesi {worst:+.2} dBFS'e çıkarıyor");
}

/// Kanıt (DSP): parametrik ekolayzerin korumaya bildirilen yükseltmesi 44,1/48 kHz'e göredir;
/// 96/192 kHz'te çalarken duyulur bantta (≤ 20 kHz) gerçek tepe daha yüksek olabilir.
#[test]
fn denetim_dsp_parametrik_yukseltme_her_hizda_karsilanir() {
    let mut worst = (0.0f64, String::new());
    let kinds = [FilterKind::Peaking, FilterKind::HighShelf, FilterKind::LowShelf];
    let mut seed = 0x1234_5678_u64;
    let mut rnd = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (seed >> 11) as f64 / (1u64 << 53) as f64
    };
    for _ in 0..3000 {
        let n = 1 + (rnd() * 4.0) as usize;
        let bands: Vec<ParametricBand> = (0..n)
            .map(|_| {
                band(
                    kinds[(rnd() * 3.0) as usize % 3],
                    20.0 * 1000f64.powf(rnd()),
                    -12.0 + 24.0 * rnd(),
                    0.3 * 30f64.powf(rnd() * 0.8),
                )
            })
            .collect();
        for design_method in [DesignMethod::Matched, DesignMethod::Rbj] {
            let settings = ParametricSettings { enabled: true, bands: bands.clone(), design: design_method };
            let reported = settings.boost_db();
            for rate in [44_100.0, 48_000.0, 96_000.0, 192_000.0] {
                let coefs: Vec<Biquad> =
                    settings.filters().iter().map(|f| design(f, rate, design_method)).collect();
                let peak = (0..4000)
                    .map(|i| 20.0 * 1000f64.powf(f64::from(i) / 3999.0))
                    .map(|hz| {
                        let phi = biquad::phi(2.0 * PI * hz / rate);
                        10.0 * coefs.iter().map(|c| c.power_gain(phi)).product::<f64>().log10()
                    })
                    .fold(f64::NEG_INFINITY, f64::max);
                if peak - reported > worst.0 {
                    worst = (peak - reported, format!("{rate} Hz {design_method:?}: bildirilen {reported:.2}, gerçek {peak:.2} dB; {bands:?}"));
                }
            }
        }
    }
    println!("en kötü eksik bildirim {:.2} dB: {}", worst.0, worst.1);
    assert!(worst.0 < 0.1, "parametrik yükseltme {:.2} dB eksik bildiriliyor", worst.0);
}
