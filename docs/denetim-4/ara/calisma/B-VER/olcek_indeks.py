import sqlite3, time, os, sys
path = sys.argv[1]
def drop_caches():
    try:
        open("/proc/sys/vm/drop_caches", "w").write("3\n"); return True
    except Exception as e:
        return False
JOIN = """JOIN analyses a ON a.path = t.path AND a.file_size = t.file_size AND a.modified = t.modified
    AND a.spectrum_version = ?1 AND a.rhythm_version = ?2"""
FULLY = "a.loudness_version = ?3 AND a.bass_version = ?4 AND a.key_version = ?5"
vers = (2, 4, 1, 1, 1)
def run(label):
    cold = drop_caches()
    c = sqlite3.connect(path)
    t = time.perf_counter(); n = c.execute(f"SELECT COUNT(*) FROM tracks t {JOIN} WHERE {FULLY}", vers).fetchone()[0]; d1 = time.perf_counter() - t
    t = time.perf_counter(); c.execute(f"SELECT COUNT(*) FROM tracks t {JOIN} WHERE {FULLY}", vers).fetchone(); d2 = time.perf_counter() - t
    plan = [r[3] for r in c.execute(f"EXPLAIN QUERY PLAN SELECT COUNT(*) FROM tracks t {JOIN} WHERE {FULLY}", vers)]
    print(f"{label}: analyzed_count={n} soğuk(önbellek boşaltıldı={cold}) {d1*1000:.0f} ms, sıcak {d2*1000:.0f} ms; plan {plan}")
    c.close()
run("mevcut şema (indeks yok)")
c = sqlite3.connect(path)
t = time.perf_counter()
c.execute("CREATE INDEX analyses_stamp ON analyses(path, file_size, modified, spectrum_version, rhythm_version, loudness_version, bass_version, key_version)")
c.commit(); print(f"kapsayan indeks kuruldu: {time.perf_counter()-t:.1f} sn"); c.close()
run("kapsayan indeksle")
c = sqlite3.connect(path); c.execute("DROP INDEX analyses_stamp"); c.commit(); c.close()
