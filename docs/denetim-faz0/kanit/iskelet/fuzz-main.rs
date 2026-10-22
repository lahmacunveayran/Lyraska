use std::io::Cursor;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

fn run(data: Vec<u8>, ext: &str) -> usize {
    let mut total = 0usize;
    let mss = MediaSourceStream::new(Box::new(Cursor::new(data)), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(ext);
    let Ok(mut format) = symphonia::default::get_probe().probe(&hint, mss, FormatOptions::default(), MetadataOptions::default()) else { return total };
    let _ = format.metadata();
    let Some(track) = format.default_track(TrackType::Audio) else { return total };
    let id = track.id;
    let Some(params) = track.codec_params.as_ref().and_then(|p| p.audio()).cloned() else { return total };
    let Ok(mut dec) = symphonia::default::get_codecs().make_audio_decoder(&params, &AudioDecoderOptions::default()) else { return total };
    let mut buf: Vec<f64> = Vec::new();
    for _ in 0..20000 {
        let packet = match format.next_packet() { Ok(Some(p)) => p, _ => break };
        if packet.track_id != id { continue; }
        if let Ok(a) = dec.decode(&packet) { buf.resize(a.samples_interleaved(), 0.0); a.copy_to_slice_interleaved(&mut buf); total += a.frames(); }
    }
    total
}

fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let args: Vec<String> = std::env::args().collect();
    let iters: u64 = args[1].parse().unwrap();
    let mut seed: u64 = 0x9E3779B97F4A7C15;
    let mut rng = move || { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; seed };
    for path in &args[2..] {
        let orig = std::fs::read(path).unwrap();
        let ext = path.rsplit('.').next().unwrap().to_string();
        println!("{path}: özgün dosyada çözülen kare {}", run(orig.clone(), &ext));
        let mut panics = 0; let mut first: Option<String> = None;
        for i in 0..iters {
            let mut d = orig.clone();
            let n = 1 + (rng() % 8) as usize;
            for _ in 0..n { let p = (rng() as usize) % d.len(); d[p] = rng() as u8; }
            if i % 4 == 0 { let cut = (rng() as usize) % d.len(); d.truncate(cut.max(16)); }
            let r = std::panic::catch_unwind(|| { run(d.clone(), &ext); });
            if let Err(e) = r {
                panics += 1;
                if first.is_none() {
                    let msg = e.downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| e.downcast_ref::<String>().cloned()).unwrap_or_default();
                    first = Some(format!("iter {i}: {msg}"));
                    std::fs::write(format!("crash-{}.{}", i, ext), &d).unwrap();
                }
            }
        }
        println!("{path}: {iters} mutasyon, {panics} panik; ilk: {:?}", first);
    }
}
