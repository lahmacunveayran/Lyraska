//! "Söz paketi": sözleri sese oturtan modelin kurulumu (proje sahibinin kararı, 30 Ekim 2026: model
//! programla gelmez, ayrı dosya olarak indirilir ve Lyraska'da "Dosyadan ekle" ile seçilir; programa ağ
//! kodu girmez).
//!
//! Paket tek dosyadır: Omnilingual ASR CTC 300M v2'nin sherpa-onnx int8 ONNX dosyası, değiştirilmeden
//! (366 MB). Harf listesi (`tokens.txt`, 90 KB) programın içindedir (`src-tauri/soz-modeli/`); ikisinin
//! lisansı ve atfı `public/lisanslar/Omnilingual-ASR-Apache-2.0.txt`.
//!
//! Kurulum ([`install`]): seçilen dosyanın boyutu ve SHA-256'sı bilinen paketinkiyle aynı olmalı;
//! dosya büyük veri klasörüne (`soz-paketi/`, [`super::lyrics_worker::PACKAGE_DIR`]) kopyalanırken
//! özeti hesaplanır, tutmazsa kopya silinir. Yarım kopya modelin yerine geçmez (önce geçici ada yazılır,
//! sonra adı değiştirilir). Seçilen dosyaya dokunulmaz.

use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;

use sha2::{Digest, Sha256};

use super::lyrics_model::{MODEL_FILE, MODEL_SHA256, TOKENS_FILE};

/// Modelin harf listesi (programın içinde; SHA-256'sı `lyrics_model::TOKENS_SHA256`).
pub const TOKENS: &[u8] = include_bytes!("../../soz-modeli/tokens.txt");

/// Paketin model dosyasının boyutu (bayt).
pub const MODEL_BYTES: u64 = 365_841_453;

/// Kurulacak bir paket: model dosyasının özeti ve boyutu, yanına yazılacak harf listesi.
#[derive(Debug, Clone, Copy)]
pub struct Package<'a> {
    pub sha256: &'a str,
    pub bytes: u64,
    pub tokens: &'a [u8],
}

/// Programın bildiği söz paketi.
pub const PRODUCT: Package<'static> = Package {
    sha256: MODEL_SHA256,
    bytes: MODEL_BYTES,
    tokens: TOKENS,
};

#[derive(Debug, thiserror::Error)]
pub enum PackageError {
    #[error(
        "Bu dosya Lyraska'nın söz paketi değil (bozuk, yarım indirilmiş ya da başka bir dosya)."
    )]
    NotPackage,
    #[error("Söz paketi kopyalanamadı: {0}")]
    Io(#[from] std::io::Error),
}

/// Paket kurulu mu? Yalnızca dosyaların varlığına ve boyutuna bakar (özet model açılırken denetlenir).
pub fn installed(dir: &Path, package: Package<'_>) -> bool {
    let size = |name: &str| std::fs::metadata(dir.join(name)).ok().map(|m| m.len());
    size(MODEL_FILE) == Some(package.bytes)
        && size(TOKENS_FILE) == Some(package.tokens.len() as u64)
}

