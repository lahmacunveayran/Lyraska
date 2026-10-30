//! Kullanım: lyraska-cubuk <ses.st.f32 (44,1 kHz, iki kanal, f32le)> <başlangıç s> <bitiş s> <çıktı.json>
//! Uygulamanın yolu (visuals.rs `spectrum_at`): şarkının LUFS'i gerçek `LoudnessMeter` ile, kazanç
//! `gain_db(−14)`; tap f32 (Decimator çıkışı), her 1/60 sn'de pencere ekranda görüneceği anın üstüne
//! ortalanır (`read_window`: son örnek ⌊T·sr + WINDOW/2⌋), `mono_mix` = (L+R)/2 · kazanç, `bar_levels`.
#![allow(dead_code)]
mod audio {
    pub type Sample = f64;
    pub mod waveform {
        pub const WAVEFORM_RATE: u32 = 44_100;
    }
    #[path = "/home/user/Lyraska/src-tauri/src/audio/spectrum.rs"]
    pub mod spectrum;
    #[path = "/home/user/Lyraska/src-tauri/src/audio/loudness.rs"]
    pub mod loudness;
}
use audio::{loudness, spectrum};
use std::io::Write;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&a[1]).unwrap();
    let s: Vec<f32> = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    let (t0, t1): (f64, f64) = (a[2].parse().unwrap(), a[3].parse().unwrap());
    let frames = s.len() / 2;
    let mut meter = loudness::LoudnessMeter::new(44_100, 2);
    for f in 0..frames {
        meter.add(&[f64::from(s[2 * f]), f64::from(s[2 * f + 1])]);
    }
    let l = meter.finish().unwrap();
    let gain_db = l.gain_db(-14.0);
    let gain = 10f64.powf(gain_db / 20.0);
    eprintln!("LUFS {:.3}, gerçek tepe {:.2} dBTP, kazanç {:+.3} dB", l.integrated_lufs, l.true_peak_dbtp, gain_db);
    let n = spectrum::WINDOW as i64;
    let mut out = std::fs::File::create(&a[4]).unwrap();
    write!(out, "{{\"lufs\":{},\"gain_db\":{},\"fps\":60,\"t0\":{},\"levels\":[", l.integrated_lufs, gain_db, t0).unwrap();
    let mut i = 0;
    loop {
        let t = t0 + i as f64 / 60.0;
        if t > t1 { break; }
        let last = (t * 44_100.0 + (n / 2) as f64).floor() as i64;
        let first = last - (n - 1);
        let mono: Vec<f64> = (first..=last)
            .map(|k| if k >= 0 && (k as usize) < frames {
                let k = k as usize;
                (f64::from(s[2 * k]) + f64::from(s[2 * k + 1])) * 0.5 * gain
            } else { 0.0 })
            .collect();
        let lv = spectrum::bar_levels(&mono);
        if i > 0 { write!(out, ",").unwrap(); }
        write!(out, "[{}]", lv.iter().map(|v| format!("{v}")).collect::<Vec<_>>().join(",")).unwrap();
        i += 1;
    }
    write!(out, "]}}").unwrap();
    eprintln!("{i} kare");
}
