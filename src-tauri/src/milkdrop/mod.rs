//! MilkDrop sahnesi için kullanıcının kendi `.milk` dosyaları.
//!
//! **Lyraska hazır MilkDrop görseli (preset) içermez ve dağıtmaz**: yaygın preset paketlerinin
//! yazarları lisans vermemiştir (`docs/LISANSLAR.md`). Kullanıcı kendi bilgisayarındaki bir klasörü
//! seçer; program o klasördeki `.milk` dosyalarını listeler ve seçileni Butterchurn'ün JSON
//! biçimine çevirir ([`parse`]). Dosyalar hiçbir yere kopyalanmaz ya da saklanmaz; yalnızca
//! seçilen klasörün yolu ayarlarda hatırlanır. Gölgelendiriciler (HLSL) kum havuzundaki bir
//! çeviriciyle GLSL'e çevrilir ([`shader`]).
//!
//! Güvenlik: yalnızca seçilen klasörün içindeki (ve bir alt düzeyindeki) `.milk` dosyaları açılır;
//! boyut sınırı vardır. Çevrilen preset yalnızca sayılar ve EEL denklem metni taşır; denklemleri
//! arayüzdeki Butterchurn WebAssembly'ye derler (JavaScript olarak çalıştırılmaz).

pub mod eel;
pub mod parse;
pub mod shader;
mod shader_loops;

use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

pub use parse::{ButterchurnPreset, ButterchurnShape, ButterchurnWave};

/// Listelenen en fazla görsel. Büyük paketler (ör. 10 000 preset) ilk 5000'iyle listelenir.
pub const MAX_PRESETS: usize = 5000;
/// Klasör taramasında bakılan en fazla girdi (dosya ve alt klasör).
const MAX_SCAN_ENTRIES: usize = 200_000;
/// Ayarlarda saklanan klasör yolunun en büyük uzunluğu (bayt).
const MAX_FOLDER_PATH: usize = 4096;

/// Klasördeki bir görsel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct MilkdropEntry {
    /// Gösterilen ad: dosya adı (uzantısız); alt klasördeyse "alt klasör / ad".
    pub name: String,
    pub path: PathBuf,
}

/// Seçilen klasör ve içindeki görseller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct MilkdropFolder {
    /// Seçilen klasör; henüz seçilmediyse `null`.
    pub folder: Option<PathBuf>,
    /// Türkçe sıralı (büyük/küçük harf ve Türkçe harf farkı gözetmeden).
    pub presets: Vec<MilkdropEntry>,
    /// Klasörde [`MAX_PRESETS`]'ten fazla görsel vardı; ilkleri listelendi.
    pub truncated: bool,
    /// Klasör okunamadıysa nedeni (ör. çıkarılmış disk); klasör yine hatırlanır.
    pub error: Option<String>,
}

/// Açılan görsel.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct MilkdropPreset {
    pub name: String,
    /// Gölgelendiricisi (HLSL) çevrilemediği için atıldı: görsel sade hâliyle çalar.
    pub simplified: bool,
    /// Çevrilemeyen gölgelendiricinin nedeni (günlüğe yazılır; galeride "sade hâliyle çalıyor"
    /// notunun yanında görünür).
    pub shader_error: Option<String>,
    /// Butterchurn'ün `loadPreset`'ine verilecek nesne.
    pub preset: ButterchurnPreset,
}

#[derive(Debug, thiserror::Error)]
pub enum MilkdropError {
    #[error("MilkDrop klasörü seçilmedi")]
    NoFolder,
    #[error("Yalnızca seçilen klasördeki .milk dosyaları açılabilir")]
    OutsideFolder,
    #[error("Klasör okunamadı ({path}): {source}")]
    Folder {
        path: String,
        source: std::io::Error,
    },
    #[error("Görsel dosyası okunamadı ({path}): {source}")]
    Read {
        path: String,
        source: std::io::Error,
    },
    #[error("Görsel açılamadı ({name}): {source}")]
    Parse {
        name: String,
        source: parse::ParseError,
    },
}

