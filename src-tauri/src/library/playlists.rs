//! Kullanıcının çalma listeleri.
//!
//! Liste şarkıları yollarıyla, sırasıyla tutar (`playlist_entries`; bkz. `storage` 8. adım).
//! Aynı şarkı bir listede birden çok kez bulunabilir. Kütüphaneden çıkan şarkı listeden
//! silinmez: disk geri takılınca yine çalar; o sırada arayüz onu dosya adıyla gösterir.
//! Kapak resmi veritabanında değil, `kapaklar/` klasöründedir (`covers::CoverStore`).

use rusqlite::{params, OptionalExtension};
use serde::Serialize;

use super::db::Library;
use super::LibraryError;

/// Listenin adı en çok bu kadar karakter (fazlası kırpılır).
pub const MAX_NAME_CHARS: usize = 100;
/// Kendi kapağı olmayan listenin kolajı için en çok bu kadar albüm.
const COLLAGE_ALBUMS: usize = 4;

/// Bir çalma listesi.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, rename = "Playlist"))]
pub struct PlaylistRow {
    #[cfg_attr(test, ts(type = "number"))]
    pub id: i64,
    pub name: String,
    /// Listedeki şarkı sayısı (kütüphanede şu an bulunmayanlar dahil).
    pub track_count: u32,
    /// Kütüphanede bulunan şarkıların toplam süresi (saniye).
    pub duration_secs: f64,
    /// Kendi kapağı yoksa kolaj için: listedeki ilk farklı albümlerin (en çok dört) birer
    /// şarkısının yolu, liste sırasıyla.
    pub collage_paths: Vec<String>,
}

/// Adı temizler: baştaki ve sondaki boşluklar atılır, uzunsa kırpılır; boşsa hata.
fn clean_name(name: &str) -> Result<String, LibraryError> {
    let name: String = name.trim().chars().take(MAX_NAME_CHARS).collect();
    let name = name.trim_end().to_owned();
    if name.is_empty() {
        return Err(LibraryError::PlaylistNameEmpty);
    }
    Ok(name)
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
}

impl Library {
    /// Bütün listeler, en son değişen önce.
    pub fn playlists(&self) -> Result<Vec<PlaylistRow>, LibraryError> {
        let ids: Vec<i64> = {
            let mut stmt = self
                .conn()
                .prepare("SELECT id FROM playlists ORDER BY modified DESC, id DESC")?;
            let rows = stmt.query_map([], |r| r.get(0))?;
            rows.collect::<Result<_, _>>()?
        };
        ids.into_iter()
            .map(|id| self.playlist(id)?.ok_or(LibraryError::PlaylistMissing))
            .collect()
    }

