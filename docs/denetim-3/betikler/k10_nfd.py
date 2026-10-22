import unicodedata, sqlite3
FOLD = {}
for chars, t in [("IıİiÍíÌìÎîÏï","i"),("ŞşŚśŠš","s"),("ÇçĆćČč","c"),("Ğğ","g"),("ÖöÓóÒòÔôÕõØø","o"),
                 ("ÜüÚúÙùÛû","u"),("ÁáÀàÂâÄäÃãÅå","a"),("ÉéÈèÊêËë","e"),("Ññ","n"),("ÝýŸÿ","y"),("Žž","z")]:
    for ch in chars: FOLD[ch] = t
def search_key(s):  # library/mod.rs:69-96
    return "".join(FOLD.get(ch, ch.lower()) for ch in s)
nfc = "Şebnem Ferah - Çocukluğum"
nfd = unicodedata.normalize("NFD", nfc)
print("NFC key:", repr(search_key(nfc)))
print("NFD key:", repr(search_key(nfd)))
c = sqlite3.connect(":memory:")
c.execute("CREATE TABLE t(search TEXT)")
c.execute("INSERT INTO t VALUES (?)", (search_key(nfd),))
for q in ["sebnem", "Şebnem", "cocuklugum"]:
    pat = "%" + search_key(q) + "%"
    print(q, "->", c.execute("SELECT COUNT(*) FROM t WHERE search LIKE ? ESCAPE '\\'", (pat,)).fetchone()[0])
# LIKE kaçışı denemesi (db.rs escape_like)
def esc(w): return w.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")
c.execute("DELETE FROM t"); c.executemany("INSERT INTO t VALUES (?)", [("100% hit",),("100x hit",),("a_b",),("axb",),("c\\d",)])
for q in ["100%", "a_b", "c\\d"]:
    print("kaçış", q, "->", [r[0] for r in c.execute("SELECT search FROM t WHERE search LIKE ? ESCAPE '\\'", ("%"+esc(q)+"%",))])
