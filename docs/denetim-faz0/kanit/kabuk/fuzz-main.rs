use std::io::Cursor;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::codecs::audio::AudioDecoderOptions;

fn run(data: Vec<u8>, ext: &str) {
    let mss = MediaSourceStream::new(Box::new(Cursor::new(data)), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(ext);
    let Ok(mut format) = symphonia::default::get_probe().probe(&hint, mss, FormatOptions::default(), MetadataOptions::default()) else { return };
    let _ = format.metadata().skip_to_latest().map(|r| r.media.tags.len());
    let Some(track) = format.default_track(TrackType::Audio) else { return };
    let id = track.id;
    let Some(params) = track.codec_params.as_ref().and_then(|p| p.audio()).cloned() else { return };
    let Ok(mut dec) = symphonia::default::get_codecs().make_audio_decoder(&params, &AudioDecoderOptions::default()) else { return };
    for _ in 0..200 {
        match format.next_packet() {
            Ok(Some(p)) => { if p.track_id == id { let _ = dec.decode(&p); } }
            _ => break,
        }
    }
}

fn main() {
    let files: Vec<String> = std::env::args().skip(1).collect();
    std::panic::set_hook(Box::new(|_| {}));
    let mut seed: u64 = 0x9E3779B97F4A7C15;
    let mut rnd = move || { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; seed };
    let mut found = 0;
    for f in &files {
        let orig = std::fs::read(f).unwrap();
        let ext = f.rsplit('.').next().unwrap().to_string();
        for i in 0..4000u32 {
            let mut d = orig.clone();
            let n = 1 + (rnd() % 8) as usize;
            // mutate mostly the header region
            let lim = if i % 2 == 0 { d.len().min(4096) } else { d.len() };
            for _ in 0..n { let p = (rnd() as usize) % lim; d[p] = rnd() as u8; }
            if i % 7 == 0 { let t = (rnd() as usize) % d.len(); d.truncate(t.max(1)); }
            let copy = d.clone();
            let e = ext.clone();
            let r = std::panic::catch_unwind(move || run(copy, &e));
            if let Err(p) = r {
                let msg = p.downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| p.downcast_ref::<String>().cloned()).unwrap_or_default();
                found += 1;
                if found <= 20 {
                    let out = format!("crash_{}_{}.{}", ext, i, ext);
                    std::fs::write(&out, &d).unwrap();
                    println!("PANIC {} iter {} -> {}: {}", f, i, out, msg);
                }
            }
        }
    }
    println!("toplam panik: {found}");
}
