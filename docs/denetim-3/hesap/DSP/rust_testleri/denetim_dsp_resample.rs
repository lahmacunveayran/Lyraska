//! DSP denetimi (Denetim 2): yeniden örnekleyicinin geçirme bandı ve örtüşme bastırması. Depoya girmez.
use super::*;
use std::f64::consts::PI;

fn level_db(rate_in: u32, rate_out: u32, hz: f64) -> (f64, f64) {
    let mut c = Converter::new(rate_in, 1, rate_out, 1).unwrap();
    let n = rate_in as usize * 2;
    let x: Vec<Sample> = (0..n)
        .map(|i| 0.5 * (2.0 * PI * hz * i as f64 / f64::from(rate_in)).sin())
        .collect();
    let mut out = Vec::new();
    for piece in x.chunks(4096) {
        out.extend_from_slice(c.process(piece).unwrap());
    }
    out.extend_from_slice(c.finish().unwrap());
    let tail = &out[out.len() / 4..out.len() * 3 / 4];
    let rms = (tail.iter().map(|v| v * v).sum::<f64>() / tail.len() as f64).sqrt();
    let peak = tail.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    (20.0 * (rms * 2f64.sqrt() / 0.5).log10(), 20.0 * (peak / 0.5).log10())
}

#[test]
fn denetim_dsp_yeniden_ornekleme_yaniti() {
    for (a, b) in [(44_100u32, 48_000u32), (48_000, 44_100), (44_100, 96_000), (96_000, 48_000), (192_000, 44_100)] {
        let mut line = format!("{a}→{b}:");
        for hz in [1000.0, 10_000.0, 16_000.0, 18_000.0, 19_000.0, 20_000.0, 21_000.0] {
            if hz < 0.5 * f64::from(a.min(b)) {
                line += &format!(" {:.0}k {:+.3}", hz / 1000.0, level_db(a, b, hz).0);
            }
        }
        // Örtüşme: çıkış Nyquist'inin üstündeki giriş (yalnız aşağı örneklemede).
        if b < a {
            for hz in [0.5 * f64::from(b) + 500.0, 0.5 * f64::from(b) + 2000.0, 0.5 * f64::from(b) + 4000.0] {
                if hz < 0.5 * f64::from(a) {
                    line += &format!(" | örtüşme {hz:.0} Hz {:+.1} dB", level_db(a, b, hz).0);
                }
            }
        }
        println!("{line}");
    }
}
