#!/usr/bin/env python3
"""50 000 şarkılık sentetik kütüphane: db.rs / cache.rs sorgularının süreleri ve EXPLAIN QUERY PLAN.

Kullanım: olcek.py <analiz_sayısı> <levels_blob_bayt> [dosya]
Şema storage.rs'teki göç adımlarından kurulur; sorgular db.rs ve cache.rs'ten aynen alınmıştır."""
import os, random, re, sqlite3, sys, time, unicodedata

SRC = "/home/user/denetim-bagimsiz/kaynak/src-tauri/src/storage.rs"
N_TRACKS = 50_000
n_analyses = int(sys.argv[1]) if len(sys.argv) > 1 else 50_000
blob = int(sys.argv[2]) if len(sys.argv) > 2 else 200
path = sys.argv[3] if len(sys.argv) > 3 else f"/home/user/denetim-bagimsiz/calisma/B-VER/olcek-{n_analyses}-{blob}.sqlite3"
V = {"spectrum": 2, "rhythm": 4, "loudness": 1, "bass": 1, "key": 1}

steps = dict(re.findall(r'const V(\d+): &str = "(.*?)";', open(SRC, encoding="utf-8").read(), re.S))

def search_key(s):  # library/mod.rs search_key (yalnızca bu betiğin verisi için)
    table = str.maketrans("IıİiŞşÇçĞğÖöÜü", "iiiisscc" + "ggoouu")
    return s.translate(table).lower()

random.seed(7)
ARTISTS = ["Şebnem Ferah", "Sezen Aksu", "Barış Manço", "Cem Karaca", "Müslüm Gürses", "Tarkan", "Ajda Pekkan",
           "Erkin Koray", "Zülfü Livaneli", "Nilüfer", "Duman", "maNga", "Teoman", "Göksel", "İbrahim Tatlıses",
           "Yıldız Tilbe", "Candan Erçetin", "Mor ve Ötesi", "Athena", "Kenan Doğulu"]
WORDS = ["Gece", "Yarısı", "Işık", "Gülümse", "Mayın", "Tarlası", "Rüya", "Çiçek", "Dağ", "Şarkı", "Sevda",
         "Yağmur", "Deniz", "Güneş", "Ömür", "Yol", "Kalp", "Yıldız", "Özlem", "Hüzün"]

if os.path.exists(path):
    os.remove(path)
for s in ("-wal", "-shm"):
    if os.path.exists(path + s): os.remove(path + s)
c = sqlite3.connect(path, isolation_level=None)
c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL"); c.execute("PRAGMA foreign_keys=ON")
for i in range(1, 8):
    c.executescript(steps[str(i)])
c.execute("PRAGMA user_version = 7")
t0 = time.time()
c.execute("BEGIN")
c.execute("INSERT INTO folders (id, path) VALUES (1, 'D:\\Müzik')")
rows = []
for i in range(N_TRACKS):
    artist = ARTISTS[i % len(ARTISTS)]
    album = f"{random.choice(WORDS)} {random.choice(WORDS)}"
    title = f"{random.choice(WORDS)} {random.choice(WORDS)} {i}"
    p = f"D:\\Müzik\\{artist}\\{album}\\{i % 12 + 1:02} {title}.flac"
    fn = f"{i % 12 + 1:02} {title}"
    sort_key = "\x01".join([search_key(artist), search_key(album), "000", f"{i % 12 + 1:04}", search_key(title)])
    search = search_key(" ".join([title, artist, album, fn]))
    rows.append((1, p, fn, title, artist, album, None, i % 12 + 1, None, 180.0 + i % 200, "flac", 44100, 2,
                 20_000_000 + i, 1_700_000_000 + i, sort_key, search, 1))
