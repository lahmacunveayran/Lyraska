"""Şarkı düzeyinde güven: model sözlerin ne kadarını "duyuyor"?
oran = serbest (açgözlü) çözümde çıkan harf sayısı / sözlerdeki harf sayısı. Düşükse hizalama körlemesine olur.
Kullanım: python duyulan.py <veri> <bölüm> [kaynak=karisim]"""
import json, sys
import numpy as np
import ctc, ortak
from ortak import CACHE
data, split = sys.argv[1], sys.argv[2]
src = sys.argv[3] if len(sys.argv) > 3 else "karisim"
r = json.load(open(CACHE / "sonuc" / f"{data}_{split}_ctc-{src}.json"))
songs = {s.sid: s for s in ortak.dataset(data, split)}
rows = []
for x in r["sarkilar"]:
    s = songs[x["sid"]]
    z = np.load(CACHE / "em" / f"omni300v2_{src}_{s.sid}.npz")
    ids = z["lp"].astype(np.float32).argmax(1)
    heard = int(((ids != 0) & (np.concatenate([[True], ids[1:] != ids[:-1]]))).sum())
    n = sum(len(ctc.lower(w, s.lang)) for l in s.lines for w in l)
    rows.append((heard / max(n, 1), x["satir_ort"], s.sid))
for o, e, sid in sorted(rows):
    print(f"{o:5.2f}  satır ort {e:6.2f}  {sid[:40]}")
