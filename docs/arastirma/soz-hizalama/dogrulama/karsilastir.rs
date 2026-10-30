//! Rust hizalayıcıyı (src-tauri/src/analysis/lyrics_align.rs) Python'daki ölçülmüş yöntemle karşılaştırır.
#[path = "/home/user/Lyraska/src-tauri/src/analysis/lyrics_align.rs"]
#[allow(dead_code)]
mod lyrics_align;
use lyrics_align::*;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

fn auroc(bad_score: &[f64], bad: &[bool]) -> f64 {
    let mut idx: Vec<usize> = (0..bad_score.len()).collect();
    idx.sort_by(|&a, &b| bad_score[a].total_cmp(&bad_score[b]));
    let mut rank = vec![0.0; idx.len()];
    for (r, &i) in idx.iter().enumerate() { rank[i] = r as f64 + 1.0; }
    let p = bad.iter().filter(|&&b| b).count() as f64;
    let n = bad.len() as f64 - p;
    if p == 0.0 || n == 0.0 { return f64::NAN; }
    let s: f64 = (0..bad.len()).filter(|&i| bad[i]).map(|i| rank[i]).sum();
    (s - p * (p + 1.0) / 2.0) / (p * n)
}

fn main() {
    let out = std::path::Path::new("out");
    let vocab_json: Value = serde_json::from_str(&std::fs::read_to_string(out.join("vocab.json")).unwrap()).unwrap();
    let chars: Vec<String> = vocab_json["chars"].as_array().unwrap().iter().map(|c| c.as_str().unwrap().to_string()).collect();
    let mut letters = HashMap::new();
    let mut space = None;
    for (i, c) in chars.iter().enumerate() {
        if c == " " { space = Some(i + 1); } else { letters.insert(c.chars().next().unwrap(), i + 1); }
    }
    let vocab = Vocabulary { blank: 0, space, letters };
    let index: Vec<String> = serde_json::from_str(&std::fs::read_to_string(out.join("index.json")).unwrap()).unwrap();
    // (set, split) → satırlar: (rust hata, py hata, rust güven, py güven, rust-py fark)
    let mut rows: BTreeMap<(String, String), Vec<(f64, f64, f64, f64, f64)>> = BTreeMap::new();
    let mut verdicts: BTreeMap<String, usize> = BTreeMap::new();
    let mut total_secs = 0.0;
    let mut audio_secs = 0.0;
    for name in &index {
        let meta: Value = serde_json::from_str(&std::fs::read_to_string(out.join(format!("{name}.json"))).unwrap()).unwrap();
        let bytes = std::fs::read(out.join(format!("{name}.f32"))).unwrap();
        let log_probs: Vec<f32> = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
        let em = Emissions { frames: meta["frames"].as_u64().unwrap() as usize, columns: meta["cols"].as_u64().unwrap() as usize, log_probs, frame_secs: meta["dt"].as_f64().unwrap() };
        let lines: Vec<Vec<String>> = meta["lines"].as_array().unwrap().iter().map(|l| l.as_array().unwrap().iter().map(|w| w.as_str().unwrap().to_string()).collect()).collect();
        let t0 = std::time::Instant::now();
        let a = align(&em, &vocab, &lines).unwrap();
        total_secs += t0.elapsed().as_secs_f64();
        audio_secs += em.frames as f64 * em.frame_secs;
        *verdicts.entry(format!("{:?}", a.verdict)).or_default() += 1;
        if a.verdict != Verdict::Good {
            let truth = meta["truth"].as_array().unwrap();
            let errs: Vec<f64> = a.lines.iter().enumerate().filter_map(|(j, l)| truth.get(j).and_then(Value::as_f64).map(|t| (l.start - t).abs())).collect();
            let mean = errs.iter().sum::<f64>() / errs.len().max(1) as f64;
            let weak = a.lines.iter().filter(|l| l.low_confidence()).count();
            let half = a.lines.iter().filter(|l| l.skipped || l.confidence < UNALIGNED_CONFIDENCE).count();
            let big = errs.iter().filter(|&&e| e > 1.0).count();
            eprintln!("{:?} {} {} ort hata {:.2} sn, büyük hata {}/{}, tahmini {}, <0,5: {}", a.verdict, meta["set"], meta["sid"], mean, big, errs.len(), weak, half);
        }
        let key = (meta["set"].as_str().unwrap().to_string(), meta["split"].as_str().unwrap().to_string());
        let truth = meta["truth"].as_array().unwrap();
        for (j, line) in a.lines.iter().enumerate() {
            let (Some(tr), Some(py), Some(pc)) = (truth.get(j).and_then(Value::as_f64), meta["py_start"][j].as_f64(), meta["py_conf"][j].as_f64()) else { continue };
            rows.entry(key.clone()).or_default().push(((line.start - tr).abs(), (py - tr).abs(), if line.skipped { 0.0 } else { line.confidence }, pc, (line.start - py).abs()));
        }
    }
    let status = std::fs::read_to_string("/proc/self/status").unwrap();
    println!("tepe bellek: {}", status.lines().find(|l| l.starts_with("VmHWM")).unwrap());
    println!("hız: {:.1} sn hesap / {:.0} sn ses (gerçek zamanın {:.3} katı)", total_secs, audio_secs, total_secs / audio_secs);
    println!("şarkı hükmü: {verdicts:?}");
    println!("| set | bölüm | satır | ≤0,3 sn Rust | ≤0,3 sn Python | Rust≠Python (>1 kare) | AUROC Rust | AUROC Python | işaretli | yakalanan büyük hata | işaretsizde >1 sn |");
    println!("|---|---|---|---|---|---|---|---|---|---|---|");
    for ((set, split), r) in &rows {
        let n = r.len() as f64;
        let ok_r = r.iter().filter(|x| x.0 <= 0.3).count() as f64 / n * 100.0;
        let ok_p = r.iter().filter(|x| x.1 <= 0.3).count() as f64 / n * 100.0;
        let diff = r.iter().filter(|x| x.4 > 0.021).count();
        let bad: Vec<bool> = r.iter().map(|x| x.0 > 1.0).collect();
        let bad_p: Vec<bool> = r.iter().map(|x| x.1 > 1.0).collect();
        let au_r = auroc(&r.iter().map(|x| -x.2).collect::<Vec<_>>(), &bad);
        let au_p = auroc(&r.iter().map(|x| -x.3).collect::<Vec<_>>(), &bad_p);
        let flagged: Vec<bool> = r.iter().map(|x| x.2 < LOW_CONFIDENCE).collect();
        let caught = (0..r.len()).filter(|&i| flagged[i] && bad[i]).count();
        let unflag_bad = (0..r.len()).filter(|&i| !flagged[i] && bad[i]).count() as f64 / (0..r.len()).filter(|&i| !flagged[i]).count().max(1) as f64 * 100.0;
        println!("| {set} | {split} | {} | %{ok_r:.1} | %{ok_p:.1} | {diff} | {au_r:.3} | {au_p:.3} | %{:.1} | {caught}/{} | %{unflag_bad:.1} |", r.len(), flagged.iter().filter(|&&f| f).count() as f64 / n * 100.0, bad.iter().filter(|&&b| b).count());
    }
}
