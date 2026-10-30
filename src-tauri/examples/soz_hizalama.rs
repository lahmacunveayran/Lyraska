//! Sözleri sese oturtmayı uçtan uca dener (araştırma ve hız ölçüm aracı; ses depoya girmez).
//!
//! Kullanım: `cargo run --release --example soz_hizalama -- <söz paketi klasörü> <şarkı> <söz.txt>`.
//! Şarkı çözülür (16 kHz mono), model emisyonları hesaplanır (`analysis::lyrics_model`), söz
//! hazırlanır (`lyrics_text`) ve yerleştirilir (`lyrics_align`). Her satır LRC biçiminde, güveniyle
//! yazılır ("~" tahmini, "-" atlandı); sonda süreler ve şarkı hükmü.
//!
//! `<şarkı>` yerine `--sessiz <saniye>` verilirse yalnızca modelin hızı ölçülür (sessiz ses).

use lyraska_lib::analysis::lyrics_align::align;
use lyraska_lib::analysis::lyrics_model::{
    decode_mono, LyricsModel, MODEL_SHA256, SAMPLE_RATE, TOKENS_SHA256,
};
use lyraska_lib::analysis::lyrics_text::prepare;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

fn lrc_time(secs: f64) -> String {
    let cs = (secs * 100.0).round() as u64;
    format!("{:02}:{:02}.{:02}", cs / 6000, cs / 100 % 60, cs % 100)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "kullanım: soz_hizalama <söz paketi> <şarkı> <söz.txt> | <söz paketi> --sessiz <sn>"
        );
        std::process::exit(2);
    }
    let cancel = AtomicBool::new(false);
    let t0 = Instant::now();
    let model = LyricsModel::open(Path::new(&args[1]), MODEL_SHA256, TOKENS_SHA256)?;
    let load = t0.elapsed().as_secs_f64();

    if args[2] == "--sessiz" {
        let secs: f64 = args.get(3).map_or(Ok(60.0), |s| s.parse())?;
        let audio = vec![0f32; (secs * f64::from(SAMPLE_RATE)) as usize];
        let t1 = Instant::now();
        let em = model.emissions(&audio, &cancel)?;
        let run = t1.elapsed().as_secs_f64();
        println!(
            "model yükleme {load:.1} sn; {secs:.0} sn ses {run:.1} sn ({:.2}× gerçek zaman), {} kare",
            run / secs,
            em.frames
        );
        return Ok(());
    }

    let t1 = Instant::now();
    let audio = decode_mono(Path::new(&args[2]), &cancel)?;
    let decode = t1.elapsed().as_secs_f64();
    let t2 = Instant::now();
    let em = model.emissions(&audio, &cancel)?;
    let model_secs = t2.elapsed().as_secs_f64();
    let lines = prepare(&std::fs::read_to_string(&args[3])?);
    let words: Vec<Vec<String>> = lines.iter().map(|l| l.words.clone()).collect();
    let t3 = Instant::now();
    let result = align(&em, model.vocabulary(), &words)?;
    let align_secs = t3.elapsed().as_secs_f64();
    for (line, timing) in lines.iter().zip(&result.lines) {
        let mark = if timing.skipped {
            "-"
        } else if timing.low_confidence() {
            "~"
        } else {
            " "
        };
        println!(
            "[{}]{mark} {:.2}  {}",
            lrc_time(timing.start),
            timing.confidence,
            line.text
        );
    }
    let secs = audio.len() as f64 / f64::from(SAMPLE_RATE);
    eprintln!(
        "şarkı {secs:.0} sn; model yükleme {load:.1} sn, çözme {decode:.1} sn, emisyon {model_secs:.1} sn ({:.2}× gerçek zaman), yerleşim {align_secs:.1} sn; hüküm {:?}",
        model_secs / secs,
        result.verdict
    );
    Ok(())
}
