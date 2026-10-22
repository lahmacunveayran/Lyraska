//! TST denetimi (Faz 3, Denetim 2) kanıt testleri. Ürün kodu değildir; çalışma ağacında
//! `src-tauri/src/audio/denetim_tst.rs` olarak durur ve `audio/mod.rs`'e
//! `#[cfg(test)] mod denetim_tst;` satırıyla bağlanır.
//!
//! Çalıştırma: `cd src-tauri && cargo test --lib audio::denetim_tst -- --nocapture --test-threads=1`
//!
//! Her test belgede yazan bir sayısal iddiayı kendi eşiğiyle ölçer. Kırmızı = iddia tutmuyor.

use std::f64::consts::PI;
use std::sync::Arc;

use rtrb::{Consumer, RingBuffer};

use super::biquad::{error_weight, Biquad, Kind, Spec};
use super::crossfeed::{CrossfeedControl, CrossfeedSettings};
use super::eq::{EqControl, EqSettings, BANDS};
use super::limiter::{Limiter, CEILING_DBTP};
use super::normalize::{LoudnessControl, TrackLevels};
use super::peq::{
    DesignMethod, FilterKind, HeadphoneProfile, ParametricBand, ParametricSettings,
    ParametricState, PeqControl, PeqFilter,
};
use super::render::{RenderControls, Renderer};
use super::test_util::{fit, sine};
use super::Sample;

/// `limiter.rs` testlerindeki referansın aynısı (8×, 64 katsayılı Hann pencereli sinc).
fn true_peak_8x(signal: &[Sample]) -> Sample {
    const OVERSAMPLE: usize = 8;
    const HALF: isize = 32;
    let mut peak: f64 = 0.0;
    for n in HALF as usize..signal.len() - HALF as usize {
        for p in 0..OVERSAMPLE {
            let frac = p as f64 / OVERSAMPLE as f64;
            let mut sum = 0.0;
            for k in -HALF..HALF {
                let index = (n as isize + k) as usize;
                let x = k as f64 - frac;
                let sinc = if x.abs() < 1e-12 {
                    1.0
                } else {
                    (PI * x).sin() / (PI * x)
                };
                let window = 0.5 + 0.5 * (PI * x / HALF as f64).cos();
                sum += signal[index] * sinc * window;
            }
            peak = peak.max(sum.abs());
        }
    }
    peak
}

/// İddia (limiter.rs:9-16, MIMARI.md:89-91): çıkış −1 dBTP'de tutulur, kaçırma payı sert
/// kırpılmış 9 kHz'te 0,06 dB, "testler 0,1 dB tolerans tanır". Projenin kendi testi
/// (`kirpilmis_yuksek_frekans_tavani_asmaz`) yalnızca 44,1 kHz'te çalışır; Windows'ta paylaşımlı
/// modun en yaygın hızı 48 kHz'tir. Aynı test, aynı referans ve aynı tolerans, 48 kHz.
#[test]
fn tst01_kirpilmis_9khz_48khz_te_de_tavani_asmaz() {
    for rate in [44_100u32, 48_000] {
        let mut limiter = Limiter::new(1, rate);
        let mut out: Vec<Sample> = (0..rate as usize)
            .map(|i| {
                let x = 1.6 * (2.0 * PI * 9000.0 * i as f64 / f64::from(rate)).sin();
                x.clamp(-1.0, 1.0)
            })
            .collect();
        for frame in out.chunks_exact_mut(1) {
            limiter.process_frame(frame);
        }
        let peak = 20.0 * true_peak_8x(&out[rate as usize / 4..]).log10();
        println!("TST01 {rate} Hz: çıkışın gerçek tepesi {peak:+.3} dBTP (sınır {CEILING_DBTP} + 0,1)");
        assert!(
            peak <= CEILING_DBTP + 0.1,
            "{rate} Hz: gerçek tepe {peak:+.3} dBTP > −0,9 dBTP"
        );
    }
}

