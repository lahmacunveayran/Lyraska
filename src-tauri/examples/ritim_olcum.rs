//! Ritim analizinin standart veri setlerinde ölçümü (araştırma aracı; ses ve sonuçlar depoya girmez).
//!
//! Kullanım: `cargo run --release --example ritim_olcum -- <ses klasörü> <işaret klasörü> <sonuç klasörü>`.
//! Ses klasöründeki her şarkı için (alt klasörler dahil) işaret klasöründe aynı adlı `.beats` dosyası
//! aranır: satır başına "zaman vuruş_no" (Ballroom, GTZAN, Hainsworth, SMC işaretlerinin ortak biçimi;
//! `1` ölçü başıdır, numara yoksa yalnızca vuruş). Ölçütler alanın standardı:
//! - **Vuruş F-ölçüsü**: ±70 ms pencere, en büyük eşleştirme (mir_eval `beat.f_measure`); ayrıca ilk 5
//!   saniyesi atılmış hâli (mir_eval `trim_beats`, MIREX kuralı).
//! - **Ölçü başı F-ölçüsü**: ±70 ms (madmom / Beat This değerlendirmesi).
//! - **Tempo**: ACC1 (±%4), ACC2 (±%4, ×2, ×½, ×3, ×⅓ oktav hataları dahil); gerçek tempo işaretli
//!   vuruş aralıklarının ortancasından.
//!
//! Sonuçlar `sonuclar.jsonl`'a satır satır yazılır; `rapor.md` tür (üst klasör) başına ortalamaları verir.
//!
//! `LYRASKA_RITIM_MODELI` bir model dosyasını gösterirse analiz yerine ritim modeli (Beat This,
//! `analysis::rhythm_net`) ölçülür: vuruş ve ölçü başı modelin, tempo vuruş aralıklarının ortancası.
use lyraska_lib::analysis::evaluate::{f_measure, interval_bpm, BEAT_TOLERANCE};
use lyraska_lib::analysis::lyrics_model::decode_mono_at;
use lyraska_lib::analysis::rhythm_model::SAMPLE_RATE as MODEL_RATE;
use lyraska_lib::analysis::rhythm_net::{RhythmNet, MODEL_SHA256};
use lyraska_lib::analysis::spectrogram::{analyze, Spectrogram};
use lyraska_lib::audio::decode::Decoder;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Instant;

const AUDIO: [&str; 6] = ["wav", "flac", "mp3", "ogg", "m4a", "au"];
/// mir_eval `trim_beats`: değerlendirmede atılan başlangıç (saniye).
const TRIM_SECONDS: f64 = 5.0;
/// Tempo doğruluğu penceresi (ACC1 / ACC2).
const TEMPO_TOLERANCE: f64 = 0.04;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        eprintln!("kullanım: ritim_olcum <ses klasörü> <işaret klasörü> <sonuç klasörü>");
        std::process::exit(2);
    }
    let (audio_dir, marks_dir, out_dir) = (
        PathBuf::from(&args[1]),
        PathBuf::from(&args[2]),
        PathBuf::from(&args[3]),
    );
    if let Err(e) = std::fs::create_dir_all(&out_dir) {
        eprintln!("sonuç klasörü açılamadı: {e}");
        std::process::exit(1);
    }
    let net = std::env::var_os("LYRASKA_RITIM_MODELI").map(|path| {
        RhythmNet::open(Path::new(&path), MODEL_SHA256).unwrap_or_else(|e| {
            eprintln!("ritim modeli açılamadı: {e}");
            std::process::exit(1);
        })
    });
    let marks = index_marks(&marks_dir);
    let mut songs: Vec<PathBuf> = walkdir::WalkDir::new(&audio_dir)
        .into_iter()
        .filter_map(Result::ok)
        .map(|e| e.into_path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| AUDIO.contains(&e.to_lowercase().as_str()))
        })
        .collect();
    songs.sort();
    let results_path = out_dir.join("sonuclar.jsonl");
    let mut file = match std::fs::File::create(&results_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("sonuç dosyası açılamadı: {e}");
            std::process::exit(1);
        }
    };
    let mut all = Vec::new();
    for (i, song) in songs.iter().enumerate() {
        let stem = song.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let Some(mark_path) = marks.get(stem) else {
            continue;
        };
        let genre = song
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("-")
            .to_owned();
        let line = measure(song, mark_path, &genre, net.as_ref());
        if let Err(e) = writeln!(file, "{line}") {
            eprintln!("yazılamadı: {e}");
        }
        eprintln!("{}/{} {stem}", i + 1, songs.len());
        all.push(line);
    }
    let report = report(&all);
    println!("{report}");
    if let Err(e) = std::fs::write(out_dir.join("rapor.md"), report) {
        eprintln!("rapor yazılamadı: {e}");
    }
}

