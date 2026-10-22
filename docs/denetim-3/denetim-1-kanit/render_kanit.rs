
#[cfg(test)]
mod denetim1_kanit {
    use super::*;
    use crate::audio::peq::{DesignMethod, FilterKind, ParametricBand, ParametricSettings};

    /// D1-a: Koruma boşluğu 0 dBTP'ye, sınırlayıcı −1 dBTP'ye göre: koruma yetiyor sanılırken
    /// sınırlayıcı her tepede ~1 dB kısar.
    #[test]
    fn d1a_koruma_varken_sinirlayici_calismamali() {
        let levels = Arc::new(TrackLevels::new());
        levels.set_loudness(
            0,
            Some(crate::audio::loudness::Loudness {
                integrated_lufs: -14.0,
                true_peak_dbtp: -1.0,
            }),
        );
        let settings = ParametricSettings {
            enabled: true,
            bands: vec![ParametricBand {
                kind: FilterKind::Peaking,
                freq_hz: 1000.0,
                gain_db: 6.0,
                q: 1.0,
                enabled: true,
            }],
            design: DesignMethod::Rbj,
        };
        let parametric = Arc::new(PeqControl::default());
        parametric.set_filters(&settings.filters(), 0.0, settings.boost_db(), settings.design, true);
        let controls = RenderControls {
            parametric,
            loudness: Arc::new(LoudnessControl::new(true)),
            levels: Arc::clone(&levels),
            ..RenderControls::default()
        };
        let rate = 48_000u32;
        let mut renderer = Renderer::new(1, rate, controls);
        let amp = 10f64.powf(-1.0 / 20.0);
        let w = 2.0 * std::f64::consts::PI * 1000.0 / f64::from(rate);
        let samples: Vec<Sample> = (0..rate).map(|i| amp * (w * f64::from(i)).sin()).collect();
        let (mut producer, mut source) = rtrb::RingBuffer::new(samples.len());
        for &s in &samples {
            producer.push(s).unwrap();
        }
        let mut out = vec![0.0f64; rate as usize];
        let mut min_gain: f64 = 1.0;
        for chunk in out.chunks_mut(480) {
            renderer.render(&mut source, chunk, false);
            if renderer.limiter.gain() < 1.0 {
                min_gain = min_gain.min(renderer.limiter.gain());
            }
        }
        let peak = out[rate as usize / 2..].iter().fold(0.0f64, |m, s| m.max(s.abs()));
        println!(
            "D1-a: bildirilen yükseltme {:.2} dB; çıkış tepesi {:.2} dBFS; sınırlayıcının en küçük kazancı {:.2} dB",
            settings.boost_db(),
            20.0 * peak.log10(),
            20.0 * min_gain.log10()
        );
        assert!(min_gain > 0.99, "koruma varken sınırlayıcı {:.2} dB kıstı", 20.0 * min_gain.log10());
    }
}
