//! DOĞRULAMA-1: DSP-01/02/03/05 ve ARY-03/04/05 için bağımsız kanıt testleri. Depoya girmez.
use super::*;

fn pb(kind: FilterKind, freq_hz: f64, gain_db: f64, q: f64) -> ParametricBand {
    ParametricBand { kind, freq_hz, gain_db, q, enabled: true }
}

/// Oynatıcının yaptığı gibi (player.rs set_parametric) kontrolü kurar.
fn parametric_processor(s: &ParametricSettings, rate: u32) -> (Arc<PeqControl>, PeqProcessor) {
    let s = s.clone().sanitized();
    let c = Arc::new(PeqControl::default());
    c.set_filters(&s.filters(), 0.0, s.boost_db(), s.design, s.enabled);
    let p = PeqProcessor::new(Arc::clone(&c), 2, rate);
    (c, p)
}

/// Kararlı durum: (çıkış örnek tepesi, sinüs kazancı dB).
fn sine_through(p: &mut PeqProcessor, hz: f64, rate: u32, amp: f64, seconds: f64) -> (f64, f64) {
    let n = (f64::from(rate) * seconds) as usize;
    let w = 2.0 * PI * hz / f64::from(rate);
    let (mut peak, mut e, mut c) = (0.0f64, 0.0, 0.0);
    for i in 0..n {
        if i % 256 == 0 {
            p.begin_block();
        }
        let x = amp * (w * i as f64).sin();
        let mut fr = [x, x];
        p.process_frame(&mut fr);
        if i >= n / 2 {
            peak = peak.max(fr[0].abs());
            e += fr[0] * fr[0];
            c += 1.0;
        }
    }
    (peak, 10.0 * (2.0 * e / c / (amp * amp)).log10())
}

/// Bağımsız sık tarama: lo'dan hi'ye 200 000 nokta, verilen katsayıların toplam tepesi.
fn dense_peak(coefs: &[Biquad], fs: f64, lo: f64, hi: f64) -> (f64, f64) {
    let mut best = (f64::NEG_INFINITY, 0.0);
    for i in 0..200_000 {
        let hz = lo * (hi / lo).powf(f64::from(i) / 199_999.0);
        let db: f64 = coefs.iter().map(|c| c.response_db(2.0 * PI * hz / fs)).sum();
        if db > best.0 {
            best = (db, hz);
        }
    }
    best
}

#[test]
fn dog1_dsp01_parametrik_20hz_alti() {
    let fs = 48_000u32;
    for (name, bands, design_m) in [
        ("PK 10 Hz +24 Q4 (arayüz izin verir)", vec![pb(FilterKind::Peaking, 10.0, 24.0, 4.0)], DesignMethod::Matched),
        ("PK 15 Hz +6 Q1.4 (ılımlı altbas)", vec![pb(FilterKind::Peaking, 15.0, 6.0, 1.4)], DesignMethod::Matched),
        ("LS 15 Hz +6 Q0.707", vec![pb(FilterKind::LowShelf, 15.0, 6.0, 0.707)], DesignMethod::Matched),
        ("LS 30 Hz +6 Q0.707 (kontrol: 20 Hz üstü raf)", vec![pb(FilterKind::LowShelf, 30.0, 6.0, 0.707)], DesignMethod::Matched),
        ("PK 40 Hz +6 Q1 (kontrol)", vec![pb(FilterKind::Peaking, 40.0, 6.0, 1.0)], DesignMethod::Matched),
    ] {
        let s = ParametricSettings { enabled: true, bands, design: design_m };
        let coefs: Vec<Biquad> = s.filters().iter().map(|f| design(f, f64::from(fs), design_m)).collect();
        let (peak_db, at) = dense_peak(&coefs, f64::from(fs), 1.0, 0.49 * f64::from(fs));
        let (_c, mut p) = parametric_processor(&s, fs);
        let (out_peak, gain) = sine_through(&mut p, at, fs, 0.5, 4.0);
        println!(
            "{name}: bildirilen boost_db {:.2} dB | gerçek tepe {peak_db:.2} dB @ {at:.1} Hz | işlemciden ölçülen {gain:+.2} dB (örnek tepesi ×{:.2}) | eksik {:.2} dB",
            s.boost_db(),
            out_peak / 0.5,
            peak_db - s.boost_db()
        );
    }
}

