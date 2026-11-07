//! Boşluksuz çalma için kodlayıcı dolgusu (encoder delay / padding).
//!
//! Kayıplı kodlayıcılar sesin başına birkaç yüz–bin örnek sessizlik ekler,
//! sonunu da tam bloğa tamamlar. Bu dolgular atılmazsa ard arda çalınan
//! parçalar arasında (canlı albümler, kesintisiz DJ setleri) kısa bir boşluk
//! duyulur. MP3 (LAME etiketi) ve Ogg Vorbis için bunu çözücü zaten yapar;
//! MP4/M4A (AAC) için gereken bilgi dosyada durur ama çözücü kullanmaz. Burada
//! iki yerden okunur:
//!
//! - iTunes'un `iTunSMPB` etiketi: `" 00000000 00000840 000001CA 00000000003F31F6 ..."`
//!   (başlangıç dolgusu, son dolgu, gerçek örnek sayısı; onaltılık).
//! - Düzenleme listesi (`moov/trak/edts/elst`): ilk oynatılan kesimin başlangıcı
//!   (ses zaman ölçeğinde) ve süresi (film zaman ölçeğinde).

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Bir dosyanın oynatılacak kısmı (örnek karesi cinsinden, çözülen akışın başından).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Trim {
    /// Baştan atılacak kare sayısı.
    pub delay: u64,
    /// Gerçek ses uzunluğu (kare); bilinmiyorsa `None` (sona kadar).
    pub frames: Option<u64>,
}

/// Okunacak kutunun en büyük boyutu (bozuk dosyada belleği şişirmesin).
const MAX_BOX_READ: u64 = 16 * 1024 * 1024;

/// MP4/M4A dosyasındaki dolgu bilgisi. MP4 değilse ya da bilgi yoksa `None`.
pub fn mp4_trim(path: &Path, sample_rate: u32) -> Option<Trim> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let moov = find_top_level(&mut file, len, *b"moov")?;
    let mut info = Mp4Info::default();
    walk(&moov, &mut info, 0);
    if let Some((delay, frames)) = info.itunsmpb {
        return Some(Trim {
            delay,
            frames: (frames > 0).then_some(frames),
        });
    }
    let (media_time, segment) = info.audio_edit?;
    let media_scale = info.audio_timescale.filter(|&t| t > 0)?;
    let rate = u64::from(sample_rate);
    let delay = media_time * rate / media_scale;
    let frames = info
        .movie_timescale
        .filter(|&t| t > 0 && segment > 0)
        .map(|t| (u128::from(segment) * u128::from(rate) / u128::from(t)) as u64);
    (delay > 0 || frames.is_some()).then_some(Trim { delay, frames })
}

/// `iTunSMPB` metnini okur: (başlangıç dolgusu, gerçek örnek sayısı).
pub fn parse_itunsmpb(text: &str) -> Option<(u64, u64)> {
    let fields: Vec<u64> = text
        .split_whitespace()
        .take(4)
        .map(|w| u64::from_str_radix(w, 16).ok())
        .collect::<Option<_>>()?;
    match fields[..] {
        [_, delay, _, frames] => Some((delay, frames)),
        _ => None,
    }
}

#[derive(Default)]
struct Mp4Info {
    movie_timescale: Option<u64>,
    /// Ses izinin zaman ölçeği ve düzenleme listesi (son okunan ses izi).
    audio_timescale: Option<u64>,
    audio_edit: Option<(u64, u64)>,
    itunsmpb: Option<(u64, u64)>,
}

