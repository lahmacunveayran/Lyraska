//! Uygulama veri klasörleri. Küçük, kullanıcıya ait veri (ayarlar, işaretler) gezici (Roaming)
//! klasörde kalır; büyük ve yeniden üretilebilir veri (kütüphane + analiz önbelleği, günlükler)
//! makineye özgü (Local) klasöre yazılır: gezici profillerde oturum açmayı yavaşlatmasın, kota
//! doldurmasın (DENETIM-2 KUT-03). Eski sürümlerin Roaming'e yazdığı dosyalar ilk açılışta bir
//! kez taşınır; taşınamazsa eski yer kullanılmaya devam eder (kütüphane kaybolmaz).

use std::path::{Path, PathBuf};

/// Local klasöre taşınacak dosyalar (yoksa atlanır). SQLite'ın `-wal`/`-shm` eşleri de taşınır.
const MOVED_FILES: &[&str] = &[
    "library.sqlite3",
    "library.sqlite3-wal",
    "library.sqlite3-shm",
];
const MOVED_DIRS: &[&str] = &["logs"];

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
        if from.exists() && std::fs::rename(&from, local.join(name)).is_err() {
            // Kütüphane dosyası taşınamadıysa eski yerde kalır; eşleri de orada kalmalı.
            for moved in MOVED_FILES {
                let back = local.join(moved);
                if back.exists() {
                    let _ = std::fs::rename(&back, roaming.join(moved));
                }
            }
            return roaming.to_path_buf();
        }
    }
    for dir in MOVED_DIRS {
        let from = roaming.join(dir);
        if from.is_dir() && !local.join(dir).exists() {
            let _ = std::fs::rename(&from, local.join(dir));
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
    fn ayni_klasorsa_hicbir_sey_yapilmaz() {
        let dir = temp_path("tek");
        assert_eq!(big_data_dir(&dir, &dir), dir);
    }
}
