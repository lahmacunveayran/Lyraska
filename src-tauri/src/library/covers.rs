//! Kullanıcının albümlere, şarkılara ve çalma listelerine seçtiği kapaklar.
//!
//! Seçilen resmin kopyası Lyraska'nın veri klasöründe (`kapaklar/`) durur; müzik dosyalarına ve
//! klasörlerine dokunulmaz (proje sahibinin kararı, 23 Ekim 2026). Dosya adı albümün kimliğinden
//! (albüm sanatçısı, yoksa sanatçı + albüm adı) türetilir: veritabanına tablo gerekmez, kapak
//! kaldırılınca dosya silinir.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::audio::decode::{image_type, Cover, MAX_COVER_BYTES};

/// Kapak dosyalarının uzantıları (resmin gerçek türü verisinden tanınır).
const EXTENSIONS: [&str; 4] = ["jpg", "png", "webp", "gif"];

/// Kapak klasörünün adı (büyük veri klasörünün içinde).
pub const COVERS_DIR: &str = "kapaklar";

#[derive(Debug, thiserror::Error)]
pub enum CoverError {
    #[error("Seçilen dosya okunamadı: {0}")]
    Read(std::io::Error),
    #[error("Seçilen dosya bir resim değil (JPEG, PNG, WebP ya da GIF olmalı).")]
    NotImage,
    #[error("Resim çok büyük (en çok 8 MB).")]
    TooLarge,
    #[error("Kapak kaydedilemedi: {0}")]
    Write(std::io::Error),
}

/// Albümün kapak dosyasının adı (uzantısız): kimliğin 64 bitlik FNV-1a özeti, onaltılık.
/// Sabittir: aynı albüm her sürümde aynı dosyayı bulur (test dondurur).
pub fn stem(album: &str, artist: Option<&str>) -> String {
    fnv(&format!("{}\u{0}{album}", artist.unwrap_or("\u{1}")))
}

