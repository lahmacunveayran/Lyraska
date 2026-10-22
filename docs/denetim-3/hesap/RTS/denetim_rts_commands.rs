//! Bağımsız denetim (RTS) kanıt testi: `parametric_set` oynatıcı kilidini ayar dosyasını
//! diske yazıp `sync_all` ile beklerken de tutar. Çıktıyı görmek için `--nocapture`.

use super::*;
use crate::audio::peq::{DesignMethod, FilterKind, ParametricBand, ParametricSettings};
use std::time::{Duration, Instant};

#[test]
fn rts_parametrik_ayar_kilit_altinda_diske_yazar() {
    let dir = crate::audio::test_util::temp_path("rts-ayar");
    let store = SettingsStore::open(&dir.join("settings.json"));
    let player = PlayerState::default();
    let bands: Vec<ParametricBand> = (0..20)
        .map(|i| ParametricBand {
            kind: if i % 3 == 0 {
                FilterKind::LowShelf
            } else {
                FilterKind::Peaking
            },
            freq_hz: 30.0 * 1.4f64.powi(i),
            gain_db: 3.0 + f64::from(i % 4),
            q: 1.2,
            enabled: true,
        })
        .collect();
    let settings = |gain: f64| {
        let mut bands = bands.clone();
        bands[5].gain_db = gain;
        ParametricSettings {
            enabled: true,
            bands,
            design: DesignMethod::Matched,
        }
    };
    let runs = 20;
    let (mut total, mut worst) = (Duration::ZERO, Duration::ZERO);
    for i in 0..runs {
        let start = Instant::now();
        apply_parametric(settings(f64::from(i) * 0.5), &player, &store).unwrap();
        let held = start.elapsed();
        total += held;
        worst = worst.max(held);
    }
    // Parçalar: yalnızca ses kanalına yazma, yalnızca diske yazma, yalnızca eğri hesabı.
    let start = Instant::now();
    player.lock().unwrap().set_parametric(settings(1.0));
    let set_only = start.elapsed();
    let start = Instant::now();
    store.update(|s| s.parametric = settings(1.5)).unwrap();
    let disk_only = start.elapsed();
    let start = Instant::now();
    let _ = ParametricState::new(settings(2.0), false);
    let curves_only = start.elapsed();
    println!(
        "RTS parametric_set: kilit ortalama {:.2} ms, en kötü {:.2} ms; parçalar: ses kanalı \
         {:.3} ms, disk (sync_all) {:.3} ms, eğriler {:.3} ms",
        total.as_secs_f64() * 1e3 / f64::from(runs),
        worst.as_secs_f64() * 1e3,
        set_only.as_secs_f64() * 1e3,
        disk_only.as_secs_f64() * 1e3,
        curves_only.as_secs_f64() * 1e3,
    );
    // Kilit, ayarı ses kanalına yazmanın yanında disk (sync_all) ve eğri hesabı boyunca da
    // tutulur.
    assert!(total / runs > set_only + disk_only / 2);
}
