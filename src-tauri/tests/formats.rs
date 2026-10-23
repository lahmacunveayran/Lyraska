//! Gerçek kodeklerle (MP3, AAC/M4A, OGG Vorbis, FLAC, Opus) çözme ve sarma testleri.
//!
//! Test dosyaları arka arkaya üç ton içerir: 0–1 sn 440 Hz, 1–2 sn 880 Hz,
//! 2–3 sn 1760 Hz. Sarmadan sonra duyulan tonun frekansı, doğru yere gidilip
//! gidilmediğini gösterir. Ayrıntı: `tests/data/README.md`.

// Deneme kodu: beklenmeyen bir hata denemeyi hemen durdurmalı.
#![allow(clippy::unwrap_used, reason = "test: başarısızlık testi düşürür")]

use std::path::PathBuf;

use lyraska_lib::audio::decode::Decoder;

const FORMATS: &[&str] = &["mp3", "m4a", "ogg", "flac"];
const RATE: f64 = 22_050.0;
/// Opus her zaman 48 kHz çözülür; Ogg (`.opus`) ve WebM kapları.
const OPUS_FORMATS: &[&str] = &["opus", "webm"];
const OPUS_RATE: f64 = 48_000.0;

fn fixture(ext: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/data")
        .join(format!("uc-uc-ton.{ext}"))
}

/// Sonraki `seconds` saniyelik sesi (mono) çözer.
fn read_seconds(decoder: &mut Decoder, seconds: f64) -> Vec<f64> {
    read_seconds_at(decoder, seconds, RATE)
}

fn read_seconds_at(decoder: &mut Decoder, seconds: f64, rate: f64) -> Vec<f64> {
    let wanted = (seconds * rate) as usize;
    let mut samples = Vec::with_capacity(wanted);
    while samples.len() < wanted {
        match decoder.next_chunk().unwrap() {
            Some(chunk) => samples.extend_from_slice(chunk),
            None => break,
        }
    }
    samples.truncate(wanted);
    samples
}

/// Sıfırdan geçiş sayısından baskın frekansı kestirir.
fn dominant_frequency(samples: &[f64]) -> f64 {
    dominant_frequency_at(samples, RATE)
}

fn dominant_frequency_at(samples: &[f64], rate: f64) -> f64 {
    let crossings = samples
        .windows(2)
        .filter(|w| (w[0] < 0.0) != (w[1] < 0.0))
        .count();
    crossings as f64 / 2.0 / (samples.len() as f64 / rate)
}

/// Çözülen sesin, t = 0'da sıfır fazlı `freq` Hz sinüsle normalleştirilmiş ilintisi (−1..1):
/// genlikten bağımsız, zaman kaymasına duyarlı hizalama ölçüsü.
fn alignment(samples: &[f64], freq: f64) -> f64 {
    alignment_at(samples, freq, RATE)
}

fn alignment_at(samples: &[f64], freq: f64, rate: f64) -> f64 {
    let (mut xy, mut xx, mut yy) = (0.0, 0.0, 0.0);
    for (n, &x) in samples.iter().enumerate() {
        let y = (2.0 * std::f64::consts::PI * freq * n as f64 / rate).sin();
        xy += x * y;
        xx += x * x;
        yy += y * y;
    }
    xy / (xx * yy).sqrt()
}

fn assert_near(actual: f64, expected: f64, what: &str) {
    assert!(
        (actual - expected).abs() / expected < 0.06,
        "{what}: {actual:.1} Hz, beklenen {expected} Hz"
    );
}

