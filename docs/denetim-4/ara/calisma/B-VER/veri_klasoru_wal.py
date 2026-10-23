#!/usr/bin/env python3
"""data_dirs::big_data_dir taşıması sırasında çökme benzetimi.

Lyraska WAL modunda çalışır ve Tauri `app.run` süreci `std::process::exit` ile kapatır: SQLite
bağlantıları kapanmaz, `-wal` dosyası diskte kalır (içinde denetim noktasına alınmamış, commit
edilmiş veri). big_data_dir önce library.sqlite3'ü, sonra -wal'ı taşır. İkisinin arasında süreç
ölürse: bir sonraki açılışta local/library.sqlite3 var → fonksiyon hiçbir şey taşımaz; roaming'deki
-wal yetim kalır. Bu betik kaybın büyüklüğünü ölçer."""
import os, shutil, sqlite3, tempfile

base = tempfile.mkdtemp(prefix="bver-wal-")
roaming, local = os.path.join(base, "Roaming"), os.path.join(base, "Local")
os.makedirs(roaming); os.makedirs(local)
db = os.path.join(roaming, "library.sqlite3")

c = sqlite3.connect(db, isolation_level=None)
c.execute("PRAGMA journal_mode=WAL")
c.execute("PRAGMA synchronous=NORMAL")
c.execute("CREATE TABLE folders (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE)")
c.execute("CREATE TABLE tracks (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT)")
c.execute("INSERT INTO folders (path) VALUES ('D:\\Müzik')")
c.execute("PRAGMA wal_checkpoint(TRUNCATE)")  # bu nokta ana dosyaya işlenmiş
# Kullanıcının son oturumu: 300 şarkı eklendi (her biri ayrı commit; otomatik denetim noktası
# 1000 sayfa dolmadan gelmez), sonra program std::process::exit ile kapandı.
for i in range(300):
    c.execute("INSERT INTO tracks (path, title) VALUES (?, ?)", (f"D:\\Müzik\\{i:04}.mp3", f"Şarkı {i}"))
main_before = os.path.getsize(db); wal_before = os.path.getsize(db + "-wal")
# süreç kapandı (bağlantı kapatılmadan): dosyaları olduğu gibi kopyalayarak taklit
snap = os.path.join(base, "snap"); os.makedirs(snap)
snap2 = os.path.join(base, "snap2"); os.makedirs(snap2)  # ikinci kopya: ilk açılış denetim noktası alır, dosyayı değiştirir
for s in ("", "-wal", "-shm"):
    shutil.copy(db + s, os.path.join(snap, "library.sqlite3" + s))
    shutil.copy(db + s, os.path.join(snap2, "library.sqlite3" + s))
c.close()
# Olağan açılış (WAL ile birlikte): hiçbir şey kaybolmaz
k = sqlite3.connect(os.path.join(snap, "library.sqlite3"))
print("ana dosya", main_before, "bayt, -wal", wal_before, "bayt; -wal ile açılınca tracks =",
      k.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]); k.close()

# big_data_dir: library.sqlite3 taşındı, -wal taşınmadan süreç öldü
os.replace(os.path.join(snap2, "library.sqlite3"), os.path.join(local, "library.sqlite3"))
# sonraki açılış: local/library.sqlite3 var → big_data_dir local döner, roaming'deki -wal yetim
k = sqlite3.connect(os.path.join(local, "library.sqlite3"))
print("yalnız ana dosya taşınınca tracks =", k.execute("SELECT COUNT(*) FROM tracks").fetchone()[0],
      "(kayıp:", 300 - k.execute("SELECT COUNT(*) FROM tracks").fetchone()[0], "şarkı); bütünlük:",
      k.execute("PRAGMA integrity_check").fetchone()[0])
k.close()
shutil.rmtree(base)
