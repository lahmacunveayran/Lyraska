//! DOĞRULAMA-1: DSP-04 bağımsız kanıt (grafik ekolayzerin bildirdiği yükseltme). Depoya girmez.
use super::*;

/// Sürgüler: hazır ayarlar (src/lib/eq.ts, yalnız bant kazançları) ve birkaç elle ayar.
const CASES: [(&str, [f64; BANDS]); 15] = [
    ("Bas", [0.0, 4.0, 3.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
    ("Derin bas", [2.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
    ("Kulüp", [0.0, 2.0, 1.0, 0.0, -1.0, 0.0, 0.0, 1.0, 2.0, 2.0]),
    ("Küçük hoparlör", [0.0, 0.0, 3.0, 3.0, 1.5, 0.0, 0.0, 1.0, 1.5, 0.0]),
    ("Tiz", [0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 4.0, 5.5, 6.0]),
    ("Vokal", [-2.0, -2.0, -1.0, 0.5, 2.0, 3.5, 3.5, 2.0, 0.0, -1.0]),
    ("Akustik", [3.0, 3.0, 2.0, 1.0, 1.0, 1.0, 2.0, 2.5, 3.0, 2.0]),
    ("Elektronik", [3.0, 3.0, 2.0, 0.0, -1.5, 0.0, 1.0, 2.0, 4.0, 4.5]),
    ("Rock", [4.0, 4.5, 2.5, 0.0, -1.0, -1.0, 1.0, 2.5, 3.5, 4.0]),
    ("Gece", [4.5, 4.0, 2.0, 0.0, -0.5, 0.0, 0.0, 1.0, 2.5, 3.0]),
    ("Konuşma", [-6.0, -4.0, -1.5, 1.0, 3.0, 4.0, 3.0, 1.5, 0.0, -2.0]),
    ("elle V: bas +8, orta -6, tiz +8", [8.0, 8.0, 2.0, -6.0, -6.0, -6.0, -2.0, 4.0, 8.0, 8.0]),
    ("tek bant 1 kHz +12", [0.0, 0.0, 0.0, 0.0, 0.0, 12.0, 0.0, 0.0, 0.0, 0.0]),
    ("komşu zıt: 2k +12, 4k -12", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 12.0, -12.0, 0.0, 0.0]),
    ("zikzak ±12", [12.0, -12.0, 12.0, -12.0, 12.0, -12.0, 12.0, -12.0, 12.0, -12.0]),
];

#[test]
fn dog1_dsp04_grafik_ekolayzer_bildirilen_yukseltme() {
    for fs in [44_100u32, 48_000] {
        let rate = f64::from(fs);
        for (name, gains) in CASES {
            let d = Design::new(&gains, rate);
            // Bağımsız tarama: 5 Hz – min(20 kHz, 0,49 fs), 20 000 nokta.
            let hi = 20_000.0f64.min(0.49 * rate);
            let (mut pk, mut at) = (f64::NEG_INFINITY, 0.0);
            for i in 0..20_000 {
                let hz = 5.0 * (hi / 5.0f64).powf(f64::from(i) / 19_999.0);
                let v = d.response_db(hz, rate);
                if v > pk {
                    pk = v;
                    at = hz;
                }
            }
            // İşlemciyle doğrulama: o frekansta sinüs.
            let control = Arc::new(EqControl::new(EqSettings { enabled: true, gains_db: gains, ..EqSettings::default() }));
            let mut p = EqProcessor::new(Arc::clone(&control), 1, fs);
            let w = 2.0 * PI * at / rate;
            let n = fs as usize * 2;
            let (mut e, mut c) = (0.0, 0.0);
            for i in 0..n {
                if i % 256 == 0 {
                    p.begin_block();
                }
                p.advance_frame();
                let y = p.process(0, (w * i as f64).sin());
                if i >= n / 2 {
                    e += y * y;
                    c += 1.0;
                }
            }
            let measured = 10.0 * (2.0 * e / c).log10();
            println!(
                "{fs} {name:<34} bildirilen {:5.2} | tepe {pk:5.2} dB @ {at:7.0} Hz | işlemciden {measured:5.2} | eksik {:+.2}",
                p.boost_db(),
                measured - p.boost_db()
            );
        }
    }
}