/// Ayarlardan okunan klasör yolu: boş, göreli, `..` içeren ya da aşırı uzun yol unutulur;
/// Windows'ta yalnızca yerel disk yolu (`C:\…`; ağ paylaşımı ve aygıt yolları değil). Klasörün
/// var olup olmadığına bakılmaz (çıkarılmış disk takılınca yine çalışsın).
pub fn sanitize_folder(folder: Option<PathBuf>) -> Option<PathBuf> {
    folder.filter(|path| {
        let text = path.as_os_str();
        let local = if cfg!(windows) {
            windows_local_absolute(&path.to_string_lossy())
        } else {
            path.is_absolute()
        };
        !text.is_empty()
            && text.len() <= MAX_FOLDER_PATH
            && local
            && !path.components().any(|c| c == Component::ParentDir)
    })
}

/// Windows yolu yerel bir diskte mutlak mı? Yalnızca `C:\…` (ya da `C:/…`) ve `\\?\C:\…`
/// (Rust'taki `Prefix::Disk` ve `Prefix::VerbatimDisk`). Ağ paylaşımı (`\\sunucu\…`,
/// `\\?\UNC\…`), aygıt (`\\.\…`), diğer `\\?\` yolları, sürücüye göreli (`C:a`) ve kökten
/// (`\a`) yollar ve `..` içeren yollar reddedilir. Linux'ta da sınansın diye metin üzerinde çalışır.
pub fn windows_local_absolute(path: &str) -> bool {
    let (rest, verbatim) = match path.strip_prefix(r"\\?\") {
        Some(rest) => (rest, true),
        None => (path, false),
    };
    let is_separator = |c: char| c == '\\' || (!verbatim && c == '/');
    let mut chars = rest.chars();
    let drive = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.next() == Some(':')
        && chars.next().is_some_and(is_separator);
    drive && !rest.split(is_separator).any(|part| part == "..")
}

/// Klasörün durumu: seçilmemişse boş liste; okunamıyorsa hata metniyle.
pub fn folder_state(folder: Option<PathBuf>) -> MilkdropFolder {
    let Some(path) = folder else {
        return MilkdropFolder {
            folder: None,
            presets: Vec::new(),
            truncated: false,
            error: None,
        };
    };
    match list(&path) {
        Ok((presets, truncated)) => MilkdropFolder {
            folder: Some(path),
            presets,
            truncated,
            error: None,
        },
        Err(error) => MilkdropFolder {
            folder: Some(path),
            presets: Vec::new(),
            truncated: false,
            error: Some(error.to_string()),
        },
    }
}

/// Klasördeki ve bir alt düzeyindeki `.milk` dosyaları, Türkçe sıralı; en fazla [`MAX_PRESETS`]
/// (fazlası varsa ikinci değer `true`).
pub fn list(folder: &Path) -> Result<(Vec<MilkdropEntry>, bool), MilkdropError> {
    let folder_error = |source| MilkdropError::Folder {
        path: folder.display().to_string(),
        source,
    };
    if !folder.is_dir() {
        return Err(folder_error(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "klasör yok",
        )));
    }
    let mut found: Vec<(String, MilkdropEntry)> = Vec::new();
    let walker = walkdir::WalkDir::new(folder)
        .min_depth(1)
        .max_depth(2)
        .follow_links(false);
    for entry in walker.into_iter().take(MAX_SCAN_ENTRIES) {
        let entry = match entry {
            Ok(entry) => entry,
            // Kökün kendisi okunamıyorsa hata; içteki okunamayan alt klasör atlanır.
            Err(error) if error.depth() == 0 => {
                return Err(folder_error(
                    error
                        .into_io_error()
                        .unwrap_or_else(|| std::io::Error::other("okunamadı")),
                ))
            }
            Err(_) => continue,
        };
        let path = entry.path();
        if !entry.file_type().is_file() || !is_milk(path) {
            continue;
        }
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let name = match path.parent().filter(|_| entry.depth() == 2) {
            Some(parent) => {
                let sub = parent
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                format!("{sub} / {stem}")
            }
            None => stem,
        };
        let key = crate::library::search_key(&name);
        found.push((
            key,
            MilkdropEntry {
                name,
                path: path.to_path_buf(),
            },
        ));
    }
    found.sort_by(|(a, x), (b, y)| a.cmp(b).then_with(|| x.path.cmp(&y.path)));
    let truncated = found.len() > MAX_PRESETS;
    found.truncate(MAX_PRESETS);
    Ok((
        found.into_iter().map(|(_, entry)| entry).collect(),
        truncated,
    ))
}

