# Soru 1: ölçülen çubuk boylarının bölge (10 dilim × 20 çubuk) istatistikleri; iki video aynı zaman
# adımıyla (örneğin ~24 kare/sn'si) karşılaştırılsın diye bizimki en yakın karelerle seyreltilir.
# Boylar ekran yüksekliğinin %'si. Kullanım: python3 istatistik.py
import numpy as np
from model import *
DT = np.diff(frames('a')).mean()
def grid(v):
    t = frames(v); Em = E(v)
    if v == 'biz':
        g = np.arange(t[0], t[-1], DT); idx = np.abs(t[None] - g[:, None]).argmin(1)
        return Em[idx], t[idx]
    return Em, t
def table(name, X):
    X = X * 100
    d = np.abs(np.diff(X, axis=0))
    rows = {'ölçülebilen %': [], 'ortalama boy %': [], 'ortanca %': [], '%90 boy': [], 'zaman std %': [],
            '|Δ| ort. %/kare': [], 'hareketli kare % (|Δ|>0,5)': [], 'yukarıda % (>2 %H)': []}
    for s in range(10):
        sl = slice(20 * s, 20 * s + 20)
        x = X[:, sl]; dd = d[:, sl]
        fin = np.isfinite(x); dfin = np.isfinite(dd)
        rows['ölçülebilen %'].append(100 * fin.mean())
        if fin.sum() < 20:
            for k in list(rows)[1:]: rows[k].append(np.nan)
            continue
        rows['ortalama boy %'].append(np.nanmean(x))
        rows['ortanca %'].append(np.nanmedian(x))
        rows['%90 boy'].append(np.nanpercentile(x, 90))
        rows['zaman std %'].append(np.nanmean(np.nanstd(np.where(fin, x, np.nan), axis=0)))
        rows['|Δ| ort. %/kare'].append(np.nanmean(dd))
        rows['hareketli kare % (|Δ|>0,5)'].append(100 * (dd[dfin] > 0.5).mean())
        rows['yukarıda % (>2 %H)'].append(100 * (x[fin] > 2).mean())
    print(f'\n## {name}')
    print(f'{"dilim":28s}' + ''.join(f'{s:>7d}' for s in range(1, 11)))
    print(f'{"Hz":28s}' + ''.join(f'{int(20+198*s):>7d}' for s in range(10)))
    for k, vals in rows.items():
        print(f'{k:28s}' + ''.join('     — ' if not np.isfinite(x) else f'{x:7.1f}' if abs(x) < 100 else f'{x:7.0f}' for x in vals))
if __name__ == '__main__':
    for v, nm in [('biz', 'Lyraska kaydı (ölçülen)'), ('a', 'Örnek a (ölçülen)')]:
        X, _ = grid(v); table(nm, resample_bars(X, 200))
