//! Drop bulmayı bilinen sonuçlu şarkılarda ölçer (araştırma aracı; ses depoya girmez).
//!
//! Kullanım: `cargo run --release --example drop_olcum -- <klasör>`. Klasörde her `ad.wav`
//! (ya da başka bir ses dosyası) için `ad.json`: `{"drops": [saniye, ...]}`. Her şarkı için
//! bulunan dropları (güveniyle) ve işaretlilerle eşleşmeyi, sonda toplamı yazar.

use lyraska_lib::analysis::evaluate::DROP_TOLERANCE;
use lyraska_lib::analysis::spectrogram::{analyze, Spectrogram};
use lyraska_lib::analysis::structure::DROP_CONFIDENCE_MIN;
use lyraska_lib::audio::decode::Decoder;
use std::path::Path;

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .map(|r| r.filter_map(Result::ok).map(|e| e.path()).collect())
        .unwrap_or_default();
    entries.sort();
    let (mut marked_total, mut hits_total, mut false_total) = (0usize, 0usize, 0usize);
    let mut errors: Vec<f64> = Vec::new();
    for path in entries {
        if path.extension().is_some_and(|e| e == "json") {
            continue;
        }
        let truth_path = path.with_extension("json");
        let Ok(text) = std::fs::read_to_string(&truth_path) else {
            continue;
        };
        let truth: Vec<f64> = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("drops").cloned())
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        let found = run(&path);
        let confident: Vec<f64> = found
            .iter()
            .filter(|(_, c)| *c >= DROP_CONFIDENCE_MIN)
            .map(|(t, _)| *t)
            .collect();
        let hits = truth
            .iter()
            .filter(|&&m| confident.iter().any(|&d| (d - m).abs() <= DROP_TOLERANCE))
            .count();
        let false_alarms = confident
            .iter()
            .filter(|&&d| truth.iter().all(|&m| (d - m).abs() > DROP_TOLERANCE))
            .count();
        for &m in &truth {
            if let Some(e) = found
                .iter()
                .map(|(t, _)| t - m)
                .min_by(|a, b| a.abs().total_cmp(&b.abs()))
            {
                errors.push(e);
            }
        }
        marked_total += truth.len();
        hits_total += hits;
        false_total += false_alarms;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let list: Vec<String> = found
            .iter()
            .map(|(t, c)| format!("{t:.2}({c:.2})"))
            .collect();
        println!(
            "{name}: işaretli {truth:?} · bulunan {} · isabet {hits}/{} · yanlış {false_alarms}",
            list.join(" "),
            truth.len()
        );
    }
    let near = errors.iter().filter(|e| e.abs() <= DROP_TOLERANCE).count();
    println!(
        "TOPLAM: isabet {hits_total}/{marked_total} · yanlış alarm {false_total} · en yakın aday ±1 sn içinde {near}/{}",
        errors.len()
    );
}

/// Bütün drop adayları (saniye, güven).
fn run(path: &Path) -> Vec<(f64, f32)> {
    let Ok(decoder) = Decoder::open(path) else {
        return Vec::new();
    };
    let spectrogram = Spectrogram::new();
    analyze(decoder, &spectrogram);
    spectrogram
        .song_map()
        .map(|m| {
            m.drops
                .iter()
                .copied()
                .zip(m.drop_confidence.iter().copied())
                .collect()
        })
        .unwrap_or_default()
}
