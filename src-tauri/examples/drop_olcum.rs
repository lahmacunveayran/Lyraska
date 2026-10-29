//! Drop bulmayı ve tempoyu bilinen sonuçlu şarkılarda ölçer (araştırma aracı; ses depoya girmez).
//!
//! Kullanım: `cargo run --release --example drop_olcum -- <klasör> [--ayrinti]`. Klasörde her
//! `ad.json` için `ad.flac` (ya da `.wav`, `.mp3`, `.opus`) ya da önceden yazılmış `ad.kare`:
//! `{"drops": [sn, ...], "sahte": [sn, ...], "belirsiz": [sn, ...], "tur": "...", "bpm": tempo}`
//! (`sahte`, `belirsiz`, `tur`, `bpm` isteğe bağlı; `docs/arastirma/drop/uret2.py` üretir).
//!
//! Şarkı bir kez çözülür; analiz kareleri `ad.kare`'ye yazılır (ses dosyası silinse de ölçüm
//! yeniden yapılabilir). Ritim, şarkı haritası ve droplar programdaki önbellek gibi karelerden
//! hesaplanır.
//!
//! Ölçütler (`docs/arastirma/drop/MODEL.md`): yalnızca ekranda gösterilen droplar (güven ≥
//! `DROP_CONFIDENCE_MIN`) sayılır. Her işaretli drop'a en çok bir bulunan drop eşlenir (en yakın).
//! - isabet ±1 vuruş ve isabet ±50 ms (ayrı ayrı); ±1 sn eski ölçüttür,
//! - kaçan: ±1 vuruşta gösterilen drop yok,
//! - yanlış drop: hiçbir işaretli drop'a ±1 vuruş içinde eşlenmeyen gösterilen drop (sahte drop'a
//!   denk gelen ayrı sayılır, belirsiz geçişe ±1 sn içinde denk gelen sayılmaz),
//! - sahteyi drop sayma: sahte drop'a ±1 vuruş içinde gösterilen drop,
//! - zaman hatası: ±1 ölçü içinde gösterilen droplarda |bulunan − işaretli| (ortanca, %90).

use lyraska_lib::analysis::drop::FEATURES;
use lyraska_lib::analysis::spectrogram::{analyze, drop_research_from_frames, Spectrogram};
use lyraska_lib::analysis::structure::DROP_CONFIDENCE_MIN;
use lyraska_lib::audio::decode::Decoder;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Default, Clone)]
struct Tally {
    songs: usize,
    marked: usize,
    hit_beat: usize,
    hit_50: usize,
    hit_1s: usize,
    false_drops: usize,
    fakes: usize,
    fake_counted: usize,
    dropless_songs: usize,
    dropless_false: usize,
    dropless_songs_with_false: usize,
    errors: Vec<f64>,
}

impl Tally {
    fn add(&mut self, o: &Tally) {
        self.songs += o.songs;
        self.marked += o.marked;
        self.hit_beat += o.hit_beat;
        self.hit_50 += o.hit_50;
        self.hit_1s += o.hit_1s;
        self.false_drops += o.false_drops;
        self.fakes += o.fakes;
        self.fake_counted += o.fake_counted;
        self.dropless_songs += o.dropless_songs;
        self.dropless_false += o.dropless_false;
        self.dropless_songs_with_false += o.dropless_songs_with_false;
        self.errors.extend(&o.errors);
    }

    fn quantile(&self, q: f64) -> String {
        let mut e = self.errors.clone();
        e.sort_by(f64::total_cmp);
        e.get(((e.len() as f64 - 1.0) * q).round() as usize)
            .map_or("-".into(), |v| format!("{:.0}", v * 1000.0))
    }

