//! Uygulama veri klasörleri. Küçük, kullanıcıya ait veri (ayarlar, işaretler) gezici (Roaming)
//! klasörde kalır; büyük ve yeniden üretilebilir veri (kütüphane + analiz önbelleği, günlükler)
//! makineye özgü (Local) klasöre yazılır: gezici profillerde oturum açmayı yavaşlatmasın, kota
//! doldurmasın (DENETIM-2 KUT-03). Eski sürümlerin Roaming'e yazdığı dosyalar ilk açılışta bir
//! kez taşınır; taşınamazsa eski yer kullanılmaya devam eder (kütüphane kaybolmaz).
//!
//! Klasörler Tauri açılmadan önce, Tauri'nin kuralıyla bulunur (`dirs::data_dir` /
//! `dirs::data_local_dir` + program kimliği): günlük pencereden önce açılır ve tek örnek kilidi
//! alınır.

use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

/// Local klasöre taşınacak dosyalar (yoksa atlanır). SQLite'ın `-wal`/`-shm` eşleri de taşınır.
const MOVED_FILES: &[&str] = &[
    "library.sqlite3",
    "library.sqlite3-wal",
    "library.sqlite3-shm",
];
const MOVED_DIRS: &[&str] = &["logs"];

/// Programın veri klasörleri.
#[derive(Debug, Clone, PartialEq)]
pub struct DataDirs {
    /// Küçük, kullanıcıya ait veri (Windows'ta Roaming).
    pub roaming: PathBuf,
    /// Büyük, yeniden üretilebilir veri (Windows'ta Local; taşınamadıysa Roaming).
    pub big: PathBuf,
}

impl DataDirs {
    /// Tauri'nin `app_data_dir` / `app_local_data_dir` kuralıyla aynı klasörler; eski kütüphane
    /// gerekirse taşınır. İşletim sistemi klasörü bildirmezse `None` (Tauri'ninki kullanılır).
    pub fn resolve(identifier: &str) -> Option<Self> {
        let roaming = dirs::data_dir()?.join(identifier);
        let local = dirs::data_local_dir()?.join(identifier);
        let big = big_data_dir(&roaming, &local);
        Some(Self { roaming, big })
    }
}

/// Tek örnek kilidi: tutulduğu sürece programın ikinci bir kopyası açılmaz. İki kopya aynı ayar
/// dosyasını "son yazan kazanır" biçiminde ezer, aynı kütüphaneyi tarar ve iki ses akışı çalar.
/// İşletim sisteminin dosya kilidi kullanılır: program çökse de kilit kendiliğinden kalkar.
#[derive(Debug)]
pub struct InstanceLock {
    _file: File,
}

/// Kilit alınamadı.
#[derive(Debug)]
pub enum LockError {
    /// Program zaten açık.
    AlreadyRunning,
    /// Kilit dosyası açılamadı (ör. yazılamayan klasör): program yine açılır.
    Io(io::Error),
}

/// `dir/lyraska.lock` üzerinde tek örnek kilidini alır.
pub fn acquire_instance_lock(dir: &Path) -> Result<InstanceLock, LockError> {
    std::fs::create_dir_all(dir).map_err(LockError::Io)?;
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join("lyraska.lock"))
        .map_err(LockError::Io)?;
    match file.try_lock() {
        Ok(()) => Ok(InstanceLock { _file: file }),
        Err(std::fs::TryLockError::WouldBlock) => Err(LockError::AlreadyRunning),
        Err(std::fs::TryLockError::Error(e)) => Err(LockError::Io(e)),
    }
}

/// Dosyayı ya da klasörü taşır. `rename` farklı birimler arasında çalışmaz (ör. Roaming başka bir
/// diske yönlendirilmiş kurumsal profil): o zaman kopyalanıp eskisi silinir. Kopyalama yarıda
/// kalırsa yarım kopya silinir, kaynak yerinde kalır.
pub fn move_path(from: &Path, to: &Path) -> io::Result<()> {
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_then_remove(from, to)
}