#[test]
fn her_bicim_acilir_ve_bilgileri_dogru() {
    for ext in FORMATS {
        let decoder = Decoder::open(&fixture(ext)).unwrap_or_else(|e| panic!("{ext}: {e}"));
        let info = decoder.info();
        assert_eq!(info.sample_rate, 22_050, "{ext}");
        assert_eq!(info.channels, 1, "{ext}");
        let duration = info
            .duration_secs
            .unwrap_or_else(|| panic!("{ext}: süre bilinmiyor"));
        assert!((duration - 3.0).abs() < 0.08, "{ext}: süre {duration}");
        assert_eq!(info.title.as_deref(), Some("Üç Ton"), "{ext}: başlık");
        assert_eq!(
            info.artist.as_deref(),
            Some("Lyraska Test"),
            "{ext}: sanatçı"
        );
        assert_eq!(info.album.as_deref(), Some("Deneme Albümü"), "{ext}: albüm");
        assert_eq!(
            info.album_artist.as_deref(),
            Some("Lyraska"),
            "{ext}: albüm sanatçısı"
        );
        assert_eq!(info.track_number, Some(3), "{ext}: parça no");
        assert_eq!(info.disc_number, Some(1), "{ext}: disk no");
    }
}

#[test]
fn her_bicim_bastan_sona_cozulur() {
    for ext in FORMATS {
        let mut decoder = Decoder::open(&fixture(ext)).unwrap();
        let samples = read_seconds(&mut decoder, 10.0);
        let seconds = samples.len() as f64 / RATE;
        assert!((seconds - 3.0).abs() < 0.08, "{ext}: {seconds} sn çözüldü");
        // Ortadaki ton: 1,2–1,8 sn arası 880 Hz.
        let middle = &samples[(1.2 * RATE) as usize..(1.8 * RATE) as usize];
        assert_near(dominant_frequency(middle), 880.0, ext);
    }
}

#[test]
fn her_bicimde_sarma_dogru_yere_gider() {
    for ext in FORMATS {
        let mut decoder = Decoder::open(&fixture(ext)).unwrap();

        // İleri: 2,2 sn → 1760 Hz bölümü
        decoder.seek(2.2).unwrap();
        let after = read_seconds(&mut decoder, 0.5);
        assert_near(dominant_frequency(&after), 1760.0, &format!("{ext} 2,2 sn"));

        // Geri: 0,2 sn → 440 Hz bölümü
        decoder.seek(0.2).unwrap();
        let after = read_seconds(&mut decoder, 0.5);
        assert_near(dominant_frequency(&after), 440.0, &format!("{ext} 0,2 sn"));

        // Bölüm sınırının hemen sonrası: 1,05 sn'den itibaren 880 Hz duyulmalı;
        // kaba bir sarma 440 Hz bölümüne düşerdi.
        decoder.seek(1.05).unwrap();
        let after = read_seconds(&mut decoder, 0.4);
        assert_near(dominant_frequency(&after), 880.0, &format!("{ext} 1,05 sn"));
    }
}

#[test]
fn bosluksuz_calma_icin_dolgu_atilir() {
    // Her dosyada tam 3 saniye (66 150 örnek) ses var. Kodlayıcının başa ve sona
    // eklediği dolgu atılmazsa ard arda çalınan şarkılar arasında boşluk duyulur.
    for ext in FORMATS {
        let mut decoder = Decoder::open(&fixture(ext)).unwrap();
        let mut samples = Vec::new();
        while let Some(chunk) = decoder.next_chunk().unwrap() {
            samples.extend_from_slice(chunk);
        }
        // Her biçimde tam 66 150 örnek: ne baştan ne sondan dolgu kalır, örnek de kaybolmaz.
        // (Eskiden MP3'e 64 örnek tolerans vardı; o tolerans baştan atılan 47 örneği gizliyordu.)
        assert_eq!(samples.len(), 66_150, "{ext}: örnek sayısı");
        // Ses ilk örneklerden başlar: baştaki sessizlik (dolgu) yok.
        let first_loud = samples.iter().position(|s| s.abs() > 0.05).unwrap();
        assert!(first_loud < 20, "{ext}: ses {first_loud}. örnekte başlıyor");
        // Hizalama: çözülen ses, kaynağın t = 0'da sıfır fazla başlayan 440 Hz sinüsüyle örnek
        // örnek örtüşür (ilinti ≈ 1). 47 örneklik kayma 440 Hz'te 0,84 radyan faz farkı eder;
        // ilinti 0,92'ye düşer ve bu ölçüden kaçmaz.
        let corr = alignment(&samples[..2000], 440.0);
        assert!(
            corr > 0.98,
            "{ext}: ilk 2000 örnek kaynakla hizalı değil (ilinti {corr:.3})"
        );
        let duration = decoder.info().duration_secs.unwrap();
        assert!(
            (duration - 3.0).abs() < 1e-9 || *ext == "ogg",
            "{ext}: süre {duration}"
        );
    }
}

