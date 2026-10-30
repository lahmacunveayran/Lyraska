//! Kullanıcının Lyraska'da yapıştırıp düzenlediği şarkı sözleri.
//!
//! Sözler Lyraska'nın veri klasöründe (`sozler/`) durur: müzik dosyalarına ve klasörlerine dokunulmaz
//! (kapaklardaki gibi; proje sahibinin kararı, 30 Ekim 2026). Dosya adı şarkının yolunun özetidir
//! ([`super::covers::track_stem`] ile aynı: aynı şarkı farklı yazılsa da aynı dosyayı bulur). Metin
//! olduğu gibi (LRC ya da düz metin, UTF-8) saklanır; okuyan `audio::lyrics` her zaman bunu yeğler.
//! Program söz indirmez, dağıtmaz.

use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::audio::lyrics::MAX_FILE_BYTES;

/// Sözlerin klasörü (veri klasöründe).
pub const LYRICS_DIR: &str = "sozler";

#[derive(Debug, Error)]
pub enum UserLyricsError {
    #[error("Sözler çok uzun (en çok {} KB)", MAX_FILE_BYTES / 1024)]
    TooLong,
    #[error("Sözler kaydedilemedi: {0}")]
    Io(#[from] std::io::Error),
}

pub struct UserLyricsStore {
    dir: PathBuf,
}

impl UserLyricsStore {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            dir: data_dir.join(LYRICS_DIR),
        }
    }

    fn file(&self, path: &str) -> PathBuf {
        self.dir
            .join(format!("{}.lrc", super::covers::track_stem(path)))
    }

    /// Şarkının düzenlenmiş sözleri; yoksa (ya da okunamıyorsa) `None`.
    pub fn get(&self, path: &str) -> Option<String> {
        let file = self.file(path);
        let meta = std::fs::metadata(&file).ok()?;
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            return None;
        }
        std::fs::read_to_string(file).ok()
    }

    /// Sözleri kaydeder (bölünmez yazma). Boş metin kaydı siler (şarkının kendi sözlerine dönülür).
    pub fn set(&self, path: &str, text: &str) -> Result<(), UserLyricsError> {
        if text.trim().is_empty() {
            return self.clear(path);
        }
        if text.len() as u64 > MAX_FILE_BYTES {
            return Err(UserLyricsError::TooLong);
        }
        std::fs::create_dir_all(&self.dir)?;
        crate::atomic_file::write(&self.file(path), text.as_bytes())?;
        Ok(())
    }

    /// Düzenlenmiş sözleri siler; yoksa bir şey yapmaz.
    pub fn clear(&self, path: &str) -> Result<(), UserLyricsError> {
        match std::fs::remove_file(self.file(path)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::lyrics::{for_track_with, text_for_track, LyricsSource};
    use crate::audio::test_util::temp_path;

    fn store() -> (UserLyricsStore, PathBuf) {
        let dir = temp_path("kullanici-sozleri");
        std::fs::create_dir_all(&dir).unwrap();
        (UserLyricsStore::new(&dir), dir)
    }

    #[test]
    fn kaydedilir_okunur_silinir_muzik_dosyasina_dokunulmaz() {
        let (store, dir) = store();
        let song = "C:/Müzik/Gece Yolu.flac";
        assert_eq!(store.get(song), None);
        store
            .set(song, "Gece yolunda yalnız\nIşıklar akıyor")
            .unwrap();
        assert_eq!(
            store.get(song).as_deref(),
            Some("Gece yolunda yalnız\nIşıklar akıyor")
        );
        // Dosya yalnızca veri klasörünün `sozler/` altında.
        let files: Vec<_> = std::fs::read_dir(dir.join(LYRICS_DIR)).unwrap().collect();
        assert_eq!(files.len(), 1);
        store.set(song, "  \n").unwrap(); // boş metin: kayıt silinir
        assert_eq!(store.get(song), None);
        store.clear(song).unwrap(); // yokken silmek hata değil
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn cok_uzun_metin_reddedilir() {
        let (store, dir) = store();
        let long = "a".repeat(MAX_FILE_BYTES as usize + 1);
        assert!(matches!(
            store.set("x.flac", &long),
            Err(UserLyricsError::TooLong)
        ));
        assert_eq!(store.get("x.flac"), None);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn duzenlenen_sozler_yan_dosyadan_once_gelir() {
        let dir = temp_path("kullanici-sozleri-oncelik");
        std::fs::create_dir_all(&dir).unwrap();
        let song = dir.join("şarkı.flac");
        std::fs::write(dir.join("şarkı.lrc"), "[00:01.00]Dosyadaki satır\n").unwrap();
        // Düzenleme yokken yan dosya.
        let file = for_track_with(&song, Some(60.0), None).unwrap();
        assert_eq!(file.source, LyricsSource::File);
        let raw = text_for_track(&song, None).unwrap();
        assert_eq!(raw.source, LyricsSource::File);
        assert_eq!(raw.text, "[00:01.00]Dosyadaki satır\n");
        // Düzenleme varsa her zaman o (zamansız olsa da: kullanıcı seçti).
        let user = for_track_with(&song, Some(60.0), Some("Benim satırım")).unwrap();
        assert_eq!(user.source, LyricsSource::User);
        assert!(!user.synced);
        assert_eq!(user.lines[0].text, "Benim satırım");
        let timed = for_track_with(&song, Some(60.0), Some("[00:02.50]Zamanlı")).unwrap();
        assert!(timed.synced);
        assert_eq!(timed.lines[0].start, 2.5);
        assert_eq!(
            text_for_track(&song, Some("Benim satırım")).unwrap().source,
            LyricsSource::User
        );
        // Boş düzenleme yok sayılır.
        assert_eq!(
            for_track_with(&song, None, Some(" \n")).unwrap().source,
            LyricsSource::File
        );
        std::fs::remove_dir_all(dir).ok();
    }
}