/// İddia (peq.rs:69-71): "Tepe 20 Hz'ten 0,49·fs'e kadar oktavda 48 noktayla taranır: dar
/// (Q = 3) bir tepe bile 0,05 dB içinde bulunur." Parametrik ekolayzer Q'yu 30'a, kazancı
/// ±24 dB'e kadar kabul eder (`MAX_Q`, `PARAMETRIC_MAX_GAIN_DB`). Bildirilen yükseltme
/// (`boost_db`) taşma korumasının (`Leveler`) kısma payıdır.
#[test]
fn tst02_dar_tepe_korumaya_eksik_bildirilmez() {
    let mut worst: f64 = 0.0;
    let mut failures = Vec::new();
    for (q, gain) in [(3.0, 6.0), (3.0, 24.0), (10.0, 24.0), (30.0, 24.0)] {
        for design in [DesignMethod::Rbj, DesignMethod::Matched] {
            let settings = ParametricSettings {
                enabled: true,
                bands: vec![ParametricBand {
                    kind: FilterKind::Peaking,
                    freq_hz: 1896.7,
                    gain_db: gain,
                    q,
                    enabled: true,
                }],
                design,
            };
            let reported = settings.boost_db();
            // Gerçek tepe: 44,1 ve 48 kHz'te merkezin ±5 %'i 0,01 Hz adımla.
            let freqs: Vec<f64> = (0..19_000).map(|i| 1801.0 + 0.01 * f64::from(i)).collect();
            let actual = [44_100.0, 48_000.0]
                .iter()
                .flat_map(|&rate| settings.response_db(&freqs, rate))
                .fold(f64::NEG_INFINITY, f64::max);
            let miss = actual - reported;
            println!(
                "TST02 Q={q:4.1} {gain:+5.1} dB {design:?}: gerçek tepe {actual:+.3}, bildirilen {reported:+.3}, eksik {miss:.3} dB"
            );
            if q <= 3.0 {
                worst = worst.max(miss);
            }
            if miss >= 0.05 {
                failures.push(format!("Q={q} {gain} dB {design:?}: {miss:.3} dB eksik"));
            }
        }
    }
    println!("TST02 Q ≤ 3 en kötü {worst:.3}");
    assert!(failures.is_empty(), "korumaya eksik bildirildi: {failures:?}");
}

/// İddia (MIMARI.md:57-58, peq.rs:619): parametrik ekolayzerde "çizilen eğri duyulan eğridir".
/// Ekrandaki eğri (`ParametricState.curve_db`) 96 kHz'te tasarlanır (`ANALYSIS_RATE`); ses
/// aygıtın hızında (paylaşımlı modda çoğunlukla 48 ya da 44,1 kHz) tasarlanır. Equalizer APO
/// dosyasından yüklenen ayar RBJ tasarımıyla gelir (`from_profile`).
#[test]
fn tst03_cizilen_egri_duyulan_egriyle_ayni() {
    let bands = vec![
        ParametricBand {
            kind: FilterKind::Peaking,
            freq_hz: 1000.0,
            gain_db: 6.0,
            q: 1.0,
            enabled: true,
        },
        ParametricBand {
            kind: FilterKind::HighShelf,
            freq_hz: 10_000.0,
            gain_db: 6.0,
            q: 0.7,
            enabled: true,
        },
        ParametricBand {
            kind: FilterKind::Peaking,
            freq_hz: 16_000.0,
            gain_db: 6.0,
            q: 2.0,
            enabled: true,
        },
    ];
    let mut failures = Vec::new();
    for design in [DesignMethod::Matched, DesignMethod::Rbj] {
        let settings = ParametricSettings {
            enabled: true,
            bands: bands.clone(),
            design,
        };
        let state = ParametricState::new(settings.clone(), false);
        for rate in [44_100.0, 48_000.0] {
            let heard = settings.response_db(&state.curve_hz, rate);
            let (mut worst, mut at) = (0.0f64, 0.0);
            for (i, &hz) in state.curve_hz.iter().enumerate() {
                let d = (state.curve_db[i] - heard[i]).abs();
                if d > worst {
                    worst = d;
                    at = hz;
                }
            }
            println!("TST03 {design:?} {rate} Hz: çizilen − duyulan en büyük fark {worst:.2} dB ({at:.0} Hz'te)");
            if worst > 0.5 {
                failures.push(format!("{design:?} @ {rate}: {worst:.2} dB ({at:.0} Hz)"));
            }
        }
    }
    assert!(failures.is_empty(), "çizilen eğri duyulandan farklı: {failures:?}");
}

