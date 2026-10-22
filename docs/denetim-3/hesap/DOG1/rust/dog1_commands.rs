//! DOĞRULAMA-1: ARY-02 bağımsız kanıt. Aynı iş iki kilit düzeniyle: `apply_parametric` (kilit
//! kaydetme boyunca tutulur) ve `equalizer_set` düzeni (kilit kaydetmeden önce bırakılır). Bir
//! "görsel kare" iş parçacığı her 2 ms'de kilidi ister; bekleme süreleri karşılaştırılır.
use super::*;
use crate::audio::peq::{DesignMethod, FilterKind, ParametricBand};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

fn bands(n: usize, gain: f64) -> ParametricSettings {
    ParametricSettings {
        enabled: true,
        bands: (0..n)
            .map(|i| ParametricBand {
                kind: FilterKind::Peaking,
                freq_hz: 40.0 * 1.45f64.powi(i as i32),
                gain_db: gain,
                q: 1.2,
                enabled: true,
            })
            .collect(),
        design: DesignMethod::Matched,
    }
}

fn run(fixed: bool) -> (Duration, Duration, usize) {
    let player = Arc::new(PlayerState::default());
    let path = crate::audio::test_util::temp_path(if fixed { "dog1-fixed.json" } else { "dog1-orig.json" });
    let store = Arc::new(SettingsStore::open(&path));
    let done = Arc::new(AtomicBool::new(false));
    let (p, s, d) = (Arc::clone(&player), Arc::clone(&store), Arc::clone(&done));
    let worker = std::thread::spawn(move || {
        for n in 0..30 {
            let settings = bands(5, f64::from(n % 7));
            if fixed {
                let (applied, comparing) = {
                    let mut g = p.lock().unwrap();
                    let a = g.set_parametric(settings);
                    (a, g.parametric_comparing())
                };
                s.update(|x| x.parametric = applied.clone()).unwrap();
                let _ = ParametricState::new(applied, comparing);
            } else {
                apply_parametric(settings, &p, &s).unwrap();
            }
            // Arayüzdeki IPC gidiş-dönüşü ve bir sonraki pointermove arası.
            std::thread::sleep(Duration::from_millis(3));
        }
        d.store(true, Ordering::Relaxed);
    });
    let mut waits = Vec::new();
    while !done.load(Ordering::Relaxed) {
        let t = Instant::now();
        drop(player.lock().unwrap());
        waits.push(t.elapsed());
        std::thread::sleep(Duration::from_millis(2));
    }
    worker.join().unwrap();
    waits.sort();
    (waits[waits.len() - 1], waits[waits.len() * 95 / 100], waits.len())
}

#[test]
fn dog1_ary02_kilit_kapsami() {
    for round in 0..2 {
        let (worst_o, p95_o, n_o) = run(false);
        let (worst_f, p95_f, n_f) = run(true);
        println!(
            "tur {round}: apply_parametric (kilit kaydetmede tutulur): görsel kare beklemesi en kötü {worst_o:?}, p95 {p95_o:?} ({n_o} örnek) | equalizer_set düzeni: en kötü {worst_f:?}, p95 {p95_f:?} ({n_f} örnek)"
        );
    }
}