/// `source` dosyasını `dir` klasörüne söz paketi olarak kurar (bkz. modül belgesi). Kurulu paketin
/// yerine geçer; dosya paket değilse kurulu olana dokunulmaz.
pub fn install(source: &Path, dir: &Path, package: Package<'_>) -> Result<(), PackageError> {
    let meta = std::fs::metadata(source)?;
    if !meta.is_file() || meta.len() != package.bytes {
        return Err(PackageError::NotPackage);
    }
    std::fs::create_dir_all(dir)?;
    let target = dir.join(MODEL_FILE);
    let same = match (source.canonicalize(), target.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    if same {
        // Kurulu dosyanın kendisi seçildi: kopyalanmaz, yalnızca denetlenir.
        if sha256_of(source)? != package.sha256 {
            return Err(PackageError::NotPackage);
        }
    } else {
        let temp = dir.join(format!("{MODEL_FILE}.yeni"));
        let copied = copy_hashing(source, &temp, package.bytes);
        if !matches!(&copied, Ok(sha) if sha == package.sha256) {
            let _ = std::fs::remove_file(&temp);
            copied?;
            return Err(PackageError::NotPackage);
        }
        crate::atomic_file::write(&dir.join(TOKENS_FILE), package.tokens)?;
        std::fs::rename(&temp, &target)?;
        return Ok(());
    }
    crate::atomic_file::write(&dir.join(TOKENS_FILE), package.tokens)?;
    Ok(())
}

/// `source`'u `target`'a kopyalar, kopyalananın SHA-256'sını döndürür. En çok `limit` bayt okunur:
/// kopyalanırken büyüyen dosya paket sayılmaz.
fn copy_hashing(source: &Path, target: &Path, limit: u64) -> Result<String, PackageError> {
    let mut input = File::open(source)?.take(limit + 1);
    let mut output = File::create(target)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        let n = input.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        hasher.update(&buffer[..n]);
        output.write_all(&buffer[..n])?;
    }
    if total != limit {
        return Err(PackageError::NotPackage);
    }
    output.sync_all()?;
    Ok(hex(&hasher.finalize()))
}

fn sha256_of(path: &Path) -> Result<String, PackageError> {
    let mut input = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let n = input.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex(&hasher.finalize()))
}

fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::cache::AnalysisCache;
    use crate::analysis::lyrics_job::{align_track, ModelSlot};
    use crate::analysis::lyrics_model::{file_sha256, FRAME_SAMPLES, SAMPLE_RATE, TOKENS_SHA256};
    use crate::audio::test_util::{temp_path, write_wav};
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;

    fn toy_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/data/soz-modeli")
    }

    /// Deneme modelinin paketi: dosyası, özeti ve harf listesi.
    struct Toy {
        file: PathBuf,
        sha256: String,
        tokens: Vec<u8>,
        tokens_sha256: String,
    }

    impl Toy {
        fn new() -> Self {
            let file = toy_dir().join(MODEL_FILE);
            Self {
                sha256: file_sha256(&file).unwrap(),
                tokens: std::fs::read(toy_dir().join(TOKENS_FILE)).unwrap(),
                tokens_sha256: file_sha256(&toy_dir().join(TOKENS_FILE)).unwrap(),
                file,
            }
        }

        fn package(&self) -> Package<'_> {
            Package {
                sha256: &self.sha256,
                bytes: std::fs::metadata(&self.file).unwrap().len(),
                tokens: &self.tokens,
            }
        }
    }

    fn files(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }

    #[test]
    fn programdaki_harf_listesi_bilinen_listedir() {
        assert_eq!(hex(&Sha256::digest(TOKENS)), TOKENS_SHA256);
    }

    #[test]
    fn kurulan_paketle_model_acilir_sozler_zamanlanir() {
        let toy = Toy::new();
        let dir = temp_path("soz-paketi-kur");
        assert!(!installed(&dir, toy.package()));
        install(&toy.file, &dir, toy.package()).unwrap();
        assert!(installed(&dir, toy.package()));
        assert_eq!(files(&dir), [MODEL_FILE, TOKENS_FILE]);
        // Kurulu paket deneme modeli olarak açılır ve bir şarkının sözünü zamanlar.
        let song = temp_path("soz-paketi-sarki").with_extension("wav");
        write_wav(&song, SAMPLE_RATE, 1, 8 * 37 * FRAME_SAMPLES, |i, _| {
            if (i / FRAME_SAMPLES / 37).is_multiple_of(2) {
                0.5
            } else {
                -0.5
            }
        });
        let mut slot = ModelSlot::new(dir, &toy.sha256, &toy.tokens_sha256);
        let cache = AnalysisCache::open_in_memory().unwrap();
        let result = align_track(&cache, &song, "ab ab", &mut slot, &AtomicBool::new(false));
        assert!(result.is_ok(), "{result:?}");
        assert_eq!(slot.times_opened(), 1);
    }

    #[test]
    fn paket_olmayan_dosya_kurulu_pakete_dokunmaz_iz_birakmaz() {
        let toy = Toy::new();
        let dir = temp_path("soz-paketi-yanlis");
        install(&toy.file, &dir, toy.package()).unwrap();
        let before = std::fs::read(dir.join(MODEL_FILE)).unwrap();
        let bytes = toy.package().bytes as usize;
        // Aynı boyutta ama bir baytı farklı (bozuk indirme), daha kısa (yarım), daha uzun.
        let mut corrupt = before.clone();
        corrupt[bytes / 2] ^= 1;
        let cases = [
            corrupt,
            before[..bytes - 1].to_vec(),
            [&before[..], b"x"].concat(),
        ];
        for (i, data) in cases.iter().enumerate() {
            let source = temp_path(&format!("soz-paketi-yanlis-{i}")).with_extension("onnx");
            std::fs::write(&source, data).unwrap();
            assert!(
                matches!(
                    install(&source, &dir, toy.package()),
                    Err(PackageError::NotPackage)
                ),
                "durum {i}"
            );
            assert_eq!(
                std::fs::read(dir.join(MODEL_FILE)).unwrap(),
                before,
                "durum {i}"
            );
            assert_eq!(files(&dir), [MODEL_FILE, TOKENS_FILE], "durum {i}");
            // Seçilen dosyaya dokunulmaz.
            assert_eq!(&std::fs::read(&source).unwrap(), data, "durum {i}");
        }
        // Klasör ya da olmayan dosya seçildi.
        assert!(install(&dir, &dir, toy.package()).is_err());
        assert!(install(&dir.join("yok.onnx"), &dir, toy.package()).is_err());
        assert_eq!(files(&dir), [MODEL_FILE, TOKENS_FILE]);
    }

    #[test]
    fn eksik_harf_listesi_yeniden_kurulunca_tamamlanir_kurulu_dosya_secilebilir() {
        let toy = Toy::new();
        let dir = temp_path("soz-paketi-yeniden");
        install(&toy.file, &dir, toy.package()).unwrap();
        std::fs::remove_file(dir.join(TOKENS_FILE)).unwrap();
        assert!(!installed(&dir, toy.package()));
        // Kurulu model dosyasının kendisi seçildi: kopyalanmaz, harf listesi yazılır.
        install(&dir.join(MODEL_FILE), &dir, toy.package()).unwrap();
        assert!(installed(&dir, toy.package()));
        assert_eq!(files(&dir), [MODEL_FILE, TOKENS_FILE]);
        assert_eq!(std::fs::read(dir.join(TOKENS_FILE)).unwrap(), toy.tokens);
    }

    #[test]
    #[ignore = "gerçek söz paketi gerekir; elle: LYRASKA_SOZ_PAKETI (model.int8.onnx'in klasörü)"]
    fn gercek_paket_kurulur_ve_acilir() {
        let dir = PathBuf::from(std::env::var("LYRASKA_SOZ_PAKETI").expect("LYRASKA_SOZ_PAKETI"));
        let target = temp_path("soz-paketi-gercek");
        install(&dir.join(MODEL_FILE), &target, PRODUCT).unwrap();
        assert!(installed(&target, PRODUCT));
        let mut slot = ModelSlot::product(target);
        let song = temp_path("soz-paketi-gercek-sarki").with_extension("wav");
        write_wav(&song, SAMPLE_RATE, 1, 5 * SAMPLE_RATE as usize, |i, _| {
            (i as f64 * 0.05).sin() * 0.3
        });
        let cache = AnalysisCache::open_in_memory().unwrap();
        // Sinüste söz yok: önemli olan modelin açılması (paket ve harf listesi tutarlı).
        let _ = align_track(&cache, &song, "la la", &mut slot, &AtomicBool::new(false));
        assert_eq!(slot.times_opened(), 1);
    }

    #[test]
    fn urun_paketi_dogru_boyutta_degilse_ozet_hesaplanmadan_reddedilir() {
        // Deneme modeli ürün paketinin boyutunda değil: hiç kopyalanmaz.
        let toy = Toy::new();
        let dir = temp_path("soz-paketi-urun");
        assert!(matches!(
            install(&toy.file, &dir, PRODUCT),
            Err(PackageError::NotPackage)
        ));
        assert!(files(&dir).is_empty());
    }
}
