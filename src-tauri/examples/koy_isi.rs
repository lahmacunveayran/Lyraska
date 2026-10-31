//! "Köy işi": müzik kütüphanesini saatlerce, gözetimsiz ölçer (araştırma aracı; ses ve sonuçlar
//! depoya girmez).
//!
//! Kullanım: `cargo run --release --example koy_isi -- <müzik klasörü> <sonuç klasörü> [söz paketi]`.
//! Her şarkı ayrı bir süreçte (`--tek`) ölçülür: biri çökerse ya da 20 dakikayı aşarsa yalnızca o
//! şarkı "hata" yazılır, iş sürer. Sonuçlar `sonuclar.jsonl`'a satır satır eklenir; iş yarıda
//! kalırsa (elektrik kesildi, bilgisayar yeniden başladı) yeniden başlatınca kaldığı yerden sürer.
//! Her şarkı için:
//! - analiz: tempo, ölçü, bölümler, droplar, ton, ses yüksekliği ve süreleri;
//! - ses yolu: eşitleme açık, +6 dB bas (80 Hz) ile bütün şarkı oluşturucudan geçer; çıkışın
//!   tepesi, sınırlayıcının tavanını aşan örnek, NaN ve hız;
//! - sözler (söz paketi verildiyse ve şarkının yanında aynı adla `.lrc` ya da `.txt` varsa):
//!   `soz_hizalama` aracı çalışır; `.lrc`'nin zamanları varsa bulunan zamanlarla karşılaştırılır.
//!
//! Sonda `rapor.md`: özet, uyarılar ve aynı şarkının iki biçimini (`.m4a` / `.mka`) karşılaştırma.
use lyraska_lib::analysis::spectrogram::{analyze, Spectrogram};
use lyraska_lib::audio::decode::Decoder;
use lyraska_lib::audio::limiter::CEILING;
use lyraska_lib::audio::normalize::LoudnessControl;
use lyraska_lib::audio::peq::PeqControl;
use lyraska_lib::audio::peq::{DesignMethod, FilterKind, ParametricBand, ParametricSettings};
use lyraska_lib::audio::render::{RenderControls, Renderer};
use lyraska_lib::audio::Sample;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

const AUDIO: [&str; 10] = [
    "m4a", "mka", "mp3", "flac", "opus", "ogg", "wav", "aac", "mp4", "webm",
];
const TIMEOUT: Duration = Duration::from_secs(20 * 60);

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--tek") {
        let Some(path) = args.get(2) else { return };
        println!("{}", measure(Path::new(path)));
        return;
    }
    if args.len() < 3 {
        eprintln!("kullanım: koy_isi <müzik klasörü> <sonuç klasörü> [söz paketi klasörü]");
        std::process::exit(2);
    }
    let music = PathBuf::from(&args[1]);
    let out = PathBuf::from(&args[2]);
    let package = args.get(3).map(PathBuf::from);
    if let Err(e) = std::fs::create_dir_all(out.join("sozler")) {
        eprintln!("sonuç klasörü açılamadı: {e}");
        std::process::exit(1);
    }
    let results = out.join("sonuclar.jsonl");
    let done: HashSet<String> = read_results(&results)
        .iter()
        .filter_map(|v| v["yol"].as_str().map(str::to_owned))
        .collect();
    let mut songs: Vec<PathBuf> = std::fs::read_dir(&music)
        .map(|r| r.filter_map(Result::ok).map(|e| e.path()).collect())
        .unwrap_or_default();
    songs.retain(|p| {
        p.extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| AUDIO.contains(&e.to_lowercase().as_str()))
    });
    songs.sort();
    let me = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("koy_isi"));
    let aligner = me.with_file_name(if cfg!(windows) {
        "soz_hizalama.exe"
    } else {
        "soz_hizalama"
    });
    let started = Instant::now();
    let total = songs.len();
    for (i, song) in songs.iter().enumerate() {
        let key = song.to_string_lossy().into_owned();
        if done.contains(&key) {
            continue;
        }
        let t = Instant::now();
        let mut line = match run_child(Command::new(&me).arg("--tek").arg(song), TIMEOUT) {
            Ok(text) => {
                serde_json::from_str::<Value>(text.split('\u{0}').next().unwrap_or("").trim())
                    .unwrap_or_else(|_| json!({ "hata": "çıktı okunamadı" }))
            }
            Err(e) => json!({ "hata": e }),
        };
        line["yol"] = json!(key);
        if let Some(package) = &package {
            if let Some(lyrics) = lyrics_for(song, &line) {
                line["soz"] = lyrics_test(&aligner, package, song, &lyrics, &out);
            }
        }
        append(&results, &line);
        let name = song.file_name().unwrap_or_default().to_string_lossy();
        let status = if line.get("hata").is_some() {
            "HATA"
        } else {
            "tamam"
        };
        println!(
            "[{}/{total}] {status} {:.0} sn · {name} (toplam {:.0} dk)",
            i + 1,
            t.elapsed().as_secs_f64(),
            started.elapsed().as_secs_f64() / 60.0
        );
    }
    let all = read_results(&results);
    let report = report(&all);
    if let Err(e) = std::fs::write(out.join("rapor.md"), report) {
        eprintln!("rapor yazılamadı: {e}");
    }
    println!(
        "Bitti: {} şarkı. Rapor: {}",
        all.len(),
        out.join("rapor.md").display()
    );
}

