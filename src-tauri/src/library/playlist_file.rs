//! Çalma listesini başka bilgisayara taşıma: `.m3u8` dosyası (UTF-8, her çalarda açılır).
//!
//! Dosyada her şarkının yolu ve süresi standart `#EXTINF` satırıyla yazılır; sanatçı, ad ve
//! albüm ayrıca `#LYRASKA:` satırında JSON olarak durur (başka çalarlar `#` satırlarını yok
//! sayar). Listenin adı `#PLAYLIST:`, kapağı `#EXTIMG:` ile (kapak dosyası listenin yanında).
//!
//! İçe aktarırken şarkı sırayla şöyle aranır: kütüphanede aynı yol → diskte aynı yol →
//! kütüphanede aynı sanatçı ve ad (süre ±3 sn, aynı albüm önce) → kütüphanede aynı dosya adı
//! (yalnızca tek şarkıdaysa).
//! Bulunamayan şarkı özgün yoluyla listede kalır (disk takılınca çalar).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use super::db::Library;
use super::playlists::PlaylistRow;
use super::LibraryError;
use crate::audio::decode::Cover;

/// İçe aktarmada kabul edilen en büyük dosya: bundan büyüğü liste değildir.
pub const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
/// Etiketle eşlemede süre farkı (saniye): aynı kaydın farklı kodlaması birkaç yüz ms oynar.
const DURATION_TOLERANCE_SECS: f64 = 3.0;

/// Listedeki bir şarkı.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FileEntry {
    pub path: String,
    pub duration_secs: Option<f64>,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub album: Option<String>,
}

/// Bir `.m3u8` dosyasının içeriği.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PlaylistFile {
    pub name: Option<String>,
    /// Kapak resminin dosya adı ya da yolu (listeye göre).
    pub cover: Option<String>,
    pub entries: Vec<FileEntry>,
}

/// `#LYRASKA:` satırının içeriği.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Tags {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    artist: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    album: Option<String>,
}

/// Satır sonu ve yönerge ayıracı içermesin (ad tek satırda kalmalı).
fn one_line(text: &str) -> String {
    text.replace(['\r', '\n'], " ")
}

/// Dosyanın metni (Windows satır sonlarıyla: Not Defteri ve eski çalarlar için).
pub fn write(file: &PlaylistFile) -> String {
    let mut out = String::from("#EXTM3U\r\n");
    if let Some(name) = &file.name {
        out.push_str(&format!("#PLAYLIST:{}\r\n", one_line(name)));
    }
    if let Some(cover) = &file.cover {
        out.push_str(&format!("#EXTIMG:{}\r\n", one_line(cover)));
    }
    for entry in &file.entries {
        let seconds = entry.duration_secs.map_or(-1, |d| d.round() as i64);
        let shown = match (&entry.artist, &entry.title) {
            (Some(artist), Some(title)) => format!("{artist} - {title}"),
            (None, Some(title)) => title.clone(),
            _ => file_name(&entry.path).to_owned(),
        };
        out.push_str(&format!("#EXTINF:{seconds},{}\r\n", one_line(&shown)));
        let tags = Tags {
            artist: entry.artist.clone(),
            title: entry.title.clone(),
            album: entry.album.clone(),
        };
        if tags.artist.is_some() || tags.title.is_some() || tags.album.is_some() {
            if let Ok(json) = serde_json::to_string(&tags) {
                out.push_str(&format!("#LYRASKA:{json}\r\n"));
            }
        }
        out.push_str(&one_line(&entry.path));
        out.push_str("\r\n");
    }
    out
}

/// Yolun son parçası (`\` ve `/` ayıraçlarının ikisi de).
fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// Mutlak yol mu ("C:\…", "\\sunucu\…", "/…"): hangi sistemde yazıldığından bağımsız.
fn is_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    path.starts_with('/')
        || path.starts_with('\\')
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && (bytes[2] == b'\\' || bytes[2] == b'/'))
}