#[test]
fn opus_acilir_ve_bilgileri_dogru() {
    for ext in OPUS_FORMATS {
        let decoder = Decoder::open(&fixture(ext)).unwrap_or_else(|e| panic!("{ext}: {e}"));
        let info = decoder.info();
        assert_eq!(info.codec, "opus", "{ext}");
        assert_eq!(info.sample_rate, 48_000, "{ext}");
        assert_eq!(info.channels, 1, "{ext}");
        // WebM süreyi bildirmez; paketlerden hesaplanır (milisaniye çözünürlüğünde).
        let duration = info
            .duration_secs
            .unwrap_or_else(|| panic!("{ext}: süre bilinmiyor"));
        assert!((duration - 3.0).abs() < 0.03, "{ext}: süre {duration}");
        assert_eq!(
            info.artist.as_deref(),
            Some("Lyraska Test"),
            "{ext}: sanatçı"
        );
        assert_eq!(info.album.as_deref(), Some("Deneme Albümü"), "{ext}: albüm");
        assert_eq!(
            info.album_artist.as_deref(),
            Some("Lyraska"),
            "{ext}: albüm sanatçısı"
        );
        assert_eq!(info.track_number, Some(3), "{ext}: parça no");
        assert_eq!(info.disc_number, Some(1), "{ext}: disk no");
    }
    // Ogg Opus başlığı etikettir; WebM'de başlık etiket değil (symphonia okumuyor): dosya adı kullanılır.
    let ogg = Decoder::open(&fixture("opus")).unwrap();
    assert_eq!(ogg.info().title.as_deref(), Some("Üç Ton"));
}

#[test]
fn opus_bastan_sona_hizali_cozulur() {
    for ext in OPUS_FORMATS {
        let mut decoder = Decoder::open(&fixture(ext)).unwrap();
        let mut samples = Vec::new();
        while let Some(chunk) = decoder.next_chunk().unwrap() {
            samples.extend_from_slice(chunk);
        }
        // Opus'un baştaki ön boşluğu (312 örnek) bir kez atılır: ne kalır ne iki kez atılır.
        // Ogg sondaki dolguyu da bildirir (tam 144 000 örnek); WebM bildirmez, en çok bir
        // Opus çerçevesi (20 ms) fazlalık kalabilir.
        if *ext == "opus" {
            assert_eq!(samples.len(), 144_000, "{ext}: örnek sayısı");
        } else {
            assert!(
                (144_000..=144_960).contains(&samples.len()),
                "{ext}: {} örnek",
                samples.len()
            );
        }
        let corr = alignment_at(&samples[..4000], 440.0, OPUS_RATE);
        assert!(
            corr > 0.98,
            "{ext}: baş kaynakla hizalı değil (ilinti {corr:.3})"
        );
        let middle = &samples[(1.2 * OPUS_RATE) as usize..(1.8 * OPUS_RATE) as usize];
        assert_near(dominant_frequency_at(middle, OPUS_RATE), 880.0, ext);
    }
}

#[test]
fn opus_sarma_dogru_yere_gider() {
    // WebM'de symphonia'nın sarması hata veriyor; dosya baştan okunup hedefe ilerlenir.
    for ext in OPUS_FORMATS {
        let mut decoder = Decoder::open(&fixture(ext)).unwrap();
        for (at, freq) in [(2.2, 1760.0), (0.2, 440.0), (1.05, 880.0)] {
            decoder
                .seek(at)
                .unwrap_or_else(|e| panic!("{ext} {at} sn: {e}"));
            let after = read_seconds_at(&mut decoder, 0.4, OPUS_RATE);
            assert_eq!(after.len(), (0.4 * OPUS_RATE) as usize, "{ext} {at} sn");
            assert_near(
                dominant_frequency_at(&after, OPUS_RATE),
                freq,
                &format!("{ext} {at} sn"),
            );
        }
    }
}