/// Çocuk süreci çalıştırır; süreyi aşarsa öldürür. Başarılıysa standart çıktısı.
fn run_child(cmd: &mut Command, limit: Duration) -> Result<String, String> {
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("başlatılamadı: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let reader = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut s) = stdout {
            std::io::Read::read_to_string(&mut s, &mut text).ok();
        }
        text
    });
    let err_reader = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut s) = stderr {
            std::io::Read::read_to_string(&mut s, &mut text).ok();
        }
        text
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let text = reader.join().unwrap_or_default();
                let err = err_reader.join().unwrap_or_default();
                return if status.success() {
                    Ok(text + "\u{0}" + &err)
                } else {
                    Err(format!("çöktü ({status}): {}", last_line(&err)))
                };
            }
            Ok(None) if start.elapsed() > limit => {
                child.kill().ok();
                child.wait().ok();
                return Err(format!("{} dk'yı aştı", limit.as_secs() / 60));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(e) => return Err(format!("beklenemedi: {e}")),
        }
    }
}

fn last_line(text: &str) -> String {
    text.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .chars()
        .take(300)
        .collect()
}

fn read_results(path: &Path) -> Vec<Value> {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn append(path: &Path, line: &Value) {
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path);
    if let Ok(mut file) = file {
        writeln!(file, "{line}").ok();
        file.sync_all().ok();
    }
}

/// Tek şarkının analizi ve ses yolu ölçümü (ayrı süreçte).
fn measure(path: &Path) -> Value {
    let t = Instant::now();
    let decoder = match Decoder::open(path) {
        Ok(d) => d,
        Err(e) => return json!({ "hata": format!("açılamadı: {e}") }),
    };
    let info = decoder.info().clone();
    let spectrogram = Spectrogram::new();
    analyze(decoder, &spectrogram);
    let analysis_secs = t.elapsed().as_secs_f64();
    let grid = spectrogram.beat_grid();
    let map = spectrogram.song_map();
    let key = spectrogram.key().and_then(|k| k.key);
    let loudness = spectrogram.loudness();
    let mut v = json!({
        "sure": info.duration_secs,
        "kodek": info.codec,
        "hiz": info.sample_rate,
        "kanal": info.channels,
        "analiz_sn": analysis_secs,
        "kesik": spectrogram.is_truncated(),
        "bpm": grid.as_ref().map(|g| g.bpm),
        "degisken_tempo": grid.as_ref().map(|g| g.variable_tempo),
        "vurus": grid.as_ref().map(|g| g.beats.len()),
        "olcu": map.as_ref().map(|m| m.meter),
        "olcu_guveni": map.as_ref().map(|m| m.meter_confidence),
        "bolum": map.as_ref().map(|m| m.sections.len()),
        "drop": map.as_ref().map(|m| m.drops.clone()),
        "drop_guveni": map.as_ref().map(|m| m.drop_confidence.clone()),
        "ton": key.map(|k| k.camelot_code()),
        "ton_guveni": key.map(|k| k.confidence),
        "lufs": loudness.map(|l| l.integrated_lufs),
        "tepe_dbtp": loudness.map(|l| l.true_peak_dbtp),
    });
    v["ses_yolu"] = render_pass(path, &spectrogram);
    v
}

