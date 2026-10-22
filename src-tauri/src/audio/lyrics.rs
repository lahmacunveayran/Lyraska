//! Şarkı sözleri: yalnızca kullanıcının kendi dosyalarından okunur ve hiçbir yere yazılmaz
//! (önbellek, şarkı haritası dosyası, depo). Program söz dağıtmaz.
//!
//! **Kaynaklar** (zamanlı olan önce):
//! 1. Şarkının yanındaki `.lrc` dosyası (`şarkı.lrc`, `şarkı.LRC` ya da `şarkı.mp3.lrc`).
//! 2. Şarkıya gömülü sözler (ID3 USLT, Vorbis `LYRICS`, MP4 `©lyr`); çoğu araç zamanlı sözleri de
//!    LRC biçiminde buraya yazar.
//!
//! **LRC:** satır zamanları (`[mm:ss.xx]`, bir satırda birden çok), `[offset:±ms]`, kelime
//! zamanları (`<mm:ss.xx>`, "enhanced LRC"). Aynı zamandaki ikinci satır çeviri sayılır. Zamanı
//! olan boş satır şarkının sözsüz kısmıdır: önceki satırı bitirir.
//!
//! **Kodlama:** UTF-8 (BOM'lu ya da BOM'suz), UTF-16 (BOM'lu); ikisi de değilse Windows-1254 (Türkçe
//! Windows'un eski programlarının yazdığı `.lrc` dosyaları böyledir; yoksa "ş, ğ, ı" bozulur).
//!
//! **Kelime zamanları:** dosyada yoksa kelimeler satırın süresine hece sayısıyla orantılı dağıtılır
//! (hece başına en çok ~0,35 sn; uzun satır sonunda bekleme bırakılır) ve "tahmini" işaretlenir.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Okunan söz dosyasının en büyük boyutu.
const MAX_FILE_BYTES: u64 = 1024 * 1024;
/// Sonraki satır yoksa ya da çok uzaktaysa bir satırın en uzun süresi (saniye).
const MAX_LINE_SECONDS: f64 = 10.0;
/// Hecenin en uzun süresi (saniye): kelimeler satırın sonuna kadar yayılmaz.
const MAX_SYLLABLE_SECONDS: f64 = 0.35;
/// Satır sayısı sınırı (kötü niyetli ya da bozuk dosya).
const MAX_LINES: usize = 5_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub enum LyricsSource {
    /// Şarkının yanındaki `.lrc` dosyası.
    File,
    /// Şarkıya gömülü sözler.
    Embedded,
}

/// Bir şarkının sözleri.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct Lyrics {
    pub source: LyricsSource,
    /// Satırların zamanı var mı? Yoksa satırların zamanları 0'dır (ekranda kayan söz gösterilmez).
    pub synced: bool,
    pub lines: Vec<LyricLine>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct LyricLine {
    /// Başlangıç ve bitiş (saniye).
    pub start: f64,
    pub end: f64,
    pub text: String,
    /// Aynı zamandaki ikinci satır (çeviri).
    pub translation: Option<String>,
    pub words: Vec<LyricWord>,
    /// Kelime zamanları dosyadan değil tahminden mi?
    pub estimated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct LyricWord {
    pub start: f64,
    pub end: f64,
    /// Kelime (ardındaki boşlukla; satır kelimeler birleştirilerek yeniden yazılabilir).
    pub text: String,
}

/// Şarkının sözleri; hiç yoksa `None`. `duration_secs` son satırın bitişi için.
pub fn for_track(path: &Path, duration_secs: Option<f64>) -> Option<Lyrics> {
    let sidecar = sidecar_text(path).map(|text| parse(&text, LyricsSource::File, duration_secs));
    if sidecar.as_ref().is_some_and(|l| l.synced) {
        return sidecar;
    }
    let embedded = super::decode::read_lyrics(path)
        .ok()
        .flatten()
        .map(|text| parse(&text, LyricsSource::Embedded, duration_secs));
    match (sidecar, embedded) {
        (_, Some(embedded)) if embedded.synced => Some(embedded),
        (Some(sidecar), _) => Some(sidecar).filter(|l| !l.lines.is_empty()),
        (None, embedded) => embedded.filter(|l| !l.lines.is_empty()),
    }
}

/// Şarkının yanındaki `.lrc` dosyalarının adayları.
fn sidecar_paths(path: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![path.with_extension("lrc"), path.with_extension("LRC")];
    if let Some(name) = path.file_name() {
        let mut long = name.to_os_string();
        long.push(".lrc");
        candidates.push(path.with_file_name(long));
    }
    candidates
}

fn sidecar_text(path: &Path) -> Option<String> {
    sidecar_paths(path).into_iter().find_map(|candidate| {
        let meta = std::fs::metadata(&candidate).ok()?;
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            return None;
        }
        std::fs::read(&candidate)
            .ok()
            .map(|bytes| decode_text(&bytes))
    })
}