/// İddia (ROADMAP.md Faz 3, MIMARI.md:53-56, biquad.rs:34): eşlenmiş tasarım "hiçbir ayarda
/// RBJ'den uzak değil". Projenin testi bunu sık ızgarada `e_m <= e_r + 1.0` (1 dB pay) ile
/// denetler. Burada aynı ayar ızgarasında gerçek en büyük fark ölçülür.
#[test]
fn tst04_eslenmis_hicbir_ayarda_rbj_den_uzak_degil() {
    const FLOOR_DB: f64 = -30.0;
    let kinds = [
        Kind::Peaking,
        Kind::LowShelf,
        Kind::HighShelf,
        Kind::LowPass,
        Kind::HighPass,
        Kind::BandPass,
        Kind::Notch,
        Kind::AllPass,
    ];
    let dense = |spec: &Spec, f: &Biquad, rate: f64| {
        let high = (rate / 2.0 * 0.999).min(20_000.0);
        (0..1000)
            .map(|i| 20.0 * (high / 20.0).powf(f64::from(i) / 999.0))
            .filter(|&hz| spec.analog_db(hz) > FLOOR_DB)
            .map(|hz| {
                let r = spec.analog_db(hz);
                (f.response_db(2.0 * PI * hz / rate) - r).abs() * error_weight(r)
            })
            .fold(0.0, f64::max)
    };
    let mut worst = (0.0f64, String::new());
    let mut over = 0usize;
    let mut total = 0usize;
    for rate in [44_100.0, 48_000.0, 96_000.0] {
        for kind in kinds {
            for i in 0..31 {
                let freq_hz = 20.0 * 1000f64.powf(f64::from(i) / 30.0);
                if freq_hz > 0.45 * rate {
                    continue;
                }
                for q in [0.3, 0.5, 0.707, 1.0, 2.0, 4.0, 8.0] {
                    let gains: &[f64] = if kind.has_gain() {
                        &[-18.0, -12.0, -6.0, -1.0, 1.0, 6.0, 12.0, 18.0]
                    } else {
                        &[0.0]
                    };
                    for &gain_db in gains {
                        let spec = Spec {
                            kind,
                            freq_hz,
                            gain_db,
                            q,
                        };
                        let e_m = dense(&spec, &Biquad::matched(&spec, rate), rate);
                        let e_r = dense(&spec, &Biquad::rbj(&spec, rate), rate);
                        total += 1;
                        if e_m > e_r + 0.05 {
                            over += 1;
                        }
                        if e_m - e_r > worst.0 {
                            worst = (e_m - e_r, format!("{spec:?} @ {rate}: eşlenmiş {e_m:.2}, RBJ {e_r:.2}"));
                        }
                    }
                }
            }
        }
    }
    println!(
        "TST04 {total} ayarın {over} tanesinde eşlenmiş RBJ'den 0,05 dB'den fazla uzak; en kötü +{:.3} dB: {}",
        worst.0, worst.1
    );
    assert!(worst.0 <= 0.05, "en kötü +{:.3} dB: {}", worst.0, worst.1);
}

fn filled(samples: &[Sample]) -> Consumer<Sample> {
    let (mut producer, consumer) = RingBuffer::new(samples.len().max(1));
    for &s in samples {
        let _ = producer.push(s);
    }
    consumer
}

