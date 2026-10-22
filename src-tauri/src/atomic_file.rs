//! Dosyayı bölünmez biçimde yazar: önce aynı klasörde geçici dosyaya yazılır, diske işlenir
//! (`sync_all`), sonra adı hedefe çevrilir. Yazma ya da yeniden adlandırma sırasında elektrik
//! kesilse ya da program çökse de hedefte ya eski ya yeni içerik kalır, yarım dosya kalmaz.
//! Ayarlar, işaretler ve içe aktarılan şarkı haritaları bununla yazılır.

use std::io::{self, Write};
use std::path::Path;

/// `path`'e `bytes`'ı bölünmez biçimde yazar (klasörü yoksa açar).
pub fn write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut temp_name = path.as_os_str().to_owned();
    temp_name.push(".tmp");
    let temp = std::path::PathBuf::from(temp_name);
    let written = (|| {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }
    std::fs::rename(&temp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;

    #[test]
    fn yazar_ustune_yazar_gecici_dosya_kalmaz() {
        let dir = temp_path("atomik");
        let path = dir.join("alt/ayar.json");
        write(&path, b"bir").unwrap();
        write(&path, b"iki").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"iki");
        assert!(!dir.join("alt/ayar.json.tmp").exists());
    }

    #[test]
    fn yazilamazsa_hedef_bozulmaz() {
        let dir = temp_path("atomik2");
        let path = dir.join("ayar.json");
        write(&path, b"eski").unwrap();
        // Geçici dosyanın yerinde bir klasör: oluşturma başarısız olur.
        std::fs::create_dir_all(dir.join("ayar.json.tmp")).unwrap();
        assert!(write(&path, b"yeni").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"eski");
    }
}
