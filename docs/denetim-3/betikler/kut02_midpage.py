import sqlite3, os
db="mid.sqlite3"
for s in ["","-wal","-shm"]:
    if os.path.exists(db+s): os.remove(db+s)
c=sqlite3.connect(db, isolation_level=None)
c.execute("PRAGMA journal_mode=WAL")
c.executescript(open('steps.sql').read())
c.execute("PRAGMA user_version=7")
c.execute("BEGIN"); c.execute("INSERT INTO folders(path) VALUES('/m')")
for i in range(3000):
    c.execute("INSERT INTO tracks(folder_id,path,file_name,codec,sample_rate,channels,file_size,modified,sort_key,search) VALUES(1,?,?,'MP3',44100,2,1,1,?,?)",(f"/m/{i}.mp3",f"{i}.mp3",f"k{i:05d}",f"sarki {i}"))
c.execute("COMMIT"); c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
root=c.execute("SELECT rootpage FROM sqlite_master WHERE name='tracks'").fetchone()[0]
psize=c.execute("PRAGMA page_size").fetchone()[0]; npages=c.execute("PRAGMA page_count").fetchone()[0]
c.close()
# tracks ağacının ortasındaki bir yaprak sayfayı boz (sayfa başlığı = çöp)
target = root + 20
with open(db,"r+b") as f:
    f.seek((target-1)*psize); f.write(os.urandom(64))
c=sqlite3.connect(db, isolation_level=None)
# db.rs init + storage::apply'in açılışta dokunduğu şeyler:
c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA foreign_keys=ON")
c.execute("BEGIN IMMEDIATE"); print("user_version", c.execute("PRAGMA user_version").fetchone()[0])
print("analyses sütunları", len(c.execute("SELECT name,type FROM pragma_table_info('analyses')").fetchall())); c.execute("COMMIT")
print("=> Library::open başarılı olurdu (kenara alma tetiklenmez)")
for q in ["SELECT COUNT(*) FROM tracks","SELECT path FROM tracks ORDER BY sort_key LIMIT 50000"]:
    try: print(q[:30], "->", len(c.execute(q).fetchall()))
    except Exception as e: print(q[:30], "-> HATA:", type(e).__name__, e)
print("quick_check:", c.execute("PRAGMA quick_check").fetchone()[0][:60])
