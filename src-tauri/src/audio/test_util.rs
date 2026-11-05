//! Testlerde kullanılan yardımcılar: geçici dosya yolu ve WAV üretici.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

/// Testler paralel çalıştığı için her çağrıda benzersiz bir geçici dosya yolu üretir.
pub fn temp_path(name: &str) -> PathBuf {
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir()
        .join(format!("lyraska-test-{}", std::process::id()))
        .join(n.to_string());
    std::fs::create_dir_all(&dir).unwrap();
    dir.join(name)
}

/// Belirli bir frekansta sinüs örneği (-1..1).
pub fn sine(freq: f64, rate: u32, frame: usize) -> f64 {
    (2.0 * std::f64::consts::PI * freq * frame as f64 / f64::from(rate)).sin()
}

/// 16 bit PCM WAV dosyası yazar. `sample(kare, kanal)` -1..1 aralığında değer döndürür.
pub fn write_wav(
    path: &Path,
    rate: u32,
    channels: u16,
    frames: usize,
    sample: impl Fn(usize, usize) -> f64,
) {
    write_wav_bits(path, rate, channels, 16, frames, sample);
}

/// `bits` (16 ya da 24) bitlik PCM WAV yazar.
pub fn write_wav_bits(
    path: &Path,
    rate: u32,
    channels: u16,
    bits: u16,
    frames: usize,
    sample: impl Fn(usize, usize) -> f64,
) {
    write_wav_full(path, rate, channels, bits, None, frames, sample);
}

/// Kanal düzeni bildiren (WAVE_FORMAT_EXTENSIBLE) 24 bit PCM WAV yazar. `mask` Microsoft'un
/// kanal maskesidir (ör. 0x607 = L, R, C, yan sol, yan sağ); kanallar maskenin bit sırasıyla.
pub fn write_wav_layout(
    path: &Path,
    rate: u32,
    mask: u32,
    frames: usize,
    sample: impl Fn(usize, usize) -> f64,
) {
    write_wav_full(
        path,
        rate,
        mask.count_ones() as u16,
        24,
        Some(mask),
        frames,
        sample,
    );
}

/// [`write_wav_layout`] gibi, ama kanal sayısı maskeden bağımsız: maskesi 0 ("düzen
/// belirtilmemiş") olan uzantılı başlık için.
pub fn write_wav_extensible(
    path: &Path,
    rate: u32,
    channels: u16,
    mask: u32,
    frames: usize,
    sample: impl Fn(usize, usize) -> f64,
) {
    write_wav_full(path, rate, channels, 24, Some(mask), frames, sample);
}

/// PCM WAV yazar; `mask` verilirse başlık WAVE_FORMAT_EXTENSIBLE'dır (o maskeyle).
fn write_wav_full(
    path: &Path,
    rate: u32,
    channels: u16,
    bits: u16,
    mask: Option<u32>,
    frames: usize,
    sample: impl Fn(usize, usize) -> f64,
) {
    let bytes_per_sample = usize::from(bits / 8);
    let data_len = frames * usize::from(channels) * bytes_per_sample;
    let block = channels * bytes_per_sample as u16;
    let fmt_len: u32 = if mask.is_some() { 40 } else { 16 };
    let mut bytes = Vec::with_capacity(28 + fmt_len as usize + data_len);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&((20 + fmt_len as usize + data_len) as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&fmt_len.to_le_bytes());
    // PCM ya da WAVE_FORMAT_EXTENSIBLE
    let format: u16 = if mask.is_some() { 0xFFFE } else { 1 };
    bytes.extend_from_slice(&format.to_le_bytes());
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * u32::from(block)).to_le_bytes());
    bytes.extend_from_slice(&block.to_le_bytes());
    bytes.extend_from_slice(&bits.to_le_bytes());
    if let Some(mask) = mask {
        bytes.extend_from_slice(&22u16.to_le_bytes()); // ek alanın boyu
        bytes.extend_from_slice(&bits.to_le_bytes()); // geçerli bit
        bytes.extend_from_slice(&mask.to_le_bytes());
        // KSDATAFORMAT_SUBTYPE_PCM
        bytes.extend_from_slice(&[
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38,
            0x9b, 0x71,
        ]);
    }
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
    let full_scale = ((1i64 << (bits - 1)) - 1) as f64;
    for frame in 0..frames {
        for channel in 0..usize::from(channels) {
            let value = (sample(frame, channel).clamp(-1.0, 1.0) * full_scale).round() as i32;
            bytes.extend_from_slice(&value.to_le_bytes()[..bytes_per_sample]);
        }
    }
    std::fs::File::create(path)
        .unwrap()
        .write_all(&bytes)
        .unwrap();
}

/// Bilinen frekanstaki sinüse en küçük kareler uydurma: genlik ve kalanın (gürültü +
/// bozulma, THD+N) sinüse göre seviyesi (dB).
pub fn fit(signal: &[f64], freq: f64, rate: u32) -> (f64, f64) {
    let w = 2.0 * std::f64::consts::PI * freq / f64::from(rate);
    let (mut ss, mut sc, mut cc, mut ys, mut yc) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for (i, &y) in signal.iter().enumerate() {
        let (s, c) = (w * i as f64).sin_cos();
        ss += s * s;
        sc += s * c;
        cc += c * c;
        ys += y * s;
        yc += y * c;
    }
    let det = ss * cc - sc * sc;
    let a = (ys * cc - yc * sc) / det;
    let b = (yc * ss - ys * sc) / det;
    let residual: f64 = signal
        .iter()
        .enumerate()
        .map(|(i, &y)| {
            let (s, c) = (w * i as f64).sin_cos();
            (y - a * s - b * c).powi(2)
        })
        .sum::<f64>()
        / signal.len() as f64;
    let amplitude = (a * a + b * b).sqrt();
    (
        amplitude,
        10.0 * (residual / (amplitude * amplitude / 2.0)).log10(),
    )
}

/// Kütüphane ve önbellek testleri için şarkı bilgisi (etiketsiz, 44,1 kHz stereo FLAC).
pub fn track_info(path: &str) -> crate::audio::decode::TrackInfo {
    let path = PathBuf::from(path);
    crate::audio::decode::TrackInfo {
        file_name: path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        path,
        title: None,
        artist: None,
        album: None,
        album_artist: None,
        track_number: None,
        disc_number: None,
        codec: "flac".to_owned(),
        sample_rate: 44_100,
        channels: 2,
        channel_layout: None,
        duration_secs: Some(200.0),
    }
}