/// Söz dosyasının baytlarını metne çevirir: UTF-8, UTF-16 (BOM'lu) ya da Windows-1254.
pub fn decode_text(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    let utf16 = |rest: &[u8], little: bool| -> String {
        let units: Vec<u16> = rest
            .chunks_exact(2)
            .map(|c| {
                if little {
                    u16::from_le_bytes([c[0], c[1]])
                } else {
                    u16::from_be_bytes([c[0], c[1]])
                }
            })
            .collect();
        String::from_utf16_lossy(&units)
    };
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return utf16(rest, true);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return utf16(rest, false);
    }
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => bytes
            .iter()
            .map(|&b| super::decode::windows_1254(b))
            .collect(),
    }
}

/// Dosyadaki zamanlı bir satır (ayrıştırırken).
struct TimedLine {
    time: f64,
    text: String,
    /// Satır içi kelime zamanları (saniye, kelime).
    words: Vec<(f64, String)>,
    /// Dosyadaki sırası (aynı zamanlı satırlar dosyadaki sırayla kalsın).
    order: usize,
    /// Aynı zamandaki ikinci satır (çeviri).
    translation: Option<String>,
}

/// LRC (ya da zamansız düz metin) sözleri ayrıştırır.
pub fn parse(text: &str, source: LyricsSource, duration_secs: Option<f64>) -> Lyrics {
    let mut offset = 0.0;
    let mut timed: Vec<TimedLine> = Vec::new();
    let mut plain: Vec<String> = Vec::new();
    for (order, raw) in text.lines().enumerate().take(MAX_LINES) {
        let line = raw.trim();
        let (stamps, rest) = leading_stamps(line);
        if stamps.is_empty() {
            if let Some(value) = id_tag(line, "offset") {
                // LRC: artı, sözlerin daha önce gelmesi demek.
                offset = value.trim().parse::<f64>().map_or(0.0, |ms| ms / 1000.0);
            } else if !line.is_empty() && !is_id_tag(line) {
                plain.push(line.to_owned());
            }
            continue;
        }
        let (words, text) = word_stamps(rest);
        for time in stamps {
            timed.push(TimedLine {
                time,
                text: text.clone(),
                words: words.clone(),
                order,
                translation: None,
            });
        }
    }
    if timed.is_empty() {
        return Lyrics {
            source,
            synced: false,
            lines: plain
                .into_iter()
                .map(|text| LyricLine {
                    start: 0.0,
                    end: 0.0,
                    text,
                    translation: None,
                    words: Vec::new(),
                    estimated: false,
                })
                .collect(),
        };
    }
    timed.sort_by(|a, b| a.time.total_cmp(&b.time).then(a.order.cmp(&b.order)));
    // Aynı zamandaki satırlar: ilki asıl, ikincisi çeviri; boş satır sözsüz kısım.
    let mut grouped: Vec<TimedLine> = Vec::new();
    for mut line in timed {
        line.time = (line.time - offset).max(0.0);
        for word in &mut line.words {
            word.0 = (word.0 - offset).max(0.0);
        }
        match grouped.last_mut() {
            Some(last)
                if (last.time - line.time).abs() < 1e-6
                    && !line.text.is_empty()
                    && !last.text.is_empty() =>
            {
                if last.translation.is_none() {
                    last.translation = Some(line.text);
                }
            }
            _ => grouped.push(line),
        }
    }
    let limit = duration_secs.unwrap_or(f64::INFINITY);
    let mut lines = Vec::new();
    for (i, line) in grouped.iter().enumerate() {
        if line.text.is_empty() {
            continue;
        }
        let start = line.time;
        let next = grouped.get(i + 1).map(|g| g.time);
        let end = next
            .unwrap_or(limit)
            .min(start + MAX_LINE_SECONDS)
            .min(limit)
            .max(start);
        let (words, estimated) = if line.words.is_empty() {
            (estimate_words(&line.text, start, end), true)
        } else {
            (timed_words(&line.words, end), false)
        };
        lines.push(LyricLine {
            start,
            end,
            text: line.text.clone(),
            translation: line.translation.clone(),
            words,
            estimated,
        });
    }
    Lyrics {
        source,
        synced: true,
        lines,
    }
}

