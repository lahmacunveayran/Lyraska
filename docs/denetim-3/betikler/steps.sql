
CREATE TABLE IF NOT EXISTS folders (
    id   INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS tracks (
    id            INTEGER PRIMARY KEY,
    folder_id     INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    path          TEXT NOT NULL UNIQUE,
    file_name     TEXT NOT NULL,
    title         TEXT,
    artist        TEXT,
    album         TEXT,
    album_artist  TEXT,
    track_number  INTEGER,
    disc_number   INTEGER,
    duration_secs REAL,
    codec         TEXT NOT NULL,
    sample_rate   INTEGER NOT NULL,
    channels      INTEGER NOT NULL,
    file_size     INTEGER NOT NULL,
    modified      INTEGER NOT NULL,
    sort_key      TEXT NOT NULL,
    search        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_folder ON tracks(folder_id);
CREATE INDEX IF NOT EXISTS tracks_sort ON tracks(sort_key);
CREATE TABLE IF NOT EXISTS analyses (
    path      TEXT PRIMARY KEY,
    file_size INTEGER NOT NULL,
    modified  INTEGER NOT NULL,
    version   INTEGER NOT NULL,
    frames    INTEGER NOT NULL,
    bpm       REAL,
    levels    BLOB NOT NULL,
    meters    BLOB NOT NULL,
    onset     BLOB NOT NULL,
    beats     TEXT,
    song_map  TEXT
);
CREATE TRIGGER IF NOT EXISTS analyses_follow_tracks AFTER DELETE ON tracks
BEGIN DELETE FROM analyses WHERE path = old.path; END;


ALTER TABLE analyses ADD COLUMN loudness_lufs REAL;
ALTER TABLE analyses ADD COLUMN true_peak_dbtp REAL;


ALTER TABLE analyses ADD COLUMN bass_peaks TEXT;


ALTER TABLE tracks ADD COLUMN tags_version INTEGER NOT NULL DEFAULT 1;
UPDATE tracks SET tags_version = 0
 WHERE lower(path) LIKE '%.mp3'
   AND (title IS NULL OR artist IS NULL OR album IS NULL
        OR title GLOB '*[ÐÝÞðýþ]*' OR artist GLOB '*[ÐÝÞðýþ]*'
        OR album GLOB '*[ÐÝÞðýþ]*' OR album_artist GLOB '*[ÐÝÞðýþ]*');


ALTER TABLE analyses ADD COLUMN spectrum_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analyses ADD COLUMN rhythm_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analyses ADD COLUMN loudness_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analyses ADD COLUMN bass_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE analyses ADD COLUMN sample_rate INTEGER;
UPDATE analyses SET
    spectrum_version = CASE WHEN version >= 2 THEN 1 ELSE 0 END,
    rhythm_version = CASE WHEN version >= 2 THEN 1 ELSE 0 END,
    loudness_version = CASE WHEN version >= 3 THEN 1 ELSE 0 END,
    bass_version = CASE WHEN version >= 5 THEN 1 ELSE 0 END,
    sample_rate = (SELECT t.sample_rate FROM tracks t WHERE t.path = analyses.path);


CREATE TRIGGER IF NOT EXISTS analyses_follow_tracks AFTER DELETE ON tracks
BEGIN DELETE FROM analyses WHERE path = old.path; END;


ALTER TABLE analyses ADD COLUMN chroma BLOB;
ALTER TABLE analyses ADD COLUMN musical_key TEXT;
ALTER TABLE analyses ADD COLUMN camelot TEXT;
ALTER TABLE analyses ADD COLUMN key_version INTEGER NOT NULL DEFAULT 0;
