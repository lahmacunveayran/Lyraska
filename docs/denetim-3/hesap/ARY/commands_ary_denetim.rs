
// ---- ARY denetim kanıt testleri (src-tauri/src/commands.rs sonuna eklenir) ----
#[cfg(test)]
mod ary_denetim {
    use super::*;
    use crate::audio::peq::{FilterKind, ParametricBand};
    use std::time::{Duration, Instant};

    fn twenty_bands(gain: f64) -> ParametricSettings {
        ParametricSettings {
            enabled: true,
            bands: (0..20)
                .map(|i| ParametricBand {
                    kind: FilterKind::Peaking,
                    freq_hz: 30.0 * 1.4f64.powi(i),
                    gain_db: gain + i as f64 * 0.1,
                    q: 1.4,
                    enabled: true,
                })
                .collect(),
            design: crate::audio::peq::DesignMethod::Matched,
        }
    }

    /// `apply_parametric` oynatıcı kilidini ayar dosyası diske işlenirken (fsync) ve eğriler
    /// hesaplanırken de tutar; `equalizer_set` ve `crossfeed_set` kilidi kaydetmeden önce bırakır.
    /// Bu sırada her ekran karesinde çağrılan `visual_frame` kilidi bekler.
    #[test]
    fn ary_parametrik_kayit_oynatici_kilidini_tutar() {
        let player = Arc::new(PlayerState::default());
        let path = crate::audio::test_util::temp_path("ary-lock-settings.json");
        let store = Arc::new(SettingsStore::open(&path));
        let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));

        // Sürükleme: art arda parametric_set (arayüz aynı anda tek istek gönderir).
        let (p, s, st) = (Arc::clone(&player), Arc::clone(&store), Arc::clone(&stop));
        let dragger = std::thread::spawn(move || {
            let mut n = 0;
            let mut held = Duration::ZERO;
            while !st.load(std::sync::atomic::Ordering::Relaxed) && n < 40 {
                let t = Instant::now();
                apply_parametric(twenty_bands(f64::from(n % 12)), &p, &s).unwrap();
                held = held.max(t.elapsed());
                n += 1;
            }
            (n, held)
        });
        // visual_frame benzeri: her 4 ms'de bir kilidi alıp bırakır, bekleme süresini ölçer.
        let mut worst = Duration::ZERO;
        let mut waits = Vec::new();
        let begin = Instant::now();
        while !dragger.is_finished() && begin.elapsed() < Duration::from_secs(60) {
            let t = Instant::now();
            drop(player.lock().unwrap());
            let w = t.elapsed();
            worst = worst.max(w);
            waits.push(w);
            std::thread::sleep(Duration::from_millis(4));
        }
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let (n, held) = dragger.join().unwrap();
        waits.sort();
        let p95 = waits[waits.len() * 95 / 100];

        // Aynı iş, kilit dışında kaydetme ile (equalizer_set/crossfeed_set düzeni):
        let t = Instant::now();
        let state = ParametricState::new(twenty_bands(3.0), false);
        let curves = t.elapsed();
        let t = Instant::now();
        store.update(|s| s.parametric = state.settings.clone()).unwrap();
        let save = t.elapsed();
        println!(
            "{n} parametric_set; kilidin tutulduğu en uzun süre {held:?}; visual_frame'in kilit \
             beklemesi en kötü {worst:?}, p95 {p95:?}; (eğri hesabı {curves:?}, kaydetme {save:?}; \
             hata ayıklama derlemesi, /tmp)"
        );
        assert!(
            worst < Duration::from_millis(4),
            "visual_frame bir ekran karesinin dörtte birinden uzun bekledi: {worst:?}"
        );
    }
}
