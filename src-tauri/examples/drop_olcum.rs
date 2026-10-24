//! Drop bulmayı ve tempoyu bilinen sonuçlu şarkılarda ölçer (araştırma aracı; ses depoya girmez).
//!
//! Kullanım: `cargo run --release --example drop_olcum -- <klasör>`. Klasörde her `ad.wav`
//! (ya da başka bir ses dosyası) için `ad.json`: `{"drops": [saniye, ...], "bpm": tempo}`
//! (tempo isteğe bağlı). Her şarkı için
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
    let (mut bpm_total, mut bpm_ok, mut bpm_octave, mut bpm_variable) = (0usize, 0, 0, 0);
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
        let truth_bpm = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("bpm").and_then(serde_json::Value::as_f64));
        let (found, grid) = run(&path);
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
        // Zaman hatası yalnızca isabetlerde (ekranda gösterilen, ±1 sn içindeki drop).
        for &m in &truth {
            if let Some(e) = confident
                .iter()
                .map(|&t| (t - m).abs())
                .filter(|&e| e <= DROP_TOLERANCE)
                .min_by(f64::total_cmp)
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
        // Tempo: bilinen tempoya ±%2 içinde mi (yarısı ya da iki katı ayrı sayılır).
        let tempo = match (grid, truth_bpm) {
            (Some((bpm, variable)), Some(want)) => {
                bpm_total += 1;
                let ratio = bpm / want;
                let ok = (ratio - 1.0).abs() <= 0.02;
                let octave = (ratio - 2.0).abs() <= 0.04 || (ratio - 0.5).abs() <= 0.01;
                bpm_ok += usize::from(ok);
                bpm_octave += usize::from(octave);
                bpm_variable += usize::from(variable);
                let verdict = if ok {
                    ""
                } else if octave {
                    " (oktav)"
                } else {
                    " (YANLIŞ)"
                };
                let changing = if variable { " değişken" } else { "" };
                format!(" · tempo {bpm:.1}/{want:.0}{verdict}{changing}")
            }
            _ => String::new(),
        };
        println!(
            "{name}: işaretli {truth:?} · bulunan {} · isabet {hits}/{} · yanlış {false_alarms}{tempo}",
            list.join(" "),
            truth.len()
        );
    }
    errors.sort_by(f64::total_cmp);
    let at = |q: f64| {
        errors
            .get(((errors.len() as f64 - 1.0) * q).round() as usize)
            .copied()
    };
    let ms = |v: Option<f64>| v.map_or("-".to_owned(), |v| format!("{:.0} ms", v * 1000.0));
    println!(
        "TOPLAM: isabet {hits_total}/{marked_total} · yanlış alarm {false_total} · isabetlerde zaman hatası ortanca {} · %90 {}",
        ms(at(0.5)),
        ms(at(0.9))
    );
    if bpm_total > 0 {
        println!(
            "TEMPO: doğru {bpm_ok}/{bpm_total} · oktav {bpm_octave} · değişken sanılan {bpm_variable}"
        );
    }
}

/// Drop adayları (saniye, güven).
type Drops = Vec<(f64, f32)>;
/// Tempo (BPM, değişken mi).
type Tempo = Option<(f64, bool)>;

/// Bütün drop adayları ve tempo.
fn run(path: &Path) -> (Drops, Tempo) {
    let Ok(decoder) = Decoder::open(path) else {
        return (Vec::new(), None);
    };
    let spectrogram = Spectrogram::new();
    analyze(decoder, &spectrogram);
    let drops = spectrogram
        .song_map()
        .map(|m| {
            m.drops
                .iter()
                .copied()
                .zip(m.drop_confidence.iter().copied())
                .collect()
        })
        .unwrap_or_default();
    let grid = spectrogram.beat_grid().map(|g| (g.bpm, g.variable_tempo));
    (drops, grid)
}
