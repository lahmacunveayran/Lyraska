//! DSP denetimi (Denetim 2): grafik ekolayzerin bildirilen yükseltmesi gerçek tepeyi karşılıyor mu.
use super::*;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

fn settings() -> Vec<[f64; BANDS]> {
    let mut out = vec![
        [12.0; BANDS],
        [12.0, -12.0, 12.0, -12.0, 12.0, -12.0, 12.0, -12.0, 12.0, -12.0],
        [-12.0, 12.0, -12.0, 12.0, -12.0, 12.0, -12.0, 12.0, -12.0, 12.0],
        [12.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [12.0, 12.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 12.0],
        [6.0, 5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ];
    let mut rng = Rng(7);
    for _ in 0..300 {
        out.push(std::array::from_fn(|_| (rng.next() * 2.0 - 1.0) * MAX_GAIN_DB));
    }
    out
}

/// Bildirilen yükseltme (en yüksek sürgü) ile eğrinin gerçek en yükseği: duyulur bantta ve 20 Hz altında.
#[test]
fn denetim_dsp_ekolayzer_bildirilen_yukseltme_gercek_tepeyi_karsilar() {
    let mut worst_audible = (0.0f64, String::new());
    let mut worst_sub = (0.0f64, String::new());
    let (mut over_half, mut total) = (0usize, 0usize);
    for rate in [44_100.0, 48_000.0, 96_000.0, 192_000.0] {
        for gains in settings() {
            let design = Design::new(&gains, rate);
            let reported = -design.preamp_db;
            let scan = |lo: f64, hi: f64| {
                (0..3000)
                    .map(|i| lo * (hi / lo).powf(f64::from(i) / 2999.0))
                    .map(|hz| (design.response_db(hz, rate), hz))
                    .fold((f64::NEG_INFINITY, 0.0), |a, b| if b.0 > a.0 { b } else { a })
            };
            let (aud, aud_hz) = scan(20.0, 20_000.0f64.min(0.49 * rate));
            let (sub, sub_hz) = scan(2.0, 20.0);
            if aud - reported > 0.5 { over_half += 1; }
            total += 1;
            if aud - reported > worst_audible.0 {
                worst_audible = (aud - reported, format!("{rate}: {gains:?} tepe {aud:.2} dB @ {aud_hz:.0} Hz, bildirilen {reported:.2}"));
            }
            if sub - reported > worst_sub.0 {
                worst_sub = (sub - reported, format!("{rate}: {gains:?} tepe {sub:.2} dB @ {sub_hz:.1} Hz, bildirilen {reported:.2}"));
            }
        }
    }
    println!("duyulur bantta en kötü eksik: {:.2} dB — {}", worst_audible.0, worst_audible.1);
    println!("duyulur bantta 0,5 dB'den fazla eksik bildirilen: {over_half}/{total}");
    println!("20 Hz altında en kötü eksik: {:.2} dB — {}", worst_sub.0, worst_sub.1);

    // Ses yolunda: 31 Hz sürgüsü +12, 12 Hz'lik (ya da DC kaymalı) içerik.
    let mut gains = [0.0; BANDS];
    gains[0] = 12.0;
    let control = Arc::new(EqControl::new(EqSettings { enabled: true, gains_db: gains, ..EqSettings::default() }));
    let mut p = EqProcessor::new(Arc::clone(&control), 1, 48_000);
    let w = 2.0 * PI * 12.0 / 48_000.0;
    let (mut e, mut c) = (0.0, 0.0);
    for i in 0..96_000 {
        p.advance_frame();
        let y = p.process(0, (w * f64::from(i)).sin());
        if i >= 48_000 {
            e += y * y;
            c += 1.0;
        }
    }
    let measured = 10.0 * (2.0 * e / c).log10();
    println!("31 Hz +12: 12 Hz sinüs işlemciden {measured:+.2} dB geçti; bildirilen yükseltme {:.2} dB", p.boost_db());
    assert!(worst_audible.0 < 0.1 && measured <= p.boost_db() + 0.1, "bildirilen yükseltme gerçek tepeyi karşılamıyor");
}