#[test]
fn dog1_dsp01_kulaklik_profili() {
    let fs = 48_000u32;
    for (name, text) in [
        ("PK 12 Hz +10 Q1.4, Preamp yok", "Filter 1: ON PK Fc 12 Hz Gain 10 dB Q 1.4\n"),
        ("PK 12 Hz +10 Q1.4, Preamp -3", "Preamp: -3 dB\nFilter 1: ON PK Fc 12 Hz Gain 10 dB Q 1.4\n"),
        ("LSC 15 Hz +12 Q2 (DSP'nin örneği)", "Filter 1: ON LSC Fc 15 Hz Gain 12 dB Q 2\n"),
        ("AutoEq tipik LSC 105 +6 Q0.7 (kontrol)", "Filter 1: ON LSC Fc 105 Hz Gain 6 dB Q 0.7\n"),
        ("PK Q30 +12 @ 2712.3 Hz (dar tepe)", "Filter 1: ON PK Fc 2712.3 Hz Gain 12 dB Q 30\n"),
        ("PK Q10 +12 @ 2712.3 Hz", "Filter 1: ON PK Fc 2712.3 Hz Gain 12 dB Q 10\n"),
    ] {
        let profile = HeadphoneProfile::parse(text, "x").unwrap();
        let coefs: Vec<Biquad> = profile.filters.iter().map(|f| design(f, f64::from(fs), profile.design)).collect();
        let (peak_db, at) = dense_peak(&coefs, f64::from(fs), 1.0, 0.49 * f64::from(fs));
        let c = Arc::new(PeqControl::default());
        c.set(Some(&profile), true);
        let mut p = PeqProcessor::new(Arc::clone(&c), 2, fs);
        let (out_peak, _) = sine_through(&mut p, at, fs, 1.0, 4.0);
        println!(
            "{name}: ön kazanç {:.2} dB, gerçek tepe {peak_db:.2} dB @ {at:.2} Hz, tam ölçekli sinüs çıkışı {:+.2} dBFS, korumaya bildirilen {:.2}",
            profile.preamp_db,
            20.0 * out_peak.log10(),
            c.boost_db()
        );
    }
}

/// DSP-02 / ARY-03: ekrandaki eğri (ParametricState.curve_db) ile işlemciden sinüsle ölçülen kazanç.
#[test]
fn dog1_dsp02_ary03_ekran_ve_duyulan() {
    for (name, s) in [
        (
            "APO dosyasından içe aktarma (parse + from_profile) PK 15 kHz +6 Q2",
            ParametricSettings::from_profile(
                &HeadphoneProfile::parse("Preamp: -6 dB\nFilter 1: ON PK Fc 15000 Hz Gain 6 dB Q 2\n", "").unwrap(),
            ),
        ),
        (
            "aynı bant, varsayılan eşlenmiş tasarım",
            ParametricSettings { enabled: true, bands: vec![pb(FilterKind::Peaking, 15_000.0, 6.0, 2.0)], design: DesignMethod::Matched },
        ),
        (
            "içe aktarma: AutoEq benzeri 5 filtre",
            ParametricSettings::from_profile(
                &HeadphoneProfile::parse(
                    "Preamp: -6 dB\nFilter 1: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.70\nFilter 2: ON PK Fc 1923 Hz Gain -3.2 dB Q 1.31\nFilter 3: ON PK Fc 6000 Hz Gain 4 dB Q 3\nFilter 4: ON PK Fc 8400 Hz Gain -5 dB Q 4\nFilter 5: ON HSC Fc 10000 Hz Gain 3 dB Q 0.7\n",
                    "",
                )
                .unwrap(),
            ),
        ),
    ] {
        let state = ParametricState::new(s.clone(), false);
        for fs in [44_100u32, 48_000] {
            let mut worst = (0.0f64, 0.0, 0.0, 0.0);
            for (i, &hz) in state.curve_hz.iter().enumerate() {
                if hz < 2000.0 {
                    continue;
                }
                let (_c, mut p) = parametric_processor(&s, fs);
                let (_, heard) = sine_through(&mut p, hz, fs, 0.1, 0.25);
                let d = (state.curve_db[i] - heard).abs();
                if d > worst.0 {
                    worst = (d, hz, state.curve_db[i], heard);
                }
            }
            println!(
                "{name} @ {fs}: tasarım {:?}; en büyük fark {:.2} dB @ {:.0} Hz (ekranda {:+.2}, işlemciden {:+.2})",
                s.design, worst.0, worst.1, worst.2, worst.3
            );
        }
    }
}

