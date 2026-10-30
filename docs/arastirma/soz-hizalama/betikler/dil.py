"""Sonuç dosyasında dil başına kelime ve satır özeti. Kullanım: python dil.py <sonuç.json>"""
import json, sys
import numpy as np
r = json.load(open(sys.argv[1]))
by = {}
for s in r["sarkilar"]:
    d = by.setdefault(s["dil"], {"w": [], "l": [], "n": 0, "kotu": []})
    d["w"] += s["kelime_hata"] or []; d["l"] += s["satir_hata"]; d["n"] += 1
    if s["satir_ort"] > 1: d["kotu"].append((s["sid"][:30], round(s["satir_ort"], 2)))
print("| Dil | Şarkı | Kelime ≤0,3 sn % | Kelime ortanca | Satır ≤0,3 sn % | Satır ort. | Satır ort. > 1 sn olan şarkılar |")
print("|---|---|---|---|---|---|---|")
for k, d in sorted(by.items()):
    w, l = np.array(d["w"]), np.array(d["l"])
    ws = f"{(w<=0.3).mean()*100:.1f}" if len(w) else "—"
    wm = f"{np.median(w):.3f}" if len(w) else "—"
    print(f"| {k} | {d['n']} | {ws} | {wm} | {(l<=0.3).mean()*100:.1f} | {l.mean():.2f} | {', '.join(f'{a} ({b})' for a,b in d['kotu']) or '—'} |".replace(".", ","))