    fn row(&self, name: &str) -> String {
        let fakes = if self.fakes > 0 {
            format!("{}/{}", self.fake_counted, self.fakes)
        } else {
            "-".into()
        };
        let dropless = if self.dropless_songs > 0 {
            format!(
                "{} ({}/{} şarkı)",
                self.dropless_false, self.dropless_songs_with_false, self.dropless_songs
            )
        } else {
            "-".into()
        };
        let marked = |n: usize| {
            if self.marked > 0 {
                format!("{n}/{}", self.marked)
            } else {
                "-".into()
            }
        };
        format!(
            "| {name} | {} | {} | {} | {} | {} | {} | {fakes} | {dropless} | {} | {} |",
            self.songs,
            marked(self.hit_beat),
            marked(self.hit_50),
            marked(self.hit_1s),
            self.marked - self.hit_beat,
            self.false_drops,
            self.quantile(0.5),
            self.quantile(0.9),
        )
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args.next().unwrap_or_else(|| ".".into());
    let rest: Vec<String> = args.collect();
    let detail = rest.iter().any(|a| a == "--ayrinti");
    // Araştırma: her vuruşun drop özelliklerini `ad.oz.json`'a yazar (ağırlıkları uydurmak için).
    let features_dir = rest
        .iter()
        .position(|a| a == "--oz")
        .and_then(|i| rest.get(i + 1))
        .map(PathBuf::from);
    let mut truths: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|r| r.filter_map(Result::ok).map(|e| e.path()).collect())
        .unwrap_or_default();
    truths.retain(|p| {
        p.extension().is_some_and(|e| e == "json")
            && p.file_stem()
                .is_some_and(|s| !s.to_string_lossy().contains('.'))
    });
    truths.sort();
    // Yöntem başına (eski, yeni) tür tür sayım.
    let mut tables: [BTreeMap<String, Tally>; 2] = [BTreeMap::new(), BTreeMap::new()];
    let (mut bpm_total, mut bpm_ok) = (0usize, 0usize);
    for truth_path in truths {
        let Ok(text) = std::fs::read_to_string(&truth_path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let list = |key: &str| -> Vec<f64> {
            json.get(key)
                .cloned()
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default()
        };
        let truth = Truth {
            drops: list("drops"),
            fakes: list("sahte"),
            unsure: list("belirsiz"),
            bpm: json.get("bpm").and_then(serde_json::Value::as_f64),
            dropless: json
                .get("dropsuz")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(list("drops").is_empty()),
        };
        let kind = json
            .get("tur")
            .and_then(|v| v.as_str())
            .unwrap_or("?")
            .to_owned();
        let Some(frames) = load_frames(&truth_path) else {
            eprintln!("{}: açılamadı", truth_path.display());
            continue;
        };
        let Some((grid, map, research)) =
            drop_research_from_frames(&frames.levels, &frames.meters, &frames.onset, frames.rate)
        else {
            eprintln!("{}: vuruş bulunamadı", truth_path.display());
            continue;
        };
        if let (Some(dir), Some(name)) = (&features_dir, truth_path.file_stem()) {
            let json = serde_json::json!({
                "beats": grid.beats, "features": research.features, "names": FEATURES,
            });
            let _ = std::fs::write(dir.join(name).with_extension("oz.json"), json.to_string());
        }
        let new: Vec<(f64, f32)> = map
            .drops
            .iter()
            .copied()
            .zip(map.drop_confidence.iter().copied())
            .collect();
        let name = truth_path
            .file_stem()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        for (method, found) in [&research.legacy_drops, &new].into_iter().enumerate() {
            let tally = score(&truth, found);
            if detail {
                let list: Vec<String> = found
                    .iter()
                    .map(|(t, c)| format!("{t:.2}({c:.2})"))
                    .collect();
                println!(
                    "{} {name}: işaretli {:?} sahte {:?} · bulunan {} · ±vuruş {}/{} · ±50 ms {} · yanlış {} · sahte sayılan {}",
                    ["eski", "yeni"][method],
                    truth.drops,
                    truth.fakes,
                    list.join(" "),
                    tally.hit_beat,
                    truth.drops.len(),
                    tally.hit_50,
                    tally.false_drops,
                    tally.fake_counted,
                );
            }
            tables[method].entry(kind.clone()).or_default().add(&tally);
        }
        if let Some(want) = truth.bpm {
            bpm_total += 1;
            bpm_ok += usize::from((grid.bpm / want - 1.0).abs() <= 0.02);
        }
    }
    for (method, table) in tables.iter().enumerate() {
        println!();
        println!("{}", ["Eski yöntem", "Yeni model"][method]);
        println!();
        println!(
            "| Tür | Şarkı | İsabet ±1 vuruş | İsabet ±50 ms | İsabet ±1 sn | Kaçan | Yanlış drop | Sahteyi drop sayma | Dropsuzda yanlış | Hata ortanca (ms) | Hata %90 (ms) |"
        );
        println!("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
        let mut total = Tally::default();
        for (kind, tally) in table {
            println!("{}", tally.row(kind));
            total.add(tally);
        }
        println!("{}", total.row("**Toplam**"));
    }
    if bpm_total > 0 {
        println!();
        println!("Tempo (±%2): doğru {bpm_ok}/{bpm_total}");
    }
}

/// Bir şarkının doğru cevapları.
struct Truth {
    drops: Vec<f64>,
    fakes: Vec<f64>,
    unsure: Vec<f64>,
    bpm: Option<f64>,
    dropless: bool,
}

/// Bulunan dropları (saniye, güven) doğru cevaplara göre sayar.
fn score(truth: &Truth, found: &[(f64, f32)]) -> Tally {
    let beat = truth.bpm.map_or(0.5, |b| 60.0 / b);
    let shown: Vec<f64> = found
        .iter()
        .filter(|(_, c)| *c >= DROP_CONFIDENCE_MIN)
        .map(|(t, _)| *t)
        .collect();
    let mut tally = Tally {
        songs: 1,
        marked: truth.drops.len(),
        fakes: truth.fakes.len(),
        dropless_songs: usize::from(truth.dropless),
        ..Tally::default()
    };
    // Eşleme: her işaretli drop'a en yakın, henüz eşlenmemiş gösterilen drop.
    let mut used = vec![false; shown.len()];
    for &m in &truth.drops {
        let nearest = shown
            .iter()
            .enumerate()
            .filter(|(i, _)| !used[*i])
            .min_by(|a, b| (a.1 - m).abs().total_cmp(&(b.1 - m).abs()));
        if let Some((i, &d)) = nearest {
            let e = (d - m).abs();
            if e <= 4.0 * beat {
                tally.errors.push(e);
            }
            tally.hit_1s += usize::from(e <= 1.0);
            tally.hit_50 += usize::from(e <= 0.05);
            if e <= beat + 1e-9 {
                tally.hit_beat += 1;
                used[i] = true;
            }
        }
    }
    for (i, &d) in shown.iter().enumerate() {
        if used[i] {
            continue;
        }
        if truth.fakes.iter().any(|&f| (d - f).abs() <= beat + 1e-9) {
            tally.fake_counted += 1;
        } else if truth.unsure.iter().any(|&u| (d - u).abs() <= 1.0) {
            // Tartışmalı geçiş: ne isabet ne yanlış.
        } else {
            tally.false_drops += 1;
        }
    }
    if truth.dropless {
        tally.dropless_false = tally.false_drops;
        tally.dropless_songs_with_false = usize::from(tally.false_drops > 0);
    }
    tally
}

/// Analiz kareleri: bant seviyeleri, kanal seviyeleri, başlangıç gücü, örnekleme hızı.
struct Frames {
    levels: Vec<u8>,
    meters: Vec<u8>,
    onset: Vec<f32>,
    rate: u32,
}

/// Kareleri `ad.kare`'den okur; yoksa şarkıyı çözümleyip yazar.
fn load_frames(truth_path: &Path) -> Option<Frames> {
    let cache = truth_path.with_extension("kare");
    if let Some(frames) = std::fs::read(&cache).ok().and_then(|d| decode(&d)) {
        return Some(frames);
    }
    let audio = ["flac", "wav", "mp3", "opus", "ogg", "m4a"]
        .iter()
        .map(|e| truth_path.with_extension(e))
        .find(|p| p.exists())?;
    let spectrogram = Spectrogram::new();
    analyze(Decoder::open(&audio).ok()?, &spectrogram);
    let saved = spectrogram.saved()?;
    let frames = Frames {
        levels: saved.levels,
        meters: saved.meters,
        onset: saved.onset,
        rate: saved.sample_rate.unwrap_or(44_100),
    };
    let _ = std::fs::write(&cache, encode(&frames));
    Some(frames)
}

fn encode(f: &Frames) -> Vec<u8> {
    let mut out = b"KARE1".to_vec();
    out.extend(f.rate.to_le_bytes());
    for part in [&f.levels, &f.meters] {
        out.extend((part.len() as u64).to_le_bytes());
        out.extend(part.iter());
    }
    out.extend((f.onset.len() as u64).to_le_bytes());
    for v in &f.onset {
        out.extend(v.to_le_bytes());
    }
    out
}

struct Reader<'a> {
    data: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.data.get(self.at..self.at.checked_add(n)?)?;
        self.at += n;
        Some(s)
    }

    fn len(&mut self) -> Option<usize> {
        Some(u64::from_le_bytes(self.take(8)?.try_into().ok()?) as usize)
    }
}

fn decode(data: &[u8]) -> Option<Frames> {
    let mut r = Reader { data, at: 0 };
    if r.take(5)? != b"KARE1" {
        return None;
    }
    let rate = u32::from_le_bytes(r.take(4)?.try_into().ok()?);
    let n = r.len()?;
    let levels = r.take(n)?.to_vec();
    let n = r.len()?;
    let meters = r.take(n)?.to_vec();
    let n = r.len()?;
    let onset = r
        .take(n.checked_mul(4)?)?
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    Some(Frames {
        levels,
        meters,
        onset,
        rate,
    })
}