/// DSP-02: A/B telafisi: karşılaştırma tarafı ile ekolayzerli taraf arasındaki güç farkı.
#[test]
fn dog1_dsp02_ab_telafisi() {
    for (name, bands, fs) in [
        ("HS 22 kHz +12 (hava) @44.1k", vec![pb(FilterKind::HighShelf, 22_000.0, 12.0, 0.707)], 44_100u32),
        ("HS 20 kHz +12 @44.1k", vec![pb(FilterKind::HighShelf, 20_000.0, 12.0, 0.707)], 44_100),
        ("LS 24 kHz +6 @48k (DSP örneği)", vec![pb(FilterKind::LowShelf, 24_000.0, 6.0, 0.707)], 48_000),
        ("PK 1 kHz +6 Q1 (kontrol)", vec![pb(FilterKind::Peaking, 1000.0, 6.0, 1.0)], 48_000),
    ] {
        let s = ParametricSettings { enabled: true, bands, design: DesignMethod::Matched };
        let tones: Vec<f64> = (0..60).map(|i| 20.0 * 1000f64.powf((f64::from(i) + 0.5) / 60.0)).collect();
        let measure = |p: &mut PeqProcessor| {
            let n = fs as usize;
            let (mut e_in, mut e_out) = (0.0, 0.0);
            for i in 0..n {
                if i % 256 == 0 {
                    p.begin_block();
                }
                let t = i as f64 / f64::from(fs);
                let x: f64 = tones
                    .iter()
                    .filter(|&&f| f < 0.45 * f64::from(fs))
                    .enumerate()
                    .map(|(k, &f)| 0.01 * (2.0 * PI * f * t + k as f64).sin())
                    .sum();
                let mut fr = [x, x];
                p.process_frame(&mut fr);
                if i > n / 4 {
                    e_in += x * x;
                    e_out += fr[0] * fr[0];
                }
            }
            10.0 * (e_out / e_in).log10()
        };
        let (c, mut p) = parametric_processor(&s, fs);
        let eq_side = measure(&mut p);
        c.set_compare(true, s.loudness_db());
        let cmp_side = measure(&mut p);
        println!(
            "{name}: loudness_db {:.2}, boost_db {:.2}; logaritmik ton kümesinde (ağırlıksız güç) ekolayzerli {eq_side:+.2} dB, karşılaştırma {cmp_side:+.2} dB, fark {:+.2}",
            s.loudness_db(),
            s.boost_db(),
            cmp_side - eq_side
        );
    }
}

/// DSP-03: Nyquist'e yakın raf/tepe ses yolunda tamamen kaybolur; HP ise çekilir.
#[test]
fn dog1_dsp03_nyquist() {
    let fs = 44_100u32;
    for (name, band, probe) in [
        ("HS 22 kHz +12 Q0.707", pb(FilterKind::HighShelf, 22_000.0, 12.0, 0.707), 16_000.0),
        ("HS 21.5 kHz +12 (sınırın hemen altı)", pb(FilterKind::HighShelf, 21_500.0, 12.0, 0.707), 16_000.0),
        ("PK 22 kHz +12 Q0.5", pb(FilterKind::Peaking, 22_000.0, 12.0, 0.5), 16_000.0),
        ("LP 22 kHz", pb(FilterKind::LowPass, 22_000.0, 0.0, 0.707), 20_000.0),
        ("HP 22 kHz", pb(FilterKind::HighPass, 22_000.0, 0.0, 0.707), 16_000.0),
    ] {
        for m in [DesignMethod::Matched, DesignMethod::Rbj] {
            let s = ParametricSettings { enabled: true, bands: vec![band], design: m };
            let (_c, mut p) = parametric_processor(&s, fs);
            let (_, heard) = sine_through(&mut p, probe, fs, 0.1, 0.5);
            let spec = s.filters()[0].spec();
            let shown = ParametricState::new(s.clone(), false);
            let idx = shown
                .curve_hz
                .iter()
                .enumerate()
                .min_by(|a, b| (a.1 - probe).abs().total_cmp(&(b.1 - probe).abs()))
                .unwrap()
                .0;
            println!(
                "{name} {m:?} @44.1k, {probe} Hz: duyulan {heard:+.2} dB, analog {:+.2} dB, ekranda ({:.0} Hz) {:+.2} dB",
                spec.analog_db(probe),
                shown.curve_hz[idx],
                shown.curve_db[idx]
            );
        }
    }
}