/// Üst düzey kutular arasında `kind` olanı bulup içeriğini okur (mdat atlanır).
fn find_top_level(file: &mut File, len: u64, kind: [u8; 4]) -> Option<Vec<u8>> {
    let mut offset = 0u64;
    while offset + 8 <= len {
        file.seek(SeekFrom::Start(offset)).ok()?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header[..8]).ok()?;
        let mut size = u64::from(u32::from_be_bytes(header[..4].try_into().ok()?));
        let mut header_len = 8;
        if size == 1 {
            file.read_exact(&mut header[8..16]).ok()?;
            size = u64::from_be_bytes(header[8..16].try_into().ok()?);
            header_len = 16;
        } else if size == 0 {
            size = len - offset;
        }
        if size < header_len {
            return None;
        }
        if header[4..8] == kind {
            let body = size - header_len;
            if body > MAX_BOX_READ {
                return None;
            }
            let mut data = vec![0u8; body as usize];
            file.read_exact(&mut data).ok()?;
            return Some(data);
        }
        offset = offset.checked_add(size)?;
    }
    None
}

/// Bellekteki kutuları dolaşır.
fn walk(data: &[u8], info: &mut Mp4Info, depth: usize) {
    if depth > 8 {
        return;
    }
    let mut offset = 0usize;
    // Bir `trak` içindeki bilgiler yalnızca ses iziyse alınır.
    while let Some((kind, body, next)) = next_box(data, offset) {
        match &kind {
            b"trak" => {
                let mut track = Mp4Info::default();
                let mut is_audio = false;
                walk_track(body, &mut track, &mut is_audio, depth + 1);
                if is_audio && info.audio_timescale.is_none() {
                    info.audio_timescale = track.audio_timescale;
                    info.audio_edit = track.audio_edit;
                }
            }
            b"mvhd" => info.movie_timescale = header_timescale(body),
            b"udta" | b"ilst" => walk(body, info, depth + 1),
            b"meta" => walk(body.get(4..).unwrap_or_default(), info, depth + 1),
            b"----" => {
                if let Some(value) = itunes_freeform(body, "iTunSMPB") {
                    info.itunsmpb = parse_itunsmpb(&value);
                }
            }
            _ => {}
        }
        offset = next;
    }
}

fn walk_track(data: &[u8], track: &mut Mp4Info, is_audio: &mut bool, depth: usize) {
    if depth > 8 {
        return;
    }
    let mut offset = 0usize;
    while let Some((kind, body, next)) = next_box(data, offset) {
        match &kind {
            b"mdia" | b"edts" => walk_track(body, track, is_audio, depth + 1),
            b"mdhd" => track.audio_timescale = header_timescale(body),
            b"hdlr" => *is_audio |= body.get(8..12) == Some(b"soun"),
            b"elst" => track.audio_edit = first_edit(body),
            _ => {}
        }
        offset = next;
    }
}

/// (tür, içerik, sonraki kutunun yeri).
fn next_box(data: &[u8], offset: usize) -> Option<([u8; 4], &[u8], usize)> {
    let header = data.get(offset..offset + 8)?;
    let mut size = u32::from_be_bytes(header[..4].try_into().ok()?) as u64;
    let kind: [u8; 4] = header[4..8].try_into().ok()?;
    let mut header_len = 8usize;
    if size == 1 {
        size = u64::from_be_bytes(data.get(offset + 8..offset + 16)?.try_into().ok()?);
        header_len = 16;
    } else if size == 0 {
        size = (data.len() - offset) as u64;
    }
    let end = offset.checked_add(usize::try_from(size).ok()?)?;
    if size < header_len as u64 || end > data.len() {
        return None;
    }
    Some((kind, &data[offset + header_len..end], end))
}

/// `mvhd`/`mdhd` kutusundan zaman ölçeği.
fn header_timescale(body: &[u8]) -> Option<u64> {
    let at = if *body.first()? == 1 { 20 } else { 12 };
    Some(u64::from(u32::from_be_bytes(
        body.get(at..at + 4)?.try_into().ok()?,
    )))
}

