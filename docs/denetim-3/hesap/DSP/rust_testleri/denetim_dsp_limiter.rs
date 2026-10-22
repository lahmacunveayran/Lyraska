//! DSP denetimi (Denetim 2): gerçek tepe sınırlayıcının yüksek frekansta tepe kaçırması. Depoya girmez.
use super::*;

/// Tam ölçekli (0 dBTP) yüksek frekanslı sinüs: kararlı durumda çıkış kazancı g ise çıkışın gerçek
/// tepesi tam olarak g'dir (sinüsün genliği × kazanç). Tavan −1 dBTP.
#[test]
fn denetim_dsp_yuksek_frekansta_gercek_tepe_tavani_asmaz() {
    let mut worst = (f64::NEG_INFINITY, 0u32, 0.0, 0.0);
    for rate in [44_100u32, 48_000, 88_200, 96_000, 176_400, 192_000] {
        for hz in [1000.0, 5000.0, 10_000.0, 12_000.0, 15_000.0, 17_000.0, 18_000.0, 19_000.0, 20_000.0] {
            if hz >= 0.47 * f64::from(rate) {
                continue;
            }
            let mut rate_worst = f64::NEG_INFINITY;
            for k in 0..8 {
                let phase = f64::from(k) * PI / 8.0;
                let mut limiter = Limiter::new(1, rate);
                let w = 2.0 * PI * hz / f64::from(rate);
                let n = rate as usize / 2;
                let mut max_gain_after: f64 = 0.0;
                for i in 0..n {
                    let mut frame = [(w * i as f64 + phase).sin()];
                    limiter.process_frame(&mut frame);
                    if i > n / 2 {
                        max_gain_after = max_gain_after.max(limiter.gain());
                    }
                }
                let out_dbtp = 20.0 * max_gain_after.log10();
                rate_worst = rate_worst.max(out_dbtp);
                if out_dbtp > worst.0 {
                    worst = (out_dbtp, rate, hz, phase);
                }
            }
            println!("{rate} Hz, {hz} Hz sinüs (0 dBTP): çıkış gerçek tepesi en çok {rate_worst:+.3} dBTP");
        }
    }
    println!("en kötü: {:+.3} dBTP ({} Hz hız, {} Hz, faz {:.3})", worst.0, worst.1, worst.2, worst.3);
    assert!(worst.0 <= CEILING_DBTP + 0.1, "çıkış {:+.2} dBTP > −1 dBTP", worst.0);
}

/// dsp08 betiğinin ürettiği sinyalleri sınırlayıcıdan geçirir (çıkışın gerçek tepesini betik ölçer).
#[test]
#[ignore]
fn denetim_dsp_sinirlayici_dosya() {
    let dir = "docs/denetim-3/hesap/DSP";
    for name in ["beyaz", "pembe", "zil"] {
        let bytes = std::fs::read(format!("{dir}/sinir_giris_{name}.f64")).unwrap();
        let mut x: Vec<f64> = bytes
            .chunks_exact(8)
            .map(|c| f64::from_le_bytes(c.try_into().unwrap()))
            .collect();
        let mut limiter = Limiter::new(1, 44_100);
        for v in x.iter_mut() {
            let mut frame = [*v];
            limiter.process_frame(&mut frame);
            *v = frame[0];
        }
        let out: Vec<u8> = x.iter().flat_map(|v| v.to_le_bytes()).collect();
        std::fs::write(format!("{dir}/sinir_cikis_{name}.f64"), out).unwrap();
        println!("{name}: işlendi");
    }
}

/// Ara değerleyici fazlarının genlik yanıtı (yazdırır): 20 kHz'te (44,1 kHz) ne kadar zayıflatıyor.
#[test]
fn denetim_dsp_ara_degerleyici_yaniti() {
    for rate in [44_100.0, 48_000.0, 96_000.0, 192_000.0] {
        let (phases, factor, _) = interpolator(rate);
        for hz in [10_000.0, 15_000.0, 18_000.0, 20_000.0] {
            let w = 2.0 * PI * hz / rate;
            let mut line = format!("{rate} Hz, {hz} Hz:");
            for phase in phases.iter().take(factor) {
                let (mut re, mut im) = (0.0, 0.0);
                for (t, &c) in phase.iter().enumerate() {
                    re += c * (w * t as f64).cos();
                    im -= c * (w * t as f64).sin();
                }
                line += &format!(" {:+.2}", 10.0 * (re * re + im * im).log10());
            }
            println!("{line} dB");
        }
    }
}
