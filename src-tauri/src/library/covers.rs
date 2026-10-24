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
        "Hareketli resim (GIF, APNG ya da WebP) arka plan olamaz: parlama güvenliği için resim sabit olmalı."
    )]
    Animated,
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

    /// "Kendi resmin" sahnesinin arka planı; seçilmemişse `None`. Hareketli resim (klasöre elle
    /// konmuş olsa bile) verilmez: bkz. [`Self::background_set`].
    pub fn background_get(&self) -> Option<Cover> {
        self.get_stem(BACKGROUND_STEM)
            .filter(|cover| !is_animated(&cover.data))
    }

    /// Resmi arka plan yapar (kopyası saklanır). Hareketli resim kabul edilmez: sahnenin parlama
    /// sınırı resmi bir kez, sabit sayarak ölçer (src/lib/photoScene.ts) ve hareketli resmin
    /// kendisi de denetimsiz parlayabilir.
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

    /// `still`: hareketli resim reddedilir ([`is_animated`]).
    fn set_stem_checked(&self, stem: &str, source: &Path, still: bool) -> Result<(), CoverError> {
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
        if still && is_animated(&data) {
            return Err(CoverError::Animated);
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

/// Resim hareketli mi: birden çok kareli GIF, APNG (`acTL` parçası) ya da hareketli WebP
/// (`VP8X` hareket bayrağı, `ANIM`/`ANMF` parçası). Kareleri sayılamayan bozuk GIF hareketli
/// sayılır (güvenli yan); PNG ve WebP'de parça yapısı bozuksa okunabilen kısma bakılır.
fn is_animated(data: &[u8]) -> bool {
    match image_type(data) {
        Some("image/gif") => !matches!(gif_frames(data), Some(0 | 1)),
        Some("image/png") => png_animated(data),
        Some("image/webp") => webp_animated(data),
        _ => false,
    }
}

/// GIF'in kare sayısı (ikiyi bulunca durur); yapı bozuksa `None`.
fn gif_frames(data: &[u8]) -> Option<usize> {
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
                if frames > 1 {
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

    fn png(animated: bool) -> Vec<u8> {
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
        out.extend(png_chunk(b"IHDR", &[0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
        if animated {
            out.extend(png_chunk(b"acTL", &[0, 0, 0, 2, 0, 0, 0, 0]));
        }
        out.extend(png_chunk(b"IDAT", &[0x78, 0x9c, 0x63, 0, 0, 0, 1, 0, 1]));
        out.extend(png_chunk(b"IEND", &[]));
        out
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

    fn webp(animated: bool) -> Vec<u8> {
        let mut body = b"WEBP".to_vec();
        if animated {
            body.extend_from_slice(b"VP8X\x0a\x00\x00\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00\x00");
            body.extend_from_slice(b"ANIM\x06\x00\x00\x00\x00\x00\x00\x00\x00\x00");
        } else {
            body.extend_from_slice(b"VP8L\x05\x00\x00\x00\x2f\x00\x00\x00\x00\x00");
        }
        let mut out = b"RIFF".to_vec();
        out.extend_from_slice(&(body.len() as u32).to_le_bytes());
        out.extend(body);
        out
    }

    #[test]
    fn hareketli_resim_arka_plan_olamaz() {
        // Arka plan sabit olmalı: parlama sınırı resmi bir kez ölçer (src/lib/photoScene.ts) ve
        // hareketli resmin kendisi de parlayabilir.
        assert!(!is_animated(&png(false)));
        assert!(is_animated(&png(true)));
        assert!(!is_animated(&gif(1)));
        assert!(is_animated(&gif(2)));
        assert!(!is_animated(&webp(false)));
        assert!(is_animated(&webp(true)));
        assert!(!is_animated(JPEG));
        assert!(!is_animated(PNG), "kısa PNG sabit sayılır");
        // Kareleri sayılamayan bozuk GIF hareketli sayılır (güvenli yan).
        let mut broken = gif(1);
        broken.truncate(30);
        broken.push(0x99);
        assert!(is_animated(&broken));

        let dir = temp_path("arkaplan-hareketli");
        let store = CoverStore::new(&dir);
        let source = dir.with_extension("img");
        for (data, ok) in [
            (gif(2), false),
            (png(true), false),
            (webp(true), false),
            (gif(1), true),
            (png(false), true),
            (webp(false), true),
        ] {
            std::fs::write(&source, &data).unwrap();
            let result = store.background_set(&source);
            assert_eq!(result.is_ok(), ok, "{:?}", image_type(&data));
            if !ok {
                assert!(matches!(result, Err(CoverError::Animated)));
            }
        }
        // Albüm kapakları değişmez: küçük ve sahne değil.
        std::fs::write(&source, gif(2)).unwrap();
        store.set("Kum", Some("Ada"), &source).unwrap();
        // Klasöre elle konmuş hareketli arka plan da gösterilmez.
        store.background_clear().unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("arkaplan.gif"), gif(2)).unwrap();
        assert!(store.background_get().is_none());
        std::fs::remove_file(source).ok();
        std::fs::remove_dir_all(dir).ok();
    }
}
