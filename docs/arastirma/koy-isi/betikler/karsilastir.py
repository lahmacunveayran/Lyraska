import json, os, sys, collections
sys.stdout.reconfigure(encoding="utf-8")
K = r"D:\LyraskaVeri\koy-isi"
def load(d):
    out = {}
    for l in open(os.path.join(K, d, "sonuclar.jsonl"), encoding="utf-8"):
        r = json.loads(l); out[os.path.basename(r["yol"])] = r
    return out
old, new = load("sonuc"), load("sonuc-tempo")
labs = {x["name"]: x["lab"] for x in json.load(open(os.path.join(K, "tempo-etiketli.json"), encoding="utf-8"))}
print(f"eski {len(old)}, yeni {len(new)}")
changed = []
for n, r in new.items():
    a, b = (old.get(n) or {}).get("bpm"), r.get("bpm")
    if a != b:
        changed.append((n, a, b, labs.get(n, "-")))
kinds = collections.Counter()
for n, a, b, lab in sorted(changed, key=lambda x: (x[2] or 0) / (x[1] or 1)):
    q = (b or 0) / (a or 1)
    k = "2x" if abs(q - 2) < 0.05 else ("küçük" if abs(q - 1) < 0.03 else "başka")
    kinds[k] += 1
    print(f"{k:6} {a} → {b}  etiket {lab}  {n[:80]}")
print(kinds)
# Çiftler hâlâ tutarlı mı
groups = collections.defaultdict(list)
for n, r in new.items(): groups[os.path.splitext(n)[0]].append(r.get("bpm"))
bad = [(g, v) for g, v in groups.items() if len(v) == 2 and v[0] and v[1] and abs(v[0] / v[1] - 1) > 0.02]
print("tutarsız çift:", len(bad)); [print("  ", v, g[:70]) for g, v in bad]
