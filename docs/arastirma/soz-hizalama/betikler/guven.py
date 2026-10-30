"""Güven ölçüsünün işe yarayıp yaramadığı: satırın güveni düşükse hatası büyük mü?
Kullanım: python guven.py <sonuç json> [eşik ...]"""
import json, sys
import numpy as np
r = json.load(open(sys.argv[1]))
ths = [float(t) for t in sys.argv[2:]] or [-0.3, -0.5, -0.8, -1.0, -1.5]
L, E = [], []
for s in r["sarkilar"]:
    for l, e in zip(s["satir_llr"], s["satir_hata"]):
        L.append(l); E.append(e)
L, E = np.array(L), np.array(E)
big = E > 1
print(f"satır {len(E)}, >1 sn hatalı {big.sum()} ({big.mean()*100:.1f}%)")
for th in ths:
    lo = L < th
    print(f"  llr<{th:5.2f}: işaretlenen {lo.mean()*100:5.1f}%  işaretlilerde >1sn {(E[lo]>1).mean()*100 if lo.any() else 0:5.1f}%  "
          f"işaretsizlerde >1sn {(E[~lo]>1).mean()*100:4.1f}%  büyük hataların yakalanan {(big&lo).sum()}/{big.sum()}  "
          f"işaretsizlerde ≤0,3 sn {(E[~lo]<=0.3).mean()*100:5.1f}%")