/// Satırın başındaki `[mm:ss.xx]` zamanları (saniye) ve geri kalan metin.
fn leading_stamps(line: &str) -> (Vec<f64>, &str) {
    let mut stamps = Vec::new();
    let mut rest = line;
    while let Some(inner) = rest.strip_prefix('[') {
        let Some(close) = inner.find(']') else {
            break;
        };
        let Some(time) = parse_time(&inner[..close]) else {
            break;
        };
        stamps.push(time);
        rest = inner[close + 1..].trim_start();
    }
    (stamps, rest)
}

/// `mm:ss`, `mm:ss.x…`, `mm:ss:xx` ya da `hh:mm:ss.xx` → saniye.
fn parse_time(text: &str) -> Option<f64> {
    let parts: Vec<&str> = text.split(':').collect();
    let number = |s: &str| -> Option<f64> {
        (!s.is_empty() && s.bytes().all(|b| b.is_ascii_digit() || b == b'.'))
            .then(|| s.parse::<f64>().ok())
            .flatten()
    };
    let seconds = match parts.as_slice() {
        [m, s] => number(m)? * 60.0 + number(s)?,
        // Bazı programlar yüzde biri iki nokta ile yazar (mm:ss:xx); üç parçada son parça iki
        // basamaksa yüzde birdir, değilse saattir (hh:mm:ss).
        [a, b, c] if c.len() == 2 && b.len() == 2 && !c.contains('.') => {
            number(a)? * 60.0 + number(b)? + number(c)? / 100.0
        }
        [h, m, s] => number(h)? * 3600.0 + number(m)? * 60.0 + number(s)?,
        _ => return None,
    };
    (seconds.is_finite() && seconds < 24.0 * 3600.0).then_some(seconds)
}

/// `[ad:değer]` etiketinin değeri.
fn id_tag<'a>(line: &'a str, name: &str) -> Option<&'a str> {
    let inner = line.strip_prefix('[')?.strip_suffix(']')?;
    let (key, value) = inner.split_once(':')?;
    key.trim().eq_ignore_ascii_case(name).then_some(value)
}

/// `[ar:…]`, `[ti:…]` gibi bilgi etiketi mi?
fn is_id_tag(line: &str) -> bool {
    line.strip_prefix('[')
        .and_then(|l| l.strip_suffix(']'))
        .and_then(|inner| inner.split_once(':'))
        .is_some_and(|(key, _)| {
            !key.is_empty() && key.chars().all(|c| c.is_ascii_alphabetic() || c == '#')
        })
}

