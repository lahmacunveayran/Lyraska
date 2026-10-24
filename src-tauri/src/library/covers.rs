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
    #[error(
        "Hareketli resim çok uzun ya da büyük: en çok {} kare ve toplam {} milyon piksel olabilir (bu resim {frames} kare, {} milyon piksel).",
        MAX_FRAMES,
        MAX_PIXELS / 1_000_000,
        .pixels.div_ceil(1_000_000)
    )]
    AnimationTooLarge { frames: u64, pixels: u64 },
    #[error("Hareketli resmin kareleri okunamadı (dosya bozuk olabilir).")]
    AnimationUnreadable,
}

/// Hareketli arka planın en çok kare sayısı (arayüzde `MAX_FRAMES`, src/lib/animatedImage.ts).
pub const MAX_FRAMES: u64 = 600;
/// Karelerin toplam piksel sınırı (kare boyu × kare sayısı; arayüzde `MAX_PIXELS`).
pub const MAX_PIXELS: u64 = 50_000_000;

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

    /// "Kendi resmin" sahnesinin arka planı; seçilmemişse `None`. Sınırları aşan ya da kareleri
    /// okunamayan hareketli resim (klasöre elle konmuş olsa bile) verilmez: bkz.
    /// [`Self::background_set`].
    pub fn background_get(&self) -> Option<Cover> {
        self.get_stem(BACKGROUND_STEM)
            .filter(|cover| check_animation(&cover.data).is_ok())
    }

    /// Resmi arka plan yapar (kopyası saklanır). Hareketli resim (GIF, APNG, hareketli WebP)
    /// kabul edilir: arayüz kareleri parlaklık freninden geçirerek çizer, çubukların sınırını bütün
    /// karelerin zarfıyla ölçer (src/components/PhotoScene.tsx). Kareleri arayüzde tek tek çözülüp
    /// bellekte tutulduğu için kare sayısı ve toplam piksel sınırlıdır ([`MAX_FRAMES`],
    /// [`MAX_PIXELS`]).
    pub fn background_set(&self, source: &Path) -> Result<(), CoverError> {
        self.set_stem_checked(BACKGROUND_STEM, source, true)
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
        self.set_stem_checked(stem, source, false)
    }

    /// `limited`: hareketli resmin sınırları denetlenir ([`check_animation`]).
    fn set_stem_checked(&self, stem: &str, source: &Path, limited: bool) -> Result<(), CoverError> {
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
        if limited {
            check_animation(&data)?;
        }
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

/// Hareketli resmin sınırları: sabit resim her zaman geçer; hareketli resmin kare sayısı ve
/// boyu okunabilmeli, [`MAX_FRAMES`] ve [`MAX_PIXELS`]'i geçmemeli.
fn check_animation(data: &[u8]) -> Result<(), CoverError> {
    if !is_animated(data) {
        return Ok(());
    }
    let (frames, width, height) = animation_info(data).ok_or(CoverError::AnimationUnreadable)?;
    let pixels = frames.saturating_mul(width).saturating_mul(height);
    if frames == 0 || width == 0 || height == 0 {
        return Err(CoverError::AnimationUnreadable);
    }
    if frames > MAX_FRAMES || pixels > MAX_PIXELS {
        return Err(CoverError::AnimationTooLarge { frames, pixels });
    }
    Ok(())
}

/// Hareketli resmin kare sayısı ve tuval boyu (genişlik, yükseklik); okunamazsa `None`.
fn animation_info(data: &[u8]) -> Option<(u64, u64, u64)> {
    match image_type(data) {
        Some("image/gif") => {
            let width = u64::from(u16::from_le_bytes([*data.get(6)?, *data.get(7)?]));
            let height = u64::from(u16::from_le_bytes([*data.get(8)?, *data.get(9)?]));
            Some((gif_frame_count(data, u64::MAX)?, width, height))
        }
        Some("image/png") => {
            let mut i = 8usize;
            let (mut width, mut height) = (0u64, 0u64);
            while let (Some(len), Some(kind)) = (data.get(i..i + 4), data.get(i + 4..i + 8)) {
                let body = data.get(i + 8..)?;
                let be = |at: usize| -> Option<u64> {
                    Some(u64::from(u32::from_be_bytes(
                        body.get(at..at + 4)?.try_into().ok()?,
                    )))
                };
                match kind {
                    b"IHDR" => {
                        width = be(0)?;
                        height = be(4)?;
                    }
                    b"acTL" => return Some((be(0)?, width, height)),
                    b"IDAT" => return None,
                    _ => {}
                }
                let len = u32::from_be_bytes([len[0], len[1], len[2], len[3]]) as usize;
                i = i.saturating_add(12).saturating_add(len);
            }
            None
        }
        Some("image/webp") => {
            let mut i = 12usize;
            let (mut frames, mut width, mut height) = (0u64, 0u64, 0u64);
            while let (Some(kind), Some(len)) = (data.get(i..i + 4), data.get(i + 4..i + 8)) {
                if kind == b"VP8X" {
                    let b = data.get(i + 12..i + 18)?;
                    width = 1 + u64::from(u32::from_le_bytes([b[0], b[1], b[2], 0]));
                    height = 1 + u64::from(u32::from_le_bytes([b[3], b[4], b[5], 0]));
                }
                if kind == b"ANMF" {
                    frames += 1;
                }
                let len = u32::from_le_bytes([len[0], len[1], len[2], len[3]]) as usize;
                i = i
                    .saturating_add(8)
                    .saturating_add(len.saturating_add(len & 1));
            }
            Some((frames, width, height))
        }
        _ => None,
    }
}

/// Resim hareketli mi: birden çok kareli GIF, APNG (`acTL` parçası) ya da hareketli WebP
/// (`VP8X` hareket bayrağı, `ANIM`/`ANMF` parçası). Kareleri sayılamayan bozuk GIF hareketli
/// sayılır (güvenli yan); PNG ve WebP'de parça yapısı bozuksa okunabilen kısma bakılır.
fn is_animated(data: &[u8]) -> bool {
    match image_type(data) {
        Some("image/gif") => !matches!(gif_frame_count(data, 2), Some(0 | 1)),
        Some("image/png") => png_animated(data),
        Some("image/webp") => webp_animated(data),
        _ => false,
    }
}

/// GIF'in kare sayısı (`stop`'u bulunca durur); yapı bozuksa `None`.
fn gif_frame_count(data: &[u8], stop: u64) -> Option<u64> {
    let table = |flags: u8| {
        if flags & 0x80 != 0 {
            3usize << ((flags & 0x07) + 1)
        } else {
            0
        }
    };
    let mut i = 13 + table(*data.get(10)?);
    let mut frames = 0;
    loop {
        match data.get(i) {
            // Dosya sonu ya da sonlandırıcı.
            None | Some(0x3b) => return Some(frames),
            // Uzantı: tür baytı ve alt bloklar.
            Some(0x21) => i = skip_gif_blocks(data, i + 2)?,
            // Kare: 9 bayt tanım, yerel renk tablosu, LZW kod boyu, alt bloklar.
            Some(0x2c) => {
                frames += 1;
                if frames >= stop {
                    return Some(frames);
                }
                i += 10 + table(*data.get(i + 9)?);
                i = skip_gif_blocks(data, i + 1)?;
            }
            Some(_) => return None,
        }
    }
}

/// GIF alt bloklarını (uzunluk baytı + veri, 0 ile biter) atlar.
fn skip_gif_blocks(data: &[u8], mut i: usize) -> Option<usize> {
    loop {
        let len = usize::from(*data.get(i)?);
        i += 1;
        if len == 0 {
            return Some(i);
        }
        i += len;
    }
}

/// APNG: görüntü verisinden (`IDAT`) önce `acTL` parçası.
fn png_animated(data: &[u8]) -> bool {
    let mut i = 8usize;
    while let (Some(len), Some(kind)) = (data.get(i..i + 4), data.get(i + 4..i + 8)) {
        match kind {
            b"acTL" => return true,
            b"IDAT" => return false,
            _ => {}
        }
        let len = u32::from_be_bytes([len[0], len[1], len[2], len[3]]) as usize;
        i = i.saturating_add(12).saturating_add(len);
    }
    false
}

/// Hareketli WebP: `VP8X` parçasında hareket bayrağı ya da `ANIM`/`ANMF` parçası.
fn webp_animated(data: &[u8]) -> bool {
    let mut i = 12usize;
    while let (Some(kind), Some(len)) = (data.get(i..i + 4), data.get(i + 4..i + 8)) {
        match kind {
            b"ANIM" | b"ANMF" => return true,
            b"VP8X" if data.get(i + 8).is_some_and(|flags| flags & 0x02 != 0) => return true,
            _ => {}
        }
        let len = u32::from_le_bytes([len[0], len[1], len[2], len[3]]) as usize;
        i = i
            .saturating_add(8)
            .saturating_add(len.saturating_add(len & 1));
    }
    false
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

    /// PNG parçası (CRC denetlenmez; sıfır).
    fn png_chunk(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = (body.len() as u32).to_be_bytes().to_vec();
        out.extend_from_slice(kind);
        out.extend_from_slice(body);
        out.extend_from_slice(&[0; 4]);
        out
    }

    /// `width × height` PNG; hareketliyse `frames` kareli APNG (`acTL`).
    fn png_sized(frames: u32, width: u32, height: u32) -> Vec<u8> {
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut ihdr = width.to_be_bytes().to_vec();
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
        out.extend(png_chunk(b"IHDR", &ihdr));
        if frames > 1 {
            let mut actl = frames.to_be_bytes().to_vec();
            actl.extend_from_slice(&[0, 0, 0, 0]);
            out.extend(png_chunk(b"acTL", &actl));
        }
        out.extend(png_chunk(b"IDAT", &[0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]));
        out.extend(png_chunk(b"IEND", &[]));
        out
    }

    fn png(animated: bool) -> Vec<u8> {
        png_sized(if animated { 2 } else { 1 }, 1, 1)
    }

    /// 1×1 GIF, `frames` kare (hareketliyse NETSCAPE döngü uzantısıyla).
    fn gif(frames: usize) -> Vec<u8> {
        let mut out = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff".to_vec();
        if frames > 1 {
            out.extend_from_slice(b"\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00");
        }
        for _ in 0..frames {
            // Kare gecikmesi (grafik denetim uzantısı) ve kare: 1×1, LZW en küçük kod 2.
            out.extend_from_slice(b"\x21\xf9\x04\x00\x0a\x00\x00\x00");
            out.extend_from_slice(b"\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00");
        }
        out.push(0x3b);
        out
    }

    /// 1×1 WebP; hareketliyse `VP8X` (hareket bayrağı, tuval 1×1), `ANIM` ve iki `ANMF` karesi.
    fn webp(animated: bool) -> Vec<u8> {
        let mut body = b"WEBP".to_vec();
        if animated {
            body.extend_from_slice(b"VP8X\x0a\x00\x00\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00");
            body.extend_from_slice(b"ANIM\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00");
            for _ in 0..2 {
                body.extend_from_slice(b"ANMF\x02\x00\x00\x00\x00\x00");
            }
        } else {
            body.extend_from_slice(b"VP8L\x05\x00\x00\x00\x2f\x00\x00\x00\x00\x00");
        }
        let mut out = b"RIFF".to_vec();
        out.extend_from_slice(&(body.len() as u32).to_le_bytes());
        out.extend(body);
        out
    }

    #[test]
    fn hareketli_resim_sinirlar_icinde_arka_plan_olur() {
        // Bu dalda önce hareketli arka plan reddediliyordu (o test de bu dalda eklenmişti, main'de
        // yoktu). Artık arayüz kareleri parlaklık freninden (kırmızı kanalıyla) geçirerek çiziyor
        // ve çubukların sınırını bütün karelerin zarfıyla ölçüyor; yalnızca kare sayısı ve toplam
        // piksel sınırlı (kareler arayüzde tek tek çözülüp bellekte tutuluyor).
        assert!(!is_animated(&png(false)));
        assert!(is_animated(&png(true)));
        assert!(!is_animated(&gif(1)));
        assert!(is_animated(&gif(2)));
        assert!(!is_animated(&webp(false)));
        assert!(is_animated(&webp(true)));
        assert!(!is_animated(JPEG));
        assert!(!is_animated(PNG), "kısa PNG sabit sayılır");
        assert_eq!(animation_info(&gif(3)), Some((3, 1, 1)));
        assert_eq!(animation_info(&png(true)), Some((2, 1, 1)));
        assert_eq!(animation_info(&webp(true)), Some((2, 1, 1)));
        assert_eq!(
            animation_info(&png_sized(10, 640, 480)),
            Some((10, 640, 480))
        );

        let dir = temp_path("arkaplan-hareketli");
        let store = CoverStore::new(&dir);
        let source = dir.with_extension("img");
        for data in [
            gif(2),
            png(true),
            webp(true),
            gif(1),
            png(false),
            webp(false),
        ] {
            std::fs::write(&source, &data).unwrap();
            assert!(
                store.background_set(&source).is_ok(),
                "{:?}",
                image_type(&data)
            );
            assert!(store.background_get().is_some());
        }
        // Çok kare (601) ya da çok piksel (600 × 1000 × 1000) reddedilir, iletisi açık.
        for data in [gif(601), png_sized(600, 1000, 1000)] {
            std::fs::write(&source, &data).unwrap();
            let error = store.background_set(&source).unwrap_err();
            assert!(
                matches!(error, CoverError::AnimationTooLarge { .. }),
                "{error}"
            );
            assert!(error.to_string().contains("en çok 600 kare"), "{error}");
        }
        let error = CoverError::AnimationTooLarge {
            frames: 600,
            pixels: 600_000_000,
        };
        assert!(
            error.to_string().contains("600 kare, 600 milyon piksel"),
            "{error}"
        );
        // Sınırda kabul (600 kare × 83 333 piksel ≤ 50 milyon).
        std::fs::write(&source, png_sized(600, 289, 288)).unwrap();
        assert!(store.background_set(&source).is_ok());
        // Kareleri sayılamayan bozuk GIF hareketli sayılır ve okunamaz.
        let mut broken = gif(1);
        broken.truncate(30);
        broken.push(0x99);
        assert!(is_animated(&broken));
        std::fs::write(&source, &broken).unwrap();
        assert!(matches!(
            store.background_set(&source),
            Err(CoverError::AnimationUnreadable)
        ));
        // Albüm kapakları değişmez: sınır yok.
        std::fs::write(&source, gif(601)).unwrap();
        store.set("Kum", Some("Ada"), &source).unwrap();
        // Klasöre elle konmuş, sınırı aşan hareketli arka plan da gösterilmez.
        store.background_clear().unwrap();
        std::fs::create_dir_all(dir.join(COVERS_DIR)).unwrap();
        std::fs::write(dir.join(COVERS_DIR).join("arkaplan.gif"), gif(601)).unwrap();
        assert!(store.background_get().is_none());
        std::fs::write(dir.join(COVERS_DIR).join("arkaplan.gif"), gif(2)).unwrap();
        assert!(store.background_get().is_some());
        std::fs::remove_file(source).ok();
        std::fs::remove_dir_all(dir).ok();
    }
}