/// Bütün şarkıyı eşitleme açık, +6 dB basla oluşturucudan geçirir.
fn render_pass(path: &Path, spectrogram: &Spectrogram) -> Value {
    let Ok(mut decoder) = Decoder::open(path) else {
        return json!({ "hata": "açılamadı" });
    };
    let channels = decoder.info().channels.max(1);
    let rate = decoder.info().sample_rate;
    let settings = ParametricSettings {
        enabled: true,
        bands: vec![ParametricBand {
            kind: FilterKind::Peaking,
            freq_hz: 80.0,
            gain_db: 6.0,
            q: 0.7,
            enabled: true,
        }],
        design: DesignMethod::default(),
    };
    let parametric = Arc::new(PeqControl::default());
    parametric.set_filters(
        &settings.filters(),
        0.0,
        settings.boost_db(),
        settings.design,
        true,
    );
    let controls = RenderControls {
        parametric,
        loudness: Arc::new(LoudnessControl::new(true)),
        ..RenderControls::default()
    };
    controls.levels.set_loudness(0, spectrogram.loudness());
    if let Some(peaks) = spectrogram.bass_peaks() {
        controls.levels.set_bass_peaks(0, &peaks);
    }
    let mut renderer = Renderer::new(channels, rate, controls);
    let (mut producer, mut consumer) = rtrb::RingBuffer::<Sample>::new(1 << 20);
    let mut out = vec![0.0; 1024 * channels];
    let (mut peak, mut over, mut nan, mut missing, mut frames) = (0.0f64, 0u64, 0u64, 0usize, 0u64);
    let t = Instant::now();
    let mut drain = |consumer: &mut rtrb::Consumer<Sample>, all: bool| {
        while consumer.slots() >= out.len() || (all && consumer.slots() > 0) {
            let n = if consumer.slots() >= out.len() {
                out.len()
            } else {
                consumer.slots() - consumer.slots() % channels
            };
            if n == 0 {
                break;
            }
            let outcome = renderer.render(consumer, &mut out[..n], false);
            missing += outcome.frames_missing;
            frames += outcome.frames_consumed as u64;
            for &s in &out[..n] {
                if s.is_nan() {
                    nan += 1;
                }
                let a = s.abs();
                peak = peak.max(a);
                if a > CEILING + 1e-6 {
                    over += 1;
                }
            }
        }
    };
    loop {
        match decoder.next_chunk() {
            Ok(Some(chunk)) => {
                let mut rest = chunk;
                while !rest.is_empty() {
                    let take = rest.len().min(producer.slots());
                    for &s in &rest[..take] {
                        producer.push(s).ok();
                    }
                    rest = &rest[take..];
                    drain(&mut consumer, false);
                }
            }
            Ok(None) => break,
            Err(e) => return json!({ "hata": format!("çözme: {e}") }),
        }
    }
    drain(&mut consumer, true);
    let secs = t.elapsed().as_secs_f64();
    let audio_secs = frames as f64 / f64::from(rate.max(1));
    json!({
        "tepe_dbfs": 20.0 * peak.max(1e-12).log10(),
        "tavani_asan": over,
        "nan": nan,
        "eksik_kare": missing,
        "gercek_zaman_kati": if secs > 0.0 { audio_secs / secs } else { 0.0 },
    })
}