/// Satır içi `<mm:ss.xx>` kelime zamanları: (zaman, kelime) çiftleri ve zamansız metin.
fn word_stamps(text: &str) -> (Vec<(f64, String)>, String) {
    if !text.contains('<') {
        return (Vec::new(), text.trim().to_owned());
    }
    let mut words: Vec<(f64, String)> = Vec::new();
    let mut plain = String::new();
    let mut rest = text;
    let mut current: Option<f64> = None;
    while !rest.is_empty() {
        if let Some(inner) = rest.strip_prefix('<') {
            if let Some(close) = inner.find('>') {
                if let Some(time) = parse_time(&inner[..close]) {
                    current = Some(time);
                    rest = &inner[close + 1..];
                    continue;
                }
            }
        }
        // İlk karakterden sonraki ilk '<' (çok baytlı harfin ortasından kesilmez).
        let first = rest.chars().next().map_or(rest.len(), char::len_utf8);
        let next = rest[first..].find('<').map_or(rest.len(), |i| i + first);
        let chunk = &rest[..next];
        plain.push_str(chunk);
        if let Some(time) = current.take() {
            if !chunk.trim().is_empty() {
                words.push((time, chunk.to_owned()));
            }
        } else if let Some(last) = words.last_mut() {
            last.1.push_str(chunk);
        }
        rest = &rest[next..];
    }
    (words, plain.trim().to_owned())
}

/// Dosyadaki kelime zamanlarından kelimeler (bitiş: sonraki kelime ya da satırın sonu).
fn timed_words(words: &[(f64, String)], line_end: f64) -> Vec<LyricWord> {
    words
        .iter()
        .enumerate()
        .map(|(i, (start, text))| LyricWord {
            start: *start,
            end: words.get(i + 1).map_or(line_end, |w| w.0).max(*start),
            text: text.clone(),
        })
        .collect()
}

/// Kelime zamanı yoksa: kelimeler hece sayısıyla orantılı, hece başına en çok
/// [`MAX_SYLLABLE_SECONDS`] süreyle dağıtılır.
fn estimate_words(text: &str, start: f64, end: f64) -> Vec<LyricWord> {
    let words: Vec<&str> = text
        .split_inclusive(' ')
        .filter(|w| !w.trim().is_empty())
        .collect();
    let weights: Vec<f64> = words.iter().map(|w| syllables(w) as f64).collect();
    let total: f64 = weights.iter().sum();
    if total == 0.0 {
        return Vec::new();
    }
    let span = (end - start).min(total * MAX_SYLLABLE_SECONDS);
    let mut at = start;
    words
        .iter()
        .zip(&weights)
        .map(|(word, weight)| {
            let length = span * weight / total;
            let word = LyricWord {
                start: at,
                end: at + length,
                text: (*word).to_owned(),
            };
            at += length;
            word
        })
        .collect()
}

