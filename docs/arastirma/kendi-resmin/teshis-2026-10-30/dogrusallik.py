# Ölçülen boyun modele göre doğrusallığı: bölge bölge, model genliği kutularında ölçülen boyun ortancası (px).
# Eğim farkı ölçüm tabanından mı (kısa çubuk, açık zemin) yoksa gerçek ölçek farkından mı?
import sys
import numpy as np
from model import *
v = sys.argv[1]
Em = resample_bars(E(v), 200) * HGT[v]; t = frames(v); lag = float(np.load(f'veri/{v}-lag.npy')[0])
A = amps(v, t, lag)
bins = [0, .002, .005, .01, .02, .04, .08, .16, 1]
print(v, 'genlik kutuları:', bins)
for grp, sl in [('bas 20–416', slice(0, 40)), ('orta 416–1406', slice(40, 140)), ('üst 1406–2000', slice(140, 200))]:
    e, a = Em[:, sl], A[:, sl]; m = np.isfinite(e)
    row = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        mm = m & (a >= lo) & (a < hi)
        row.append(f'{np.median(e[mm]):6.1f}({mm.sum():4d})' if mm.sum() > 10 else '      —     ')
    print(f'  {grp:14s}', ' '.join(row))
