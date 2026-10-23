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

/// Tauri'nin `app_data_dir` / `app_local_data_dir` kuralıyla aynı klasörler: (Roaming, Local).
/// Henüz hiçbir şey taşınmaz; işletim sistemi klasörü bildirmezse `None` (Tauri'ninki kullanılır).
pub fn locate(identifier: &str) -> Option<(PathBuf, PathBuf)> {
    Some((
        dirs::data_dir()?.join(identifier),
        dirs::data_local_dir()?.join(identifier),
    ))
}

/// Eski kütüphanenin Local'a taşınmasının sonucu (açılışta günlüğe yazılır).
#[derive(Debug, Clone, PartialEq)]
pub enum Migration {
    /// Taşınacak bir şey yoktu.
    NotNeeded,
    /// Eski kütüphane Local'a taşındı.
    Moved,
    /// Taşınamadı; Roaming kullanılmaya devam ediliyor (neden).
    KeptInRoaming(String),
}

impl DataDirs {
    /// Klasörler; eski kütüphane gerekirse taşınır. Tek örnek kilidinden **sonra** çağrılır: iki
    /// kopya aynı anda taşıma yapmasın.
    pub fn migrate(roaming: PathBuf, local: &Path) -> (Self, Migration) {
        let (big, migration) = big_data_dir(&roaming, local);
        (Self { roaming, big }, migration)
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

/// Oturum işareti: program açıkken `big` klasöründe `oturum-acik` dosyası durur, düzgün kapanışta
/// silinir. Açılışta hâlâ duruyorsa önceki oturum yarıda kesildi (çökme, elektrik kesintisi,
/// Görev Yöneticisi): döner `true` ve kütüphane bu açılışta tam denetlenir. Tek örnek kilidinden
/// sonra çağrılır (ikinci kopya işarete dokunmaz).
pub fn begin_session(dir: &Path) -> bool {
    let marker = dir.join("oturum-acik");
    let unclean = marker.exists();
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(&marker, b"");
    unclean
}

/// Düzgün kapanış: oturum işareti kalkar.
pub fn end_session(dir: &Path) {
    let _ = std::fs::remove_file(dir.join("oturum-acik"));
}

/// Dosyayı ya da klasörü taşır. Hedef zaten varsa dokunulmaz (hata). `rename` farklı birimler
/// arasında çalışmaz (ör. Roaming başka bir diske yönlendirilmiş kurumsal profil): o zaman
/// kopyalanıp eskisi silinir. Dosya taşıması ya hep ya hiçtir: kopyalama yarıda kalırsa ya da
/// kaynak silinemezse (ör. başka program açık tutuyor) kopya silinir, kaynak yerinde kalır; iki
/// ayrı sürüm oluşmaz.
pub fn move_path(from: &Path, to: &Path) -> io::Result<()> {
    if to.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("{} zaten var", to.display()),
        ));
    }
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_then_remove(from, to, remove_path)
}

