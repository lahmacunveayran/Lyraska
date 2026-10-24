//! Kütüphane veritabanı (SQLite).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;

use super::{search_key, LibraryError};
use crate::analysis::cache::VERSIONS;
use crate::audio::decode::TrackInfo;

/// Arama sonucunda dönen en fazla şarkı sayısı.
pub const MAX_RESULTS: usize = 50_000;
/// Etiket okuma kuralının sürümü. Etiketlerin okunuşu değişince (ör. eski tip ID3v1'in
/// Türkçe harfleri) artırılır ve bir göç adımı hangi kayıtların yeniden okunacağını işaretler
/// (`tags_version` küçük olanlar): dosyalar değişmese de etiketleri bir kez yeniden okunur.
/// 1: ID3v1 metni Windows-1254 / UTF-8 olarak okunuyor (göç 4).
pub const TAGS_VERSION: i64 = 1;

/// Kütüphanedeki bir kaynak: klasör ya da tek tek eklenmiş bir şarkı.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, rename = "LibraryFolder"))]
pub struct FolderRow {
    #[cfg_attr(test, ts(type = "number"))]
    pub id: i64,
    pub path: String,
    /// Kaynaktaki şarkı sayısı (yalnızca `folders()` doldurur; yeni eklenende 0).
    pub track_count: u32,
    /// Tek tek eklenmiş bir şarkı mı: kaynağın kendi yolu bir şarkının yolu. Uzantıya
    /// bakılmaz (adı ".flac" ile biten bir klasör klasör kalır).
    pub single: bool,
}

/// Listede gösterilen bir şarkı.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, rename = "LibraryTrack"))]
pub struct TrackRow {
    #[cfg_attr(test, ts(type = "number"))]
    pub id: i64,
    pub path: String,
    /// Etiketteki başlık, yoksa dosya adı.
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    /// Albüm sanatçısı; albümler bununla (yoksa sanatçıyla) gruplanır.
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub duration_secs: Option<f64>,
    pub codec: String,
    /// Tempo (önbellekteki geçerli analizden); analiz edilmediyse ya da ritim yoksa `None`.
    pub bpm: Option<f64>,
    /// Geçerli bir analizi var mı (ritimsiz şarkılar da analiz edilmiş sayılır).
    pub analyzed: bool,
    /// Tonun Camelot kodu (ör. "8A"; geçerli ton analizinden, güveni yeterliyse).
    pub key: Option<String>,
    /// Kullanıcı şarkıya kapak seçtiyse `Some(true)`; yoksa alan gönderilmez (veritabanında değil;
    /// kapak deposundan komut doldurur).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(test, ts(optional))]
    pub custom_cover: Option<bool>,
}

/// Kütüphanedeki bir albüm (albüm sanatçısı, yoksa sanatçı + albüm adıyla gruplanır).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, rename = "LibraryAlbum"))]
pub struct AlbumRow {
    pub name: String,
    /// Albüm sanatçısı, yoksa şarkıların sanatçısı.
    pub artist: Option<String>,
    pub track_count: u32,
    /// Şarkıların toplam süresi (saniye; süresi bilinmeyenler sayılmaz).
    pub duration_secs: f64,
    /// Kapak resminin okunacağı şarkı: albümün ilk şarkısı.
    pub cover_path: String,
    /// İlk şarkının temposu ve tonu (Camelot): üretilen kapağın ailesi ve mürekkepleri.
    pub bpm: Option<f64>,
    pub key: Option<String>,
}

/// Kütüphanedeki bir sanatçı (albüm sanatçısı, yoksa sanatçı).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, rename = "LibraryArtist"))]
pub struct ArtistRow {
    pub name: String,
    pub album_count: u32,
    pub track_count: u32,
    /// Kapak resminin okunacağı şarkı: sanatçının ilk şarkısı.
    pub cover_path: String,
}

pub use crate::analysis::cache::FileStamp;

pub struct Library {
    conn: Connection,
    /// Bozuk dosya kenara alınıp kütüphane yeniden kurulduysa kullanıcıya gösterilecek açıklama.
    recovery_notice: Option<String>,
}

impl Library {
    /// Veritabanını açar (yoksa oluşturur). Dosya SQLite değilse ya da bozuksa (elektrik
    /// kesintisi, dolu disk) program her açılışta kapalı kalmasın diye dosya `-wal`/`-shm`
    /// eşleriyle birlikte `<ad>.bozuk-<zaman>` adıyla kenara alınır ve boş kütüphane kurulur;
    /// `recovery_notice` bunu söyler. Başka hatalar (izin, kilit) olduğu gibi döner.
    pub fn open(path: &Path) -> Result<Self, LibraryError> {
        Self::open_checked(path, false)
    }