/// Şarkının yanındaki söz dosyası: önce `.lrc`, sonra `.txt`.
fn lyrics_for(song: &Path, line: &Value) -> Option<PathBuf> {
    if line.get("hata").is_some() {
        return None;
    }
    let lrc = song.with_extension("lrc");
    if lrc.is_file() {
        return Some(lrc);
    }
    let stem = song.file_stem()?.to_string_lossy().into_owned();
    // yt-dlp adları "sıra - başlık": liste sırası değiştiyse altyazı yalnızca başlıkla eşleşir.
    let title = |name: &str| -> String {
        let name = name.split_once(" - ").map_or(name, |(n, rest)| {
            if n.chars().all(|c| c.is_ascii_digit()) {
                rest
            } else {
                name
            }
        });
        name.to_owned()
    };
    let want = title(&stem);
    let mut subs: Vec<PathBuf> = std::fs::read_dir(song.parent()?)
        .ok()?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            let name = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            (name.ends_with(".srt") || name.ends_with(".vtt"))
                && name.split('.').next().is_some()
                && name
                    .rsplitn(3, '.')
                    .nth(2)
                    .is_some_and(|base| base == stem || title(base) == want)
        })
        .collect();
    // Türkçe ve İngilizce önce, elle yazılmış altyazı otomatikten önce (yt-dlp otomatiği "-orig" vb.).
    subs.sort_by_key(|p| {
        let name = p.to_string_lossy().to_lowercase();
        (!name.contains(".tr."), !name.contains(".en"), name)
    });
    subs.into_iter()
        .next()
        .or_else(|| Some(song.with_extension("txt")).filter(|p| p.is_file()))
}

/// SRT/VTT altyazısı → (başlangıç saniyesi, metin); etiketler ve art arda tekrarlar atılır
/// (otomatik altyazıda her satır kayarak iki kez gelir).
fn subtitle_lines(text: &str) -> Vec<(f64, String)> {
    fn stamp(s: &str) -> Option<f64> {
        let s = s.trim().replace(',', ".");
        let mut total = 0.0;
        for part in s.split(':') {
            total = total * 60.0 + part.parse::<f64>().ok()?;
        }
        Some(total)
    }
    let mut lines: Vec<(f64, String)> = Vec::new();
    let mut start: Option<f64> = None;
    for raw in text.lines() {
        let l = raw.trim();
        if let Some((a, _)) = l.split_once("-->") {
            start = stamp(a.split_whitespace().next().unwrap_or(""));
            continue;
        }
        let Some(t) = start else { continue };
        if l.is_empty() {
            start = None;
            continue;
        }
        let mut clean = String::new();
        let mut in_tag = false;
        for c in l.chars() {
            match c {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => clean.push(c),
                _ => {}
            }
        }
        let clean = clean
            .replace(['♪', '♫'], "")
            .replace("&amp;", "&")
            .trim()
            .to_owned();
        if clean.is_empty() || clean.starts_with('[') || clean.starts_with('(') {
            continue;
        }
        if lines.iter().rev().take(2).any(|(_, last)| *last == clean) {
            continue;
        }
        lines.push((t, clean));
    }
    lines
}

/// `[dd:ss.cc]` zamanlarını ayıklar: (saniye, metin).
fn lrc_lines(text: &str) -> Vec<(f64, String)> {
    let mut lines = Vec::new();
    for raw in text.lines() {
        let mut rest = raw.trim();
        let mut times = Vec::new();
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let tag = &stripped[..end];
            if let Some((m, s)) = tag.split_once(':') {
                if let (Ok(m), Ok(s)) = (m.trim().parse::<f64>(), s.trim().parse::<f64>()) {
                    times.push(m * 60.0 + s);
                }
            }
            rest = stripped[end + 1..].trim();
        }
        if !rest.is_empty() {
            for t in times {
                lines.push((t, rest.to_owned()));
            }
        }
    }
    lines.sort_by(|a, b| a.0.total_cmp(&b.0));
    lines
}

