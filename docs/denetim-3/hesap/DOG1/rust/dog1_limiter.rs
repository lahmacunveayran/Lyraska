//! DOĞRULAMA-1: DSP-06 bağımsız kanıt. Python'un ürettiği sinyalleri gerçek `Limiter`'dan geçirir;
//! çıkışın gerçek tepesini Python (FFT ile 16× ara değer) ölçer. Depoya girmez.
use super::*;

const DIR: &str = "docs/denetim-3/hesap/DOG1";

#[test]
#[ignore]
fn dog1_dsp06_sinirlayici_dosyalar() {
    let list = std::fs::read_to_string(format!("{DIR}/sinir_liste.txt")).unwrap();
    for line in list.lines() {
        let mut parts = line.split_whitespace();
        let (Some(name), Some(rate)) = (parts.next(), parts.next()) else { continue };
        let rate: u32 = rate.parse().unwrap();
        let bytes = std::fs::read(format!("{DIR}/g_{name}.f64")).unwrap();
        let mut x: Vec<f64> = bytes.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect();
        let mut limiter = Limiter::new(1, rate);
        let mut min_gain: f64 = 1.0;
        for v in x.iter_mut() {
            let mut frame = [*v];
            limiter.process_frame(&mut frame);
            *v = frame[0];
            min_gain = min_gain.min(limiter.gain());
        }
        let out: Vec<u8> = x.iter().flat_map(|v| v.to_le_bytes()).collect();
        std::fs::write(format!("{DIR}/c_{name}.f64"), out).unwrap();
        println!("{name} @ {rate}: işlendi, gecikme {} kare, en küçük kazanç {:.3}", limiter.latency_frames(), min_gain);
    }
}
