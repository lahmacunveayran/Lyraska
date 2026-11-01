// GEÇİCİ ölçüm testi (1 Kasım 2026): tempo.rs mod tests içine eklenip LYRASKA_TEMPO_LISTE ile çalıştırıldı; çıktısı ../tempo-ic-degerler.json.

    /// GEÇİCİ (commit edilmez): LYRASKA_TEMPO_LISTE dosyasındaki şarkılar için oktav kararının iç değerleri.
    #[test]
    fn yerel_oktav_olcumu() {
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
            let accent = accent_envelope(bands, 32);
            let snare = snare_envelope(bands, 32);
            let noise = noise_envelope(bands, 32);
            let frame = |t: f64| (t + latency) * fps;
            let doubled = with_midpoints(&grid.beats);
            let retracked = retrack(onset, fps, latency, &grid, 30.0 / grid.bpm);
            let fine = retracked.as_ref().map_or(&doubled, |g| &g.beats);
            let out = resolve_octave(grid.clone(), onset, bands, 32, fps, latency);
            let frames: Vec<&[u8]> = bands.chunks_exact(32).collect();
            let low: Vec<f64> = frames.iter().enumerate().map(|(i, f)| {
                let p = frames[i.saturating_sub(1)];
                LOW_BANDS.map(|b| (f64::from(f[b]) - f64::from(p[b])).max(0.0)).sum::<f64>()
            }).collect();
            let (lon, loff) = peaks(&low, &grid.beats, &frame);
            let med = |v: &[f64]| { let mut v = v.to_vec(); v.sort_by(f64::total_cmp); v.get(v.len() / 2).copied().unwrap_or(0.0) };
            let (son, soff) = peaks(&strength, &grid.beats, &frame);
            let lm = med(&lon);
            let presence = |v: &[f64]| v.iter().filter(|&&x| x >= 0.6 * lm).count() as f64 / v.len().max(1) as f64;
            let sm = med(&son);
            let spres = |v: &[f64]| v.iter().filter(|&&x| x >= 0.6 * sm).count() as f64 / v.len().max(1) as f64;
            print!("PR|lon {:.2}|loff {:.2}|son {:.2}|soff {:.2}|", presence(&lon), presence(&loff), spres(&son), spres(&soff));
            print!("EK|low {:.2}|lowmed {:.2}|strmed {:.2}|", quotient(mean(&lon), mean(&loff)), quotient(med(&lon), med(&loff)), quotient(med(&son), med(&soff)));
            println!(
                "OLCUM|{:.1}|{:.1}|{}|acc {:.2}|sn {:.2}|cov {:.2}|noise {:.2}|fill {:.3}|fill2 {:.3}|noise2 {:.2}|retrack {}|{}",
                grid.bpm, out.bpm, grid.variable_tempo,
                strong_offbeat_ratio(&accent, &grid.beats, &frame),
                strong_offbeat_ratio(&snare, &grid.beats, &frame),
                gap_coverage(&snare, &grid.beats, &frame),
                offbeat_noise(&noise, &grid.beats, &frame),
                offbeat_ratio(&strength, &grid.beats, &frame),
                offbeat_ratio(&strength, fine, &frame),
                offbeat_noise(&noise, fine, &frame),
                retracked.is_some(),
                path.rsplit(['/', '\\']).next().unwrap_or(path),
            );
        }
    }