/// `file:///C:/M%C3%BCzik/a.flac` → `C:/Müzik/a.flac`. Bozuk kodlama olduğu gibi kalır.
fn from_file_url(line: &str) -> Option<String> {
    let rest = line
        .strip_prefix("file://")
        .or_else(|| line.strip_prefix("FILE://"))?;
    // "file:///C:/…" → "C:/…"; "file:///home/…" → "/home/…"; "file://sunucu/…" → "//sunucu/…".
    let rest = match rest.strip_prefix('/') {
        Some(tail) if is_absolute(tail) => tail.to_owned(),
        Some(tail) => format!("/{tail}"),
        None => format!("//{rest}"),
    };
    // Baytlarla çözülür: metni dilimlemek çok baytlı harfin ortasına denk gelip programı düşürürdü.
    let hex = |b: u8| (b as char).to_digit(16);
    let bytes = rest.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                decoded.push((high * 16 + low) as u8);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }
    Some(String::from_utf8(decoded).unwrap_or(rest))
}

/// Göreli yolu listenin klasörüne göre çözer; ayıraç listenin yazıldığı gibi kalır.
fn resolve_path(raw: &str, base_dir: &Path) -> String {
    let path = from_file_url(raw).unwrap_or_else(|| raw.to_owned());
    if is_absolute(&path) {
        return path;
    }
    base_dir.join(path).to_string_lossy().into_owned()
}

/// Dosyanın metninden liste. Göreli yollar `base_dir`'e göre çözülür; bilinmeyen satırlar
/// yok sayılır.
pub fn parse(text: &str, base_dir: &Path) -> PlaylistFile {
    let mut file = PlaylistFile::default();
    let mut pending = FileEntry::default();
    for line in text.trim_start_matches('\u{feff}').lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(name) = line.strip_prefix("#PLAYLIST:") {
            let name = name.trim();
            if !name.is_empty() {
                file.name = Some(name.to_owned());
            }
        } else if let Some(cover) = line.strip_prefix("#EXTIMG:") {
            let cover = cover.trim();
            if !cover.is_empty() {
                file.cover = Some(resolve_path(cover, base_dir));
            }
        } else if let Some(info) = line.strip_prefix("#EXTINF:") {
            // "#EXTINF:240 tvg-id=\"…\",Sanatçı - Ad": süre virgüle (ya da boşluğa) kadar.
            let (head, shown) = info.split_once(',').unwrap_or((info, ""));
            let seconds = head.split_whitespace().next().unwrap_or("");
            pending.duration_secs = seconds.parse::<f64>().ok().filter(|s| *s > 0.0);
            if pending.title.is_none() && !shown.trim().is_empty() {
                // Lyraska satırı yoksa "Sanatçı - Ad" ayrılır (ayıraç yoksa hepsi ad).
                match shown.split_once(" - ") {
                    Some((artist, title)) => {
                        pending.artist = Some(artist.trim().to_owned());
                        pending.title = Some(title.trim().to_owned());
                    }
                    None => pending.title = Some(shown.trim().to_owned()),
                }
            }
        } else if let Some(json) = line.strip_prefix("#LYRASKA:") {
            if let Ok(tags) = serde_json::from_str::<Tags>(json) {
                pending.artist = tags.artist;
                pending.title = tags.title;
                pending.album = tags.album;
            }
        } else if line.starts_with('#') {
            continue;
        } else {
            pending.path = resolve_path(line, base_dir);
            file.entries.push(std::mem::take(&mut pending));
        }
    }
    file
}

/// Eşlemede kullanılan kütüphane şarkısı.
#[derive(Debug, Clone)]
pub struct LibraryEntry {
    pub path: String,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub album: Option<String>,
    pub duration_secs: Option<f64>,
}

/// Şarkının nasıl bulunduğu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Match {
    /// Kütüphanede ya da diskte aynı yol.
    SamePath,
    /// Kütüphanede aynı sanatçı ve ad.
    Tags,
    /// Kütüphanede aynı dosya adı.
    FileName,
    /// Bulunamadı: özgün yol kalır.
    Missing,
}