fn is_milk(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("milk"))
}

/// Seçilen klasördeki bir görseli okur ve çevirir. Klasörün dışındaki ya da `.milk` olmayan
/// dosyalar açılmaz.
///
/// Bağlantılar izlenmez: dosyanın kendisi sembolik bağlantıysa açılmaz; klasör ve dosya gerçek
/// yerleriyle (`canonicalize`, Windows'ta bağlantı noktaları da) karşılaştırılır ve dosya klasörün
/// en çok bir alt düzeyinde olmalıdır (listedeki gibi: `klasör/x.milk`, `klasör/alt/x.milk`).
pub fn load(folder: Option<&Path>, path: &Path) -> Result<MilkdropPreset, MilkdropError> {
    let folder = folder.ok_or(MilkdropError::NoFolder)?;
    if !is_milk(path) || path.components().any(|c| c == Component::ParentDir) {
        return Err(MilkdropError::OutsideFolder);
    }
    let read_error = |source| MilkdropError::Read {
        path: path.display().to_string(),
        source,
    };
    let meta = std::fs::symlink_metadata(path).map_err(read_error)?;
    if !meta.file_type().is_file() {
        return Err(MilkdropError::OutsideFolder);
    }
    let root = folder
        .canonicalize()
        .map_err(|source| MilkdropError::Folder {
            path: folder.display().to_string(),
            source,
        })?;
    let real = path.canonicalize().map_err(read_error)?;
    let depth = real
        .strip_prefix(&root)
        .map_err(|_| MilkdropError::OutsideFolder)?
        .components()
        .count();
    if !(1..=2).contains(&depth) {
        return Err(MilkdropError::OutsideFolder);
    }
    let file = std::fs::File::open(&real).map_err(read_error)?;
    let mut bytes = Vec::new();
    // Sınırdan bir bayt fazlası okunur: büyük dosya belleğe alınmadan reddedilir.
    file.take(parse::MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(read_error)?;
    let name = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    if bytes.len() as u64 > parse::MAX_FILE_BYTES {
        return Err(MilkdropError::Parse {
            name,
            source: parse::ParseError::TooLarge,
        });
    }
    // UTF-8, UTF-16 (BOM'lu) ya da eski Windows kodlaması (Türkçe/Batı; yorumlardaki harfler).
    let text = crate::audio::lyrics::decode_text(&bytes);
    let parsed = parse::parse(&text).map_err(|source| MilkdropError::Parse {
        name: name.clone(),
        source,
    })?;
    Ok(MilkdropPreset {
        name,
        simplified: parsed.simplified,
        shader_error: parsed.shader_error,
        preset: parsed.preset,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;

    /// Testin (programın kendi, özgün) örnek görselleri.
    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/data/milkdrop")
            .join(name)
    }

    #[test]
    fn klasor_yolu_temizlenir() {
        let absolute = std::env::temp_dir().join("milk");
        assert_eq!(
            sanitize_folder(Some(absolute.clone())),
            Some(absolute.clone())
        );
        assert_eq!(sanitize_folder(None), None);
        assert_eq!(sanitize_folder(Some(PathBuf::new())), None);
        assert_eq!(sanitize_folder(Some(PathBuf::from("goreli/klasor"))), None);
        assert_eq!(sanitize_folder(Some(absolute.join("../baska"))), None);
        let long = absolute.join("a".repeat(MAX_FOLDER_PATH));
        assert_eq!(sanitize_folder(Some(long)), None);
    }

    #[test]
    fn klasor_turkce_sirali_listelenir_alt_klasor_dahil() {
        let dir = temp_path("milk-liste");
        std::fs::create_dir_all(dir.join("Alt/İç")).unwrap();
        for name in [
            "şelale.milk",
            "Zeytin.MILK",
            "ılık.milk",
            "ayna.milk",
            "notlar.txt",
        ] {
            std::fs::write(dir.join(name), "zoom=1\n").unwrap();
        }
        std::fs::write(dir.join("Alt/bulut.milk"), "zoom=1\n").unwrap();
        // İki düzey aşağısı listelenmez.
        std::fs::write(dir.join("Alt/İç/derin.milk"), "zoom=1\n").unwrap();
        // Uzantısı .milk olan klasör dosya sayılmaz.
        std::fs::create_dir_all(dir.join("klasor.milk")).unwrap();

        let (presets, truncated) = list(&dir).unwrap();
        assert!(!truncated);
        let names: Vec<_> = presets.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(
            names,
            ["Alt / bulut", "ayna", "ılık", "şelale", "Zeytin"],
            "Türkçe harfler sade karşılığıyla sıralanır"
        );
        assert!(presets.iter().all(|p| p.path.starts_with(&dir)));

        let state = folder_state(Some(dir.clone()));
        assert_eq!(state.presets.len(), 5);
        assert_eq!(state.error, None);
        assert_eq!(state.folder, Some(dir));
    }

    #[test]
    fn olmayan_klasor_hatayla_hatirlanir() {
        let missing = temp_path("milk-yok").join("yok");
        let state = folder_state(Some(missing.clone()));
        assert_eq!(state.folder, Some(missing));
        assert!(state.presets.is_empty());
        assert!(state.error.unwrap().contains("Klasör okunamadı"));
        assert_eq!(folder_state(None).folder, None);
    }

    #[test]
    fn cok_fazla_gorsel_kirpilir() {
        let dir = temp_path("milk-cok");
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..(MAX_PRESETS + 3) {
            std::fs::write(dir.join(format!("{i:05}.milk")), "").unwrap();
        }
        let (presets, truncated) = list(&dir).unwrap();
        assert!(truncated);
        assert_eq!(presets.len(), MAX_PRESETS);
        assert_eq!(presets[0].name, "00000");
    }

    #[test]
    fn yalnizca_secilen_klasordeki_milk_dosyasi_acilir() {
        let dir = temp_path("milk-ac");
        std::fs::create_dir_all(dir.join("alt")).unwrap();
        let preset = dir.join("deneme.milk");
        std::fs::write(&preset, "[preset00]\nzoom=1.5\n").unwrap();
        std::fs::write(dir.join("gizli.txt"), "zoom=1\n").unwrap();
        let other = temp_path("disarida.milk");
        std::fs::write(&other, "zoom=1\n").unwrap();

        let loaded = load(Some(&dir), &preset).unwrap();
        assert_eq!(loaded.name, "deneme");
        assert!(!loaded.simplified);
        assert_eq!(loaded.preset.base_vals.get("zoom"), Some(&1.5));

        assert!(matches!(load(None, &preset), Err(MilkdropError::NoFolder)));
        for bad in [
            dir.join("gizli.txt"),
            other.clone(),
            dir.join("alt/../deneme.milk"),
            dir.clone(),
        ] {
            assert!(
                matches!(load(Some(&dir), &bad), Err(MilkdropError::OutsideFolder)),
                "{}",
                bad.display()
            );
        }
        assert!(matches!(
            load(Some(&dir), &dir.join("yok.milk")),
            Err(MilkdropError::Read { .. })
        ));
    }

    #[test]
    fn buyuk_ya_da_bozuk_dosya_anlasilir_hatayla_reddedilir() {
        let dir = temp_path("milk-buyuk");
        std::fs::create_dir_all(&dir).unwrap();
        let big = dir.join("buyuk.milk");
        std::fs::write(&big, vec![b'a'; parse::MAX_FILE_BYTES as usize + 10]).unwrap();
        let error = load(Some(&dir), &big).unwrap_err();
        assert!(matches!(
            error,
            MilkdropError::Parse {
                source: parse::ParseError::TooLarge,
                ..
            }
        ));
        assert!(error.to_string().contains("buyuk"));

        let junk = dir.join("cop.milk");
        std::fs::write(&junk, [0xff, 0x00, 0x13, 0x80, 0x0a]).unwrap();
        assert!(matches!(
            load(Some(&dir), &junk),
            Err(MilkdropError::Parse {
                source: parse::ParseError::NotAPreset,
                ..
            })
        ));
    }

    #[test]
    fn boyut_siniri_dosyanin_baytlarinda() {
        // ~300 KB Windows-1254 dosya: Türkçe harfler UTF-8'de iki bayt olur (~600 KB metin) ama
        // dosyanın kendisi sınırın altında: açılmalı.
        let dir = temp_path("milk-1254");
        std::fs::create_dir_all(&dir).unwrap();
        let mut bytes = b"[preset00]\r\nzoom=1.1\r\n".to_vec();
        for i in 0..300 {
            bytes.extend_from_slice(format!("per_frame_{}=a = 1; // ", i + 1).as_bytes());
            // ş ğ ı İ ö ç ü (Windows-1254)
            for _ in 0..140 {
                bytes.extend_from_slice(b"\xFE\xF0\xFD\xDD\xF6\xE7\xFC");
            }
            bytes.extend_from_slice(b"\r\n");
        }
        assert!(bytes.len() > 290 * 1024 && (bytes.len() as u64) < parse::MAX_FILE_BYTES);
        let path = dir.join("uzun.milk");
        std::fs::write(&path, &bytes).unwrap();
        let loaded = load(Some(&dir), &path).unwrap();
        assert!(loaded.preset.frame_eqs_eel.len() > parse::MAX_FILE_BYTES as usize);
        assert!(loaded.preset.frame_eqs_eel.contains("şğıİöçü"));
    }

    #[test]
    fn windows_yolu_yalnizca_yerel_disk_olabilir() {
        for ok in [
            r"C:\Müzik\MilkDrop",
            "D:/Görseller",
            r"\\?\C:\Görseller",
            r"c:\",
        ] {
            assert!(windows_local_absolute(ok), "{ok}");
        }
        for bad in [
            r"\\sunucu\paylasim\milk",
            "//sunucu/paylasim/milk",
            r"\\?\UNC\sunucu\paylasim",
            r"\\.\COM1",
            r"\\.\C:\milk",
            r"\\?\GLOBALROOT\Device\x",
            r"C:goreli",
            r"\kok\ama\surucusuz",
            "goreli/klasor",
            r"C:\a\..\b",
            r"\\?\C:\a\..\b",
            "",
            "1:/x",
        ] {
            assert!(!windows_local_absolute(bad), "{bad}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn baglanti_ve_derin_dosyalar_acilmaz() {
        use std::os::unix::fs::symlink;
        let dir = temp_path("milk-bag");
        let outside = temp_path("milk-dis");
        std::fs::create_dir_all(dir.join("alt/derin")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let preset = "[preset00]\nzoom=1.2\n";
        std::fs::write(outside.join("gizli.milk"), preset).unwrap();
        std::fs::write(dir.join("alt/iyi.milk"), preset).unwrap();
        std::fs::write(dir.join("alt/derin/cok.milk"), preset).unwrap();
        // Dosyanın kendisi bağlantı (dışarıyı ya da içeriyi gösterse de).
        symlink(outside.join("gizli.milk"), dir.join("bag.milk")).unwrap();
        symlink(dir.join("alt/iyi.milk"), dir.join("ic-bag.milk")).unwrap();
        // Alt klasör dışarıyı gösteren bağlantı.
        symlink(&outside, dir.join("dis")).unwrap();

        assert!(
            load(Some(&dir), &dir.join("alt/iyi.milk")).is_ok(),
            "bir alt düzey açılır"
        );
        for bad in [
            dir.join("bag.milk"),
            dir.join("ic-bag.milk"),
            dir.join("dis/gizli.milk"),
            dir.join("alt/derin/cok.milk"),
        ] {
            assert!(
                matches!(load(Some(&dir), &bad), Err(MilkdropError::OutsideFolder)),
                "{}",
                bad.display()
            );
        }
        // Klasörün kendisi bağlantıysa gerçek yeriyle çalışır.
        let linked = temp_path("milk-klasor-bag");
        symlink(&dir, &linked).unwrap();
        assert!(load(Some(&linked), &linked.join("alt/iyi.milk")).is_ok());
    }

    #[test]
    fn eski_windows_kodlamasi_ve_utf16_okunur() {
        let dir = temp_path("milk-kodlama");
        std::fs::create_dir_all(&dir).unwrap();
        // Windows-1254: "// Şık" yorumu (Ş = DE, ı = FD).
        let cp1254 = dir.join("eski.milk");
        std::fs::write(
            &cp1254,
            b"[preset00]\r\nzoom=1.1\r\nper_frame_1=rot = 0.1; // \xDE\xFDk\r\n",
        )
        .unwrap();
        let loaded = load(Some(&dir), &cp1254).unwrap();
        assert_eq!(loaded.preset.frame_eqs_eel, "rot = 0.1; // Şık");

        let utf16 = dir.join("utf16.milk");
        let text = "[preset00]\r\nzoom=1.2\r\nper_frame_1=rot = 0.2; // ğüş\r\n";
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend(text.encode_utf16().flat_map(u16::to_le_bytes));
        std::fs::write(&utf16, bytes).unwrap();
        let loaded = load(Some(&dir), &utf16).unwrap();
        assert_eq!(loaded.preset.base_vals.get("zoom"), Some(&1.2));
        assert_eq!(loaded.preset.frame_eqs_eel, "rot = 0.2; // ğüş");
    }

    #[test]
    fn ornek_gorsel_beklenen_jsona_cevrilir() {
        // Sahne denetimi (`scripts/check-scenes.mjs`) sahte çekirdekte bu JSON'u döndürür: gerçek
        // tarayıcıda denenen preset, bu ayrıştırıcının çıktısıyla birebir aynıdır.
        // İkincisi (döngü denemesi) çok büyük `loop`'un kırpılmış hâlini taşır.
        let folder = fixture("");
        for name in ["lyraska-parlama", "lyraska-dongu", "lyraska-golge"] {
            let loaded = load(Some(&folder), &fixture(&format!("{name}.milk"))).unwrap();
            assert!(!loaded.simplified, "{name}: {:?}", loaded.shader_error);
            if std::env::var_os("LYRASKA_FIXTURE_WRITE").is_some() {
                let json = serde_json::to_string_pretty(&loaded.preset).unwrap();
                std::fs::write(fixture(&format!("{name}.json")), json + "\n").unwrap();
            }
            let expected: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(fixture(&format!("{name}.json"))).unwrap(),
            )
            .unwrap();
            assert_eq!(
                serde_json::to_value(&loaded.preset).unwrap(),
                expected,
                "{name}"
            );
        }
    }

    #[test]
    fn arayuze_camel_case_gonderilir() {
        let json = serde_json::to_value(MilkdropFolder {
            folder: None,
            presets: vec![],
            truncated: false,
            error: None,
        })
        .unwrap();
        assert!(json.get("truncated").is_some());
        assert!(json.get("presets").is_some());
    }
}
