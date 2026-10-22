//! DSP denetimi (Denetim 2): katsayı dökümü ve kanıt testleri. Depoya girmez.
use super::*;
use std::io::Write;

const OUT: &str = "docs/denetim-3/hesap/DSP";

fn kind_name(k: Kind) -> &'static str {
    match k {
        Kind::Peaking => "PK",
        Kind::LowShelf => "LS",
        Kind::HighShelf => "HS",
        Kind::LowPass => "LP",
        Kind::HighPass => "HP",
        Kind::BandPass => "BP",
        Kind::Notch => "NO",
        Kind::AllPass => "AP",
    }
}

const ALL: [Kind; 8] = [
    Kind::Peaking,
    Kind::LowShelf,
    Kind::HighShelf,
    Kind::LowPass,
    Kind::HighPass,
    Kind::BandPass,
    Kind::Notch,
    Kind::AllPass,
];

/// Bütün türler × frekans × Q × kazanç × hız için RBJ ve eşlenmiş katsayıları CSV'ye döker.
/// `cargo test --lib denetim_dsp_katsayi_dokumu -- --ignored --nocapture`
#[test]
#[ignore]
fn denetim_dsp_katsayi_dokumu() {
    let path = format!("{OUT}/rust_katsayilar.csv");
    let mut f = std::io::BufWriter::new(std::fs::File::create(&path).unwrap());
    writeln!(f, "rate,kind,freq,gain,q,method,b0,b1,b2,a1,a2").unwrap();
    let rates = [8000.0, 22050.0, 44100.0, 48000.0, 88200.0, 96000.0, 176400.0, 192000.0];
    let qs = [0.05, 0.1, 0.3, 0.707, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0];
    let gains = [-30.0, -24.0, -18.0, -12.0, -6.0, -1.0, 1.0, 6.0, 12.0, 18.0, 24.0, 30.0];
    let mut n = 0usize;
    for &rate in &rates {
        // 10 Hz'ten 0,5·fs'e: 24 logaritmik nokta + Nyquist çevresi.
        let mut freqs: Vec<f64> = (0..24)
            .map(|i| 10.0 * (0.5 * rate / 10.0f64).powf(f64::from(i) / 23.0))
            .collect();
        for r in [0.40, 0.45, 0.48, 0.489, 0.4905, 0.495] {
            freqs.push(r * rate);
        }
        freqs.retain(|&x| x <= 24_000.0 || x < 0.5 * rate);
        for kind in ALL {
            for &freq_hz in &freqs {
                for &q in &qs {
                    let gl: &[f64] = if kind.has_gain() { &gains } else { &[0.0] };
                    for &gain_db in gl {
                        let spec = Spec { kind, freq_hz, gain_db, q };
                        for (m, c) in [
                            ("rbj", Biquad::rbj(&spec, rate)),
                            ("matched", Biquad::matched(&spec, rate)),
                        ] {
                            writeln!(
                                f,
                                "{rate},{},{freq_hz:.6},{gain_db},{q},{m},{:.17e},{:.17e},{:.17e},{:.17e},{:.17e}",
                                kind_name(kind),
                                c.b0, c.b1, c.b2, c.a1, c.a2
                            )
                            .unwrap();
                            n += 1;
                        }
                    }
                }
            }
        }
    }
    println!("{n} satır -> {path}");
}

/// Kanıt (DSP): belge "RBJ de aday: sonuç hiçbir ayarda RBJ'den uzak olamaz" der; seçim ızgarada
/// yapılır, sık taramada eşlenmiş tasarımın RBJ'den kötü olduğu ayarlar var mı?
#[test]
fn denetim_dsp_eslenmis_hicbir_ayarda_rbj_den_kotu_degil() {
    let mut worst = (0.0f64, String::new());
    for rate in [44_100.0, 48_000.0, 96_000.0] {
        for kind in ALL {
            for i in 0..31 {
                let freq_hz = 20.0 * 1000f64.powf(f64::from(i) / 30.0);
                if freq_hz > 0.45 * rate {
                    continue;
                }
                for q in [0.3, 0.5, 0.707, 1.0, 2.0, 4.0, 8.0] {
                    let gl: &[f64] = if kind.has_gain() {
                        &[-18.0, -12.0, -6.0, -1.0, 1.0, 6.0, 12.0, 18.0]
                    } else {
                        &[0.0]
                    };
                    for &gain_db in gl {
                        let spec = Spec { kind, freq_hz, gain_db, q };
                        let m = tests_dense(&spec, &Biquad::matched(&spec, rate), rate);
                        let r = tests_dense(&spec, &Biquad::rbj(&spec, rate), rate);
                        if m - r > worst.0 {
                            worst = (m - r, format!("{spec:?} @ {rate}: eşlenmiş {m:.2} dB, RBJ {r:.2} dB"));
                        }
                    }
                }
            }
        }
    }
    println!("en kötü fark: {:.3} dB — {}", worst.0, worst.1);
    assert!(worst.0 <= 0.05, "eşlenmiş RBJ'den {:.2} dB kötü: {}", worst.0, worst.1);
}