/// Karşılaştırma için: küçük harf, fazla boşluk tek. I, ı, İ ve i aynı sayılır: etiket bir
/// bilgisayarda "Itır", ötekinde "itır" (ya da İngilizce "I Will" / "i will") yazılmış olabilir.
fn norm(text: &str) -> String {
    let lower: String = text
        .chars()
        .flat_map(|c| match c {
            'I' | 'ı' | 'İ' => vec!['i'],
            c => c.to_lowercase().collect(),
        })
        .collect();
    lower.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Yolu yazımından bağımsız karşılaştırmak için: ayıraç `\`, küçük harf ("file:///C:/…" ile
/// "C:\…" aynı dosyadır; Windows'ta büyük/küçük harf de fark etmez).
fn path_key(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

/// Her şarkının bu bilgisayardaki yolu ve nasıl bulunduğu (listenin sırasıyla).
pub fn resolve(
    entries: &[FileEntry],
    library: &[LibraryEntry],
    exists: impl Fn(&str) -> bool,
) -> Vec<(String, Match)> {
    let by_path: HashMap<&str, &LibraryEntry> =
        library.iter().map(|t| (t.path.as_str(), t)).collect();
    let mut by_key: HashMap<String, &LibraryEntry> = HashMap::new();
    for track in library {
        by_key.entry(path_key(&track.path)).or_insert(track);
    }
    let mut by_tags: HashMap<(String, String), Vec<&LibraryEntry>> = HashMap::new();
    let mut by_name: HashMap<String, Vec<&LibraryEntry>> = HashMap::new();
    for track in library {
        if let (Some(artist), Some(title)) = (&track.artist, &track.title) {
            by_tags
                .entry((norm(artist), norm(title)))
                .or_default()
                .push(track);
        }
        by_name
            .entry(norm(file_name(&track.path)))
            .or_default()
            .push(track);
    }
    entries
        .iter()
        .map(|entry| {
            if by_path.contains_key(entry.path.as_str()) {
                return (entry.path.clone(), Match::SamePath);
            }
            // Aynı dosya başka yazımla: listeye kütüphanedeki yazımı girer (şarkı orada görünsün).
            if let Some(found) = by_key.get(&path_key(&entry.path)) {
                return (found.path.clone(), Match::SamePath);
            }
            if exists(&entry.path) {
                return (entry.path.clone(), Match::SamePath);
            }
            if let (Some(artist), Some(title)) = (&entry.artist, &entry.title) {
                if let Some(found) = by_tags
                    .get(&(norm(artist), norm(title)))
                    .and_then(|candidates| best_by_tags(entry, candidates))
                {
                    return (found.path.clone(), Match::Tags);
                }
            }
            if let Some(found) = by_name
                .get(&norm(file_name(&entry.path)))
                .and_then(|candidates| only_by_name(entry, candidates))
            {
                return (found.path.clone(), Match::FileName);
            }
            (entry.path.clone(), Match::Missing)
        })
        .collect()
}

/// Aynı dosya adındaki adaylardan süresi tutan tek şarkı. "01.flac" gibi ad birden çok şarkıda
/// varsa tahmin edilmez: yanlış şarkı çalmaktansa bulunamadı denir.
fn only_by_name<'a>(
    entry: &FileEntry,
    candidates: &[&'a LibraryEntry],
) -> Option<&'a LibraryEntry> {
    let mut fitting = candidates.iter().copied().filter(|track| {
        match (entry.duration_secs, track.duration_secs) {
            (Some(a), Some(b)) => (a - b).abs() <= DURATION_TOLERANCE_SECS,
            _ => true,
        }
    });
    let found = fitting.next()?;
    fitting.next().is_none().then_some(found)
}

/// Aynı sanatçı ve addaki adaylardan süresi tutanlar; aynı albüm önce, sonra süresi en yakın.
fn best_by_tags<'a>(
    entry: &FileEntry,
    candidates: &[&'a LibraryEntry],
) -> Option<&'a LibraryEntry> {
    let duration_gap = |track: &LibraryEntry| match (entry.duration_secs, track.duration_secs) {
        (Some(a), Some(b)) => Some((a - b).abs()),
        _ => None,
    };
    let album = entry.album.as_deref().map(norm);
    candidates
        .iter()
        .copied()
        .filter(|track| duration_gap(track).is_none_or(|gap| gap <= DURATION_TOLERANCE_SECS))
        .min_by(|a, b| {
            let same_album =
                |t: &LibraryEntry| album.is_some() && t.album.as_deref().map(norm) == album;
            same_album(b).cmp(&same_album(a)).then_with(|| {
                let gap = |t: &LibraryEntry| duration_gap(t).unwrap_or(f64::MAX);
                gap(a).total_cmp(&gap(b))
            })
        })
}

/// Dışa aktarılan dosyanın kapağının adı: "Yolculuk.m3u8" → "Yolculuk-kapak.jpg".
fn cover_file_name(list: &Path, cover: &Cover) -> Option<String> {
    let stem = list.file_stem()?.to_string_lossy();
    let extension = match cover.media_type {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    };
    Some(format!("{stem}-kapak.{extension}"))
}

/// Listeyi `dest` dosyasına yazar; kapak varsa yanına "<ad>-kapak.<uzantı>" olarak konur.
pub fn export(mut file: PlaylistFile, cover: Option<Cover>, dest: &Path) -> std::io::Result<()> {
    file.cover = None;
    if let Some(cover) = cover {
        if let (Some(name), Some(dir)) = (cover_file_name(dest, &cover), dest.parent()) {
            crate::atomic_file::write(&dir.join(&name), &cover.data)?;
            file.cover = Some(name);
        }
    }
    crate::atomic_file::write(dest, write(&file).as_bytes())
}

/// İçe aktarılacak dosyayı okur. UTF-8 değilse (eski `.m3u`) Türkçe kodlamalar denenir.
pub fn read(src: &Path) -> Result<PlaylistFile, LibraryError> {
    let size = std::fs::metadata(src)
        .map_err(|e| LibraryError::PlaylistFile(e.to_string()))?
        .len();
    if size > MAX_FILE_BYTES {
        return Err(LibraryError::PlaylistFile(
            "dosya bir çalma listesi için çok büyük".into(),
        ));
    }
    let bytes = std::fs::read(src).map_err(|e| LibraryError::PlaylistFile(e.to_string()))?;
    let text = crate::audio::lyrics::decode_text(&bytes);
    let base = src.parent().map(Path::to_path_buf).unwrap_or_default();
    let mut file = parse(&text, &base);
    // Kapak yalnızca listenin yanındaki dosya olabilir: başka bir dosyanın içine yazılmış yol
    // bilgisayardaki herhangi bir resmi Lyraska'ya kopyalatamasın.
    file.cover = file
        .cover
        .filter(|cover| Path::new(cover).parent() == Some(base.as_path()));
    if file.name.is_none() {
        file.name = src.file_stem().map(|s| s.to_string_lossy().into_owned());
    }
    Ok(file)
}

/// İçe aktarmanın sonucu.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct PlaylistImport {
    pub playlist: PlaylistRow,
    /// Aynı yolda bulunan şarkılar.
    pub same_path: u32,
    /// Sanatçı ve adıyla bulunanlar.
    pub by_tags: u32,
    /// Dosya adıyla bulunanlar.
    pub by_file_name: u32,
    /// Bulunamayanlar (özgün yoluyla listede kalır).
    pub missing: u32,
    /// Listenin kapak resmi (dosyada varsa; kapak deposuna komut koyar).
    #[serde(skip)]
    pub cover: Option<PathBuf>,
}

impl Library {
    /// Listenin dışa aktarılacak içeriği: yollar ve kütüphanedeki etiketleri.
    pub fn playlist_file(&self, id: i64) -> Result<PlaylistFile, LibraryError> {
        let name: String = self
            .conn()
            .query_row("SELECT name FROM playlists WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(LibraryError::PlaylistMissing)?;
        let mut stmt = self.conn().prepare(
            "SELECT e.path, t.duration_secs, t.artist, t.title, t.album
             FROM playlist_entries e LEFT JOIN tracks t ON t.path = e.path
             WHERE e.playlist_id = ?1 ORDER BY e.position",
        )?;
        let entries = stmt
            .query_map([id], |r| {
                Ok(FileEntry {
                    path: r.get(0)?,
                    duration_secs: r.get(1)?,
                    artist: r.get(2)?,
                    title: r.get(3)?,
                    album: r.get(4)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(PlaylistFile {
            name: Some(name),
            cover: None,
            entries,
        })
    }

    /// Dosyadan yeni liste kurar; şarkılar bu bilgisayarın kütüphanesinde aranır.
    pub fn import_playlist(
        &self,
        file: &PlaylistFile,
        exists: impl Fn(&str) -> bool,
    ) -> Result<PlaylistImport, LibraryError> {
        let mut stmt = self
            .conn()
            .prepare("SELECT path, artist, title, album, duration_secs FROM tracks")?;
        let library: Vec<LibraryEntry> = stmt
            .query_map([], |r| {
                Ok(LibraryEntry {
                    path: r.get(0)?,
                    artist: r.get(1)?,
                    title: r.get(2)?,
                    album: r.get(3)?,
                    duration_secs: r.get(4)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        let found = resolve(&file.entries, &library, exists);
        let name = file.name.as_deref().unwrap_or("İçe aktarılan liste");
        let created = self.create_playlist(name)?;
        let paths: Vec<String> = found.iter().map(|(path, _)| path.clone()).collect();
        self.add_to_playlist(created.id, &paths)?;
        let count = |kind: Match| found.iter().filter(|(_, m)| *m == kind).count() as u32;
        Ok(PlaylistImport {
            playlist: self
                .playlist(created.id)?
                .ok_or(LibraryError::PlaylistMissing)?,
            same_path: count(Match::SamePath),
            by_tags: count(Match::Tags),
            by_file_name: count(Match::FileName),
            missing: count(Match::Missing),
            cover: file
                .cover
                .as_ref()
                .map(PathBuf::from)
                .filter(|path| path.is_file()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn entry(path: &str, artist: &str, title: &str, secs: f64) -> FileEntry {
        FileEntry {
            path: path.into(),
            duration_secs: Some(secs),
            artist: Some(artist.into()),
            title: Some(title.into()),
            album: None,
        }
    }

    fn track(path: &str, artist: &str, title: &str, album: &str, secs: f64) -> LibraryEntry {
        LibraryEntry {
            path: path.into(),
            artist: Some(artist.into()),
            title: Some(title.into()),
            album: Some(album.into()),
            duration_secs: Some(secs),
        }
    }

    #[test]
    fn yazilan_dosya_aynen_geri_okunur() {
        let file = PlaylistFile {
            name: Some("Yolculuk – Şubat".into()),
            cover: Some("Yolculuk-kapak.jpg".into()),
            entries: vec![
                FileEntry {
                    path: r"D:\Müzik\Şebnem Ferah\01 Çakıl Taşları.flac".into(),
                    duration_secs: Some(241.0),
                    artist: Some("Şebnem Ferah".into()),
                    title: Some("Çakıl Taşları".into()),
                    album: Some("Kelimeler".into()),
                },
                FileEntry {
                    path: r"D:\Müzik\etiketsiz.mp3".into(),
                    duration_secs: None,
                    artist: None,
                    title: None,
                    album: None,
                },
            ],
        };
        let text = write(&file);
        assert!(text.starts_with("#EXTM3U\r\n"));
        assert!(text.contains("#EXTINF:241,Şebnem Ferah - Çakıl Taşları\r\n"));
        assert!(text.contains("#EXTINF:-1,etiketsiz.mp3\r\n"));
        let back = parse(&text, Path::new("/liste"));
        assert_eq!(back.name, file.name);
        assert_eq!(
            back.cover.as_deref().map(PathBuf::from),
            Some(PathBuf::from("/liste/Yolculuk-kapak.jpg"))
        );
        assert_eq!(back.entries.len(), 2);
        assert_eq!(back.entries[0], file.entries[0]);
        // Etiketsiz şarkıda gösterilen ad dosya adıdır; Lyraska satırı yok, ad olarak okunur.
        assert_eq!(back.entries[1].path, file.entries[1].path);
        assert_eq!(back.entries[1].duration_secs, None);
    }

    #[test]
    fn ad_satir_sonu_ile_dosyayi_bozamaz() {
        let file = PlaylistFile {
            name: Some("kötü\r\n#EXTINF:1,x\r\nC:\\virüs.exe".into()),
            cover: None,
            entries: vec![],
        };
        let back = parse(&write(&file), Path::new("/"));
        assert!(back.entries.is_empty());
    }

    #[test]
    fn baska_calarlarin_dosyalari_okunur() {
        // Winamp/foobar biçimi: BOM, göreli yol, file:// adresi, ekstra öznitelikler.
        let text = "\u{feff}#EXTM3U\n#EXTINF:200 tvg-id=\"x\",Barış Manço - Gülpembe\nAlbüm/02 Gülpembe.mp3\n\n#EXTINF:180,Yalnız Ad\nfile:///C:/M%C3%BCzik/a%20b.flac\n# yorum\n/home/kullanici/c.ogg\n";
        let file = parse(text, Path::new("/listeler"));
        assert_eq!(file.name, None);
        assert_eq!(file.entries.len(), 3);
        assert_eq!(
            PathBuf::from(&file.entries[0].path),
            PathBuf::from("/listeler/Albüm/02 Gülpembe.mp3")
        );
        assert_eq!(file.entries[0].artist.as_deref(), Some("Barış Manço"));
        assert_eq!(file.entries[0].title.as_deref(), Some("Gülpembe"));
        assert_eq!(file.entries[0].duration_secs, Some(200.0));
        assert_eq!(file.entries[1].path, "C:/Müzik/a b.flac");
        assert_eq!(file.entries[1].artist, None);
        assert_eq!(file.entries[1].title.as_deref(), Some("Yalnız Ad"));
        assert_eq!(file.entries[2].path, "/home/kullanici/c.ogg");
        assert_eq!(file.entries[2].title, None);
    }

    #[test]
    fn baska_bilgisayarda_sarki_yol_etiket_ve_dosya_adiyla_bulunur() {
        let library = vec![
            track(
                r"E:\Arşiv\Kelimeler\01 Çakıl Taşları.flac",
                "Şebnem Ferah",
                "Çakıl Taşları",
                "Kelimeler",
                241.4,
            ),
            // Aynı ad, başka albümde ve süresi tutmayan canlı kayıt: seçilmez.
            track(
                r"E:\Arşiv\Canlı\Çakıl Taşları.flac",
                "ŞEBNEM FERAH",
                "çakıl  taşları",
                "Canlı",
                300.0,
            ),
            track(
                r"E:\Arşiv\Diğer\Gülpembe.mp3",
                "Barış Manço",
                "Gülpembe",
                "Darısı Başınıza",
                200.0,
            ),
            track(r"E:\Arşiv\Etiketsiz\ITIR.mp3", "Bilinmeyen", "x", "y", 10.0),
        ];
        let mut first = entry(
            r"D:\Müzik\01 Çakıl Taşları.flac",
            "Şebnem Ferah",
            "Çakıl Taşları",
            241.0,
        );
        first.album = Some("Kelimeler".into());
        let entries = vec![
            first,
            entry(r"D:\Müzik\Gülpembe.mp3", "barış manço", "GÜLPEMBE", 199.0),
            FileEntry {
                path: r"D:\Eski\ıtır.mp3".into(),
                ..Default::default()
            },
            entry(r"D:\Müzik\takılı.flac", "Kimse", "Yok", 100.0),
            entry(r"D:\Müzik\yok.flac", "Kimse", "Yok", 100.0),
        ];
        let found = resolve(&entries, &library, |path| path.ends_with("takılı.flac"));
        assert_eq!(found[0], (library[0].path.clone(), Match::Tags));
        assert_eq!(found[1], (library[2].path.clone(), Match::Tags));
        assert_eq!(found[2], (library[3].path.clone(), Match::FileName));
        assert_eq!(
            found[3],
            (r"D:\Müzik\takılı.flac".to_owned(), Match::SamePath)
        );
        assert_eq!(found[4], (r"D:\Müzik\yok.flac".to_owned(), Match::Missing));
    }

    #[test]
    fn kutuphanedeki_ayni_yol_once_gelir_suresi_bilinmeyen_aday_kabul_edilir() {
        let mut no_duration = track("/m/a.flac", "A", "B", "C", 0.0);
        no_duration.duration_secs = None;
        let library = vec![no_duration];
        let entries = vec![
            entry("/m/a.flac", "Başka", "Şarkı", 999.0),
            entry("/x/a2.flac", "a", "b", 120.0),
        ];
        let found = resolve(&entries, &library, |_| false);
        assert_eq!(found[0].1, Match::SamePath);
        assert_eq!(found[1], ("/m/a.flac".to_owned(), Match::Tags));
    }

    #[test]
    fn liste_bir_bilgisayardan_digerine_tasinir() {
        // Birinci bilgisayar: liste dışa aktarılır (biri kütüphanede olmayan şarkı).
        let first = Library::open_in_memory().unwrap();
        first.execute_for_test("INSERT INTO folders (id, path) VALUES (1, 'D:/Müzik')");
        first.execute_for_test(
            "INSERT INTO tracks (folder_id, path, file_name, title, artist, album, duration_secs,
             codec, sample_rate, channels, file_size, modified, sort_key, search)
             VALUES (1, 'D:/Müzik/a.flac', 'a.flac', 'Gülpembe', 'Barış Manço', 'Darısı', 200,
             'flac', 44100, 2, 1, 1, 'k', 's')",
        );
        let list = first.create_playlist("Yolculuk").unwrap();
        first
            .add_to_playlist(
                list.id,
                &["D:/Müzik/a.flac".into(), "D:/Müzik/kayıp.mp3".into()],
            )
            .unwrap();
        let dir = std::env::temp_dir().join(format!("lyraska-liste-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let dest = dir.join("Yolculuk.m3u8");
        let cover = Cover {
            media_type: "image/png",
            data: vec![1, 2, 3],
        };
        export(first.playlist_file(list.id).unwrap(), Some(cover), &dest).unwrap();
        assert_eq!(
            std::fs::read(dir.join("Yolculuk-kapak.png")).unwrap(),
            [1, 2, 3]
        );

        // İkinci bilgisayar: müzik başka klasörde; şarkı etiketiyle bulunur, kapak gelir.
        let second = Library::open_in_memory().unwrap();
        second.execute_for_test("INSERT INTO folders (id, path) VALUES (1, '/home/k/Müzik')");
        second.execute_for_test(
            "INSERT INTO tracks (folder_id, path, file_name, title, artist, album, duration_secs,
             codec, sample_rate, channels, file_size, modified, sort_key, search)
             VALUES (1, '/home/k/Müzik/Barış Manço/01.flac', '01.flac', 'Gülpembe', 'Barış Manço',
             'Darısı', 200.4, 'flac', 44100, 2, 1, 1, 'k', 's')",
        );
        let file = read(&dest).unwrap();
        let imported = second.import_playlist(&file, |_| false).unwrap();
        assert_eq!(imported.playlist.name, "Yolculuk");
        assert_eq!(
            (imported.by_tags, imported.missing, imported.same_path),
            (1, 1, 0)
        );
        assert_eq!(imported.cover, Some(dir.join("Yolculuk-kapak.png")));
        assert_eq!(
            second.playlist_tracks(imported.playlist.id).unwrap(),
            ["/home/k/Müzik/Barış Manço/01.flac", "D:/Müzik/kayıp.mp3"]
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn bozuk_file_adresi_programi_dusurmez() {
        // "%" ardından tek onaltılık hane ve çok baytlı harf: bayt ortasından dilimlenmesin.
        assert_eq!(
            from_file_url("file:///C:/a%aü.mp3").as_deref(),
            Some("C:/a%aü.mp3")
        );
        assert_eq!(
            from_file_url("file:///C:/%ü%.mp3").as_deref(),
            Some("C:/%ü%.mp3")
        );
        // "+1" onaltılık sayı değildir; sondaki "%41" de çözülür.
        assert_eq!(
            from_file_url("file:///C:/a%+1b%41").as_deref(),
            Some("C:/a%+1bA")
        );
    }

    #[test]
    fn yolun_ayiraci_ve_harf_buyuklugu_farkli_olsa_da_kutuphanedeki_yol_alinir() {
        // VLC listeleri "file:///C:/…" yazar; kütüphanede yol "C:\…" biçimindedir. Diskte
        // bulunsa da listeye kütüphanedeki yazımı girmeli (yoksa şarkı kütüphanede görünmez).
        let library = vec![track(r"C:\Müzik\Albüm\a b.flac", "A", "B", "C", 100.0)];
        let entries = vec![FileEntry {
            path: "c:/MÜZIK/Albüm/a b.flac".into(),
            ..Default::default()
        }];
        let found = resolve(&entries, &library, |_| true);
        assert_eq!(found[0], (library[0].path.clone(), Match::SamePath));
    }

    #[test]
    fn dosya_adi_birden_fazla_sarkida_varsa_tahmin_edilmez() {
        // "01.flac" gibi adlar her albümde var: rastgele birini almak yanlış şarkıyı çalar.
        let library = vec![
            track(r"E:\A\01.flac", "x", "y", "z", 100.0),
            track(r"E:\B\01.flac", "x2", "y2", "z2", 200.0),
            track(r"E:\C\tek.flac", "x3", "y3", "z3", 50.0),
        ];
        let plain = |path: &str, secs: Option<f64>| FileEntry {
            path: path.into(),
            duration_secs: secs,
            ..Default::default()
        };
        let entries = vec![
            plain(r"D:\Eski\01.flac", None),
            // Süre adaylardan yalnızca birini tutuyorsa o alınır.
            plain(r"D:\Eski\01.flac", Some(199.0)),
            plain(r"D:\Eski\tek.flac", None),
            // Tek aday da süresi tutmuyorsa başka şarkıdır.
            plain(r"D:\Eski\tek.flac", Some(500.0)),
        ];
        let found = resolve(&entries, &library, |_| false);
        assert_eq!(found[0].1, Match::Missing);
        assert_eq!(found[1], (library[1].path.clone(), Match::FileName));
        assert_eq!(found[2], (library[2].path.clone(), Match::FileName));
        assert_eq!(found[3].1, Match::Missing);
    }

    #[test]
    fn turkce_i_harfleri_buyuk_kucuk_fark_etmeden_eslesir() {
        // Etiket bir bilgisayarda "Itır", ötekinde "itır" yazılmış olabilir: ikisi de aynı şarkı.
        let library = vec![track("/m/a.flac", "Itır", "Işık", "A", 100.0)];
        let entries = vec![entry("/x/b.flac", "itır", "ışık", 100.0)];
        let found = resolve(&entries, &library, |_| false);
        assert_eq!(found[0], ("/m/a.flac".to_owned(), Match::Tags));
        assert_eq!(norm("İSTANBUL"), norm("istanbul"));
        assert_eq!(norm("I Will Survive"), norm("i will survive"));
        assert_eq!(norm("IRMAK"), norm("ırmak"));
    }

    #[test]
    fn olmayan_dosya_okunamaz() {
        assert!(matches!(
            read(Path::new("/olmayan/liste.m3u8")),
            Err(LibraryError::PlaylistFile(_))
        ));
    }

    #[test]
    fn kapak_yalnizca_listenin_yanindaki_dosya_olabilir() {
        let dir = std::env::temp_dir().join(format!("lyraska-kapak-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let list = dir.join("Uzak.m3u8");
        std::fs::write(&list, "#EXTM3U\r\n#EXTIMG:../baska/gizli.png\r\na.flac\r\n").unwrap();
        assert_eq!(read(&list).unwrap().cover, None);
        std::fs::write(&list, "#EXTM3U\r\n#EXTIMG:/etc/gizli.png\r\na.flac\r\n").unwrap();
        assert_eq!(read(&list).unwrap().cover, None);
        std::fs::write(&list, "#EXTM3U\r\n#EXTIMG:Uzak-kapak.jpg\r\na.flac\r\n").unwrap();
        assert_eq!(
            read(&list).unwrap().cover.map(PathBuf::from),
            Some(dir.join("Uzak-kapak.jpg"))
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
