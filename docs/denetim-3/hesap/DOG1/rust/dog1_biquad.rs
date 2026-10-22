//! DOĞRULAMA-1: DSP-07 bağımsız kanıt (eşlenmiş tasarım rezonanslı rafta RBJ'den kötü mü). Depoya girmez.
use super::*;

/// Ağırlıksız en büyük mutlak sapma (dB), 20 Hz – min(20 kHz, 0,499 fs), 20 000 nokta; analog
/// eğrinin −30 dB altında kalan noktalar sayılmaz (projenin ölçüsündeki taban).
fn max_abs_dev(spec: &Spec, f: &Biquad, fs: f64) -> (f64, f64) {
    let hi = 20_000.0f64.min(0.499 * fs);
    let mut worst = (0.0f64, 0.0);
    for i in 0..20_000 {
        let hz = 20.0 * (hi / 20.0f64).powf(f64::from(i) / 19_999.0);
        let r = spec.analog_db(hz);
        if r <= FLOOR_DB {
            continue;
        }
        let d = (f.response_db(2.0 * PI * hz / fs) - r).abs();
        if d > worst.0 {
            worst = (d, hz);
        }
    }
    worst
}

#[test]
fn dog1_dsp07_eslenmis_rezonansli_raf() {
    let cases = [
        (Kind::HighShelf, 8_700.0, 12.0, 8.0, 48_000.0),
        (Kind::LowShelf, 6_300.0, 18.0, 8.0, 48_000.0),
        (Kind::HighShelf, 8_700.0, 12.0, 4.0, 48_000.0),
        (Kind::HighShelf, 8_700.0, 12.0, 2.0, 48_000.0),
        (Kind::HighShelf, 8_700.0, 12.0, 0.707, 48_000.0),
        (Kind::HighShelf, 4_000.0, 12.0, 8.0, 44_100.0),
        (Kind::LowShelf, 200.0, 12.0, 8.0, 44_100.0),
        (Kind::Peaking, 12_000.0, 12.0, 8.0, 44_100.0),
    ];
    for (kind, freq_hz, gain_db, q, fs) in cases {
        let spec = Spec { kind, freq_hz, gain_db, q };
        let (m, mhz) = max_abs_dev(&spec, &Biquad::matched(&spec, fs), fs);
        let (r, rhz) = max_abs_dev(&spec, &Biquad::rbj(&spec, fs), fs);
        println!(
            "{kind:?} {freq_hz} Hz {gain_db:+} dB Q {q} @ {fs}: eşlenmiş en büyük sapma {m:.2} dB @ {mhz:.0} Hz, RBJ {r:.2} dB @ {rhz:.0} Hz → eşlenmiş − RBJ = {:+.2} dB",
            m - r
        );
    }
}
