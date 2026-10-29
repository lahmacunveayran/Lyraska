//! Tempoyu (BPM) bilinen sonuçlu şarkılarda ölçer: oktav hatalarını türe göre sayar (araştırma
//! aracı; ses depoya girmez).
//!
//! Kullanım: `cargo run --release --example tempo_olcum -- <klasör>`. Klasörde her `ad.wav`
//! için `ad.json`: `{"bpm": tempo, "tur": "dubstep", "vuruslar": [saniye, ...]}` (vuruşlar
//! isteğe bağlı). Her şarkının bulunan tempo ve oranını, sonda tür × sonuç tablosunu yazar
//! (doğru, ½, 2×, ⅔, 3⁄2, başka, yok) ve vuruşlar verildiyse ortalama beat F-ölçüsünü.
//! Üretici: `docs/arastirma/tempo/uret.py`.

use lyraska_lib::analysis::evaluate::{f_measure, BEAT_TOLERANCE};
use lyraska_lib::analysis::spectrogram::{analyze, Spectrogram};
use lyraska_lib::audio::decode::Decoder;
use std::collections::BTreeMap;

/// Sonuç sınıfları (tablonun sütunları).
const CLASSES: [&str; 7] = ["doğru", "½", "2×", "⅔", "3⁄2", "başka", "yok"];

/// Bulunan tempo / doğru tempo oranının sınıfı (±%4).
fn classify(ratio: Option<f64>) -> usize {
    let Some(ratio) = ratio else {
        return 6;
    };
    let near = |r: f64| (ratio / r - 1.0).abs() <= 0.04;
    [1.0, 0.5, 2.0, 2.0 / 3.0, 1.5]
        .iter()
        .position(|&r| near(r))
        .unwrap_or(5)
}

/// Bir türün sayıları ve F-ölçüleri.
#[derive(Default)]
struct Row {
    counts: [usize; 7],
    f: Vec<f64>,
}

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .map(|r| r.filter_map(Result::ok).map(|e| e.path()).collect())
        .unwrap_or_default();
    entries.sort();
    let mut table: BTreeMap<String, Row> = BTreeMap::new();
    for path in entries {
        if path.extension().is_none_or(|e| e != "wav") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(path.with_extension("json")) else {
            continue;
        };
        let Ok(truth) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let (Some(want), Some(kind)) = (
            truth.get("bpm").and_then(serde_json::Value::as_f64),
            truth.get("tur").and_then(serde_json::Value::as_str),
        ) else {
            continue;
        };
        let truth_beats: Vec<f64> = truth
            .get("vuruslar")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        let found = Decoder::open(&path).ok().and_then(|decoder| {
            let spectrogram = Spectrogram::new();
            analyze(decoder, &spectrogram);
            let grouping = spectrogram
                .song_map()
                .map(|m| m.grouping.clone())
                .unwrap_or_default();
            spectrogram
                .beat_grid()
                .map(|g| (g.bpm, g.variable_tempo, grouping, g.beats.clone()))
        });
        let class = classify(found.as_ref().map(|(bpm, ..)| bpm / want));
        let row = table.entry(kind.to_owned()).or_default();
        row.counts[class] += 1;
        // F-ölçüsü yalnızca davulun çaldığı bölümde (doğru vuruşların kapsadığı aralık).
        let f = match (&found, truth_beats.first(), truth_beats.last()) {
            (Some((.., beats)), Some(&first), Some(&last)) => {
                let inside: Vec<f64> = beats
                    .iter()
                    .copied()
                    .filter(|&b| b >= first - BEAT_TOLERANCE && b <= last + BEAT_TOLERANCE)
                    .collect();
                Some(f_measure(&inside, &truth_beats, BEAT_TOLERANCE))
            }
            (None, Some(_), _) => Some(0.0),
            _ => None,
        };
        row.f.extend(f);
        let name = path
            .file_stem()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let shown = found.map_or("-".to_owned(), |(bpm, variable, grouping, _)| {
            let variable = if variable { " değişken" } else { "" };
            let grouping = if grouping.is_empty() {
                String::new()
            } else {
                format!(" aksak {grouping:?}")
            };
            format!("{bpm:.1}{variable}{grouping}")
        });
        let f = f.map_or(String::new(), |f| format!(" · F {f:.2}"));
        println!(
            "{name}: doğru {want:.1} · bulunan {shown} · {}{f}",
            CLASSES[class]
        );
    }
    println!();
    println!("| Tür | {} | F |", CLASSES.join(" | "));
    println!("|{}", " --- |".repeat(CLASSES.len() + 2));
    let mut total = Row::default();
    let mean = |f: &[f64]| {
        if f.is_empty() {
            "-".to_owned()
        } else {
            format!("{:.2}", f.iter().sum::<f64>() / f.len() as f64)
        }
    };
    for (kind, row) in &table {
        let cells: Vec<String> = row.counts.iter().map(usize::to_string).collect();
        println!("| {kind} | {} | {} |", cells.join(" | "), mean(&row.f));
        for (t, c) in total.counts.iter_mut().zip(row.counts) {
            *t += c;
        }
        total.f.extend(&row.f);
    }
    let cells: Vec<String> = total.counts.iter().map(usize::to_string).collect();
    println!(
        "| **toplam** | {} | {} |",
        cells.join(" | "),
        mean(&total.f)
    );
}