    /// Tek liste; yoksa `None`.
    pub fn playlist(&self, id: i64) -> Result<Option<PlaylistRow>, LibraryError> {
        let conn = self.conn();
        let Some(name) = conn
            .query_row("SELECT name FROM playlists WHERE id = ?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .optional()?
        else {
            return Ok(None);
        };
        let (track_count, duration_secs): (u32, f64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(t.duration_secs), 0)
             FROM playlist_entries e LEFT JOIN tracks t ON t.path = e.path
             WHERE e.playlist_id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        // Kolaj: liste sırasıyla ilk farklı albümler (albüm sanatçısı + albüm adı).
        let mut stmt = conn.prepare(
            "SELECT t.path, COALESCE(t.album_artist, t.artist), t.album
             FROM playlist_entries e JOIN tracks t ON t.path = e.path
             WHERE e.playlist_id = ?1 ORDER BY e.position",
        )?;
        let mut seen: Vec<(Option<String>, Option<String>)> = Vec::new();
        let mut collage_paths = Vec::new();
        let rows = stmt.query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })?;
        for row in rows {
            let (path, artist, album) = row?;
            let key = (artist, album);
            if !seen.contains(&key) {
                seen.push(key);
                collage_paths.push(path);
                if collage_paths.len() == COLLAGE_ALBUMS {
                    break;
                }
            }
        }
        Ok(Some(PlaylistRow {
            id,
            name,
            track_count,
            duration_secs,
            collage_paths,
        }))
    }

    /// Yeni, boş liste.
    pub fn create_playlist(&self, name: &str) -> Result<PlaylistRow, LibraryError> {
        let name = clean_name(name)?;
        let time = now();
        self.conn().execute(
            "INSERT INTO playlists (name, created, modified) VALUES (?1, ?2, ?2)",
            params![name, time],
        )?;
        let id = self.conn().last_insert_rowid();
        self.playlist(id)?.ok_or(LibraryError::PlaylistMissing)
    }

    /// Listenin adını değiştirir.
    pub fn rename_playlist(&self, id: i64, name: &str) -> Result<(), LibraryError> {
        let name = clean_name(name)?;
        let changed = self.conn().execute(
            "UPDATE playlists SET name = ?2, modified = ?3 WHERE id = ?1",
            params![id, name, now()],
        )?;
        if changed == 0 {
            return Err(LibraryError::PlaylistMissing);
        }
        Ok(())
    }

    /// Listeyi siler (şarkılar kütüphanede kalır).
    pub fn delete_playlist(&self, id: i64) -> Result<(), LibraryError> {
        let changed = self
            .conn()
            .execute("DELETE FROM playlists WHERE id = ?1", [id])?;
        if changed == 0 {
            return Err(LibraryError::PlaylistMissing);
        }
        Ok(())
    }

    /// Listenin şarkılarının yolları, sırasıyla.
    pub fn playlist_tracks(&self, id: i64) -> Result<Vec<String>, LibraryError> {
        if self.playlist_name(id)?.is_none() {
            return Err(LibraryError::PlaylistMissing);
        }
        let mut stmt = self.conn().prepare(
            "SELECT path FROM playlist_entries WHERE playlist_id = ?1 ORDER BY position",
        )?;
        let rows = stmt.query_map([id], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Şarkıları listenin sonuna ekler; listenin yeni şarkı sayısını döndürür.
    pub fn add_to_playlist(&self, id: i64, paths: &[String]) -> Result<u32, LibraryError> {
        let mut entries = self.playlist_tracks(id)?;
        entries.extend(paths.iter().cloned());
        self.write_entries(id, &entries)?;
        Ok(entries.len() as u32)
    }

    /// Verilen sıralardaki (0'dan) şarkıları listeden çıkarır; geçersiz sıralar yok sayılır.
    pub fn remove_from_playlist(&self, id: i64, positions: &[u32]) -> Result<(), LibraryError> {
        let entries: Vec<String> = self
            .playlist_tracks(id)?
            .into_iter()
            .enumerate()
            .filter(|(i, _)| !positions.contains(&(*i as u32)))
            .map(|(_, path)| path)
            .collect();
        self.write_entries(id, &entries)
    }

    /// `from` sırasındaki şarkıyı `to` sırasına taşır (aradakiler kayar).
    pub fn move_in_playlist(&self, id: i64, from: u32, to: u32) -> Result<(), LibraryError> {
        let mut entries = self.playlist_tracks(id)?;
        let (from, to) = (from as usize, to as usize);
        if from >= entries.len() || to >= entries.len() || from == to {
            return Ok(());
        }
        let path = entries.remove(from);
        entries.insert(to, path);
        self.write_entries(id, &entries)
    }

    fn playlist_name(&self, id: i64) -> Result<Option<String>, LibraryError> {
        Ok(self
            .conn()
            .query_row("SELECT name FROM playlists WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?)
    }

    /// Listenin şarkı sırasını baştan yazar (tek işlemde) ve değişme zamanını günceller.
    fn write_entries(&self, id: i64, entries: &[String]) -> Result<(), LibraryError> {
        let tx = self.conn().unchecked_transaction()?;
        tx.execute("DELETE FROM playlist_entries WHERE playlist_id = ?1", [id])?;
        {
            let mut insert = tx.prepare(
                "INSERT INTO playlist_entries (playlist_id, position, path) VALUES (?1, ?2, ?3)",
            )?;
            for (position, path) in entries.iter().enumerate() {
                insert.execute(params![id, position as i64, path])?;
            }
        }
        tx.execute(
            "UPDATE playlists SET modified = ?2 WHERE id = ?1",
            params![id, now()],
        )?;
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library_with_tracks() -> Library {
        let library = Library::open_in_memory().unwrap();
        library.execute_for_test("INSERT INTO folders (id, path) VALUES (1, '/m')");
        for (i, (album, artist, secs)) in [
            ("Kelimeler", "Şebnem Ferah", 200.0),
            ("Kelimeler", "Şebnem Ferah", 180.0),
            ("Sarı", "Ada", 100.0),
            ("Mavi", "Ada", 150.0),
            ("Yeşil", "Bora", 120.0),
            ("Mor", "Can", 90.0),
        ]
        .iter()
        .enumerate()
        {
            library.execute_for_test(&format!(
                "INSERT INTO tracks (folder_id, path, file_name, title, artist, album, duration_secs,
                 codec, sample_rate, channels, file_size, modified, sort_key, search)
                 VALUES (1, '/m/{i}.flac', '{i}.flac', 'Şarkı {i}', '{artist}', '{album}', {secs},
                 'flac', 44100, 2, 1, 1, 'k{i}', 's{i}')"
            ));
        }
        library
    }

    fn path(i: usize) -> String {
        format!("/m/{i}.flac")
    }

    #[test]
    fn liste_olusturulur_adi_temizlenir_bos_ad_reddedilir() {
        let library = library_with_tracks();
        let list = library.create_playlist("  Yol şarkıları  ").unwrap();
        assert_eq!(list.name, "Yol şarkıları");
        assert_eq!((list.track_count, list.duration_secs), (0, 0.0));
        assert!(list.collage_paths.is_empty());
        assert!(matches!(
            library.create_playlist("   "),
            Err(LibraryError::PlaylistNameEmpty)
        ));
        let long = "ğ".repeat(MAX_NAME_CHARS + 20);
        let list = library.create_playlist(&long).unwrap();
        assert_eq!(list.name.chars().count(), MAX_NAME_CHARS);
    }

    #[test]
    fn sarkilar_eklenir_cikarilir_tasinir_ve_ayni_sarki_iki_kez_olabilir() {
        let library = library_with_tracks();
        let id = library.create_playlist("Karışık").unwrap().id;
        assert_eq!(library.add_to_playlist(id, &[path(0), path(2)]).unwrap(), 2);
        assert_eq!(library.add_to_playlist(id, &[path(4), path(0)]).unwrap(), 4);
        assert_eq!(
            library.playlist_tracks(id).unwrap(),
            [path(0), path(2), path(4), path(0)]
        );
        library.move_in_playlist(id, 3, 1).unwrap();
        assert_eq!(
            library.playlist_tracks(id).unwrap(),
            [path(0), path(0), path(2), path(4)]
        );
        library.remove_from_playlist(id, &[0, 3, 99]).unwrap();
        assert_eq!(library.playlist_tracks(id).unwrap(), [path(0), path(2)]);
        // Geçersiz taşıma bir şey değiştirmez.
        library.move_in_playlist(id, 5, 0).unwrap();
        assert_eq!(library.playlist_tracks(id).unwrap(), [path(0), path(2)]);
        let list = library.playlist(id).unwrap().unwrap();
        assert_eq!((list.track_count, list.duration_secs), (2, 300.0));
    }

    #[test]
    fn kutuphanede_olmayan_sarki_listede_kalir_suresi_sayilmaz() {
        let library = library_with_tracks();
        let id = library.create_playlist("Disk").unwrap().id;
        library
            .add_to_playlist(id, &[path(0), "/usb/kayıp.mp3".to_owned()])
            .unwrap();
        let list = library.playlist(id).unwrap().unwrap();
        assert_eq!((list.track_count, list.duration_secs), (2, 200.0));
        assert_eq!(library.playlist_tracks(id).unwrap()[1], "/usb/kayıp.mp3");
    }

    #[test]
    fn kolaj_ilk_dort_farkli_albumden() {
        let library = library_with_tracks();
        let id = library.create_playlist("Kolaj").unwrap().id;
        // 0 ve 1 aynı albüm; 2, 3, 4, 5 dört farklı albüm.
        library
            .add_to_playlist(id, &[path(1), path(0), path(2), path(3), path(4), path(5)])
            .unwrap();
        assert_eq!(
            library.playlist(id).unwrap().unwrap().collage_paths,
            [path(1), path(2), path(3), path(4)]
        );
    }

    #[test]
    fn ad_degisir_silinen_liste_bulunmaz_ve_sirasi_da_silinir() {
        let library = library_with_tracks();
        let id = library.create_playlist("Eski").unwrap().id;
        library.add_to_playlist(id, &[path(0)]).unwrap();
        library.rename_playlist(id, "Yeni").unwrap();
        assert_eq!(library.playlist(id).unwrap().unwrap().name, "Yeni");
        library.delete_playlist(id).unwrap();
        assert!(library.playlist(id).unwrap().is_none());
        assert_eq!(
            library.count_for_test("SELECT COUNT(*) FROM playlist_entries"),
            0
        );
        assert!(matches!(
            library.playlist_tracks(id),
            Err(LibraryError::PlaylistMissing)
        ));
        assert!(matches!(
            library.rename_playlist(id, "x"),
            Err(LibraryError::PlaylistMissing)
        ));
        assert!(matches!(
            library.delete_playlist(id),
            Err(LibraryError::PlaylistMissing)
        ));
        // Kimlik yeniden kullanılmaz (silinen listenin kapağı yenisine geçmesin).
        let next = library.create_playlist("Sonraki").unwrap().id;
        assert!(next > id);
    }

    #[test]
    fn listeler_en_son_degisen_once() {
        let library = library_with_tracks();
        let a = library.create_playlist("A").unwrap().id;
        let b = library.create_playlist("B").unwrap().id;
        // Aynı saniyede oluşturuldular: eşitlikte yeni olan (büyük kimlik) önce.
        let order: Vec<i64> = library.playlists().unwrap().iter().map(|p| p.id).collect();
        assert_eq!(order, [b, a]);
        library.execute_for_test(&format!(
            "UPDATE playlists SET modified = modified + 10 WHERE id = {a}"
        ));
        let order: Vec<i64> = library.playlists().unwrap().iter().map(|p| p.id).collect();
        assert_eq!(order, [a, b]);
    }
}