/// 64 bitlik FNV-1a özeti, 16 haneli onaltılık.
fn fnv(text: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        h ^= u64::from(*byte);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Şarkıların kapak dosyalarının ön eki.
const TRACK_PREFIX: &str = "sarki-";

/// Şarkının kapak dosyasının adı (uzantısız): yolunun özeti. Albüm adları 16 haneli onaltılık
/// özet, liste adları `liste-` ile başlar; bu ad ikisiyle de karışmaz. Sabittir (test dondurur).
pub fn track_stem(path: &str) -> String {
    format!("{TRACK_PREFIX}{}", fnv(&track_key(path, cfg!(windows))))
}

/// Özeti alınan yol. Windows'ta yazımdan bağımsız (ayıraç `\`, küçük harf): aynı dosya farklı
/// yazılsa da (klasör `d:/müzik` diye yeniden eklendi) aynı kapağı bulur. Öteki sistemlerde
/// büyük/küçük harf farklı dosyadır: yol aynen.
fn track_key(path: &str, windows: bool) -> String {
    if windows {
        path.replace('/', "\\").to_lowercase()
    } else {
        path.to_owned()
    }
}

/// Çalma listesinin kapak dosyasının adı (uzantısız). Albüm adları 16 haneli onaltılık özettir;
/// bu ad onlarla karışmaz.
pub fn playlist_stem(id: i64) -> String {
    format!("liste-{id}")
}

/// "Kendi resmin" sahnesinin arka plan resminin dosya adı (uzantısız).
const BACKGROUND_STEM: &str = "arkaplan";

pub struct CoverStore {
    dir: PathBuf,
}

impl CoverStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            dir: data_dir.join(COVERS_DIR),
        }
    }

    fn files(&self, stem: &str) -> impl Iterator<Item = PathBuf> + '_ {
        let stem = stem.to_owned();
        EXTENSIONS
            .iter()
            .map(move |ext| self.dir.join(format!("{stem}.{ext}")))
    }

    /// Albümün seçilmiş kapağı; yoksa (ya da okunamıyorsa) `None`.
    pub fn get(&self, album: &str, artist: Option<&str>) -> Option<Cover> {
        self.get_stem(&stem(album, artist))
    }

    /// Resmi albümün kapağı yapar (kopyası saklanır; asıl dosyaya dokunulmaz).
    pub fn set(&self, album: &str, artist: Option<&str>, source: &Path) -> Result<(), CoverError> {
        self.set_stem(&stem(album, artist), source)
    }

    /// Seçilmiş kapağı kaldırır (albüm yine kendi kapağını ya da baskı kapağını gösterir).
    pub fn clear(&self, album: &str, artist: Option<&str>) -> Result<(), CoverError> {
        self.clear_stem(&stem(album, artist))
    }

    /// Çalma listesinin kapağı; yoksa `None` (arayüz kolaj gösterir).
    pub fn playlist_get(&self, id: i64) -> Option<Cover> {
        self.get_stem(&playlist_stem(id))
    }

    /// Resmi çalma listesinin kapağı yapar (kopyası saklanır).
    pub fn playlist_set(&self, id: i64, source: &Path) -> Result<(), CoverError> {
        self.set_stem(&playlist_stem(id), source)
    }

    /// Çalma listesinin kapağını kaldırır (liste silinince de çağrılır).
    pub fn playlist_clear(&self, id: i64) -> Result<(), CoverError> {
        self.clear_stem(&playlist_stem(id))
    }

    /// Şarkıya seçilmiş kapak; yoksa `None` (şarkının kendi kapağı ya da albümünki gösterilir).
    pub fn track_get(&self, path: &str) -> Option<Cover> {
        self.get_stem(&track_stem(path))
    }

    /// Resmi şarkının kapağı yapar (kopyası saklanır; müzik dosyasına dokunulmaz).
    pub fn track_set(&self, path: &str, source: &Path) -> Result<(), CoverError> {
        self.set_stem(&track_stem(path), source)
    }

    /// Şarkıya seçilmiş kapağı kaldırır.
    pub fn track_clear(&self, path: &str) -> Result<(), CoverError> {
        self.clear_stem(&track_stem(path))
    }

    /// Kapağı seçilmiş şarkıların dosya adları (uzantısız, [`track_stem`]): şarkı listesi her
    /// şarkı için dosya aramasın diye klasör bir kez okunur. Klasör yoksa boş.
    pub fn track_stems(&self) -> HashSet<String> {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return HashSet::new();
        };
        entries
            .filter_map(|entry| {
                let name = entry.ok()?.file_name().into_string().ok()?;
                let (stem, ext) = name.rsplit_once('.')?;
                (stem.starts_with(TRACK_PREFIX) && EXTENSIONS.contains(&ext))
                    .then(|| stem.to_owned())
            })
            .collect()
    }

    /// "Kendi resmin" sahnesinin arka planı; seçilmemişse `None`.
    pub fn background_get(&self) -> Option<Cover> {
        self.get_stem(BACKGROUND_STEM)
    }

    /// Resmi arka plan yapar (kopyası saklanır).
    pub fn background_set(&self, source: &Path) -> Result<(), CoverError> {
        self.set_stem(BACKGROUND_STEM, source)
    }

    pub fn background_clear(&self) -> Result<(), CoverError> {
        self.clear_stem(BACKGROUND_STEM)
    }

    fn get_stem(&self, stem: &str) -> Option<Cover> {
        self.files(stem).find_map(|path| {
            let data = std::fs::read(path).ok()?;
            let media_type = image_type(&data)?;
            Some(Cover { media_type, data })
        })
    }

    fn set_stem(&self, stem: &str, source: &Path) -> Result<(), CoverError> {
        let size = std::fs::metadata(source).map_err(CoverError::Read)?.len();
        if size > MAX_COVER_BYTES as u64 {
            return Err(CoverError::TooLarge);
        }
        let data = std::fs::read(source).map_err(CoverError::Read)?;
        let ext = match image_type(&data).ok_or(CoverError::NotImage)? {
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => "jpg",
        };
        std::fs::create_dir_all(&self.dir).map_err(CoverError::Write)?;
        let target = self.dir.join(format!("{stem}.{ext}"));
        crate::atomic_file::write(&target, &data).map_err(CoverError::Write)?;
        // Başka türdeki eski kapak kalmasın.
        for old in self.files(stem).filter(|p| *p != target) {
            std::fs::remove_file(old).ok();
        }
        Ok(())
    }

    fn clear_stem(&self, stem: &str) -> Result<(), CoverError> {
        for path in self.files(stem) {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(CoverError::Write(e)),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR-kapak";
    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F'];

    #[test]
    fn dosya_adi_sabittir_ve_albume_ozgudur() {
        // Değişirse kullanıcıların seçtiği kapaklar kaybolur.
        assert_eq!(
            stem("Kelimeler", Some("Şebnem Ferah")),
            stem("Kelimeler", Some("Şebnem Ferah"))
        );
        assert_eq!(stem("A", None).len(), 16);
        assert_ne!(
            stem("Kelimeler", Some("Şebnem Ferah")),
            stem("Kelimeler", None)
        );
        assert_ne!(stem("Kelimeler", None), stem("Kelimeler", Some("")));
        assert_eq!(stem("Kelimeler", Some("Şebnem Ferah")), "2d02bacf43c0b19f");
    }

    #[test]
    fn sarkinin_kapak_adi_sabittir_ve_albumlerle_karismaz() {
        // Değişirse kullanıcıların şarkılara seçtiği kapaklar kaybolur.
        assert_eq!(
            track_stem("C:\\Müzik\\Kum.flac"),
            track_stem("C:\\Müzik\\Kum.flac")
        );
        assert_ne!(track_stem("a.flac"), track_stem("b.flac"));
        assert!(track_stem("a.flac").starts_with("sarki-"));
        // Windows'ta yazımdan bağımsız anahtarın (küçük harf, `\`) özeti; öteki sistemlerde yol aynen.
        let frozen = if cfg!(windows) {
            "sarki-e02f94aa372e90ab"
        } else {
            "sarki-3551f4d9fb69d90b"
        };
        assert_eq!(track_stem("C:\\Müzik\\Kum.flac"), frozen);
    }

    #[test]
    fn windowsta_ayni_dosyanin_farkli_yazimi_ayni_kapagi_bulur() {
        // Klasör kaldırılıp `d:/müzik` diye yeniden eklenince seçilen kapak kaybolmasın.
        let key = |path| track_key(path, true);
        assert_eq!(key("D:\\Müzik\\Kum.FLAC"), key("d:/müzik/kum.flac"));
        assert_eq!(key("D:\\Müzik\\Kum.FLAC"), "d:\\müzik\\kum.flac");
        // Öteki sistemlerde büyük/küçük harf farklı dosyadır: yol aynen.
        assert_eq!(track_key("/m/Kum.flac", false), "/m/Kum.flac");
        assert_ne!(
            track_key("/m/Kum.flac", false),
            track_key("/m/kum.flac", false)
        );
    }

    #[test]
    fn sarkiya_kapak_secilir_listelenir_ve_kaldirilir() {
        let dir = temp_path("sarki-kapak-deposu");
        let store = CoverStore::new(&dir);
        assert!(store.track_stems().is_empty(), "klasör yokken boş");
        let source = dir.with_extension("png");
        std::fs::write(&source, PNG).unwrap();

        store.track_set("/m/kum.flac", &source).unwrap();
        // Aynı adlı albüm ve liste kapakları şarkınınkiyle karışmaz.
        store.set("/m/kum.flac", None, &source).unwrap();
        store.playlist_set(1, &source).unwrap();
        assert_eq!(
            store.track_get("/m/kum.flac").unwrap().media_type,
            "image/png"
        );
        assert!(store.track_get("/m/ada.flac").is_none());
        assert_eq!(
            store.track_stems(),
            HashSet::from([track_stem("/m/kum.flac")])
        );

        store.track_clear("/m/kum.flac").unwrap();
        assert!(store.track_get("/m/kum.flac").is_none());
        assert!(store.track_stems().is_empty());
        assert!(
            store.get("/m/kum.flac", None).is_some(),
            "albüm kapağı yerinde"
        );
        std::fs::remove_file(source).ok();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn kapak_secilir_degistirilir_ve_kaldirilir() {
        let dir = temp_path("kapak-deposu");
        let store = CoverStore::new(&dir);
        assert!(store.get("Kum", Some("Ada")).is_none());

        let source = dir.with_extension("png");
        std::fs::write(&source, PNG).unwrap();
        store.set("Kum", Some("Ada"), &source).unwrap();
        assert_eq!(
            store.get("Kum", Some("Ada")).unwrap().media_type,
            "image/png"
        );
        // Başka albüm etkilenmez.
        assert!(store.get("Kum", Some("Bora")).is_none());

        // Türü değişen yeni kapak eskisinin yerini alır (iki dosya kalmaz).
        std::fs::write(&source, JPEG).unwrap();
        store.set("Kum", Some("Ada"), &source).unwrap();
        assert_eq!(
            store.get("Kum", Some("Ada")).unwrap().media_type,
            "image/jpeg"
        );
        assert_eq!(std::fs::read_dir(dir.join(COVERS_DIR)).unwrap().count(), 1);

        store.clear("Kum", Some("Ada")).unwrap();
        assert!(store.get("Kum", Some("Ada")).is_none());
        store.clear("Kum", Some("Ada")).unwrap(); // yoksa da hata değil

        // Resim olmayan dosya reddedilir; asıl dosyaya dokunulmaz.
        std::fs::write(&source, b"resim degil").unwrap();
        assert!(matches!(
            store.set("Kum", Some("Ada"), &source),
            Err(CoverError::NotImage)
        ));
        assert_eq!(std::fs::read(&source).unwrap(), b"resim degil");
        std::fs::remove_file(source).ok();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn calma_listesi_kapagi_albumlerden_ayri_saklanir() {
        let dir = temp_path("liste-kapak-deposu");
        let store = CoverStore::new(&dir);
        assert!(store.playlist_get(7).is_none());
        let source = dir.with_extension("png");
        std::fs::write(&source, PNG).unwrap();
        store.playlist_set(7, &source).unwrap();
        assert_eq!(store.playlist_get(7).unwrap().media_type, "image/png");
        // Başka liste ve albümler etkilenmez.
        assert!(store.playlist_get(8).is_none());
        assert!(store.get("7", None).is_none());
        // Dosya adı albüm özetleriyle karışmaz (16 haneli onaltılık değil).
        assert_eq!(playlist_stem(7), "liste-7");
        store.playlist_clear(7).unwrap();
        assert!(store.playlist_get(7).is_none());
        store.playlist_clear(7).unwrap(); // yoksa da hata değil
        std::fs::remove_file(source).ok();
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn arka_plan_resmi_kapaklardan_ayri_saklanir_ve_kaldirilir() {
        let dir = temp_path("arkaplan-deposu");
        let store = CoverStore::new(&dir);
        assert!(store.background_get().is_none());
        let source = dir.with_extension("png");
        std::fs::write(&source, PNG).unwrap();
        store.background_set(&source).unwrap();
        assert_eq!(store.background_get().unwrap().media_type, "image/png");
        assert!(store.playlist_get(1).is_none());
        store.background_clear().unwrap();
        assert!(store.background_get().is_none());
        std::fs::remove_file(source).ok();
        std::fs::remove_dir_all(dir).ok();
    }
}