fn copy_then_remove(from: &Path, to: &Path) -> io::Result<()> {
    let copied = if from.is_dir() {
        copy_dir(from, to)
    } else {
        std::fs::copy(from, to).map(|_| ())
    };
    if let Err(error) = copied {
        if to.is_dir() {
            let _ = std::fs::remove_dir_all(to);
        } else {
            let _ = std::fs::remove_file(to);
        }
        return Err(error);
    }
    if from.is_dir() {
        std::fs::remove_dir_all(from)
    } else {
        std::fs::remove_file(from)
    }
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Büyük verinin klasörü: `local`. `roaming`'de eski sürümden kalan dosyalar varsa ve `local`'da
/// henüz kütüphane yoksa, dosyalar taşınır. Taşıma başarısızsa (ör. başka pencere dosyayı
/// kilitlemiş) `roaming` döner: iki kopya oluşmaz.
pub fn big_data_dir(roaming: &Path, local: &Path) -> PathBuf {
    if roaming == local {
        return local.to_path_buf();
    }
    let old_library = roaming.join(MOVED_FILES[0]);
    if !old_library.exists() || local.join(MOVED_FILES[0]).exists() {
        return local.to_path_buf();
    }
    if std::fs::create_dir_all(local).is_err() {
        return roaming.to_path_buf();
    }
    for name in MOVED_FILES {
        let from = roaming.join(name);
        if from.exists() && move_path(&from, &local.join(name)).is_err() {
            // Kütüphane dosyası taşınamadıysa eski yerde kalır; eşleri de orada kalmalı.
            for moved in MOVED_FILES {
                let back = local.join(moved);
                if back.exists() {
                    let _ = move_path(&back, &roaming.join(moved));
                }
            }
            return roaming.to_path_buf();
        }
    }
    for dir in MOVED_DIRS {
        let from = roaming.join(dir);
        if from.is_dir() && !local.join(dir).exists() {
            let _ = move_path(&from, &local.join(dir));
        }
    }
    local.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::temp_path;

    #[test]
    fn eski_kutuphane_bir_kez_local_klasore_tasinir() {
        let roaming = temp_path("roaming");
        let local = roaming.parent().unwrap().join("local");
        std::fs::create_dir_all(&roaming).unwrap();
        std::fs::write(roaming.join("library.sqlite3"), b"db").unwrap();
        std::fs::write(roaming.join("library.sqlite3-wal"), b"wal").unwrap();
        std::fs::create_dir_all(roaming.join("logs")).unwrap();
        std::fs::write(roaming.join("logs/lyraska.log"), b"log").unwrap();
        std::fs::write(roaming.join("settings.json"), b"{}").unwrap();

        assert_eq!(big_data_dir(&roaming, &local), local);
        assert!(local.join("library.sqlite3").exists());
        assert!(local.join("library.sqlite3-wal").exists());
        assert!(local.join("logs/lyraska.log").exists());
        assert!(!roaming.join("library.sqlite3").exists());
        assert!(
            roaming.join("settings.json").exists(),
            "ayarlar Roaming'de kalır"
        );
        // İkinci çağrı bir şey taşımaz.
        assert_eq!(big_data_dir(&roaming, &local), local);
    }

    #[test]
    fn local_kutuphane_varsa_roamingdeki_dokunulmaz() {
        let roaming = temp_path("roaming2");
        let local = roaming.parent().unwrap().join("local2");
        std::fs::create_dir_all(&roaming).unwrap();
        std::fs::create_dir_all(&local).unwrap();
        std::fs::write(roaming.join("library.sqlite3"), b"eski").unwrap();
        std::fs::write(local.join("library.sqlite3"), b"yeni").unwrap();
        assert_eq!(big_data_dir(&roaming, &local), local);
        assert_eq!(
            std::fs::read(local.join("library.sqlite3")).unwrap(),
            b"yeni"
        );
        assert!(roaming.join("library.sqlite3").exists());
    }

    #[test]
    fn kopyalayarak_tasima_dosya_ve_klasor() {
        // Birimler arası taşımada kullanılan yol (rename'in başarısız olduğu durum) doğrudan.
        let root = temp_path("kopya");
        std::fs::create_dir_all(root.join("a/logs/eski")).unwrap();
        std::fs::write(root.join("a/logs/lyraska.log"), b"log").unwrap();
        std::fs::write(root.join("a/logs/eski/x.log"), b"x").unwrap();
        std::fs::write(root.join("a/library.sqlite3"), b"db").unwrap();
        std::fs::create_dir_all(root.join("b")).unwrap();

        copy_then_remove(&root.join("a/logs"), &root.join("b/logs")).unwrap();
        copy_then_remove(
            &root.join("a/library.sqlite3"),
            &root.join("b/library.sqlite3"),
        )
        .unwrap();
        assert_eq!(
            std::fs::read(root.join("b/logs/lyraska.log")).unwrap(),
            b"log"
        );
        assert_eq!(std::fs::read(root.join("b/logs/eski/x.log")).unwrap(), b"x");
        assert_eq!(
            std::fs::read(root.join("b/library.sqlite3")).unwrap(),
            b"db"
        );
        assert!(!root.join("a/logs").exists() && !root.join("a/library.sqlite3").exists());

        // Kaynak yoksa hata; hedefte yarım kopya kalmaz.
        assert!(copy_then_remove(&root.join("a/yok"), &root.join("b/yok")).is_err());
        assert!(!root.join("b/yok").exists());
    }

    #[test]
    fn ikinci_ornek_kilidi_alamaz_birincisi_kapaninca_alir() {
        let dir = temp_path("kilit");
        let first = acquire_instance_lock(&dir).unwrap();
        assert!(matches!(
            acquire_instance_lock(&dir),
            Err(LockError::AlreadyRunning)
        ));
        drop(first);
        assert!(acquire_instance_lock(&dir).is_ok());
    }

    #[test]
    fn klasorler_tauri_kuraliyla_bulunur() {
        let id = "io.github.gozlemesevdalisi.lyraska";
        if let Some(dirs) = DataDirs::resolve(id) {
            assert!(dirs.roaming.ends_with(id));
            assert!(dirs.big.ends_with(id));
        }
    }

    #[test]
    fn ayni_klasorsa_hicbir_sey_yapilmaz() {
        let dir = temp_path("tek");
        assert_eq!(big_data_dir(&dir, &dir), dir);
    }
}
