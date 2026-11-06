"""GTZAN: Lyraska ile Beat This (small0, final0) yan yana Markdown tabloları.
Kullanım: gtzan_tablo.py <lyraska sonuclar.jsonl> <beatthis-small0.jsonl> [<beatthis-final0.jsonl>]"""
import json, sys, statistics, collections

def load(path):
    rows = {}
    for line in open(path, encoding="utf-8"):
        r = json.loads(line)
        if "hata" in r:
            continue
        rows[r["sarki"]] = r
    return rows

systems = [("Lyraska", load(sys.argv[1])), ("Beat This small0", load(sys.argv[2]))]
if len(sys.argv) > 3:
    systems.append(("Beat This final0", load(sys.argv[3])))
# Ortak şarkılar: hepsinin ölçtüğü.
common = set.intersection(*(set(rows) for _, rows in systems))
genres = sorted({systems[0][1][s]["tur"] for s in common})

def tr(x, d=3):
    return "-" if x is None else f"{x:.{d}f}".replace(".", ",")

def mean(xs):
    xs = [x for x in xs if x is not None]
    return statistics.mean(xs) if xs else None

def rate(xs):
    xs = [x for x in xs if x is not None]
    return statistics.mean(1.0 if x else 0.0 for x in xs) if xs else None

def stats(rows, songs):
    rs = [rows[s] for s in songs]
    return {
        "f": mean(r["vurus_f"] for r in rs),
        "fk": mean(r["vurus_f_kirpik"] for r in rs),
        "d": mean(r["olcu_basi_f"] for r in rs),
        # Tempo bulunamayan şarkı ACC'de yanlış sayılır (adil karşılaştırma).
        "a1": rate(bool(r["acc1"]) for r in rs),
        "a2": rate(bool(r["acc2"]) for r in rs),
        "med": statistics.median(r["vurus_f"] for r in rs),
        "sn": mean(r["analiz_sn"] for r in rs),
    }

print(f"Ortak şarkı: {len(common)}\n")
head = "| Tür | Şarkı | " + " | ".join(f"{n} F" for n, _ in systems) + " | " + " | ".join(
    f"{n} ölçü başı" for n, _ in systems) + " |"
print(head)
print("|" + "---|" * (2 + 2 * len(systems)))
for g in genres + ["HEPSİ"]:
    songs = [s for s in common if g == "HEPSİ" or systems[0][1][s]["tur"] == g]
    st = [stats(rows, songs) for _, rows in systems]
    name = f"**{g}**" if g == "HEPSİ" else g
    print(f"| {name} | {len(songs)} | " + " | ".join(tr(x["f"]) for x in st) + " | "
          + " | ".join(tr(x["d"]) for x in st) + " |")

print("\n| Sistem | Vuruş F | 5 sn kırpık | Ortanca F | Ölçü başı F | ACC1 | ACC2 | Şarkı başına sn |")
print("|---|---|---|---|---|---|---|---|")
for n, rows in systems:
    x = stats(rows, common)
    print(f"| {n} | {tr(x['f'])} | {tr(x['fk'])} | {tr(x['med'])} | {tr(x['d'])} | {tr(x['a1'])} | "
          f"{tr(x['a2'])} | {tr(x['sn'], 2)} |")

def cls(r):
    e, t = r.get("bpm"), r.get("gercek_bpm")
    if not e or not t:
        return "yok"
    q = e / t
    for name, f in [("doğru", 1), ("yarı", .5), ("iki kat", 2), ("3/2", 1.5), ("2/3", 2 / 3),
                    ("üç kat", 3), ("üçte bir", 1 / 3)]:
        if abs(q - f) <= 0.04 * f:
            return name
    return "diğer"

keys = ["doğru", "yarı", "iki kat", "3/2", "2/3", "üç kat", "üçte bir", "diğer", "yok"]
print("\n| Sistem | " + " | ".join(keys) + " |")
print("|---|" + "---|" * len(keys))
for n, rows in systems:
    c = collections.Counter(cls(rows[s]) for s in common)
    print(f"| {n} | " + " | ".join(str(c[k]) for k in keys) + " |")

# Şarkı şarkı: Lyraska'dan belirgin (≥ 0,1) iyi / kötü.
base = systems[0][1]
for n, rows in systems[1:]:
    better = sum(1 for s in common if rows[s]["vurus_f"] >= base[s]["vurus_f"] + 0.1)
    worse = sum(1 for s in common if rows[s]["vurus_f"] <= base[s]["vurus_f"] - 0.1)
    both_ok = sum(1 for s in common if cls(base[s]) == "doğru" and cls(rows[s]) == "doğru")
    print(f"\n{n}: Lyraska'dan ≥ 0,1 iyi {better}, ≥ 0,1 kötü {worse}; ikisinin de temposu doğru {both_ok}")
    # Tempo doğruyken vuruş F (oktav dışı kalite).
    ok = [s for s in common if cls(base[s]) == "doğru" and cls(rows[s]) == "doğru"]
    if ok:
        print(f"  tempo ikisinde de doğruyken vuruş F: Lyraska {tr(mean(base[s]['vurus_f'] for s in ok))}, "
              f"{n} {tr(mean(rows[s]['vurus_f'] for s in ok))}")
