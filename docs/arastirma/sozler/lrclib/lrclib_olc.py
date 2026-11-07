import json, re, sys, time, random, urllib.parse, urllib.request
rows = [json.loads(l) for l in open(sys.argv[1])]
random.seed(7)
sample = random.sample(rows, int(sys.argv[2]))
def clean(name):
    name = re.sub(r"\.[A-Za-z0-9]{2,4}$", "", name)
    name = re.sub(r"^\d+\s*-\s*", "", name)
    name = re.sub(r"[\(\[【][^\)\]】]*[\)\]】]", " ", name)
    name = re.sub(r"\b(official|lyrics?|video|audio|music|hd|hq|4k)\b", " ", name, flags=re.I)
    name = re.sub(r"[_|⧸/]", " ", name)
    return re.sub(r"\s+", " ", name).strip(" -")
out = []
for r in sample:
    q = clean(r["yol"])
    url = "https://lrclib.net/api/search?q=" + urllib.parse.quote(q)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Lyraska-olcum/0.1"})
        res = json.load(urllib.request.urlopen(req, timeout=20))
    except Exception as e:
        res = None
    hit = None
    if res:
        near = [x for x in res if x.get("duration") and abs(x["duration"] - r["sure"]) <= 5]
        near.sort(key=lambda x: (not x.get("syncedLyrics"), abs(x["duration"] - r["sure"])))
        hit = near[0] if near else None
    kind = "hata" if res is None else ("yok" if not hit else ("enstrumantal" if hit.get("instrumental") else ("zamanli" if hit.get("syncedLyrics") else "duz")))
    out.append({"ad": r["yol"], "sorgu": q, "sure": round(r["sure"]), "sonuc": kind,
                "bulunan": hit and f'{hit["artistName"]} - {hit["trackName"]} ({hit["duration"]:.0f})',
                "aday_sayisi": len(res or [])})
    time.sleep(0.4)
json.dump(out, open(sys.argv[3], "w"), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(o["sonuc"] for o in out))
