import sqlite3, re, shutil, os, sys
src=open(sys.argv[1]).read()
v1=re.search(r'const V1: &str = "(.*?)";', src, re.S).group(1)
steps=[re.search(r'const V%d: &str = "(.*?)";'%i, src, re.S).group(1) for i in range(1,8)]
def make(path):
    if os.path.exists(path): os.remove(path)
    c=sqlite3.connect(path)
    for s in steps: c.executescript(s)
    c.execute("PRAGMA user_version=7")
    c.execute("INSERT INTO folders(path) VALUES ('C:/Muzik')")
    for i in range(300):
        c.execute("INSERT INTO tracks(folder_id,path,file_name,codec,sample_rate,channels,file_size,modified,sort_key,search) VALUES (1,?,?,?,?,?,?,?,?,?)",(f"C:/Muzik/{i}.mp3",f"{i}.mp3","mp3",44100,2,1,1,"k","s"))
    c.commit(); c.close()
def seq(path):
    c=sqlite3.connect(path, autocommit=True)
    steps_run=[("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;","init pragma (LibraryError::Database)"),
               ("BEGIN IMMEDIATE","migrate: transaction (Schema)"),
               ("PRAGMA user_version","migrate: user_version (Schema)"),
               (v1,"migrate: V1 (Schema)"),
               ("SELECT name, type FROM pragma_table_info('analyses')","migrate: cache_complete (Schema)"),
               ("COMMIT","migrate: commit (Schema)"),
               ("SELECT count(*) FROM tracks","ilk sorgu (status)"),("PRAGMA integrity_check","integrity")]
    for sql,label in steps_run:
        try:
            stmts=[]; buf=""
            for part in re.split(r'(;)', sql):
                buf+=part
                if sqlite3.complete_statement(buf): stmts.append(buf); buf=""
            if buf.strip(): stmts.append(buf)
            for st in stmts:
                r=c.execute(st).fetchall()
                if label=="integrity" and r!=[("ok",)]: return f"tüm adımlar geçti; integrity_check: {r[:1]}"
        except Exception as e:
            return f"HATA adımı: {label}: {e}"
    return "hata yok"
base="lib.sqlite3"
make(base)
size=os.path.getsize(base); page=4096
print("sayfa sayısı", size//page)
# 1) sqlite_master (sayfa 1, başlık sonrası) bozulursa
for name,off,ln in [("baslik(ilk 100 bayt)",20,40),("sayfa1 btree baslik",100,8),("sayfa1 hucreler(sqlite_master)",page-1500,1500),("sayfa2 tamamen",page,page),("orta sayfa tamamen",8*page,page)]:
    p=f"{name}.sqlite3"; shutil.copy(base,p)
    with open(p,"r+b") as f:
        f.seek(off); f.write(os.urandom(ln))
    print(name, "->", seq(p))