fn normalized(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Sözleri sese oturtur (`soz_hizalama`); `.lrc` zamanlıysa farkları ölçer.
fn lyrics_test(aligner: &Path, package: &Path, song: &Path, lyrics: &Path, out: &Path) -> Value {
    let text = std::fs::read_to_string(lyrics).unwrap_or_default();
    let ext = lyrics.extension().and_then(|e| e.to_str()).unwrap_or("");
    let timed = if ext == "srt" || ext == "vtt" {
        subtitle_lines(&text)
    } else {
        lrc_lines(&text)
    };
    // Zamanlı sözün zamanları silinir: araç sözleri zamansız görür, sonuç gerçek zamanla kıyaslanır.
    let plain_path = out.join("sozler").join("girdi.txt");
    let plain = if timed.is_empty() {
        text.clone()
    } else {
        timed
            .iter()
            .map(|(_, l)| l.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    };
    if std::fs::write(&plain_path, &plain).is_err() {
        return json!({ "hata": "söz yazılamadı" });
    }
    let t = Instant::now();
    let result = run_child(
        Command::new(aligner)
            .arg(package)
            .arg(song)
            .arg(&plain_path),
        TIMEOUT,
    );
    let secs = t.elapsed().as_secs_f64();
    let output = match result {
        Ok(text) => text,
        Err(e) => return json!({ "hata": e, "sn": secs }),
    };
    let (stdout, stderr) = output.split_once('\u{0}').unwrap_or((&output, ""));
    let name = song
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    std::fs::write(out.join("sozler").join(format!("{name}.lrc")), stdout).ok();
    // "[dd:ss.cc]X g  metin": X boşluk, "~" tahmini, "-" atlandı.
    let found: Vec<(f64, char, String)> = stdout
        .lines()
        .filter_map(|l| {
            let times = lrc_lines(&l.replace("]~", "] ").replace("]-", "] "));
            let mark = l
                .find(']')
                .and_then(|i| l[i + 1..].chars().next())
                .unwrap_or(' ');
            // "]" + işaret + " " + güven + "  " + metin.
            let after = l[l.find(']')? + 1..].trim_start_matches(['~', '-', ' ']);
            let text = after.split_once("  ")?.1.trim().to_owned();
            times.first().map(|(t, _)| (*t, mark, text))
        })
        .collect();
    let skipped = found.iter().filter(|f| f.1 == '-').count();
    let estimated = found.iter().filter(|f| f.1 == '~').count();
    let mut errors = Vec::new();
    let mut j = 0;
    for (t, _, text) in found.iter().filter(|f| f.1 != '-') {
        let want = normalized(text);
        if let Some(k) = timed[j.min(timed.len())..]
            .iter()
            .position(|(_, l)| normalized(l) == want)
        {
            errors.push(t - timed[j + k].0);
            j += k + 1;
        }
    }
    let mut abs: Vec<f64> = errors.iter().map(|e| e.abs()).collect();
    abs.sort_by(f64::total_cmp);
    json!({
        "kaynak": lyrics.file_name().map(|n| n.to_string_lossy().into_owned()),
        "satir": found.len(),
        "atlanan": skipped,
        "tahmini": estimated,
        "sn": secs,
        "ozet": last_line(stderr),
        "karsilastirilan": abs.len(),
        "ortanca_hata_sn": abs.get(abs.len() / 2),
        "yarim_sn_icinde": abs.iter().filter(|&&e| e <= 0.5).count(),
        "bir_sn_icinde": abs.iter().filter(|&&e| e <= 1.0).count(),
    })
}

fn f(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64)
}

/// Sonuçlardan Türkçe özet rapor.
fn report(all: &[Value]) -> String {
    let ok: Vec<&Value> = all.iter().filter(|v| v.get("hata").is_none()).collect();
    let mut r = String::new();
    let mut add = |s: String| {
        r.push_str(&s);
        r.push('\n');
    };
    add("# Köy işi raporu\n".into());
    add(format!(
        "- Şarkı: {} (ölçülen {}, hatalı {})",
        all.len(),
        ok.len(),
        all.len() - ok.len()
    ));
    let audio: f64 = ok.iter().filter_map(|v| f(v, "sure")).sum();
    let analysis: f64 = ok.iter().filter_map(|v| f(v, "analiz_sn")).sum();
    add(format!(
        "- Ses {:.1} saat; analiz {:.1} dk ({:.0}× gerçek zaman)",
        audio / 3600.0,
        analysis / 60.0,
        audio / analysis.max(1e-9)
    ));
    let mut bpm: BTreeMap<u32, usize> = BTreeMap::new();
    for v in &ok {
        if let Some(b) = f(v, "bpm") {
            *bpm.entry((b / 10.0) as u32 * 10).or_default() += 1;
        }
    }
    add(format!(
        "- Tempo dağılımı (10'luk): {}",
        bpm.iter()
            .map(|(k, n)| format!("{k}: {n}"))
            .collect::<Vec<_>>()
            .join(", ")
    ));
    let count = |p: &dyn Fn(&Value) -> bool| ok.iter().filter(|v| p(v)).count();
    add(format!(
        "- Tempo yok: {}; değişken tempo: {}; ölçü güveni < 0,5: {}; ton güvensiz (< 0,3) ya da yok: {}; drop yok: {}; kesik analiz: {}",
        count(&|v| f(v, "bpm").is_none()),
        count(&|v| v["degisken_tempo"].as_bool() == Some(true)),
        count(&|v| f(v, "olcu_guveni").is_some_and(|c| c < 0.5)),
        count(&|v| f(v, "ton_guveni").is_none_or(|c| c < 0.3)),
        count(&|v| v["drop"].as_array().is_none_or(Vec::is_empty)),
        count(&|v| v["kesik"].as_bool() == Some(true)),
    ));
    let render: Vec<&Value> = ok
        .iter()
        .map(|v| &v["ses_yolu"])
        .filter(|v| v.get("hata").is_none())
        .collect();
    let worst = render
        .iter()
        .filter_map(|v| f(v, "tepe_dbfs"))
        .fold(f64::MIN, f64::max);
    let mut speed: Vec<f64> = render
        .iter()
        .filter_map(|v| f(v, "gercek_zaman_kati"))
        .collect();
    speed.sort_by(f64::total_cmp);
    add(format!(
        "- Ses yolu (eşitleme + 80 Hz'te +6 dB): en yüksek çıkış {worst:.2} dBFS; tavanı aşan örneği olan şarkı {}; NaN'lı {}; eksik kareli {}; hız en yavaş {:.0}×, ortanca {:.0}×",
        render.iter().filter(|v| v["tavani_asan"].as_u64().unwrap_or(0) > 0).count(),
        render.iter().filter(|v| v["nan"].as_u64().unwrap_or(0) > 0).count(),
        render.iter().filter(|v| v["eksik_kare"].as_u64().unwrap_or(0) > 0).count(),
        speed.first().copied().unwrap_or(0.0),
        speed.get(speed.len() / 2).copied().unwrap_or(0.0),
    ));
    let lyrics: Vec<&Value> = ok.iter().filter_map(|v| v.get("soz")).collect();
    if !lyrics.is_empty() {
        let compared: u64 = lyrics
            .iter()
            .filter_map(|v| v["karsilastirilan"].as_u64())
            .sum();
        let half: u64 = lyrics
            .iter()
            .filter_map(|v| v["yarim_sn_icinde"].as_u64())
            .sum();
        let one: u64 = lyrics
            .iter()
            .filter_map(|v| v["bir_sn_icinde"].as_u64())
            .sum();
        add(format!(
            "- Sözler: {} şarkı; zamanlı sözle karşılaştırılan {compared} satır, ±0,5 sn içinde {half}, ±1 sn içinde {one}",
            lyrics.len()
        ));
    }
    add("\n## Hatalar\n".into());
    for v in all.iter().filter(|v| v.get("hata").is_some()) {
        add(format!(
            "- {}: {}",
            v["yol"].as_str().unwrap_or("?"),
            v["hata"]
        ));
    }
    // Aynı kaydın iki biçimi (aynı ad, farklı uzantı): sonuçlar aynı olmalı.
    add("\n## Aynı şarkının iki biçimi\n".into());
    let mut groups: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    for v in &ok {
        let stem = Path::new(v["yol"].as_str().unwrap_or(""))
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        groups.entry(stem).or_default().push(v);
    }
    let mut pairs = 0;
    for (name, list) in groups.iter().filter(|(_, l)| l.len() > 1) {
        pairs += 1;
        let show = |v: &Value| {
            format!(
                "{} bpm {:.1}, ton {}, drop {}",
                v["kodek"].as_str().unwrap_or("?"),
                f(v, "bpm").unwrap_or(0.0),
                v["ton"].as_str().unwrap_or("-"),
                v["drop"].as_array().map_or(0, Vec::len)
            )
        };
        add(format!(
            "- {name}: {}",
            list.iter().map(|v| show(v)).collect::<Vec<_>>().join(" | ")
        ));
    }
    add(format!("\n{pairs} çift."));
    r
}
