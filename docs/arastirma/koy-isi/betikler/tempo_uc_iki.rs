// GEÇİCİ ölçüm testi (1 Kasım 2026): 3:2 iç değerleri; tempo.rs mod tests içine eklenip LYRASKA_TEMPO_LISTE ile çalıştırıldı; çıktısı ../tempo-uc-iki.txt.

    /// GEÇİCİ (commit edilmez): 3:2 ölçümü.
    #[test]
    fn yerel_uc_iki_olcumu() {
        let Ok(list) = std::env::var("LYRASKA_TEMPO_LISTE") else { return };
        for path in std::fs::read_to_string(list).unwrap().lines().filter(|l| !l.trim().is_empty()) {
            let decoder = Decoder::open(std::path::Path::new(path.trim())).unwrap();
            let rate = decoder.info().sample_rate;
            let spectrogram = Spectrogram::new();
            analyze(decoder, &spectrogram);
            let saved = spectrogram.saved().unwrap();
            let latency = crate::analysis::beats::onset_latency(rate, crate::analysis::spectrogram::fft_size(rate));
            let (onset, bands, fps) = (&saved.onset, &saved.levels, 60.0);
            let Some(grid) = crate::analysis::beats::track(onset, fps, latency) else { println!("YOK {path}"); continue };
            let strength = box3(&normalize(onset, fps).unwrap());
            let low = band_rise(bands, 32, LOW_BANDS);
            let frame = |t: f64| (t + latency) * fps;
            let avg = mean(&strength);
            let lavg = mean(&low);
            let g15 = track_period(onset, fps, latency, 60.0 / (1.5 * grid.bpm)).map(|(b, _)| b).unwrap_or_default();
            let at = |env: &[f64], beats: &[f64], f: f64, w: f64| -> f64 {
                let v: Vec<f64> = beats.windows(2).map(|p| {
                    let (a, b) = (frame(p[0]), frame(p[1]));
                    let c = a + f * (b - a); let h = w * (b - a);
                    let s = ((c - h).round().max(0.0)) as usize; let e = (((c + h).round()) as usize + 1).min(env.len());
                    env.get(s..e).map_or(0.0, |x| x.iter().copied().fold(0.0, f64::max))
                }).collect();
                mean(&v)
            };
            let out = resolve_octave(grid.clone(), onset, bands, 32, fps, latency);
            println!(
                "UC|{:.1}|{:.1}|{:.1}|salT {:.2}|sal15 {:.2}|lsalT {:.2}|lsal15 {:.2}|half {:.2}|third {:.2}|fill15 {:.2}|lfill15 {:.2}|n {} {}|{}",
                grid.bpm, rounded_bpm(&g15).max(0.0), out.bpm,
                at(&strength, &grid.beats, 0.0, ON_BEAT) / avg,
                at(&strength, &g15, 0.0, ON_BEAT) / avg,
                at(&low, &grid.beats, 0.0, ON_BEAT) / lavg,
                at(&low, &g15, 0.0, ON_BEAT) / lavg,
                at(&strength, &grid.beats, 0.5, 0.06) / avg,
                0.5 * (at(&strength, &grid.beats, 1.0 / 3.0, 0.06) + at(&strength, &grid.beats, 2.0 / 3.0, 0.06)) / avg,
                offbeat_ratio(&strength, &g15, &frame),
                offbeat_ratio(&low, &g15, &frame),
                grid.beats.len(), g15.len(),
                path.rsplit(['/', '\\']).next().unwrap_or(path),
            );
        }
    }