/// İşaret klasöründeki `.beats` dosyaları, dosya adının kökünden (uzantısız) yola.
fn index_marks(dir: &Path) -> BTreeMap<String, PathBuf> {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
        .map(|e| e.into_path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("beats"))
        .filter_map(|p| {
            let stem = p.file_stem()?.to_str()?.to_owned();
            Some((stem, p))
        })
        .collect()
}

/// `.beats` dosyası: vuruşlar ve ölçü başları (numarası 1 olanlar).
fn read_marks(path: &Path) -> Option<(Vec<f64>, Vec<f64>)> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut beats = Vec::new();
    let mut downbeats = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let Some(time) = parts.next().and_then(|t| t.parse::<f64>().ok()) else {
            continue;
        };
        beats.push(time);
        if parts.next().and_then(|n| n.parse::<f64>().ok()) == Some(1.0) {
            downbeats.push(time);
        }
    }
    beats.sort_by(f64::total_cmp);
    downbeats.sort_by(f64::total_cmp);
    Some((beats, downbeats))
}

fn trimmed(times: &[f64]) -> Vec<f64> {
    times
        .iter()
        .copied()
        .filter(|&t| t >= TRIM_SECONDS)
        .collect()
}

/// Tempo doğruluğu: (ACC1, ACC2).
fn tempo_accuracy(estimated: f64, truth: f64) -> (bool, bool) {
    let near = |factor: f64| (estimated - truth * factor).abs() <= TEMPO_TOLERANCE * truth * factor;
    let acc1 = near(1.0);
    let acc2 = [1.0, 2.0, 0.5, 3.0, 1.0 / 3.0].into_iter().any(near);
    (acc1, acc2)
}

/// Bulunan vuruşlar, ölçü başları, tempo, ölçü ve ölçü güveni.
type Found = (Vec<f64>, Vec<f64>, Option<f64>, Option<usize>, Option<f32>);

/// Lyraska'nın analizi: şarkı haritasıyla.
fn run_analysis(song: &Path) -> Result<Found, String> {
    let decoder = Decoder::open(song).map_err(|e| format!("açılamadı: {e}"))?;
    let spectrogram = Spectrogram::new();
    analyze(decoder, &spectrogram);
    let grid = spectrogram.beat_grid();
    let map = spectrogram.song_map();
    Ok((
        grid.as_ref().map(|g| g.beats.clone()).unwrap_or_default(),
        map.as_ref()
            .map(|m| m.downbeats.clone())
            .unwrap_or_default(),
        grid.as_ref().map(|g| g.bpm),
        map.as_ref().map(|m| m.meter),
        map.as_ref().map(|m| m.meter_confidence),
    ))
}

/// Ritim modeli: iki iş parçacığı (programın arka plan analizi gibi).
fn run_model(net: &RhythmNet, song: &Path) -> Result<Found, String> {
    let cancel = AtomicBool::new(false);
    let audio = decode_mono_at(song, MODEL_RATE, &cancel).map_err(|e| e.to_string())?;
    let out = net.analyze(&audio, 2, &cancel).map_err(|e| e.to_string())?;
    let bpm = interval_bpm(&out.beats);
    Ok((out.beats, out.downbeats, bpm, None, None))
}

