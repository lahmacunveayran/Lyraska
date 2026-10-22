//! Bağımsız denetim (RTS) kanıt testleri: en ağır ayarlarla ses bloğunun süresi ve bellek
//! ayırma (20 + 20 eşlenmiş süzgeç, her blokta ayar değişimi). Çıktı için `--nocapture`.

use super::*;
use crate::audio::crossfeed::CrossfeedSettings;
use crate::audio::eq::{EqSettings, BANDS};
use crate::audio::peq::{DesignMethod, FilterKind, HeadphoneProfile, PeqFilter};
use rtrb::RingBuffer;
use std::time::Instant;

fn twenty(seed: f64) -> Vec<PeqFilter> {
    let kinds = [
        FilterKind::Peaking,
        FilterKind::LowShelf,
        FilterKind::HighShelf,
        FilterKind::Notch,
        FilterKind::Peaking,
    ];
    (0..20)
        .map(|i| PeqFilter {
            kind: kinds[i % kinds.len()],
            freq_hz: 25.0 * 1.4f64.powi(i as i32) * seed,
            gain_db: if i % 2 == 0 { 4.0 } else { -3.0 },
            q: [0.5, 1.0, 4.0, 12.0][i % 4],
        })
        .collect()
}

#[test]
fn rts_en_agir_ayarlarla_blok_suresi_ve_ayirma() {
    let rate = 48_000u32;
    let block = 480; // 10 ms
    let eq = Arc::new(EqControl::new(EqSettings {
        enabled: true,
        gains_db: [6.0, 4.0, 2.0, 0.0, -2.0, -4.0, 0.0, 3.0, 5.0, 6.0],
        bass_db: 9.0,
        bass_depth: 1.0,
        bass_punch: 1.0,
        small_speaker: false,
    }));
    let headphone = Arc::new(PeqControl::default());
    let profile = |seed: f64| HeadphoneProfile {
        name: "x".into(),
        preamp_db: -6.0,
        filters: twenty(seed),
        design: DesignMethod::Matched,
    };
    headphone.set(Some(&profile(1.0)), true);
    let parametric = Arc::new(PeqControl::default());
    parametric.set_filters(&twenty(1.1), 0.0, 6.0, DesignMethod::Matched, true);
    let crossfeed = Arc::new(CrossfeedControl::default());
    crossfeed.set(CrossfeedSettings {
        enabled: true,
        cutoff_hz: 700.0,
        level_db: 6.0,
    });
    let levels = Arc::new(TrackLevels::new());
    levels.set_loudness(
        0,
        Some(crate::audio::loudness::Loudness {
            integrated_lufs: -9.0,
            true_peak_dbtp: 0.5,
        }),
    );
    let controls = RenderControls {
        eq: Arc::clone(&eq),
        headphone: Arc::clone(&headphone),
        parametric: Arc::clone(&parametric),
        crossfeed: Arc::clone(&crossfeed),
        loudness: Arc::new(LoudnessControl::new(true)),
        levels,
        bit_perfect: false,
    };
    let mut renderer = Renderer::new(2, rate, controls);
    let blocks = 600;
    let (mut producer, mut consumer) = RingBuffer::new(block * 2 * (blocks + 1));
    for i in 0..block * (blocks + 1) {
        let x = 0.95 * (i as f64 * 0.031).sin();
        producer.push(x).unwrap();
        producer.push(-0.6 * x).unwrap();
    }
    let mut out = vec![0.0; block * 2];
    let mut times = Vec::with_capacity(blocks);
    let mut alloc_total = 0u64;
    for b in 0..blocks {
        // Sürükleme gibi: her 2 blokta bir parametrik, her 5 blokta bir kulaklık, ekolayzer ve
        // crossfeed değişir (ayar değişimi ses iş parçacığında yeniden tasarım yaptırır).
        if b % 2 == 0 {
            parametric.set_filters(
                &twenty(1.0 + b as f64 * 1e-3),
                0.0,
                6.0,
                DesignMethod::Matched,
                true,
            );
        }
        if b % 5 == 0 {
            headphone.set(Some(&profile(1.0 + b as f64 * 1e-3)), true);
            let mut gains = [0.0; BANDS];
            gains[b % BANDS] = 8.0;
            eq.set(EqSettings {
                enabled: true,
                gains_db: gains,
                bass_db: (b % 18) as f64,
                bass_depth: 1.0,
                bass_punch: 1.0,
                small_speaker: b % 10 == 0,
            });
            crossfeed.set(CrossfeedSettings {
                enabled: true,
                cutoff_hz: 300.0 + (b % 9) as f64 * 100.0,
                level_db: 1.0 + (b % 14) as f64,
            });
        }
        let start = Instant::now();
        let info = allocation_counter::measure(|| {
            renderer.render(&mut consumer, &mut out, false);
        });
        times.push(start.elapsed().as_secs_f64());
        alloc_total += info.count_total;
        assert!(out.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
    }
    times.sort_by(f64::total_cmp);
    let p50 = times[times.len() / 2];
    let p99 = times[times.len() * 99 / 100];
    let max = times[times.len() - 1];
    println!(
        "RTS blok (10 ms, 2 kanal, 48 kHz, 20+20 eşlenmiş süzgeç, ekolayzer, bas, vuruş, alt oktav, \
         crossfeed, eşitleme, sınırlayıcı; sürekli ayar değişimi): medyan {:.0} µs, %99 {:.0} µs, \
         en kötü {:.0} µs (periyodun %{:.1}'i); bellek ayırma {alloc_total}",
        p50 * 1e6,
        p99 * 1e6,
        max * 1e6,
        max / 0.010 * 100.0
    );
    assert_eq!(alloc_total, 0);
}

/// [RTS] Crossfeed yalnızca stereo akışta çalışır: 6 kanallı (5.1) şarkıda ayar açık kalır ama
/// ses bit bit aynı geçer (arayüzün "ses şekilleniyor" ışığı ise kanal sayısına bakmaz).
#[test]
fn rts_crossfeed_cok_kanalda_sessizce_atlanir() {
    let crossfeed = Arc::new(CrossfeedControl::default());
    crossfeed.set(CrossfeedSettings {
        enabled: true,
        cutoff_hz: 700.0,
        level_db: 6.0,
    });
    let controls = RenderControls {
        crossfeed,
        ..RenderControls::default()
    };
    let channels = 6;
    let frames = 4_800;
    let samples: Vec<Sample> = (0..frames * channels)
        .map(|i| {
            if i % channels == 0 {
                0.5 * ((i / channels) as f64 * 0.05).sin()
            } else {
                0.0
            }
        })
        .collect();
    let (mut producer, mut consumer) = RingBuffer::new(samples.len());
    for &s in &samples {
        producer.push(s).unwrap();
    }
    let mut renderer = Renderer::new(channels, 48_000, controls);
    let mut out = vec![0.0; samples.len()];
    renderer.render(&mut consumer, &mut out, false);
    // Sağ ön kanal (1) sessiz kalır: sol öndeki ses karşı kulağa hiç gitmez.
    let right_peak = out
        .chunks_exact(channels)
        .map(|f| f[1].abs())
        .fold(0.0, f64::max);
    println!("RTS 5.1: crossfeed açık, sağ ön kanalın tepesi {right_peak}");
    assert_eq!(right_peak, 0.0);
}