    /// `verify`: açılışta veri sayfaları da denetlenir (`PRAGMA quick_check`). Yalnızca şema
    /// sayfası değil, şarkı ve analiz sayfaları bozuksa da dosya kenara alınır. Dosya büyükse
    /// saniyeler sürebileceği için yalnızca önceki oturum düzgün kapanmadıysa istenir (elektrik
    /// kesintisi, çökme; `lib.rs`). DENETIM-FAZ0 ISK-07.
    pub fn open_checked(path: &Path, verify: bool) -> Result<Self, LibraryError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let error = match Connection::open(path)
            .map_err(LibraryError::from)
            .and_then(|conn| Self::init(conn, verify))
        {
            Ok(library) => return Ok(library),
            Err(error) => error,
        };
        if !is_corruption(&error) {
            return Err(error);
        }
        let moved = move_corrupt_aside(path)?;
        crate::diagnostics::error(&format!(
            "Kütüphane dosyası bozuk ({error}); {} olarak kenara alındı, boş kütüphane kuruldu.",
            moved.display()
        ));
        let mut library = Self::init(Connection::open(path)?, false)?;
        library.recovery_notice = Some(format!(
            "Kütüphane dosyası bozulmuştu; \"{}\" adıyla kenara alındı ve kütüphane boş olarak \
             yeniden kuruldu. Klasörlerinizi yeniden ekleyin; analizler yeniden yapılır.",
            moved.display()
        ));
        Ok(library)
    }

    /// Veritabanı bağlantısı (kütüphanenin alt modülleri için; ör. çalma listeleri).
    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Açılışta bozuk dosya kenara alındıysa kullanıcıya gösterilecek açıklama.
    pub fn recovery_notice(&self) -> Option<&str> {
        self.recovery_notice.as_deref()
    }

    /// Bellekte geçici veritabanı (testler için).
    pub fn open_in_memory() -> Result<Self, LibraryError> {
        Self::init(Connection::open_in_memory()?, false)
    }

    /// Testlerde veritabanını doğrudan değiştirmek için (ör. eski sürümün kaydını kurmak).
    #[cfg(test)]
    pub fn execute_for_test(&self, sql: &str) {
        self.conn.execute_batch(sql).unwrap();
    }

    /// Testlerde tek sayılık sorgu.
    #[cfg(test)]
    pub fn count_for_test(&self, sql: &str) -> i64 {
        self.conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    fn init(mut conn: Connection, verify: bool) -> Result<Self, LibraryError> {
        // Analiz önbelleği aynı dosyaya yazarken kısa süre beklenir.
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;",
        )?;
        if verify {
            let result: String = conn.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
            if result != "ok" {
                return Err(LibraryError::Database(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
                    Some(result),
                )));
            }
        }
        // Şema ve göçler tek yerde (kütüphane ve analiz önbelleği aynı dosyayı kullanır).
        crate::storage::migrate(&mut conn)?;
        Ok(Self {
            conn,
            recovery_notice: None,
        })
    }

    pub fn add_folder(&self, path: &str) -> Result<FolderRow, LibraryError> {
        let inserted = self
            .conn
            .execute("INSERT OR IGNORE INTO folders (path) VALUES (?1)", [path])?;
        if inserted == 0 {
            return Err(LibraryError::FolderExists);
        }
        Ok(FolderRow {
            id: self.conn.last_insert_rowid(),
            path: path.to_owned(),
            track_count: 0,
            single: false,
        })
    }

    /// Yeni bir klasör ekler ve kapsadığı eski kaynakların (`covered`) yerini alır: şarkıları
    /// silinmez, yeni klasöre taşınır. Silinseydi analizleri de silinir (tetikleyici) ve bütün
    /// şarkılar baştan analiz edilirdi; etiketleri de yeniden okunurdu. Tek işlemde.
    pub fn replace_folders(
        &mut self,
        path: &str,
        covered: &[i64],
    ) -> Result<FolderRow, LibraryError> {
        let tx = self.conn.transaction()?;
        if tx.execute("INSERT OR IGNORE INTO folders (path) VALUES (?1)", [path])? == 0 {
            return Err(LibraryError::FolderExists);
        }
        let id = tx.last_insert_rowid();
        for old in covered {
            tx.execute(
                "UPDATE tracks SET folder_id = ?1 WHERE folder_id = ?2",
                [id, *old],
            )?;
            tx.execute("DELETE FROM folders WHERE id = ?1", [*old])?;
        }
        tx.commit()?;
        Ok(FolderRow {
            id,
            path: path.to_owned(),
            track_count: 0,
            single: false,
        })
    }

    /// Klasörü ve ona ait bütün şarkıları kütüphaneden çıkarır (dosyalara dokunmaz).
    pub fn remove_folder(&self, id: i64) -> Result<(), LibraryError> {
        self.conn
            .execute("DELETE FROM folders WHERE id = ?1", [id])?;
        Ok(())
    }

    /// `dir` klasörünün altında (alt klasörler dahil) kütüphanede şarkı var mı? Klasör izleme,
    /// silinen ya da dışarı taşınan bir klasörün kütüphaneyi ilgilendirip ilgilendirmediğine buna
    /// bakarak karar verir. Yolun tekil dizininde ön ek aralığı aranır: büyük kütüphanede de hızlı.
    pub fn has_tracks_under(&self, dir: &Path) -> Result<bool, LibraryError> {
        let (lower, upper) = prefix_range(dir);
        Ok(self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tracks WHERE path >= ?1 AND path < ?2)",
            params![lower, upper],
            |r| r.get(0),
        )?)
    }

    /// Yol kütüphanede ya da bir çalma listesinde var mı ("Dosya konumunu aç" yalnızca bunları açar).
    pub fn knows_path(&self, path: &str) -> Result<bool, LibraryError> {
        Ok(self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tracks WHERE path = ?1)
                 OR EXISTS(SELECT 1 FROM playlist_entries WHERE path = ?1)",
            [path],
            |r| r.get(0),
        )?)
    }

    /// Kaynaklar, şarkı sayıları ve tek şarkı olup olmadıklarıyla (`tracks_folder` dizini).
    pub fn folders(&self) -> Result<Vec<FolderRow>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT f.id, f.path, \
                    (SELECT COUNT(*) FROM tracks t WHERE t.folder_id = f.id), \
                    EXISTS (SELECT 1 FROM tracks t WHERE t.folder_id = f.id AND t.path = f.path) \
             FROM folders f ORDER BY f.path",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(FolderRow {
                id: r.get(0)?,
                path: r.get(1)?,
                track_count: u32::try_from(r.get::<_, i64>(2)?).unwrap_or(u32::MAX),
                single: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn folder(&self, id: i64) -> Result<Option<FolderRow>, LibraryError> {
        Ok(self
            .conn
            .query_row("SELECT id, path FROM folders WHERE id = ?1", [id], |r| {
                Ok(FolderRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    track_count: 0,
                    single: false,
                })
            })
            .optional()?)
    }

    pub fn track_count(&self) -> Result<usize, LibraryError> {
        let n: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))?;
        Ok(n as usize)
    }

    /// Analizi tamamen güncel (dosyası değişmemiş, hiçbir parçası eskimemiş) şarkı sayısı.
    /// Analiz önbelleği okunamıyorsa 0: kütüphane önbelleksiz de çalışır.
    pub fn analyzed_count(&self) -> Result<usize, LibraryError> {
        let n: i64 = self
            .conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM tracks t {VALID_ANALYSIS_JOIN} WHERE {FULLY_CURRENT}"
                ),
                analysis_versions(),
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(n as usize)
    }

    /// Klasördeki bilinen dosyalar ve damgaları (yeniden taramada değişmeyenleri atlamak için).
    /// Etiketi eski bir okuma kuralıyla okunmuş dosyanın damgası `None`: dosya değişmese de
    /// etiketi yeniden okunur ([`TAGS_VERSION`]).
    pub fn known_files(
        &self,
        folder_id: i64,
    ) -> Result<HashMap<String, Option<FileStamp>>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT path, file_size, modified, tags_version FROM tracks WHERE folder_id = ?1",
        )?;
        let rows = stmt.query_map([folder_id], known_file)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// [`Self::known_files`] gibi; yalnızca `dir` klasörünün altındakiler (alt klasör taraması:
    /// bütün bir sürücünün kaydı kütüphane kilidi altında yüklenmesin). Ön ek aralığı yolun tekil
    /// dizininde aranır.
    pub fn known_files_under(
        &self,
        folder_id: i64,
        dir: &Path,
    ) -> Result<HashMap<String, Option<FileStamp>>, LibraryError> {
        let (lower, upper) = prefix_range(dir);
        let mut stmt = self.conn.prepare(
            "SELECT path, file_size, modified, tags_version FROM tracks \
             WHERE path >= ?1 AND path < ?2 AND folder_id = ?3",
        )?;
        let rows = stmt.query_map(params![lower, upper, folder_id], known_file)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Şarkıları ekler ya da günceller ve yok olan dosyaları siler; tek işlemde.
    pub fn apply_changes(
        &mut self,
        folder_id: i64,
        upserts: &[(TrackInfo, FileStamp)],
        removed: &[String],
    ) -> Result<(), LibraryError> {
        let tx = self.conn.transaction()?;
        {
            let mut insert = tx.prepare_cached(
                "INSERT INTO tracks (folder_id, path, file_name, title, artist, album, album_artist,
                     track_number, disc_number, duration_secs, codec, sample_rate, channels,
                     file_size, modified, sort_key, search, tags_version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                     ?18)
                 ON CONFLICT(path) DO UPDATE SET
                     folder_id = excluded.folder_id, file_name = excluded.file_name,
                     title = excluded.title, artist = excluded.artist, album = excluded.album,
                     album_artist = excluded.album_artist, track_number = excluded.track_number,
                     disc_number = excluded.disc_number, duration_secs = excluded.duration_secs,
                     codec = excluded.codec, sample_rate = excluded.sample_rate,
                     channels = excluded.channels, file_size = excluded.file_size,
                     modified = excluded.modified, sort_key = excluded.sort_key,
                     search = excluded.search, tags_version = excluded.tags_version",
            )?;
            for (info, stamp) in upserts {
                insert.execute(params![
                    folder_id,
                    info.path.to_string_lossy(),
                    info.file_name,
                    info.title,
                    info.artist,
                    info.album,
                    info.album_artist,
                    info.track_number,
                    info.disc_number,
                    info.duration_secs,
                    info.codec,
                    info.sample_rate,
                    info.channels as i64,
                    stamp.size as i64,
                    stamp.modified,
                    sort_key(info),
                    search_text(info),
                    TAGS_VERSION,
                ])?;
            }
            let mut delete = tx.prepare_cached("DELETE FROM tracks WHERE path = ?1")?;
            for path in removed {
                delete.execute([path])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Şarkıları arar. Boş arama bütün kütüphaneyi döndürür. Her kelime başlık,
    /// sanatçı, albüm ya da dosya adında geçmelidir (sıra önemsiz, Türkçe karakter
    /// ve büyük/küçük harf duyarsız). Sıralama: sanatçı, albüm, disk, parça.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<TrackRow>, LibraryError> {
        // Analiz önbelleği okunamıyorsa (ör. tablosu bozuk) şarkılar BPM'siz listelenir:
        // kütüphane önbelleksiz de çalışır.
        self.search_with(query, limit, true)
            .or_else(|_| self.search_with(query, limit, false))
    }

    fn search_with(
        &self,
        query: &str,
        limit: usize,
        with_analysis: bool,
    ) -> Result<Vec<TrackRow>, LibraryError> {
        let words: Vec<String> = search_key(query)
            .split_whitespace()
            .map(|w| format!("%{}%", escape_like(w)))
            .collect();
        // Analizle: ?1–?5 analiz parçalarının sürümleri, arama kelimeleri ?6'dan başlar.
        let (mut sql, mut values): (String, Vec<rusqlite::types::Value>) = if with_analysis {
            (
                format!(
                    "SELECT t.id, t.path, COALESCE(t.title, t.file_name), t.artist, t.album,
                            t.album_artist, t.track_number, t.duration_secs, t.codec, a.bpm,
                            a.path IS NOT NULL AND {FULLY_CURRENT},
                            CASE WHEN a.key_version = ?5 THEN a.camelot END
                     FROM tracks t LEFT {VALID_ANALYSIS_JOIN}"
                ),
                analysis_versions().into_iter().map(Into::into).collect(),
            )
        } else {
            (
                "SELECT t.id, t.path, COALESCE(t.title, t.file_name), t.artist, t.album,
                        t.album_artist, t.track_number, t.duration_secs, t.codec, NULL, 0, NULL
                 FROM tracks t"
                    .to_owned(),
                Vec::new(),
            )
        };
        let first_word = values.len() + 1;
        for i in 0..words.len() {
            sql.push_str(if i == 0 { " WHERE " } else { " AND " });
            sql.push_str(&format!("t.search LIKE ?{} ESCAPE '\\'", i + first_word));
        }
        sql.push_str(&format!(
            " ORDER BY t.sort_key LIMIT {}",
            limit.min(MAX_RESULTS)
        ));

        let mut stmt = self.conn.prepare(&sql)?;
        values.extend(words.into_iter().map(rusqlite::types::Value::from));
        let rows = stmt.query_map(params_from_iter(values.iter()), |r| {
            Ok(TrackRow {
                id: r.get(0)?,
                path: r.get(1)?,
                title: r.get(2)?,
                artist: r.get(3)?,
                album: r.get(4)?,
                album_artist: r.get(5)?,
                track_number: r.get(6)?,
                duration_secs: r.get(7)?,
                codec: r.get(8)?,
                bpm: r.get(9)?,
                analyzed: r.get(10)?,
                key: r.get(11)?,
                custom_cover: None,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

impl Library {
    /// Albümler, sanatçı ve albüm adına göre sıralı. `query` boş değilse yalnızca şarkılarından
    /// biri aramaya uyan albümler (arama kuralı [`Library::search`] ile aynı); sayı ve süre yine
    /// bütün albümündür (kart tıklanınca çalınanla aynı).
    pub fn albums(&self, query: &str, limit: usize) -> Result<Vec<AlbumRow>, LibraryError> {
        // Analiz önbelleği okunamıyorsa albümler tempo ve tonsuz listelenir ([`Library::search`]).
        self.albums_with(query, limit, true)
            .or_else(|_| self.albums_with(query, limit, false))
    }

    fn albums_with(
        &self,
        query: &str,
        limit: usize,
        with_analysis: bool,
    ) -> Result<Vec<AlbumRow>, LibraryError> {
        // SQLite'ta tek MIN() ile seçilen satırın öteki sütunları (path) o satırdan gelir; arama
        // koşulu bu yüzden MIN/MAX değil SUM ile sayılır.
        let versions: Vec<rusqlite::types::Value> = if with_analysis {
            analysis_versions().into_iter().map(Into::into).collect()
        } else {
            Vec::new()
        };
        let (filter, words) = search_filter(query, versions.len() + 1);
        let grouped = format!(
            "SELECT album, COALESCE(album_artist, artist) AS who, COUNT(*) AS n,
                    COALESCE(SUM(duration_secs), 0) AS dur, path, MIN(sort_key) AS first
             FROM tracks WHERE album IS NOT NULL AND album <> ''
             GROUP BY who, album HAVING SUM(CASE WHEN 1{filter} THEN 1 ELSE 0 END) > 0
             ORDER BY first LIMIT {}",
            limit.min(MAX_RESULTS)
        );
        let sql = if with_analysis {
            format!(
                "SELECT g.album, g.who, g.n, g.dur, g.path, a.bpm,
                        CASE WHEN a.key_version = ?5 THEN a.camelot END
                 FROM ({grouped}) g JOIN tracks t ON t.path = g.path LEFT {VALID_ANALYSIS_JOIN}
                 ORDER BY g.first"
            )
        } else {
            format!("SELECT album, who, n, dur, path, NULL, NULL FROM ({grouped}) ORDER BY first")
        };
        let mut stmt = self.conn.prepare(&sql)?;
        let values: Vec<rusqlite::types::Value> = versions
            .into_iter()
            .chain(words.into_iter().map(Into::into))
            .collect();
        let rows = stmt.query_map(params_from_iter(values.iter()), |r| {
            Ok(AlbumRow {
                name: r.get(0)?,
                artist: r.get(1)?,
                track_count: r.get(2)?,
                duration_secs: r.get(3)?,
                cover_path: r.get(4)?,
                bpm: r.get(5)?,
                key: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Sanatçılar (albüm sanatçısı, yoksa sanatçı), ada göre sıralı. `query` [`Library::albums`]
    /// gibi süzer: hangi sanatçıların görüneceğini seçer, sayılar yine sanatçının bütünüdür.
    pub fn artists(&self, query: &str, limit: usize) -> Result<Vec<ArtistRow>, LibraryError> {
        let (filter, words) = search_filter(query, 1);
        let sql = format!(
            "SELECT COALESCE(album_artist, artist) AS who, COUNT(DISTINCT NULLIF(album, '')), COUNT(*),
                    path, MIN(sort_key)
             FROM tracks WHERE COALESCE(album_artist, artist) IS NOT NULL
             GROUP BY who HAVING SUM(CASE WHEN 1{filter} THEN 1 ELSE 0 END) > 0
             ORDER BY MIN(sort_key) LIMIT {}",
            limit.min(MAX_RESULTS)
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(words.iter()), |r| {
            Ok(ArtistRow {
                name: r.get(0)?,
                album_count: r.get(1)?,
                track_count: r.get(2)?,
                cover_path: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

impl Library {
    /// Sanatçının şarkılarının yolları, çalma sırasıyla (albüm, disk, parça). Sanatçı
    /// [`Library::artists`] gibi albüm sanatçısıyla (yoksa sanatçıyla) bulunur.
    pub fn artist_tracks(&self, artist: &str) -> Result<Vec<String>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT path FROM tracks WHERE COALESCE(album_artist, artist) = ?1 ORDER BY sort_key",
        )?;
        let rows = stmt.query_map([artist], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Albümün şarkılarının yolları, çalma sırasıyla (disk, parça). Albüm [`Library::albums`]
    /// gibi albüm sanatçısı (yoksa sanatçı) ve adıyla bulunur; sanatçısız albümde `artist` boş.
    pub fn album_tracks(
        &self,
        album: &str,
        artist: Option<&str>,
    ) -> Result<Vec<String>, LibraryError> {
        let mut stmt = self.conn.prepare(
            "SELECT path FROM tracks WHERE album = ?1 AND COALESCE(album_artist, artist) IS ?2
             ORDER BY sort_key",
        )?;
        let rows = stmt.query_map(rusqlite::params![album, artist], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

/// Arama kelimelerinin SQL koşulu (` AND search LIKE ?n …`, `first` numaralı parametreden) ve
/// değerleri. Boş aramada koşul yoktur.
fn search_filter(query: &str, first: usize) -> (String, Vec<String>) {
    let words: Vec<String> = search_key(query)
        .split_whitespace()
        .map(|w| format!("%{}%", escape_like(w)))
        .collect();
    let filter = (0..words.len())
        .map(|i| format!(" AND search LIKE ?{} ESCAPE '\\'", i + first))
        .collect();
    (filter, words)
}

/// Şarkıyı (`t`) kareleri ve ritmi güncel analiziyle (`a`) eşleyen JOIN: BPM buradan gelir.
/// `?1`–`?4` analiz parçalarının sürümleri ([`analysis_versions`]). Ses yüksekliği ya da bas
/// tepeleri eskise de BPM gösterilmeye devam eder (onların yenilenmesi saatler sürebilir).
const VALID_ANALYSIS_JOIN: &str = "JOIN analyses a ON a.path = t.path
    AND a.file_size = t.file_size AND a.modified = t.modified
    AND a.spectrum_version = ?1 AND a.rhythm_version = ?2";

/// Eşlenen analizin geri kalan parçaları da güncel mi?
const FULLY_CURRENT: &str =
    "a.loudness_version = ?3 AND a.bass_version = ?4 AND a.key_version = ?5";

/// Sorgulardaki `?1`–`?5`: spektrum, ritim, ses yüksekliği, bas tepeleri ve ton sürümleri.
fn analysis_versions() -> [i64; 5] {
    [
        VERSIONS.spectrum,
        VERSIONS.rhythm,
        VERSIONS.loudness,
        VERSIONS.bass,
        VERSIONS.key,
    ]
}

/// LIKE kalıbındaki özel karakterleri kaçırır.
fn escape_like(word: &str) -> String {
    word.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Sıralama anahtarı: albüm sanatçısı (yoksa sanatçı), albüm, disk, parça, başlık.
fn sort_key(info: &TrackInfo) -> String {
    let artist = info
        .album_artist
        .as_deref()
        .or(info.artist.as_deref())
        .unwrap_or("\u{10FFFF}"); // sanatçısız şarkılar sona
    let title = info.title.as_deref().unwrap_or(&info.file_name);
    format!(
        "{}\u{1}{}\u{1}{:03}\u{1}{:04}\u{1}{}",
        search_key(artist),
        search_key(info.album.as_deref().unwrap_or("")),
        info.disc_number.unwrap_or(0),
        info.track_number.unwrap_or(0),
        search_key(title)
    )
}

/// Aramada taranan metin.
fn search_text(info: &TrackInfo) -> String {
    let parts = [
        info.title.as_deref(),
        info.artist.as_deref(),
        info.album_artist.as_deref(),
        info.album.as_deref(),
        Some(info.file_name.as_str()),
    ];
    search_key(&parts.into_iter().flatten().collect::<Vec<_>>().join(" "))
}

/// Hata, dosyanın SQLite veritabanı olmadığını ya da bozuk olduğunu mu söylüyor?
fn is_corruption(error: &LibraryError) -> bool {
    let code = match error {
        LibraryError::Database(
            rusqlite::Error::SqliteFailure(e, _) | rusqlite::Error::SqlInputError { error: e, .. },
        )
        | LibraryError::Schema(crate::storage::SchemaError::Database(
            rusqlite::Error::SqliteFailure(e, _) | rusqlite::Error::SqlInputError { error: e, .. },
        )) => e.code,
        _ => return false,
    };
    matches!(
        code,
        rusqlite::ErrorCode::NotADatabase | rusqlite::ErrorCode::DatabaseCorrupt
    )
}

/// Bozuk veritabanını (ve `-wal`/`-shm` eşlerini) `<ad>.bozuk-<zaman>` adıyla kenara alır;
/// yeni adı döner. Silinmez: kullanıcı isterse kurtarma denenebilir.
fn move_corrupt_aside(path: &Path) -> Result<PathBuf, LibraryError> {
    // "2026-10-22 07:19:48 UTC" → "20261022-071948"
    let digits: String = crate::diagnostics::timestamp()
        .chars()
        .filter(char::is_ascii_digit)
        .collect();
    let (date, time) = digits.split_at(digits.len().min(8));
    let mut target = path.as_os_str().to_owned();
    target.push(format!(".bozuk-{date}-{time}"));
    let target = PathBuf::from(target);
    std::fs::rename(path, &target)?;
    for suffix in ["-wal", "-shm"] {
        let mut side = path.as_os_str().to_owned();
        side.push(suffix);
        let side = PathBuf::from(side);
        if side.exists() {
            let mut side_target = target.as_os_str().to_owned();
            side_target.push(suffix);
            std::fs::rename(&side, PathBuf::from(side_target))?;
        }
    }
    Ok(target)
}

/// `path, file_size, modified, tags_version` satırı: yol ve (etiketleri güncelse) dosya damgası.
fn known_file(r: &rusqlite::Row<'_>) -> rusqlite::Result<(String, Option<FileStamp>)> {
    let stamp = FileStamp {
        size: r.get::<_, i64>(1)? as u64,
        modified: r.get(2)?,
    };
    let current = r.get::<_, i64>(3)? >= TAGS_VERSION;
    Ok((r.get::<_, String>(0)?, current.then_some(stamp)))
}

/// `dir` klasörünün altındaki yolların aralığı: alt sınır dahil, üst sınır hariç.
fn prefix_range(dir: &Path) -> (String, String) {
    let sep = std::path::MAIN_SEPARATOR;
    let mut lower = dir.to_string_lossy().into_owned();
    if !lower.ends_with(sep) {
        lower.push(sep);
    }
    // "dir/" ile başlayan her metin "dir/" ≤ metin < "dir0" aralığındadır ('/' + 1 = '0',
    // '\\' + 1 = ']'); SQLite metni de Rust gibi bayt bayt karşılaştırır.
    let mut upper = lower.clone();
    upper.pop();
    upper.push(char::from_u32(u32::from(sep) + 1).unwrap_or(char::MAX));
    (lower, upper)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_olmayan_dosya_kenara_alinir_ve_yeni_kutuphane_acilir() {
        // Bozuk dosya (elektrik kesintisi, dolu disk): program her açılışta kapalı kalmasın;
        // dosya `.bozuk-<zaman>` adıyla kenara alınır, boş kütüphane kurulur (DENETIM-2 KUT-02).
        let path = crate::audio::test_util::temp_path("bozuk.sqlite3");
        std::fs::write(&path, b"bu bir sqlite dosyasi degil".repeat(40)).unwrap();
        std::fs::write(path.with_extension("sqlite3-wal"), b"wal").unwrap();
        let library = Library::open(&path).unwrap();
        assert!(
            library
                .recovery_notice()
                .is_some_and(|n| n.contains("yeniden kuruldu")),
            "kullanıcıya söylenir"
        );
        assert_eq!(library.track_count().unwrap(), 0);
        let names: Vec<String> = std::fs::read_dir(path.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            names.iter().any(|n| n.starts_with("bozuk.sqlite3.bozuk-")),
            "{names:?}"
        );
        // Eski -wal yeni kütüphaneyle kullanılmaz (SQLite ya kendi siler ya da biz kenara
        // alırız); yeni bağlantının kendi -wal dosyası olabilir ama içinde eski veri yoktur.
        let wal = std::fs::read(path.with_extension("sqlite3-wal")).unwrap_or_default();
        assert_ne!(wal, b"wal", "{names:?}");
        // Sağlam dosya kenara alınmaz, bildirim yok.
        let sound = Library::open(&path).unwrap();
        assert!(sound.recovery_notice().is_none());
    }

    #[test]
    fn veri_sayfasi_bozuksa_denetimli_acilista_kenara_alinir() {
        // Hata (ISK-07): yalnızca şema sayfası denetleniyordu; veri sayfası bozuk dosya "açılıyor",
        // sonra her sorgu "malformed" diyordu ve hiç düzelmiyordu.
        let path = crate::audio::test_util::temp_path("veri-bozuk.sqlite3");
        {
            let library = Library::open(&path).unwrap();
            library
                .conn
                .execute_batch(
                    "PRAGMA journal_mode = DELETE; CREATE TABLE dolgu(x BLOB);
                     WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 400)
                     INSERT INTO dolgu SELECT randomblob(500) FROM n;",
                )
                .unwrap();
        }
        // Son sayfalardan birini (şema sayfası değil) bozuk baytlarla ez.
        let mut bytes = std::fs::read(&path).unwrap();
        let page = 4096;
        let at = bytes.len() - 2 * page;
        bytes[at..at + page].fill(0xA5);
        std::fs::write(&path, &bytes).unwrap();

        // Denetimsiz açılış bozukluğu görmez (eski davranış, hızlı yol)...
        assert!(Library::open(&path).unwrap().recovery_notice().is_none());
        // ...denetimli açılış görür ve dosyayı kenara alır.
        let library = Library::open_checked(&path, true).unwrap();
        assert!(library.recovery_notice().is_some());
        assert_eq!(library.track_count().unwrap(), 0);
    }

    fn track(
        path: &str,
        title: Option<&str>,
        artist: Option<&str>,
        album: Option<&str>,
        no: Option<u32>,
    ) -> TrackInfo {
        let path = PathBuf::from(path);
        TrackInfo {
            file_name: path.file_stem().unwrap().to_string_lossy().into_owned(),
            path,
            title: title.map(str::to_owned),
            artist: artist.map(str::to_owned),
            album: album.map(str::to_owned),
            album_artist: None,
            track_number: no,
            disc_number: None,
            codec: "flac".to_owned(),
            sample_rate: 44_100,
            channels: 2,
            duration_secs: Some(200.0),
        }
    }

    const STAMP: FileStamp = FileStamp {
        size: 1000,
        modified: 1,
    };

    #[test]
    fn klasorun_altinda_sarki_olup_olmadigi_bilinir() {
        let mut lib = Library::open_in_memory().unwrap();
        let root = std::env::temp_dir().join("muzik");
        let folder = lib.add_folder(&root.to_string_lossy()).unwrap();
        let song = root.join("Albüm").join("Alt").join("a.flac");
        lib.apply_changes(
            folder.id,
            &[(
                track(&song.to_string_lossy(), None, None, None, None),
                STAMP,
            )],
            &[],
        )
        .unwrap();
        let under = |p: PathBuf| lib.has_tracks_under(&p).unwrap();
        assert!(under(root.clone()));
        assert!(under(root.join("Albüm")));
        assert!(under(root.join("Albüm").join("Alt")));
        // Adı aynı harflerle başlayan komşu klasör ve şarkının kendisi "altında" sayılmaz.
        assert!(!under(root.join("Alb")));
        assert!(!under(root.join("Albüm 2")));
        assert!(!under(song.clone()));
        assert!(!under(root.join("Başka")));
    }

    #[test]
    fn alt_klasordeki_bilinen_sarkilar_yuklenir() {
        let mut lib = Library::open_in_memory().unwrap();
        let root = std::env::temp_dir().join("muzik");
        let other = std::env::temp_dir().join("başka");
        let folder = lib.add_folder(&root.to_string_lossy()).unwrap();
        let second = lib.add_folder(&other.to_string_lossy()).unwrap();
        let song = |p: PathBuf| (track(&p.to_string_lossy(), None, None, None, None), STAMP);
        let inside = root.join("Albüm").join("CD1").join("a.flac");
        lib.apply_changes(
            folder.id,
            &[
                song(inside.clone()),
                song(root.join("Albüm 2").join("b.flac")),
                song(root.join("c.flac")),
            ],
            &[],
        )
        .unwrap();
        lib.apply_changes(second.id, &[song(other.join("Albüm").join("d.flac"))], &[])
            .unwrap();
        let known = lib
            .known_files_under(folder.id, &root.join("Albüm"))
            .unwrap();
        assert_eq!(
            known.keys().cloned().collect::<Vec<_>>(),
            vec![inside.to_string_lossy().into_owned()]
        );
        assert_eq!(known.values().next(), Some(&Some(STAMP)));
        assert_eq!(
            lib.known_files_under(folder.id, &root).unwrap().len(),
            3,
            "kökün altı: kaynağın hepsi"
        );
        assert!(lib
            .known_files_under(folder.id, &other.join("Albüm"))
            .unwrap()
            .is_empty());
    }

    fn sample() -> Library {
        let mut lib = Library::open_in_memory().unwrap();
        let folder = lib.add_folder("/muzik").unwrap();
        lib.apply_changes(
            folder.id,
            &[
                (
                    track(
                        "/muzik/b.flac",
                        Some("Bir Kedi Gördüm"),
                        Some("Şebnem Ferah"),
                        Some("Kelimeler"),
                        Some(2),
                    ),
                    STAMP,
                ),
                (
                    track(
                        "/muzik/a.flac",
                        Some("Mayın Tarlası"),
                        Some("Şebnem Ferah"),
                        Some("Kelimeler"),
                        Some(1),
                    ),
                    STAMP,
                ),
                (
                    track(
                        "/muzik/c.mp3",
                        Some("Gülümse"),
                        Some("Sezen Aksu"),
                        Some("Gülümse"),
                        Some(1),
                    ),
                    STAMP,
                ),
                (
                    track("/muzik/etiketsiz_dosya.mp3", None, None, None, None),
                    STAMP,
                ),
            ],
            &[],
        )
        .unwrap();
        lib
    }

    #[test]
    fn albumler_ve_sanatcilar_gruplanir_ve_sirali_gelir() {
        let lib = sample();
        let albums = lib.albums("", 100).unwrap();
        let names: Vec<(&str, Option<&str>, u32)> = albums
            .iter()
            .map(|a| (a.name.as_str(), a.artist.as_deref(), a.track_count))
            .collect();
        // Sıra şarkı listesiyle aynı: sanatçı, sonra albüm (Şebnem, s-e-b, Sezen'den önce);
        // etiketsiz şarkının albümü yok.
        assert_eq!(
            names,
            [
                ("Kelimeler", Some("Şebnem Ferah"), 2),
                ("Gülümse", Some("Sezen Aksu"), 1)
            ]
        );
        // Kapak albümün ilk şarkısından (1. parça a.flac), süre toplam.
        assert_eq!(albums[0].cover_path, "/muzik/a.flac");
        assert!((albums[0].duration_secs - 400.0).abs() < 1e-9);

        let artists = lib.artists("", 100).unwrap();
        let names: Vec<(&str, u32, u32)> = artists
            .iter()
            .map(|a| (a.name.as_str(), a.album_count, a.track_count))
            .collect();
        assert_eq!(names, [("Şebnem Ferah", 1, 2), ("Sezen Aksu", 1, 1)]);

        // Arama Türkçe harf ve büyük/küçük harf duyarsız; yalnızca uyan şarkının grubu.
        let found = lib.albums("mayin", 100).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Kelimeler");
        assert_eq!(lib.artists("GULUMSE", 100).unwrap()[0].name, "Sezen Aksu");
        assert!(lib.albums("yok%böyle", 100).unwrap().is_empty());
    }

    #[test]
    fn library_adli_bozuk_dosya_tek_kez_kenara_alinir() {
        let path = crate::audio::test_util::temp_path("library.sqlite3");
        std::fs::write(&path, b"sqlite degil ".repeat(100)).unwrap();

        let library = Library::open(&path).unwrap();
        assert_eq!(library.track_count().unwrap(), 0);

        let dir = path.parent().unwrap();
        let kept: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("library.sqlite3.bozuk-"))
            .collect();
        assert_eq!(kept.len(), 1, "{kept:?}");
    }

    #[test]
    fn bos_arama_hepsini_sanatci_album_parca_sirasiyla_dondurur() {
        let titles: Vec<String> = sample()
            .search("", 100)
            .unwrap()
            .into_iter()
            .map(|t| t.title)
            .collect();
        assert_eq!(
            titles,
            // Şebnem (s-e-b) Sezen'den (s-e-z) önce gelir; etiketsiz şarkılar en sonda.
            [
                "Mayın Tarlası",
                "Bir Kedi Gördüm",
                "Gülümse",
                "etiketsiz_dosya"
            ]
        );
    }

    #[test]
    fn arama_turkce_karakter_ve_buyuk_kucuk_harf_duyarsiz() {
        let lib = sample();
        for query in ["sebnem", "ŞEBNEM", "Şebnem ferah", "ferah kelime"] {
            assert_eq!(lib.search(query, 100).unwrap().len(), 2, "{query}");
        }
        assert_eq!(
            lib.search("gulumse", 100).unwrap()[0].artist.as_deref(),
            Some("Sezen Aksu")
        );
        assert_eq!(
            lib.search("etiketsiz", 100).unwrap().len(),
            1,
            "dosya adında da arar"
        );
        assert!(lib.search("yok böyle", 100).unwrap().is_empty());
        // LIKE özel karakterleri kaçırılır: "_" her karakterle eşleşmemeli.
        assert_eq!(lib.search("z_d", 100).unwrap().len(), 1);
        assert!(lib.search("%", 100).unwrap().is_empty());
    }

    #[test]
    fn analiz_onbellegi_okunamazsa_sarkilar_bpm_siz_listelenir() {
        let lib = sample();
        // Önbellek tablosu çalışırken bozuldu (açılışta onarılır; o zamana kadar).
        lib.execute_for_test("DROP TRIGGER analyses_follow_tracks; DROP TABLE analyses;");
        let all = lib.search("", 100).unwrap();
        assert_eq!(all.len(), 4);
        assert!(all.iter().all(|t| t.bpm.is_none() && !t.analyzed));
        // Arama da çalışır (kelimeler ?1'den başlar).
        let found = lib.search("şebnem kelime", 100).unwrap();
        assert_eq!(found.len(), 2);
        assert_eq!(lib.analyzed_count().unwrap(), 0);
        assert_eq!(lib.track_count().unwrap(), 4);
    }

    #[test]
    fn kutuphaneden_cikan_sarkinin_analizi_de_silinir() {
        let mut lib = sample();
        let store = |lib: &Library, path: &str| {
            lib.conn
                .execute(
                    "INSERT OR REPLACE INTO analyses
                         (path, file_size, modified, version, frames, levels, meters, onset)
                     VALUES (?1, 1, 1, 1, 0, x'', x'', x'')",
                    [path],
                )
                .unwrap();
        };
        let count = |lib: &Library| -> i64 {
            lib.conn
                .query_row("SELECT COUNT(*) FROM analyses", [], |r| r.get(0))
                .unwrap()
        };
        for path in [
            "/muzik/a.flac",
            "/muzik/b.flac",
            "/baska/disaridan-acilan.mp3",
        ] {
            store(&lib, path);
        }
        // Taramada silinen dosya: analizi de gider.
        let folder = lib.folders().unwrap()[0].id;
        lib.apply_changes(folder, &[], &["/muzik/a.flac".to_owned()])
            .unwrap();
        assert_eq!(count(&lib), 2);
        // Klasör kütüphaneden çıkarılınca içindeki şarkıların analizleri de gider;
        // kütüphane dışından açılmış şarkınınki kalır.
        lib.remove_folder(folder).unwrap();
        assert_eq!(count(&lib), 1);
    }

    #[test]
    fn bpm_ve_ton_yalnizca_gecerli_analizden_gelir() {
        let lib = sample();
        let v = VERSIONS;
        // Kayıt: boyut, parça sürümleri (spektrum, ritim, ses yüksekliği, bas, ton), BPM.
        let analyze = |path: &str, size: i64, parts: [i64; 5], bpm: Option<f64>| {
            lib.conn
                .execute(
                    "INSERT OR REPLACE INTO analyses
                         (path, file_size, modified, version, frames, bpm, levels, meters, onset,
                          spectrum_version, rhythm_version, loudness_version, bass_version,
                          key_version, camelot)
                     VALUES (?1, ?2, ?3, 6, 0, ?4, x'', x'', x'', ?5, ?6, ?7, ?8, ?9, '8A')",
                    params![
                        path,
                        size,
                        STAMP.modified,
                        bpm,
                        parts[0],
                        parts[1],
                        parts[2],
                        parts[3],
                        parts[4]
                    ],
                )
                .unwrap();
        };
        let row = |path: &str| {
            lib.search("", 100)
                .unwrap()
                .into_iter()
                .find(|t| t.path == path)
                .unwrap()
        };
        let current = [v.spectrum, v.rhythm, v.loudness, v.bass, v.key];
        let size = STAMP.size as i64;
        assert_eq!(
            (row("/muzik/a.flac").bpm, row("/muzik/a.flac").analyzed),
            (None, false)
        );
        assert_eq!(lib.analyzed_count().unwrap(), 0);

        analyze("/muzik/a.flac", size, current, Some(128.0));
        analyze("/muzik/b.flac", size, current, None); // ritimsiz
        assert_eq!(
            (row("/muzik/a.flac").bpm, row("/muzik/a.flac").analyzed),
            (Some(128.0), true)
        );
        assert_eq!(
            (row("/muzik/b.flac").bpm, row("/muzik/b.flac").analyzed),
            (None, true)
        );
        assert_eq!(lib.analyzed_count().unwrap(), 2);
        // Arama da çalışır: kelime parametreleri analiz sürümlerinden sonra gelir.
        assert_eq!(lib.search("mayin", 100).unwrap()[0].bpm, Some(128.0));

        // Yalnızca ses yüksekliği eskidi: BPM görünmeye devam eder, analiz "bekliyor".
        analyze(
            "/muzik/a.flac",
            size,
            [v.spectrum, v.rhythm, v.loudness - 1, v.bass, v.key],
            Some(128.0),
        );
        assert_eq!(
            (row("/muzik/a.flac").bpm, row("/muzik/a.flac").analyzed),
            (Some(128.0), false)
        );
        assert_eq!(lib.analyzed_count().unwrap(), 1);
        assert_eq!(row("/muzik/a.flac").key.as_deref(), Some("8A"));

        // Yalnızca ton eskidi (ör. ton hesabı değişti): BPM kalır, ton gösterilmez.
        analyze(
            "/muzik/a.flac",
            size,
            [v.spectrum, v.rhythm, v.loudness, v.bass, v.key - 1],
            Some(128.0),
        );
        assert_eq!(
            (row("/muzik/a.flac").bpm, row("/muzik/a.flac").analyzed),
            (Some(128.0), false)
        );
        assert_eq!(row("/muzik/a.flac").key, None);
        assert_eq!(row("/muzik/b.flac").key.as_deref(), Some("8A"));

        // Dosya değişti ya da ritim eskidi: BPM gösterilmez.
        analyze("/muzik/a.flac", size + 1, current, Some(128.0));
        analyze(
            "/muzik/b.flac",
            size,
            [v.spectrum, v.rhythm - 1, v.loudness, v.bass, v.key],
            Some(90.0),
        );
        assert_eq!(
            (row("/muzik/a.flac").bpm, row("/muzik/a.flac").analyzed),
            (None, false)
        );
        assert_eq!(
            (row("/muzik/b.flac").bpm, row("/muzik/b.flac").analyzed),
            (None, false)
        );
        assert_eq!(lib.analyzed_count().unwrap(), 0);
    }

    #[test]
    fn guncelleme_ve_silme_tek_islemde() {
        let mut lib = sample();
        let folder = lib.folders().unwrap()[0].id;
        let mut changed = track(
            "/muzik/c.mp3",
            Some("Gülümse (Remaster)"),
            Some("Sezen Aksu"),
            None,
            None,
        );
        changed.duration_secs = Some(10.0);
        lib.apply_changes(
            folder,
            &[(
                changed,
                FileStamp {
                    size: 5,
                    modified: 2,
                },
            )],
            &["/muzik/a.flac".to_owned()],
        )
        .unwrap();
        assert_eq!(lib.track_count().unwrap(), 3);
        assert_eq!(lib.search("remaster", 10).unwrap().len(), 1);
        assert_eq!(
            lib.known_files(folder).unwrap()["/muzik/c.mp3"],
            Some(FileStamp {
                size: 5,
                modified: 2
            })
        );
    }

    #[test]
    fn klasor_tekrar_eklenmez_ve_silinince_sarkilari_da_gider() {
        let lib = sample();
        assert!(matches!(
            lib.add_folder("/muzik"),
            Err(LibraryError::FolderExists)
        ));
        let id = lib.folders().unwrap()[0].id;
        lib.remove_folder(id).unwrap();
        assert_eq!(lib.track_count().unwrap(), 0);
        assert!(lib.folders().unwrap().is_empty());
    }

    #[test]
    fn kaynaklar_sarki_sayisi_ve_tek_sarki_bilgisiyle_gelir() {
        let mut lib = sample();
        let muzik = lib.folders().unwrap()[0].clone();
        // Tek tek eklenmiş şarkı: kaynağın yolu şarkının kendi yolu.
        let single = lib.add_folder("/indir/tek.mp3").unwrap();
        lib.apply_changes(
            single.id,
            &[(track("/indir/tek.mp3", None, None, None, None), STAMP)],
            &[],
        )
        .unwrap();
        // Adı ses uzantısıyla biten bir klasör klasör kalır (uzantıya bakılmaz).
        let tricky = lib.add_folder("/arsiv/Albüm.flac").unwrap();
        lib.apply_changes(
            tricky.id,
            &[(
                track("/arsiv/Albüm.flac/1.flac", None, None, None, None),
                STAMP,
            )],
            &[],
        )
        .unwrap();
        // Henüz taranmamış kaynak: sıfır şarkı, tek şarkı değil.
        lib.add_folder("/bos").unwrap();

        let rows = lib.folders().unwrap();
        let get = |path: &str| rows.iter().find(|f| f.path == path).unwrap();
        assert_eq!(
            (get(&muzik.path).track_count, get(&muzik.path).single),
            (4, false)
        );
        assert_eq!(
            (
                get("/indir/tek.mp3").track_count,
                get("/indir/tek.mp3").single
            ),
            (1, true)
        );
        assert_eq!(
            (
                get("/arsiv/Albüm.flac").track_count,
                get("/arsiv/Albüm.flac").single
            ),
            (1, false)
        );
        assert_eq!((get("/bos").track_count, get("/bos").single), (0, false));
    }

    #[test]
    fn albumler_ve_albumun_sarkilari_ayni_gruplamayi_kullanir() {
        let mut lib = Library::open_in_memory().unwrap();
        let folder = lib.add_folder("/m").unwrap();
        let with_album_artist = |path: &str, artist: &str, no: u32| {
            let mut t = track(path, Some(path), Some(artist), Some("Derleme"), Some(no));
            t.album_artist = Some("Çeşitli".to_owned());
            (t, STAMP)
        };
        lib.apply_changes(
            folder.id,
            &[
                // Derleme: albüm sanatçısı var, şarkıların sanatçıları farklı.
                with_album_artist("/m/d2.flac", "Ece", 2),
                with_album_artist("/m/d1.flac", "Bora", 1),
                // Sanatçısız albüm.
                (
                    track("/m/s1.flac", Some("Sessiz"), None, Some("Adsız"), Some(1)),
                    STAMP,
                ),
                (
                    track("/m/s2.flac", Some("Rüzgâr"), None, Some("Adsız"), Some(2)),
                    STAMP,
                ),
            ],
            &[],
        )
        .unwrap();
        let albums = lib.albums("", 10).unwrap();
        assert_eq!(albums.len(), 2);
        for album in &albums {
            let paths = lib
                .album_tracks(&album.name, album.artist.as_deref())
                .unwrap();
            assert_eq!(paths.len() as u32, album.track_count, "{}", album.name);
            assert_eq!(paths[0], album.cover_path, "kapak ilk şarkıdan");
        }
        let derleme = albums.iter().find(|a| a.name == "Derleme").unwrap();
        assert_eq!(derleme.artist.as_deref(), Some("Çeşitli"));
        assert_eq!(
            lib.album_tracks("Derleme", Some("Çeşitli")).unwrap()[0],
            "/m/d1.flac"
        );
        // Şarkılarda albüm sanatçısı da gelir (çalan albüm böyle bulunur).
        let tracks = lib.search("ece", 10).unwrap();
        assert_eq!(tracks[0].album_artist.as_deref(), Some("Çeşitli"));

        // Arama yalnızca hangi albümlerin görüneceğini seçer; sayı ve süre bütün albümün.
        let found = lib.albums("rüzgar", 10).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].name.as_str(), found[0].track_count), ("Adsız", 2));
        assert!((found[0].duration_secs - 400.0).abs() < 1e-9);
        // Analizi olmayan albümün tempo ve tonu yok.
        assert_eq!((found[0].bpm, found[0].key.as_deref()), (None, None));
    }

    #[test]
    fn albumun_tempo_ve_tonu_ilk_sarkinin_gecerli_analizinden_gelir() {
        let lib = sample();
        let album = |lib: &Library| lib.albums("", 10).unwrap()[0].clone();
        assert_eq!((album(&lib).bpm, album(&lib).key), (None, None));
        let v = VERSIONS;
        lib.conn
            .execute(
                "INSERT INTO analyses
                     (path, file_size, modified, version, frames, bpm, levels, meters, onset,
                      spectrum_version, rhythm_version, loudness_version, bass_version,
                      key_version, camelot)
                 VALUES (?1, ?2, ?3, 6, 0, 128.0, x'', x'', x'', ?4, ?5, ?6, ?7, ?8, '8A')",
                params![
                    album(&lib).cover_path,
                    STAMP.size as i64,
                    STAMP.modified,
                    v.spectrum,
                    v.rhythm,
                    v.loudness,
                    v.bass,
                    v.key
                ],
            )
            .unwrap();
        assert_eq!(
            (album(&lib).bpm, album(&lib).key.as_deref()),
            (Some(128.0), Some("8A"))
        );
        // Önbellek okunamıyorsa albümler yine listelenir (tempo ve tonsuz); arama da çalışır.
        lib.execute_for_test("DROP TRIGGER analyses_follow_tracks; DROP TABLE analyses;");
        assert_eq!((album(&lib).bpm, album(&lib).key), (None, None));
        assert_eq!(lib.albums("kelime", 10).unwrap().len(), 1);
    }

    #[test]
    fn sanatcilar_ve_sanatcinin_sarkilari_ayni_gruplamayi_kullanir() {
        let mut lib = Library::open_in_memory().unwrap();
        let folder = lib.add_folder("/m").unwrap();
        let mut derleme = track(
            "/m/d1.flac",
            Some("Bir"),
            Some("Ece"),
            Some("Derleme"),
            Some(1),
        );
        derleme.album_artist = Some("Çeşitli".to_owned());
        lib.apply_changes(
            folder.id,
            &[
                (derleme, STAMP),
                (
                    track(
                        "/m/e2.flac",
                        Some("Rüzgâr"),
                        Some("Ece"),
                        Some("İlk"),
                        Some(2),
                    ),
                    STAMP,
                ),
                (
                    track(
                        "/m/e1.flac",
                        Some("Deniz"),
                        Some("Ece"),
                        Some("İlk"),
                        Some(1),
                    ),
                    STAMP,
                ),
                (
                    track(
                        "/m/e3.flac",
                        Some("Kum"),
                        Some("Ece"),
                        Some("İkinci"),
                        Some(1),
                    ),
                    STAMP,
                ),
            ],
            &[],
        )
        .unwrap();
        let artists = lib.artists("", 10).unwrap();
        for artist in &artists {
            let paths = lib.artist_tracks(&artist.name).unwrap();
            assert_eq!(paths.len() as u32, artist.track_count, "{}", artist.name);
            assert_eq!(paths[0], artist.cover_path);
        }
        let ece = artists.iter().find(|a| a.name == "Ece").unwrap();
        assert_eq!((ece.album_count, ece.track_count), (2, 3));
        // Derlemedeki şarkı "Çeşitli"nin; çalma sırası albüm, sonra parça.
        assert_eq!(
            lib.artist_tracks("Ece").unwrap(),
            ["/m/e3.flac", "/m/e1.flac", "/m/e2.flac"]
        );
        // Arama sanatçıyı seçer, sayılar sanatçının bütünü.
        let found = lib.artists("rüzgar", 10).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!((found[0].name.as_str(), found[0].track_count), ("Ece", 3));
    }

    #[test]
    fn sanatcinin_album_sayisi_bos_albumu_saymaz() {
        // Albüm listesi boş adlı albümü göstermez; sanatçının albüm sayısı da saymamalı.
        let mut lib = Library::open_in_memory().unwrap();
        let folder = lib.add_folder("/m").unwrap();
        lib.apply_changes(
            folder.id,
            &[
                (
                    track("/m/a.flac", Some("A"), Some("Ece"), Some("İlk"), Some(1)),
                    STAMP,
                ),
                (
                    track("/m/b.flac", Some("B"), Some("Ece"), Some(""), Some(1)),
                    STAMP,
                ),
                (
                    track("/m/c.flac", Some("C"), Some("Ece"), None, Some(1)),
                    STAMP,
                ),
            ],
            &[],
        )
        .unwrap();
        let ece = &lib.artists("", 10).unwrap()[0];
        assert_eq!((ece.album_count, ece.track_count), (1, 3));
        let albums = lib.albums("", 10).unwrap();
        assert_eq!(albums.len() as u32, ece.album_count);
    }

    #[test]
    fn albumun_sarkilari_calma_sirasiyla_gelir() {
        let lib = sample();
        let album = &lib.albums("", 10).unwrap()[0];
        let paths = lib
            .album_tracks(&album.name, album.artist.as_deref())
            .unwrap();
        assert_eq!(paths.len() as u32, album.track_count);
        // Parça numarası sırası (a = 1, b = 2), eklenme sırası değil.
        assert_eq!(paths[0], "/muzik/a.flac");
        assert!(lib
            .album_tracks(&album.name, Some("Başka"))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn veritabani_dosyaya_yazilir_ve_yeniden_acilir() {
        let path = crate::audio::test_util::temp_path("kutuphane.sqlite3");
        {
            let lib = Library::open(&path).unwrap();
            lib.add_folder("/muzik").unwrap();
        }
        let lib = Library::open(&path).unwrap();
        assert_eq!(lib.folders().unwrap().len(), 1);
    }
}