/// DSP-05: 96/192 kHz'te bildirilen yükseltmenin eksikliği; gerçekçi (Q ≤ 2) ve tam aralıkta.
#[test]
fn dog1_dsp05_yuksek_hiz() {
    let mut seed = 0xdead_beef_u64;
    let mut rnd = || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        (seed >> 11) as f64 / (1u64 << 53) as f64
    };
    for (label, qmax) in [("Q ≤ 2", 2.0), ("Q ≤ 30", 30.0)] {
        let mut worst = (0.0f64, String::new());
        let mut over = [0usize; 2];
        let n = 400;
        for _ in 0..n {
            let k = 1 + (rnd() * 5.0) as usize;
            let bands: Vec<ParametricBand> = (0..k)
                .map(|_| {
                    let kind = [FilterKind::Peaking, FilterKind::LowShelf, FilterKind::HighShelf]
                        [(rnd() * 3.0) as usize % 3];
                    pb(kind, 20.0 * 1000f64.powf(rnd()), -12.0 + 24.0 * rnd(), 0.3 * (qmax / 0.3f64).powf(rnd()))
                })
                .collect();
            for m in [DesignMethod::Matched, DesignMethod::Rbj] {
                let s = ParametricSettings { enabled: true, bands: bands.clone(), design: m };
                let rep = s.boost_db();
                for (j, fs) in [96_000.0, 192_000.0].into_iter().enumerate() {
                    let coefs: Vec<Biquad> = s.filters().iter().map(|f| design(f, fs, m)).collect();
                    let (pk, at) = dense_peak(&coefs[..], fs, 20.0, 20_000.0);
                    if pk - rep > 0.5 {
                        over[j] += 1;
                    }
                    if pk - rep > worst.0 {
                        worst = (pk - rep, format!("{fs} {m:?} bildirilen {rep:.2} gerçek {pk:.2} @ {at:.0} Hz {bands:?}"));
                    }
                }
            }
        }
        println!(
            "{label}: {n} ayar × 2 tasarım; >0,5 dB eksik: 96k {} / 192k {} (her biri {} içinde); en kötü {:.2} dB: {}",
            over[0],
            over[1],
            2 * n,
            worst.0,
            worst.1
        );
    }
}

/// ARY-04 / ARY-05: dosya gidiş-dönüşü ve Channel: bölümleri.
#[test]
fn dog1_ary04_ary05_dosya() {
    let mut s = ParametricSettings::default();
    s.bands[2].gain_db = 3.0;
    s.enabled = false;
    let text = s.to_apo();
    println!(
        "ana anahtar kapalı dışa aktarım -> geri okuma: {:?}",
        HeadphoneProfile::parse(&text, "").map(|p| p.filters.len())
    );
    let mut s2 = ParametricSettings::default();
    s2.bands[2].gain_db = 3.0;
    s2.bands[3].gain_db = -2.0;
    s2.bands[3].enabled = false;
    let back = ParametricSettings::from_profile(&HeadphoneProfile::parse(&s2.to_apo(), "").unwrap());
    println!(
        "bir bant kapalı: önce {} bant ({:?}), sonra {} bant ({:?})",
        s2.bands.len(),
        s2.design,
        back.bands.len(),
        back.design
    );
    let peace = "Preamp: -5 dB\nChannel: L\nFilter 1: ON PK Fc 3000 Hz Gain 4 dB Q 2\nChannel: R\nFilter 2: ON PK Fc 6000 Hz Gain 5 dB Q 2\nChannel: all\n";
    let p = HeadphoneProfile::parse(peace, "").unwrap();
    let r = p.response_db(&[3000.0, 6000.0], 48_000.0);
    println!(
        "Channel: L/R dosyası: {} filtre iki kanala birden; ön kazanç {:.2}; 3 kHz {:+.2}, 6 kHz {:+.2} dB (ön kazanç dahil) — APO'da yalnız L: 3k +4, yalnız R: 6k +5",
        p.filters.len(),
        p.preamp_db,
        r[0],
        r[1]
    );
}