c.executemany("""INSERT INTO tracks (folder_id, path, file_name, title, artist, album, album_artist, track_number,
    disc_number, duration_secs, codec, sample_rate, channels, file_size, modified, sort_key, search, tags_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", rows)
levels = os.urandom(blob); meters = os.urandom(blob // 8); onset = os.urandom(blob // 8); chroma = os.urandom(blob // 60)
arows = [(r[1], r[13], r[14], 6, 14400, 120.0 + i % 60, levels, meters, onset, '{"bpm":120}', '{"meter":4}', -12.0, -0.5,
          '{}', 44100, V["spectrum"], V["rhythm"], V["loudness"], V["bass"], chroma, '{"key":null}', "8A", V["key"])
         for i, r in enumerate(rows[:n_analyses])]
c.executemany("""INSERT INTO analyses (path, file_size, modified, version, frames, bpm, levels, meters, onset, beats,
    song_map, loudness_lufs, true_peak_dbtp, bass_peaks, sample_rate, spectrum_version, rhythm_version,
    loudness_version, bass_version, chroma, musical_key, camelot, key_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", arows)
c.execute("COMMIT")
c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
print(f"kuruldu: {N_TRACKS} şarkı, {n_analyses} analiz (levels {blob} bayt), dosya {os.path.getsize(path)/1e6:.1f} MB, {time.time()-t0:.1f} sn")
c.close()

c = sqlite3.connect(path)
c.execute("PRAGMA foreign_keys=ON")
JOIN = """JOIN analyses a ON a.path = t.path
    AND a.file_size = t.file_size AND a.modified = t.modified
    AND a.spectrum_version = ?1 AND a.rhythm_version = ?2"""
FULLY = "a.loudness_version = ?3 AND a.bass_version = ?4 AND a.key_version = ?5"
vers = (V["spectrum"], V["rhythm"], V["loudness"], V["bass"], V["key"])

def timed(name, sql, params=(), repeat=3, plan=True):
    best = None; n = 0
    for _ in range(repeat):
        t = time.perf_counter(); n = len(c.execute(sql, params).fetchall()); d = time.perf_counter() - t
        best = d if best is None else min(best, d)
    print(f"{name:52s} {best*1000:9.1f} ms  ({n} satır)")
    if plan:
        for r in c.execute("EXPLAIN QUERY PLAN " + sql, params):
            print("      plan:", r[3])

def search_sql(words, with_analysis=True):
    if with_analysis:
        sql = f"""SELECT t.id, t.path, COALESCE(t.title, t.file_name), t.artist, t.album,
            t.track_number, t.duration_secs, t.codec, a.bpm, a.path IS NOT NULL AND {FULLY},
            CASE WHEN a.key_version = ?5 THEN a.camelot END FROM tracks t LEFT {JOIN}"""
        params = list(vers)
    else:
        sql = "SELECT t.id, t.path, COALESCE(t.title, t.file_name), t.artist, t.album, t.track_number, t.duration_secs, t.codec, NULL, 0, NULL FROM tracks t"
        params = []
    first = len(params) + 1
    for i, w in enumerate(words):
        sql += (" WHERE " if i == 0 else " AND ") + f"t.search LIKE ?{i + first} ESCAPE '\\'"
        params.append("%" + w.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
    return sql + " ORDER BY t.sort_key LIMIT 50000", params

print("\n--- db.rs sorguları ---")
timed("search('') [bütün liste, analizle]", *search_sql([]))
timed("search('') [analizsiz yedek]", *search_sql([], False), plan=False)
timed("search('sebnem')", *search_sql(["sebnem"]))
timed("search('gece yarisi sebnem')", *search_sql(["gece", "yarisi", "sebnem"]), plan=False)
timed("search('zzz') [sonuçsuz]", *search_sql(["zzz"]), plan=False)
timed("track_count", "SELECT COUNT(*) FROM tracks", plan=False)
timed("analyzed_count (status() her 600 ms/3 sn)", f"SELECT COUNT(*) FROM tracks t {JOIN} WHERE {FULLY}", vers)
timed("known_files(folder)", "SELECT path, file_size, modified, tags_version FROM tracks WHERE folder_id = ?1", (1,))
timed("folders()", "SELECT id, path FROM folders ORDER BY path", plan=False)
print("\n--- cache.rs sorguları ---")
timed("cache.load(path)", """SELECT frames, levels, meters, onset, beats, song_map, loudness_lufs, true_peak_dbtp,
    bass_peaks, sample_rate, rhythm_version, loudness_version, bass_version, chroma, musical_key, key_version
    FROM analyses WHERE path = ?1 AND file_size = ?2 AND modified = ?3 AND spectrum_version = ?4""",
      (rows[100][1], rows[100][13], rows[100][14], V["spectrum"]))
timed("pending_library_tracks(16) [arka plan, her 16 şarkıda]", """SELECT t.path, t.file_size, t.modified FROM tracks t
    LEFT JOIN analyses a ON a.path = t.path AND a.file_size = t.file_size AND a.modified = t.modified
    WHERE a.path IS NULL OR a.spectrum_version != ?1 OR a.rhythm_version != ?2
        OR a.loudness_version != ?3 OR a.bass_version != ?4 OR a.key_version != ?5
    ORDER BY (a.path IS NULL OR a.spectrum_version != ?1 OR a.loudness_version != ?3
              OR a.bass_version != ?4 OR a.key_version != ?5), t.sort_key LIMIT ?6""", vers + (16,))
if len(sys.argv) > 4: c.close(); sys.exit(0)
print("\n--- yazma ---")
t = time.perf_counter(); c.execute("DELETE FROM tracks WHERE id = 7"); c.commit()
print(f"{'tek şarkı silme (tetikleyici: analyses WHERE path=)':52s} {(time.perf_counter()-t)*1000:9.1f} ms")
t = time.perf_counter(); c.execute("DELETE FROM folders WHERE id = 1"); c.commit()
print(f"{'klasörü çıkarma (CASCADE 50k + tetikleyici)':52s} {(time.perf_counter()-t)*1000:9.1f} ms")
print("indeksler:", [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='index'")])
c.close()