fn measure(song: &Path, mark_path: &Path, genre: &str, net: Option<&RhythmNet>) -> Value {
    let name = song.file_name().and_then(|n| n.to_str()).unwrap_or("-");
    let Some((beats, downbeats)) = read_marks(mark_path) else {
        return json!({ "sarki": name, "tur": genre, "hata": "işaret okunamadı" });
    };
    let started = Instant::now();
    let found = match net {
        Some(net) => run_model(net, song),
        None => run_analysis(song),
    };
    let (detected, detected_down, bpm, meter, meter_confidence) = match found {
        Ok(found) => found,
        Err(e) => return json!({ "sarki": name, "tur": genre, "hata": e }),
    };
    let seconds = started.elapsed().as_secs_f64();
    let truth_bpm = interval_bpm(&beats);
    let (acc1, acc2) = match (bpm, truth_bpm) {
        (Some(e), Some(t)) => {
            let (a, b) = tempo_accuracy(e, t);
            (Some(a), Some(b))
        }
        _ => (None, None),
    };
    json!({
        "sarki": name,
        "tur": genre,
        "vurus_f": f_measure(&detected, &beats, BEAT_TOLERANCE),
        "vurus_f_kirpik": f_measure(&trimmed(&detected), &trimmed(&beats), BEAT_TOLERANCE),
        "olcu_basi_f": if downbeats.is_empty() {
            Value::Null
        } else {
            json!(f_measure(&detected_down, &downbeats, BEAT_TOLERANCE))
        },
        "bpm": bpm,
        "gercek_bpm": truth_bpm,
        "acc1": acc1,
        "acc2": acc2,
        "olcu": meter,
        "olcu_guveni": meter_confidence,
        "analiz_sn": seconds,
    })
}

fn mean(values: impl Iterator<Item = f64>) -> Option<f64> {
    let (sum, n) = values.fold((0.0, 0usize), |(s, n), v| (s + v, n + 1));
    (n > 0).then(|| sum / n as f64)
}

/// Tür başına ve toplam ortalamalar (Markdown tablosu).
fn report(all: &[Value]) -> String {
    let mut groups: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    for v in all.iter().filter(|v| v.get("hata").is_none()) {
        let genre = v["tur"].as_str().unwrap_or("-").to_owned();
        groups.entry(genre).or_default().push(v);
        groups.entry("HEPSİ".to_owned()).or_default().push(v);
    }
    let errors = all.iter().filter(|v| v.get("hata").is_some()).count();
    let f = |rows: &[&Value], key: &str| mean(rows.iter().filter_map(|v| v[key].as_f64()));
    let rate = |rows: &[&Value], key: &str| {
        mean(
            rows.iter()
                .filter_map(|v| v[key].as_bool())
                .map(|b| if b { 1.0 } else { 0.0 }),
        )
    };
    let show = |x: Option<f64>| x.map_or("-".to_owned(), |x| format!("{x:.3}"));
    let mut out = String::from(
        "| Tür | Şarkı | Vuruş F | Vuruş F (5 sn kırpık) | Ölçü başı F | ACC1 | ACC2 |\n\
         |---|---|---|---|---|---|---|\n",
    );
    for (genre, rows) in &groups {
        out.push_str(&format!(
            "| {genre} | {} | {} | {} | {} | {} | {} |\n",
            rows.len(),
            show(f(rows, "vurus_f")),
            show(f(rows, "vurus_f_kirpik")),
            show(f(rows, "olcu_basi_f")),
            show(rate(rows, "acc1")),
            show(rate(rows, "acc2")),
        ));
    }
    out.push_str(&format!(
        "\nHata (açılamayan ya da işareti okunamayan): {errors}\n"
    ));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tempo_dogrulugu_tanimdaki_gibi() {
        // ACC1: ±%4; ACC2: ayrıca ×2, ×½, ×3, ×⅓.
        assert_eq!(tempo_accuracy(124.0, 120.0), (true, true));
        assert_eq!(tempo_accuracy(125.0, 120.0), (false, false));
        assert_eq!(tempo_accuracy(240.0, 120.0), (false, true));
        assert_eq!(tempo_accuracy(60.0, 120.0), (false, true));
        assert_eq!(tempo_accuracy(40.0, 120.0), (false, true));
        assert_eq!(tempo_accuracy(180.0, 120.0), (false, false));
    }

    #[test]
    fn isaret_dosyasi_ve_kirpma() {
        let dir = std::env::temp_dir().join(format!("ritim-olcum-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("deneme.beats");
        std::fs::write(&path, "0.5 1\n1.0 2\n4.9 3\n5.4 1\n\nbozuk satir\n6.0\n").unwrap();
        let (beats, downbeats) = read_marks(&path).unwrap();
        assert_eq!(beats, vec![0.5, 1.0, 4.9, 5.4, 6.0]);
        assert_eq!(downbeats, vec![0.5, 5.4]);
        assert_eq!(trimmed(&beats), vec![5.4, 6.0]);
    }
}
