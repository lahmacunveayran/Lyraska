//! DSP denetimi (Denetim 2): crossfeed sayısal iddiaları. Depoya girmez.
use super::*;

#[test]
fn denetim_dsp_crossfeed_sayilari() {
    for rate in [44_100.0, 48_000.0, 96_000.0] {
        for (name, cutoff, level) in PRESETS
            .into_iter()
            .chain([("uç", MIN_CUTOFF_HZ, MIN_LEVEL_DB)])
        {
            let s = CrossfeedSettings { enabled: true, cutoff_hz: cutoff, level_db: level };
            let g = SideFilter::design(&s, rate);
            let (dc, _) = g.response(0.0);
            let l1 = 2.0 * g.b0 - dc;
            println!(
                "{rate} {name}: b0 {:.4} b1 {:.4} a1 {:.4}; ‖g‖₁ = {l1:.4} ({:+.2} dB)",
                g.b0, g.b1, g.a1, 20.0 * l1.log10()
            );
        }
    }
    // Tam ölçekli geniş gürültü: ilintisiz L/R, düzgün dağılımlı ±1, 10 sn, 48 kHz.
    let mut seed = 99u64;
    let mut rnd = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((seed >> 11) as f64 / (1u64 << 53) as f64) * 2.0 - 1.0
    };
    for (name, cutoff, level) in PRESETS {
        let control = Arc::new(CrossfeedControl::default());
        control.set(CrossfeedSettings { enabled: true, cutoff_hz: cutoff, level_db: level });
        let mut p = CrossfeedProcessor::new(control, 2, 48_000);
        let mut peak = 0.0f64;
        for _ in 0..480_000 {
            let mut frame = [rnd(), rnd()];
            p.process_frame(&mut frame);
            peak = peak.max(frame[0].abs()).max(frame[1].abs());
        }
        println!("{name}: tam ölçekli ilintisiz gürültüde örnek tepesi {:+.2} dBFS", 20.0 * peak.log10());
    }
    // Ekrandaki (96 kHz) eğri ile 44,1 kHz'te duyulan arasındaki fark.
    let s = CrossfeedSettings { enabled: true, cutoff_hz: 700.0, level_db: 6.0 };
    let state = CrossfeedState::new(s);
    let g = SideFilter::design(&s, 44_100.0);
    let mut worst = (0.0f64, 0.0f64);
    for (i, &hz) in state.curve_hz.iter().enumerate() {
        let (re, im) = g.response(2.0 * PI * hz / 44_100.0);
        let far = 10.0 * (((1.0 - re) / 2.0).powi(2) + (im / 2.0).powi(2)).log10();
        let near = 10.0 * (((1.0 + re) / 2.0).powi(2) + (im / 2.0).powi(2)).log10();
        let d = (far - state.far_db[i]).abs().max((near - state.near_db[i]).abs());
        if hz < 5000.0 && d > worst.0 {
            worst = (d, hz);
        }
    }
    println!("Orta: 5 kHz altında ekran (96 kHz) – 44,1 kHz farkı en çok {:.3} dB @ {:.0} Hz", worst.0, worst.1);
}
