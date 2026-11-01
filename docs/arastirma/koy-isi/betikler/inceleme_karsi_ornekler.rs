// Bağımsız incelemenin karşı örnek düzeneği (1 Kasım 2026). `src-tauri/src/analysis/tempo.rs`'in
// `mod tests` bölümüne geçici olarak eklenip çalıştırıldı (Drums ses üreteci → analyze → beats::track →
// resolve_octave); programa ve depodaki testlere girmez. Çalıştırma:
//   RUST_TEST_THREADS=4 cargo test -j 4 -q --lib review_counter_examples -- --nocapture
// REVIEW_SWEEP=1 ile yalnızca dembow (reggaeton) taraması. Sonuçlar ../README.md'de.
    fn review_diag(samples: &[f64]) -> (f64, f64, f64, f64, bool) {
        let path = temp_path("tempo-review.wav");
        write_wav(&path, RATE, 1, samples.len(), |f, _| {
            (0.7 * samples[f]).clamp(-1.0, 1.0)
        });
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        std::fs::remove_file(&path).ok();
        let saved = spectrogram.saved().unwrap();
        let latency = crate::analysis::beats::onset_latency(RATE, 2048);
        let grid = crate::analysis::beats::track(&saved.onset, 60.0, latency).unwrap();
        let strength = box3(&normalize(&saved.onset, 60.0).unwrap());
        let frame = |t: f64| (t + latency) * 60.0;
        let r1 = offbeat_ratio(&strength, &grid.beats, &frame);
        let mid = with_midpoints(&grid.beats);
        let rt = retrack(&saved.onset, 60.0, latency, &grid, 30.0 / grid.bpm);
        let fine = rt.as_ref().map_or(&mid, |g| &g.beats);
        let r2 = offbeat_ratio(&strength, fine, &frame);
        let tracked = grid.bpm;
        let out = resolve_octave(grid, &saved.onset, &saved.levels, 32, 60.0, latency);
        (tracked, r1, r2, out.bpm, rt.is_some())
    }

    #[test]
    fn review_counter_examples() {
        type Pat = Vec<(f64, Hit, f64)>;
        let eighths = |hit: Hit, gain: f64, offbeat_only: bool| -> Pat {
            (0..8)
                .filter(|e| !offbeat_only || e % 2 == 1)
                .map(|e| (f64::from(e) / 2.0, hit, gain))
                .collect()
        };
        let sixteenths =
            |gain: f64| -> Pat { (0..16).map(|s| (f64::from(s) / 4.0, Hit::Hat, gain)).collect() };
        let four_floor = |gain: f64| -> Pat { (0..4).map(|q| (f64::from(q), Hit::Kick, gain)).collect() };
        let mut cases: Vec<(&str, f64, Pat)> = Vec::new();
        for bpm in [120.0, 124.0, 128.0] {
            let mut p = four_floor(1.0);
            p.extend([(1.0, Hit::Snare, 0.8), (3.0, Hit::Snare, 0.8)]);
            p.extend(eighths(Hit::Hat, 2.0, true));
            p.extend(sixteenths(0.5));
            cases.push(("house 4otf openhat+16th", bpm, p));
        }
        for bpm in [90.0, 95.0, 98.0, 100.0] {
            // disco: kick every beat, snare 2/4, loud open hat on offbeats, 16th hats
            let mut p = four_floor(1.0);
            p.extend([(1.0, Hit::Snare, 0.9), (3.0, Hit::Snare, 0.9)]);
            p.extend(eighths(Hit::Hat, 2.0, true));
            p.extend(sixteenths(0.6));
            cases.push(("disco 4otf openhat+16th", bpm, p.clone()));
            // dance-pop: 4otf, clap 2/4, 8th hats only
            let mut p = four_floor(1.0);
            p.extend([(1.0, Hit::Snare, 0.9), (3.0, Hit::Snare, 0.9)]);
            p.extend(eighths(Hit::Hat, 1.0, false));
            cases.push(("dance-pop 4otf 8th hats", bpm, p));
            // nu-disco: 4otf + offbeat bass note + 16th hats
            let mut p = four_floor(1.0);
            p.extend(eighths(Hit::Note(55.0, 0.2), 2.5, true));
            p.extend([(1.0, Hit::Snare, 0.8), (3.0, Hit::Snare, 0.8)]);
            p.extend(sixteenths(0.8));
            cases.push(("nu-disco 4otf offbeat bass", bpm, p));
            // reggaeton dembow: kick every beat, snare at .75 1.5 2.75 3.5, 8th hats
            let mut p = four_floor(1.0);
            p.extend([0.75, 1.5, 2.75, 3.5].map(|x| (x, Hit::Snare, 0.9)));
            p.extend(eighths(Hit::Hat, 0.8, false));
            cases.push(("reggaeton dembow", bpm, p));
            // motown: snare+tambourine every beat, kick 1/3 and the and-of-2, 8th hats
            let mut p: Pat = (0..4).map(|q| (f64::from(q), Hit::Snare, 0.9)).collect();
            p.extend([(0.0, Hit::Kick, 1.0), (2.0, Hit::Kick, 1.0), (1.5, Hit::Kick, 0.7)]);
            p.extend(eighths(Hit::Hat, 1.0, false));
            cases.push(("motown snare every beat", bpm, p));
        }
        for bpm in [92.0, 96.0, 99.0, 100.0] {
            for (hg, sg) in [(3.0, 1.5), (5.0, 3.0)] {
                let mut p = four_floor(1.0);
                p.extend([(1.0, Hit::Snare, 0.9), (3.0, Hit::Snare, 0.9)]);
                p.extend(eighths(Hit::Hat, hg, true));
                p.extend(sixteenths(sg));
                cases.push((if hg < 4.0 { "disco LOUD hats a" } else { "disco LOUD hats b" }, bpm, p));
            }
            let mut p = four_floor(1.0);
            p.extend([(1.0, Hit::Snare, 0.9), (3.0, Hit::Snare, 0.9)]);
            p.extend(eighths(Hit::Note(55.0, 0.2), 3.0, true));
            p.extend(sixteenths(2.5));
            cases.push(("nu-disco bass+LOUD 16th", bpm, p));
        }
        for bpm in [85.0, 92.0] {
            let mut p: Pat = (0..4).map(|q| (f64::from(q), Hit::Snare, 0.9)).collect();
            p.extend([(0.0, Hit::Kick, 1.0), (2.0, Hit::Kick, 1.0)]);
            p.extend(eighths(Hit::Hat, 1.0, false));
            p.extend(sixteenths(0.4));
            cases.push(("motown + 16th tambourine", bpm, p));
        }
        for bpm in [70.0, 76.0, 84.0, 92.0] {
            // ballad: straight equal piano eighths, kick 1, snare 2/4, 16th shaker
            let notes = [261.6, 329.6, 392.0, 329.6];
            let mut p: Pat = (0..8)
                .map(|e| (f64::from(e) / 2.0, Hit::Note(notes[e as usize % 4], 0.3), 1.2))
                .collect();
            p.extend([(0.0, Hit::Kick, 0.8), (1.0, Hit::Snare, 0.6), (3.0, Hit::Snare, 0.6)]);
            cases.push(("ballad eighth piano", bpm, p.clone()));
            p.extend(sixteenths(0.6));
            cases.push(("ballad eighth piano+16th shaker", bpm, p));
        }
        for bpm in [76.0, 84.0, 96.0, 100.0] {
            // reggae/ska skank: kick 1/3 (one-drop: 3 only), chord stab on every offbeat, 16th hats
            let mut p: Pat = vec![(2.0, Hit::Kick, 1.0), (2.0, Hit::Snare, 0.7)];
            p.extend(eighths(Hit::Note(392.0, 0.12), 2.5, true));
            p.extend(eighths(Hit::Snare, 0.5, true));
            p.extend(sixteenths(0.5));
            cases.push(("reggae skank offbeat", bpm, p));
            // polka / country two-step: bass on beat, snare+chord on every offbeat
            let mut p: Pat = four_floor(1.0);
            p.extend(eighths(Hit::Snare, 0.9, true));
            p.extend(sixteenths(0.4));
            cases.push(("two-step boom-chick", bpm, p));
        }
        for bpm in [80.0, 87.0, 95.0] {
            // positive: hardstyle-like at 2x (kick every beat of 2*bpm, offbeat bass)
            let mut p: Pat = (0..8).map(|e| (f64::from(e) / 2.0, Hit::Kick, 1.0)).collect();
            p.extend(sixteenths(0.6).into_iter().filter(|(x, _, _)| (x * 4.0) as i32 % 2 == 1));
            cases.push(("POSITIVE hardstyle at 2x", bpm, p));
        }
        if std::env::var("REVIEW_SWEEP").is_ok() {
            cases.clear();
            for bpm in [94.0, 96.0, 97.0, 98.0, 99.0, 100.0] {
                for (sg, hg) in [(0.9, 0.8), (1.2, 1.5), (0.6, 0.8)] {
                    let mut p = four_floor(1.0);
                    p.extend([0.75, 1.5, 2.75, 3.5].map(|x| (x, Hit::Snare, sg)));
                    p.extend(eighths(Hit::Hat, hg, false));
                    cases.push(("dembow sweep", bpm, p));
                }
            }
        }
        for (i, (name, bpm, p)) in cases.iter().enumerate() {
            let mut drums = Drums::new(40.0, 100 + i as u64);
            drums.pattern(*bpm, p);
            let (tracked, r1, r2, out, rt) = review_diag(&drums.out);
            println!(
                "REVIEW #{i} {name:34} true {bpm:5.1} tracked {tracked:6.1} even {r1:5.2} fill2 {r2:5.2} retrack {rt} -> {out:6.1}"
            );
        }
    }