/// Kaba hece sayısı: sesli harf öbekleri (Türkçe ve Batı dilleri); en az 1.
fn syllables(word: &str) -> usize {
    let vowel = |c: char| "aeıioöuüâîûAEIİOÖUÜÂÎÛyY".contains(c);
    let mut count = 0;
    let mut previous = false;
    for c in word.chars() {
        let is_vowel = vowel(c);
        if is_vowel && !previous {
            count += 1;
        }
        previous = is_vowel;
    }
    count.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lrc(text: &str) -> Lyrics {
        parse(text, LyricsSource::File, Some(240.0))
    }

    #[test]
    fn satir_zamanlari_ve_bitisler() {
        let lyrics = lrc("[ti:Gülümse]\n[ar:Sezen Aksu]\n[00:12.30]Gülümse hadi gülümse\n[00:15.8]Bulutlar gitsin\n[00:21.000]\n[00:30.00]Son satır");
        assert!(lyrics.synced);
        let starts: Vec<f64> = lyrics.lines.iter().map(|l| l.start).collect();
        assert_eq!(starts, [12.3, 15.8, 30.0]);
        assert_eq!(lyrics.lines[0].end, 15.8);
        // Boş satır (sözsüz kısım) önceki satırı bitirir.
        assert_eq!(lyrics.lines[1].end, 21.0);
        // Son satır en çok 10 sn.
        assert_eq!(lyrics.lines[2].end, 40.0);
        assert_eq!(lyrics.lines[0].text, "Gülümse hadi gülümse");
    }

    #[test]
    fn bir_satirda_birden_cok_zaman_ve_sira() {
        let lyrics = lrc("[00:40.00]Nakarat\n[00:05.00][00:20.00]Tekrar eden\n[00:10.00]Arada");
        let texts: Vec<(&str, f64)> = lyrics
            .lines
            .iter()
            .map(|l| (l.text.as_str(), l.start))
            .collect();
        assert_eq!(
            texts,
            [
                ("Tekrar eden", 5.0),
                ("Arada", 10.0),
                ("Tekrar eden", 20.0),
                ("Nakarat", 40.0)
            ]
        );
    }

    #[test]
    fn offset_ve_zaman_bicimleri() {
        // +500 ms: sözler yarım saniye önce gelir.
        let lyrics = lrc("[offset:+500]\n[01:02.50]A\n[01:05:25]B\n[1:01:01.00]C");
        let starts: Vec<f64> = lyrics.lines.iter().map(|l| l.start).collect();
        assert_eq!(starts, [62.0, 64.75, 3660.5]);
        assert_eq!(parse_time("02:03.456"), Some(123.456));
        assert_eq!(parse_time("xx:10"), None);
        assert_eq!(parse_time("10"), None);
        assert_eq!(parse_time("-1:00"), None);
    }

    #[test]
    fn ayni_zamandaki_ikinci_satir_ceviri() {
        let lyrics = lrc("[00:10.00]I love you\n[00:10.00]Seni seviyorum\n[00:14.00]Next");
        assert_eq!(lyrics.lines.len(), 2);
        assert_eq!(lyrics.lines[0].text, "I love you");
        assert_eq!(
            lyrics.lines[0].translation.as_deref(),
            Some("Seni seviyorum")
        );
    }

    #[test]
    fn kelime_zamanlari_dosyadan() {
        let lyrics = lrc("[00:10.00]<00:10.00>Bir <00:10.50>iki <00:11.20>üç\n[00:13.00]Sonra");
        // Çok baytlı harfle başlayan kelime parçası (dilim karakterin ortasından kesilmez).
        let turkish = lrc("[00:01.00]ünlü <00:01.50>ğüzel");
        assert_eq!(turkish.lines[0].text, "ünlü ğüzel");
        let line = &lyrics.lines[0];
        assert!(!line.estimated);
        assert_eq!(line.text, "Bir iki üç");
        let words: Vec<(f64, f64, &str)> = line
            .words
            .iter()
            .map(|w| (w.start, w.end, w.text.as_str()))
            .collect();
        assert_eq!(
            words,
            [
                (10.0, 10.5, "Bir "),
                (10.5, 11.2, "iki "),
                (11.2, 13.0, "üç")
            ]
        );
    }

    #[test]
    fn kelime_zamani_yoksa_hece_ile_tahmin() {
        let lyrics = lrc("[00:10.00]Gül ağlama\n[00:20.00]Son");
        let line = &lyrics.lines[0];
        assert!(line.estimated);
        // "Gül" 1 hece, "ağlama" 3 hece: 4 hece × 0,35 = 1,4 sn'ye yayılır (satır 10 sn sürse de).
        assert_eq!(line.words.len(), 2);
        assert!((line.words[0].end - 10.35).abs() < 1e-9);
        assert!((line.words[1].end - 11.4).abs() < 1e-9);
        // Kısa satırda süre satırla sınırlı.
        let short = lrc("[00:10.00]Uzun uzun söylenen bir satır\n[00:11.00]Son");
        assert!((short.lines[0].words.last().unwrap().end - 11.0).abs() < 1e-9);
        assert_eq!(syllables("ağlamaklı"), 4);
        assert_eq!(syllables("ş"), 1);
    }

    #[test]
    fn zamansiz_sozler_gosterilir_ama_zamanli_degil() {
        let lyrics = lrc("[ar:Biri]\nBirinci satır\n\nİkinci satır");
        assert!(!lyrics.synced);
        assert_eq!(lyrics.lines.len(), 2);
        assert_eq!(lyrics.lines[1].text, "İkinci satır");
    }

    #[test]
    fn kodlamalar_turkce_harfleri_bozmaz() {
        let text = "[00:01.00]Şarkı söyle ğıİöçü";
        assert_eq!(decode_text(text.as_bytes()), text);
        let bom = [&[0xEF, 0xBB, 0xBF][..], text.as_bytes()].concat();
        assert_eq!(decode_text(&bom), text);
        let le: Vec<u8> = [0xFF, 0xFE]
            .into_iter()
            .chain(text.encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        assert_eq!(decode_text(&le), text);
        let be: Vec<u8> = [0xFE, 0xFF]
            .into_iter()
            .chain(text.encode_utf16().flat_map(u16::to_be_bytes))
            .collect();
        assert_eq!(decode_text(&be), text);
        // Windows-1254: Ş=DE, ı=FD, ğ=F0, İ=DD, ö=F6, ç=E7, ü=FC.
        let cp1254 = b"[00:01.00]\xDEark\xFD s\xF6yle \xF0\xFD\xDD\xF6\xE7\xFC";
        assert_eq!(decode_text(cp1254), text);
    }

    #[test]
    fn yan_dosya_once_zamanli_olani_secer() {
        let dir = crate::audio::test_util::temp_path("sozler");
        std::fs::create_dir_all(&dir).unwrap();
        let song = dir.join("gece.flac");
        std::fs::write(&song, b"").unwrap();
        assert_eq!(for_track(&song, Some(60.0)), None, "söz yok");
        std::fs::write(dir.join("gece.lrc"), "[00:01.00]Merhaba\n").unwrap();
        let found = for_track(&song, Some(60.0)).unwrap();
        assert_eq!(found.source, LyricsSource::File);
        assert_eq!(found.lines[0].text, "Merhaba");
        // "şarkı.flac.lrc" adı da bulunur.
        std::fs::remove_file(dir.join("gece.lrc")).unwrap();
        std::fs::write(dir.join("gece.flac.lrc"), b"[00:02.00]Uzun ad").unwrap();
        assert_eq!(for_track(&song, None).unwrap().lines[0].start, 2.0);
        // Çok büyük dosya okunmaz.
        std::fs::write(
            dir.join("gece.flac.lrc"),
            vec![b'a'; MAX_FILE_BYTES as usize + 1],
        )
        .unwrap();
        assert_eq!(for_track(&song, None), None);
        std::fs::remove_dir_all(dir).ok();
    }

    /// Gömülü sözler: FLAC (Vorbis `LYRICS`) ve MP3 (ID3 USLT); test sesleri ffmpeg ile üretildi
    /// (`tests/data/README.md`).
    #[test]
    fn gomulu_sozler_okunur() {
        let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data");
        for name in ["sozlu.flac", "sozlu.mp3"] {
            let lyrics = for_track(&data.join(name), Some(1.0)).unwrap_or_else(|| panic!("{name}"));
            assert_eq!(lyrics.source, LyricsSource::Embedded, "{name}");
            assert!(lyrics.synced, "{name}");
            let texts: Vec<&str> = lyrics.lines.iter().map(|l| l.text.as_str()).collect();
            assert_eq!(texts, ["Üç ton şarkısı", "ğüşıöç"], "{name}");
        }
        assert_eq!(
            crate::audio::decode::read_lyrics(&data.join("uc-uc-ton.flac")).unwrap(),
            None
        );
    }

    #[test]
    fn bozuk_satirlar_atlanir() {
        let lyrics = lrc("[00:xx]bozuk\n[01:00.00]iyi\n[02:00.00\n<00:01>yarım");
        assert!(lyrics.synced);
        assert_eq!(lyrics.lines.len(), 1);
        assert_eq!(lyrics.lines[0].text, "iyi");
    }
}
