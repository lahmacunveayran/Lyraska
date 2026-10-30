# Soru 2: model (spectrum.rs, kaydın kendi sesiyle) her bölgede ölçülen boyları ne kadar açıklıyor:
# bölge başına çubuk-başı ilinti, havuz ilintisi, eğim (ölçülen boy / genlik) ve kesişim.
# Eğim düz değilse kayıttaki çizici bölgeye göre farklı ölçek görmüş demektir.
import sys
import numpy as np
from model import *
for v in ['biz', 'a']:
    Em = resample_bars(E(v), 200) if E(v).shape[1] != 200 else E(v)
    t = frames(v); lag = float(np.load(f'veri/{v}-lag.npy')[0])
    A = amps(v, t, lag)
    r = per_bar_r(Em, A)
    print(f'\n{v}: kayma {lag:.3f} s; havuz r {pooled(Em, A):.3f}; çubuk-başı ort. r {np.nanmean(r):.3f}')
    print(f'{"dilim (Hz)":>12s} {"çubuk r":>8s} {"havuz r":>8s} {"eğim":>7s} {"kesişim %":>9s} {"n":>6s}')
    for s in range(10):
        sl = slice(20 * s, 20 * s + 20)
        e, a = Em[:, sl], A[:, sl]; m = np.isfinite(e)
        if m.sum() < 50: print(f'{int(20+198*s):>12d}   —'); continue
        sol = np.polyfit(a[m], e[m], 1)
        print(f'{int(20+198*s):>12d} {np.nanmean(r[sl]):8.3f} {np.corrcoef(a[m], e[m])[0,1]:8.3f} {sol[0]:7.3f} {100*sol[1]:9.2f} {m.sum():6d}')