/// İddia (ROADMAP.md Faz 3, MIMARI.md:224): "bütün ses yolu ... en fazla −140 dB bozulma ve
/// gürültü ekler". Projenin testi (`ses_yolu_bozulma_ve_gurultu_eklemez`) Faz 3'ün elle
/// parametrik ekolayzerini kapalı bırakır (`parametric: Arc::default()`). Aynı ölçüm, eşlenmiş
/// tasarımlı parametrik ekolayzer de açıkken (kapsam testi).
#[test]
fn tst05_ses_yolu_parametrik_ekolayzer_aciktayken_de_temiz() {
    let rate = 48_000u32;
    let mut gains = [0.0; BANDS];
    gains[..4].copy_from_slice(&[4.0, 7.0, 6.0, 2.5]);
    let headphone = Arc::new(PeqControl::default());
    headphone.set(
        Some(&HeadphoneProfile {
            name: "Deneme".into(),
            design: Default::default(),
            preamp_db: -4.0,
            filters: vec![PeqFilter {
                kind: FilterKind::LowShelf,
                freq_hz: 105.0,
                gain_db: 4.0,
                q: 0.7,
            }],
        }),
        true,
    );
    let parametric = Arc::new(PeqControl::default());
    let user = ParametricSettings {
        enabled: true,
        bands: vec![
            ParametricBand {
                kind: FilterKind::Peaking,
                freq_hz: 3000.0,
                gain_db: 5.0,
                q: 4.0,
                enabled: true,
            },
            ParametricBand {
                kind: FilterKind::HighPass,
                freq_hz: 25.0,
                gain_db: 0.0,
                q: 0.7,
                enabled: true,
            },
            ParametricBand {
                kind: FilterKind::HighShelf,
                freq_hz: 12_000.0,
                gain_db: -3.0,
                q: 0.7,
                enabled: true,
            },
        ],
        design: DesignMethod::Matched,
    };
    parametric.set_filters(&user.filters(), 0.0, user.boost_db(), user.design, true);
    let levels = Arc::new(TrackLevels::new());
    levels.set_loudness(
        0,
        Some(super::loudness::Loudness {
            integrated_lufs: -9.0,
            true_peak_dbtp: -6.0,
        }),
    );
    let crossfeed = Arc::new(CrossfeedControl::default());
    crossfeed.set(CrossfeedSettings {
        enabled: true,
        cutoff_hz: 700.0,
        level_db: 4.5,
    });
    let mut renderer = Renderer::new(
        2,
        rate,
        RenderControls {
            eq: Arc::new(EqControl::new(EqSettings {
                enabled: true,
                gains_db: gains,
                bass_db: 6.0,
                ..EqSettings::default()
            })),
            headphone,
            parametric,
            crossfeed,
            loudness: Arc::new(LoudnessControl::new(true)),
            levels,
            bit_perfect: false,
        },
    );
    for freq in [100.0, 1000.0, 3000.0, 10_000.0] {
        let frames = rate as usize * 2;
        let samples: Vec<Sample> = (0..frames)
            .flat_map(|f| {
                let x = 0.3 * sine(freq, rate, f);
                [x, -0.5 * x]
            })
            .collect();
        let mut source = filled(&samples);
        let mut left = Vec::with_capacity(frames);
        let mut out = vec![0.0; 2 * 480];
        while left.len() < frames {
            renderer.render(&mut source, &mut out, false);
            left.extend(out.chunks_exact(2).map(|f| f64::from(f[0] as f32)));
        }
        let (amplitude, noise_db) = fit(&left[rate as usize / 2..frames], freq, rate);
        println!("TST05 {freq} Hz: genlik {amplitude:.4}, bozulma + gürültü {noise_db:.1} dB");
        assert!(amplitude > 0.005);
        assert!(noise_db < -140.0, "{freq} Hz: {noise_db:.1} dB");
    }
}