/// Düzenleme listesindeki ilk oynatılan kesim: (başlangıç, süre).
fn first_edit(body: &[u8]) -> Option<(u64, u64)> {
    let version = *body.first()?;
    let count = u32::from_be_bytes(body.get(4..8)?.try_into().ok()?) as usize;
    let entry = if version == 1 { 20 } else { 12 };
    for i in 0..count.min(64) {
        let at = 8 + i * entry;
        let e = body.get(at..at + entry)?;
        let (duration, media_time) = if version == 1 {
            (
                u64::from_be_bytes(e[..8].try_into().ok()?),
                i64::from_be_bytes(e[8..16].try_into().ok()?),
            )
        } else {
            (
                u64::from(u32::from_be_bytes(e[..4].try_into().ok()?)),
                i64::from(i32::from_be_bytes(e[4..8].try_into().ok()?)),
            )
        };
        // −1: boş kesim (sessizlik); atla.
        if media_time >= 0 {
            return Some((media_time as u64, duration));
        }
    }
    None
}

/// iTunes serbest biçimli etiket (`----`: mean/name/data) adı eşleşirse değeri.
fn itunes_freeform(body: &[u8], wanted: &str) -> Option<String> {
    let mut offset = 0usize;
    let mut name = None;
    let mut value = None;
    while let Some((kind, inner, next)) = next_box(body, offset) {
        match &kind {
            b"name" => {
                name = inner
                    .get(4..)
                    .map(|b| String::from_utf8_lossy(b).into_owned())
            }
            b"data" => {
                value = inner
                    .get(8..)
                    .map(|b| String::from_utf8_lossy(b).into_owned())
            }
            _ => {}
        }
        offset = next;
    }
    (name.as_deref() == Some(wanted)).then_some(value).flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn itunsmpb_okunur() {
        let text = " 00000000 00000840 000001CA 00000000003F31F6 00000000 00000000";
        assert_eq!(parse_itunsmpb(text), Some((0x840, 0x3F31F6)));
        assert_eq!(parse_itunsmpb("bozuk"), None);
        assert_eq!(parse_itunsmpb(" 0 1"), None);
    }

    /// Bir MP4 kutusu: boyut + tür + içerik.
    fn boxed(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(body);
        out
    }

    #[test]
    fn duzenleme_listesinden_dolgu() {
        // moov: mvhd (ölçek 1000), ses izi: elst (3000 ms, başlangıç 1024), mdhd (22050), hdlr soun.
        let mut mvhd = vec![0u8; 100];
        mvhd[12..16].copy_from_slice(&1000u32.to_be_bytes());
        let mut elst = vec![0, 0, 0, 0, 0, 0, 0, 1];
        elst.extend_from_slice(&3000u32.to_be_bytes());
        elst.extend_from_slice(&1024i32.to_be_bytes());
        elst.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        let mut mdhd = vec![0u8; 24];
        mdhd[12..16].copy_from_slice(&22_050u32.to_be_bytes());
        let mut hdlr = vec![0u8; 24];
        hdlr[8..12].copy_from_slice(b"soun");
        let mdia = [boxed(b"mdhd", &mdhd), boxed(b"hdlr", &hdlr)].concat();
        let trak = [
            boxed(b"edts", &boxed(b"elst", &elst)),
            boxed(b"mdia", &mdia),
        ]
        .concat();
        let moov = [boxed(b"mvhd", &mvhd), boxed(b"trak", &trak)].concat();
        let file = [
            boxed(b"ftyp", b"M4A \0\0\0\0"),
            boxed(b"mdat", &[0; 50]),
            boxed(b"moov", &moov),
        ]
        .concat();

        let path = crate::audio::test_util::temp_path("dolgu.m4a");
        std::fs::write(&path, file).unwrap();
        assert_eq!(
            mp4_trim(&path, 22_050),
            Some(Trim {
                delay: 1024,
                frames: Some(66_150)
            })
        );
        // Farklı örnekleme hızında oranlanır.
        assert_eq!(mp4_trim(&path, 44_100).unwrap().delay, 2048);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn mp4_olmayan_ya_da_bozuk_dosya() {
        let path = crate::audio::test_util::temp_path("bozuk.m4a");
        std::fs::write(&path, b"bu bir mp4 degil").unwrap();
        assert_eq!(mp4_trim(&path, 44_100), None);
        std::fs::write(&path, [0, 0, 0, 3, b'm', b'o', b'o', b'v']).unwrap();
        assert_eq!(mp4_trim(&path, 44_100), None);
        std::fs::remove_file(path).ok();
    }

    /// Bozma taramasının kaçırdığı (6 Kasım; tarama yalnızca `--lib` testleriyle): `iTunSMPB` etiketinin
    /// dosyanın içinden (udta/meta/ilst/----) okunması hiç sınanmıyordu.
    fn freeform(name: &str, value: &str) -> Vec<u8> {
        let mut mean = vec![0u8; 4];
        mean.extend_from_slice(b"com.apple.iTunes");
        let mut name_body = vec![0u8; 4];
        name_body.extend_from_slice(name.as_bytes());
        let mut data = vec![0, 0, 0, 1, 0, 0, 0, 0];
        data.extend_from_slice(value.as_bytes());
        boxed(
            b"----",
            &[
                boxed(b"mean", &mean),
                boxed(b"name", &name_body),
                boxed(b"data", &data),
            ]
            .concat(),
        )
    }

    /// `ilst` içeriğini `udta/meta` içine koyar (meta'nın 4 baytlık sürüm/bayrak alanıyla).
    fn udta(ilst: &[u8]) -> Vec<u8> {
        let mut meta = vec![0u8; 4];
        meta.extend_from_slice(&boxed(b"ilst", ilst));
        boxed(b"udta", &boxed(b"meta", &meta))
    }

    /// Ses izi: elst (başlangıç, süre ms), mdhd ölçeği, hdlr soun.
    fn audio_trak(edits: &[(u32, i32)], scale: u32) -> Vec<u8> {
        let mut elst = vec![0, 0, 0, 0];
        elst.extend_from_slice(&(edits.len() as u32).to_be_bytes());
        for &(duration, media_time) in edits {
            elst.extend_from_slice(&duration.to_be_bytes());
            elst.extend_from_slice(&media_time.to_be_bytes());
            elst.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        }
        let mut mdhd = vec![0u8; 24];
        mdhd[12..16].copy_from_slice(&scale.to_be_bytes());
        let mut hdlr = vec![0u8; 24];
        hdlr[8..12].copy_from_slice(b"soun");
        boxed(
            b"trak",
            &[
                boxed(b"edts", &boxed(b"elst", &elst)),
                boxed(
                    b"mdia",
                    &[boxed(b"mdhd", &mdhd), boxed(b"hdlr", &hdlr)].concat(),
                ),
            ]
            .concat(),
        )
    }

    fn mvhd(scale: u32) -> Vec<u8> {
        let mut body = vec![0u8; 100];
        body[12..16].copy_from_slice(&scale.to_be_bytes());
        boxed(b"mvhd", &body)
    }

    fn trim_of(moov: &[u8], rate: u32) -> Option<Trim> {
        let file = [boxed(b"ftyp", b"M4A \0\0\0\0"), boxed(b"moov", moov)].concat();
        let path = crate::audio::test_util::temp_path("dolgu-etiket.m4a");
        std::fs::write(&path, file).unwrap();
        let trim = mp4_trim(&path, rate);
        std::fs::remove_file(path).ok();
        trim
    }

    const SMPB: &str = " 00000000 00000840 000001CA 00000000003F31F6 00000000 00000000";

    #[test]
    fn itunsmpb_dosyadan_okunur_ve_duzenleme_listesinin_onune_gecer() {
        let trak = audio_trak(&[(3000, 1024)], 22_050);
        let tags = [
            freeform("Encoding Params", "vers"),
            freeform("iTunSMPB", SMPB),
        ]
        .concat();
        let moov = [mvhd(1000), trak.clone(), udta(&tags)].concat();
        let want = Some(Trim {
            delay: 0x840,
            frames: Some(0x3F31F6),
        });
        assert_eq!(trim_of(&moov, 22_050), want);
        // Etiket örnek sayısıdır: hızdan bağımsız.
        assert_eq!(trim_of(&moov, 44_100), want);
        // Başka adlı etiket sayılmaz: düzenleme listesi kullanılır.
        let other = [mvhd(1000), trak.clone(), udta(&freeform("iTunNORM", SMPB))].concat();
        assert_eq!(
            trim_of(&other, 22_050),
            Some(Trim {
                delay: 1024,
                frames: Some(66_150)
            })
        );
        // Etiketteki örnek sayısı 0: uzunluk bilinmiyor.
        let zero = " 00000000 00000840 000001CA 0000000000000000";
        let moov = [mvhd(1000), trak, udta(&freeform("iTunSMPB", zero))].concat();
        assert_eq!(
            trim_of(&moov, 22_050),
            Some(Trim {
                delay: 0x840,
                frames: None
            })
        );
    }

    #[test]
    fn duzenleme_listesinin_bos_kesimi_atlanir_sifirlar_dolgu_sayilmaz() {
        // İlk kesim boş (−1): ikinci kesim (başlangıç 2112, 2 sn) kullanılır.
        let moov = [mvhd(1000), audio_trak(&[(500, -1), (2000, 2112)], 44_100)].concat();
        assert_eq!(
            trim_of(&moov, 44_100),
            Some(Trim {
                delay: 2112,
                frames: Some(88_200)
            })
        );
        // Başlangıç 0 ama süre biliniyor: yalnızca uzunluk.
        let moov = [mvhd(1000), audio_trak(&[(1000, 0)], 44_100)].concat();
        assert_eq!(
            trim_of(&moov, 44_100),
            Some(Trim {
                delay: 0,
                frames: Some(44_100)
            })
        );
        // Başlangıç 0, film ölçeği 0 ya da süre 0: bilgi yok.
        let moov = [mvhd(0), audio_trak(&[(1000, 0)], 44_100)].concat();
        assert_eq!(trim_of(&moov, 44_100), None);
        let moov = [mvhd(1000), audio_trak(&[(0, 0)], 44_100)].concat();
        assert_eq!(trim_of(&moov, 44_100), None);
    }

    #[test]
    fn kutu_boyu_64_bit_ya_da_sona_kadar() {
        // udta 64 bitlik boyla (size = 1, ardından 8 baytlık boy).
        let inner = udta(&freeform("iTunSMPB", SMPB))[8..].to_vec();
        let mut big = 1u32.to_be_bytes().to_vec();
        big.extend_from_slice(b"udta");
        big.extend_from_slice(&((inner.len() + 16) as u64).to_be_bytes());
        big.extend_from_slice(&inner);
        let moov = [mvhd(1000), big].concat();
        assert_eq!(trim_of(&moov, 44_100).map(|t| t.delay), Some(0x840));
        // Son kutu boyu 0: dosyanın (kutunun) sonuna kadar.
        let mut open = 0u32.to_be_bytes().to_vec();
        open.extend_from_slice(b"udta");
        open.extend_from_slice(&inner);
        let moov = [mvhd(1000), open].concat();
        assert_eq!(trim_of(&moov, 44_100).map(|t| t.delay), Some(0x840));
    }

    #[test]
    fn cok_derin_ic_ice_kutu_okunmaz() {
        // Etiket `depth` kat udta içinde: 8 kata kadar okunur, daha derini (bozuk ya da kötü niyetli dosya)
        // dolaşılmaz.
        let nested = |depth: usize| {
            let mut b = udta(&freeform("iTunSMPB", SMPB));
            for _ in 1..depth {
                b = boxed(b"udta", &b);
            }
            [mvhd(1000), b].concat()
        };
        // udta → meta → ilst → ---- : etiket `depth + 2`. düzeyde dolaşılır.
        assert!(trim_of(&nested(6), 44_100).is_some());
        assert_eq!(trim_of(&nested(7), 44_100), None);
        assert_eq!(trim_of(&nested(20), 44_100), None);
    }
}