fn remove_path(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

fn copy_then_remove(
    from: &Path,
    to: &Path,
    remove: impl Fn(&Path) -> io::Result<()>,
) -> io::Result<()> {
    let copied = if from.is_dir() {
        copy_dir(from, to)
    } else {
        std::fs::copy(from, to).map(|_| ())
    };
    if let Err(error) = copied {
        let _ = remove_path(to);
        return Err(error);
    }
    if let Err(error) = remove(from) {
        // Kaynak silinemedi: dosyada kopya silinir (eski sürüm sonraki açılışta "taşınmış" sanılıp
        // kullanılmasın). Klasör silme yarıda kalmış olabilir; kopyası o zaman korunur.
        if !from.is_dir() {
            let _ = std::fs::remove_file(to);
        }
        return Err(error);
    }
    Ok(())
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
/// kilitlemiş) taşınanlar geri alınır ve `roaming` döner: iki kopya oluşmaz.
pub fn big_data_dir(roaming: &Path, local: &Path) -> (PathBuf, Migration) {
    if roaming == local {
        return (local.to_path_buf(), Migration::NotNeeded);
    }
    let old_library = roaming.join(MOVED_FILES[0]);
    if !old_library.exists() || local.join(MOVED_FILES[0]).exists() {
        return (local.to_path_buf(), Migration::NotNeeded);
    }
    if let Err(error) = std::fs::create_dir_all(local) {
        return (
            roaming.to_path_buf(),
            Migration::KeptInRoaming(format!("{}: {error}", local.display())),
        );
    }
    for name in MOVED_FILES {
        let from = roaming.join(name);
        if !from.exists() {
            continue;
        }
        if let Err(error) = move_path(&from, &local.join(name)) {
            // Kütüphane dosyası taşınamadıysa eski yerde kalır; eşleri de orada kalmalı. Yalnızca
            // bu taşımanın götürdüğü dosyalar geri gelir: Roaming'de duran dosyaya dokunulmaz.
            for moved in MOVED_FILES {
                let back = local.join(moved);
                let original = roaming.join(moved);
                if back.exists() && !original.exists() {
                    let _ = move_path(&back, &original);
                }
            }
            return (
                roaming.to_path_buf(),
                Migration::KeptInRoaming(format!("{name}: {error}")),
            );
        }
    }
    for dir in MOVED_DIRS {
        let from = roaming.join(dir);
        if from.is_dir() && !local.join(dir).exists() {
            let _ = move_path(&from, &local.join(dir));
        }
    }
    (local.to_path_buf(), Migration::Moved)
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

        assert_eq!(
            big_data_dir(&roaming, &local),
            (local.clone(), Migration::Moved)
        );
        assert!(local.join("library.sqlite3").exists());
        assert!(local.join("library.sqlite3-wal").exists());
        assert!(local.join("logs/lyraska.log").exists());
        assert!(!roaming.join("library.sqlite3").exists());
        assert!(
            roaming.join("settings.json").exists(),
            "ayarlar Roaming'de kalır"
        );
        // İkinci çağrı bir şey taşımaz.
        assert_eq!(
            big_data_dir(&roaming, &local),
            (local, Migration::NotNeeded)
        );
    }

    #[test]
    fn local_kutuphane_varsa_roamingdeki_dokunulmaz() {
        let roaming = temp_path("roaming2");
        let local = roaming.parent().unwrap().join("local2");
        std::fs::create_dir_all(&roaming).unwrap();
        std::fs::create_dir_all(&local).unwrap();
        std::fs::write(roaming.join("library.sqlite3"), b"eski").unwrap();
        std::fs::write(local.join("library.sqlite3"), b"yeni").unwrap();
        assert_eq!(big_data_dir(&roaming, &local).0, local);
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

        copy_then_remove(&root.join("a/logs"), &root.join("b/logs"), remove_path).unwrap();
        copy_then_remove(
            &root.join("a/library.sqlite3"),
            &root.join("b/library.sqlite3"),
            remove_path,
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
        assert!(copy_then_remove(&root.join("a/yok"), &root.join("b/yok"), remove_path).is_err());
        assert!(!root.join("b/yok").exists());
    }

    #[test]
    fn kaynak_silinemezse_kopya_da_silinir() {
        // Başka bir program dosyayı açık tutuyor: kopya kalsaydı sonraki açılış onu "taşınmış"
        // sanıp eski sürümü kullanırdı.
        let root = temp_path("hephic");
        std::fs::create_dir_all(root.join("a")).unwrap();
        std::fs::create_dir_all(root.join("b")).unwrap();
        std::fs::write(root.join("a/library.sqlite3"), b"db").unwrap();
        let result = copy_then_remove(
            &root.join("a/library.sqlite3"),
            &root.join("b/library.sqlite3"),
            |_| Err(io::Error::other("kilitli")),
        );
        assert!(result.is_err());
        assert!(root.join("a/library.sqlite3").exists());
        assert!(!root.join("b/library.sqlite3").exists());
    }

    #[test]
    fn tasima_yarida_kalirsa_geri_alinir_var_olan_dosyaya_dokunulmaz() {
        let roaming = temp_path("geri-roaming");
        let local = roaming.parent().unwrap().join("geri-local");
        std::fs::create_dir_all(&roaming).unwrap();
        std::fs::create_dir_all(&local).unwrap();
        std::fs::write(roaming.join("library.sqlite3"), b"db").unwrap();
        std::fs::write(roaming.join("library.sqlite3-wal"), b"wal").unwrap();
        // Local'da başka bir şeyin bıraktığı eş dosya: üstüne yazılmaz, taşıma geri alınır.
        std::fs::write(local.join("library.sqlite3-wal"), b"yabanci").unwrap();

        let (dir, migration) = big_data_dir(&roaming, &local);
        assert_eq!(dir, roaming);
        assert!(matches!(migration, Migration::KeptInRoaming(_)));
        assert_eq!(
            std::fs::read(roaming.join("library.sqlite3")).unwrap(),
            b"db"
        );
        assert_eq!(
            std::fs::read(roaming.join("library.sqlite3-wal")).unwrap(),
            b"wal"
        );
        assert!(!local.join("library.sqlite3").exists());
        assert_eq!(
            std::fs::read(local.join("library.sqlite3-wal")).unwrap(),
            b"yabanci"
        );
    }

    #[test]
    fn yarida_kalan_oturum_sonraki_acilista_anlasilir() {
        let dir = temp_path("oturum");
        assert!(!begin_session(&dir), "ilk açılış temiz");
        end_session(&dir);
        assert!(!begin_session(&dir), "düzgün kapanıştan sonra temiz");
        // Kapanış olmadan yeniden açılış: önceki oturum yarıda kalmış.
        assert!(begin_session(&dir));
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
        if let Some((roaming, local)) = locate(id) {
            assert!(roaming.ends_with(id));
            assert!(local.ends_with(id));
        }
    }

    #[test]
    fn ayni_klasorsa_hicbir_sey_yapilmaz() {
        let dir = temp_path("tek");
        assert_eq!(big_data_dir(&dir, &dir), (dir, Migration::NotNeeded));
    }
}
