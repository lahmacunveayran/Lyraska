#!/usr/bin/env python3
"""Şemanın her eski sürümünde (1..7) içi dolu bir library.sqlite3 üretir ve
göç ortasında süreç ölmesini (işlem commit edilmeden dosyanın kopyalanması) taklit eder.

Göç SQL'leri doğrudan kaynaktaki storage.rs'ten okunur (elle kopyalanmaz)."""
import os, re, shutil, sqlite3, sys

SRC = "/home/user/denetim-bagimsiz/kaynak/src-tauri/src/storage.rs"
OUT = "/home/user/denetim-bagimsiz/calisma/B-VER/goc"

text = open(SRC, encoding="utf-8").read()
steps = {int(n): sql for n, sql in re.findall(r'const V(\d+): &str = "(.*?)";', text, re.S)}
assert sorted(steps) == list(range(1, 8)), sorted(steps)

TRACKS = [
    ("C:\\Müzik\\Şebnem Ferah\\Kelimeler\\01 Mayın Tarlası.mp3", "Mayın Tarlası", "Şebnem Ferah", "Kelimeler", 1, 245.5, "mp3", 44100),
    ("C:\\Müzik\\Şebnem Ferah\\Kelimeler\\02 Bir Kedi Gördüm.mp3", "Bir Kedi Gördüm", "Şebnem Ferah", "Kelimeler", 2, 201.0, "mp3", 44100),
    ("C:\\Müzik\\Sezen Aksu\\Gülümse\\01 Gülümse.flac", "Gülümse", "Sezen Aksu", "Gülümse", 1, 310.25, "flac", 48000),
    ("C:\\Müzik\\etiketsiz\\IÞIK.mp3", "IÞIK", None, None, None, 100.0, "mp3", 44100),  # eski ID3v1 Latin-1 bozuk harf
    ("C:\\Müzik\\etiketsiz\\adsiz.flac", None, None, None, None, None, "flac", 96000),
]

def build(n, path):
    if os.path.exists(path):
        os.remove(path)
    for s in ("-wal", "-shm"):
        if os.path.exists(path + s):
            os.remove(path + s)
    c = sqlite3.connect(path)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    for i in range(1, n + 1):
        c.executescript(steps[i])
    c.execute("INSERT INTO folders (id, path) VALUES (1, 'C:\\Müzik')")
    cols = "folder_id, path, file_name, title, artist, album, track_number, duration_secs, codec, sample_rate, channels, file_size, modified, sort_key, search"
    for i, (p, t, a, al, no, dur, codec, sr) in enumerate(TRACKS):
        c.execute(
            f"INSERT INTO tracks ({cols}) VALUES (1,?,?,?,?,?,?,?,?,?,2,?,?,?,?)",
            (p, os.path.basename(p), t, a, al, no, dur, codec, sr, 1000 + i, 1700000000 + i, (a or "~") + "\x01" + (t or ""), ((t or "") + " " + (a or "")).lower()),
        )
    # analiz kayıtları: o sürümde var olan sütunlarla
    acols = ["path", "file_size", "modified", "version", "frames", "bpm", "levels", "meters", "onset", "beats", "song_map"]
    if n >= 2:
        acols += ["loudness_lufs", "true_peak_dbtp"]
    if n >= 3:
        acols += ["bass_peaks"]
    if n >= 5:
        acols += ["spectrum_version", "rhythm_version", "loudness_version", "bass_version", "sample_rate"]
    if n >= 7:
        acols += ["chroma", "musical_key", "camelot", "key_version"]
    for i, (p, *_rest) in enumerate(TRACKS[:3]):
        legacy_version = 5 if n < 5 else 6
        vals = {"path": p, "file_size": 1000 + i, "modified": 1700000000 + i, "version": legacy_version,
                "frames": 600 + i, "bpm": 120.0 + i, "levels": b"\x01\x02" * 50, "meters": b"\x03" * 20,
                "onset": b"\x04" * 40, "beats": '{"bpm":120}', "song_map": '{"meter":4}',
                "loudness_lufs": -12.5, "true_peak_dbtp": -0.3, "bass_peaks": '{"x":1}',
                "spectrum_version": 2, "rhythm_version": 4, "loudness_version": 1, "bass_version": 1,
                "sample_rate": 44100, "chroma": b"\x05" * 12, "musical_key": '{"key":null}', "camelot": "8A", "key_version": 1}
        c.execute(f"INSERT INTO analyses ({', '.join(acols)}) VALUES ({', '.join('?' * len(acols))})", [vals[k] for k in acols])
    c.execute(f"PRAGMA user_version = {n}")
    c.commit()
    c.close()


os.makedirs(OUT, exist_ok=True)
for n in range(1, 8):
    build(n, f"{OUT}/v{n}.sqlite3")
    print(f"v{n}.sqlite3 kuruldu")

# --- Göç ortasında ölüm: şema 3 dosyası, 4..7 adımları tek işlemde, commit yok; dosyalar sıcak kopyalanır.
build(3, f"{OUT}/yarim-kaynak.sqlite3")
c = sqlite3.connect(f"{OUT}/yarim-kaynak.sqlite3", isolation_level=None)
c.execute("PRAGMA journal_mode=WAL")
c.execute("PRAGMA cache_size = 1")  # sayfalar commit beklemeden WAL'a dökülsün
c.execute("BEGIN IMMEDIATE")
for i in range(4, 8):
    buf = ""
    for piece in steps[i].split(";"):
        buf += piece + ";"
        if sqlite3.complete_statement(buf) and buf.strip(" ;\n"):
            c.execute(buf); buf = ""  # executescript gizlice COMMIT atar; tek tek yürütülür, işlem açık kalır
c.execute("PRAGMA user_version = 7")
# işlem açıkken süreç ölür: dosyayı ve -wal'ı kopyala (commit kaydı WAL'da yok)
for s in ("", "-wal", "-shm"):
    src = f"{OUT}/yarim-kaynak.sqlite3{s}"
    if os.path.exists(src):
        shutil.copy(src, f"{OUT}/yarim.sqlite3{s}")
wal = os.path.getsize(f"{OUT}/yarim-kaynak.sqlite3-wal")
c.execute("ROLLBACK"); c.close()
for s in ("", "-wal", "-shm"):
    p = f"{OUT}/yarim-kaynak.sqlite3{s}"
    if os.path.exists(p): os.remove(p)
k = sqlite3.connect(f"{OUT}/yarim.sqlite3")
print("yarım göç: WAL boyutu", wal, "bayt; açılınca user_version =", k.execute("PRAGMA user_version").fetchone()[0],
      "; tracks =", k.execute("SELECT COUNT(*) FROM tracks").fetchone()[0],
      "; tags_version sütunu var mı:", any(r[1] == "tags_version" for r in k.execute("PRAGMA table_info(tracks)")))
k.close()