/// `tests::dense_error` ile aynı ölçü (20 Hz – 20 kHz, 1000 nokta, aynı ağırlık).
fn tests_dense(spec: &Spec, filter: &Biquad, rate: f64) -> f64 {
    let high = (rate / 2.0 * 0.999).min(20_000.0);
    (0..1000)
        .map(|i| 20.0 * (high / 20.0).powf(f64::from(i) / 999.0))
        .filter(|&hz| spec.analog_db(hz) > FLOOR_DB)
        .map(|hz| {
            let reference = spec.analog_db(hz);
            (filter.response_db(2.0 * PI * hz / rate) - reference).abs() * error_weight(reference)
        })
        .fold(0.0, f64::max)
}

/// Kanıt (DSP): ROADMAP/MIMARI'deki ortalama sapma tablosu yeniden üretilir (yalnızca yazdırır).
#[test]
fn denetim_dsp_dogruluk_tablosu_yazdir() {
    let rate = 44_100.0;
    for kind in ALL {
        let (mut sr, mut sm, mut n) = (0.0, 0.0, 0.0);
        for i in 0..31 {
            let freq_hz = 20.0 * 1000f64.powf(f64::from(i) / 30.0);
            if freq_hz > 0.45 * rate {
                continue;
            }
            for q in [0.3, 0.5, 0.707, 1.0, 2.0, 4.0, 8.0] {
                let gl: &[f64] = if kind.has_gain() {
                    &[-18.0, -12.0, -6.0, -1.0, 1.0, 6.0, 12.0, 18.0]
                } else {
                    &[0.0]
                };
                for &gain_db in gl {
                    let spec = Spec { kind, freq_hz, gain_db, q };
                    sr += tests_dense(&spec, &Biquad::rbj(&spec, rate), rate);
                    sm += tests_dense(&spec, &Biquad::matched(&spec, rate), rate);
                    n += 1.0;
                }
            }
        }
        println!("{kind:?}: RBJ ort {:.3}  eşlenmiş ort {:.3}", sr / n, sm / n);
    }
}

/// Kanıt (DSP): Nyquist'e yakın (f ≥ 0,49·fs) raf ve tepe süzgeçleri sessizce birim süzgeç olur;
/// analog eğri ise duyulur bantta belirgin kazanç verir.
#[test]
fn denetim_dsp_nyquist_yakininda_raf_sessizce_kaybolur() {
    let rate = 48_000.0;
    let spec = Spec { kind: Kind::LowShelf, freq_hz: 24_000.0, gain_db: 6.0, q: 0.707 };
    let c = Biquad::matched(&spec, rate);
    let at1k = c.response_db(2.0 * PI * 1000.0 / rate);
    println!("LS 24 kHz +6 dB @48k: sayısal 1 kHz {at1k:.2} dB, analog {:.2} dB", spec.analog_db(1000.0));
    let spec2 = Spec { kind: Kind::HighShelf, freq_hz: 22_000.0, gain_db: 12.0, q: 0.707 };
    let c2 = Biquad::matched(&spec2, 44_100.0);
    let at = |hz: f64| c2.response_db(2.0 * PI * hz / 44_100.0);
    println!(
        "HS 22 kHz +12 dB @44.1k: sayısal 16k {:.2} / 20k {:.2} dB; analog 16k {:.2} / 20k {:.2} dB",
        at(16_000.0), at(20_000.0), spec2.analog_db(16_000.0), spec2.analog_db(20_000.0)
    );
    assert!((at1k - spec.analog_db(1000.0)).abs() < 1.0, "raf kayboldu: {at1k:.2} dB");
}
