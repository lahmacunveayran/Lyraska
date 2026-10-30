# Uygulama hangi sinyali "görüyor"? Kaydın kanallarından X_c = M + c·S (M=(L+R)/2, S=(L−R)/2; c=0 uygulamanın
# karışımı, c=±1 tek kanal) ve güç ortalaması için, ölçülen çubuklarla çubuk-başı ilinti ve bölge eğimi.
# Doğrusal bir ses süzgeci (ekolayzer) yalnızca eğimi değiştirir, ilintiyi değiştirmez; stereo işleme
# (sanal çevre ses vb.) en iyi c'yi 0'dan uzaklaştırır.
import numpy as np
from model import *
v = 'biz'
Em = E(v); t = frames(v); lag = float(np.load(f'veri/{v}-lag.npy')[0])
st = audio(v, True); M = (st[:, 0] + st[:, 1]) / 2; S = (st[:, 0] - st[:, 1]) / 2
cen = (t + lag) * SR; hz = bar_hz()
def bars(x):
    Sp, bh = spectra(x, cen); return np.stack([np.interp(hz / bh, np.arange(Sp.shape[1]), s) for s in Sp])
BM, BS = None, None
groups = [('20–416', slice(0, 40)), ('416–1010', slice(40, 100)), ('1010–2000', slice(100, 200))]
print(f'{"karışım":>22s}', ''.join(f'{g:>22s}' for g, _ in groups), '   (çubuk-başı r / eğim)')
for c in [-1, -0.6, -0.3, 0, 0.3, 0.6, 1]:
    A = step_bars(levels(bars(M + c * S), 1.0), t)
    r = per_bar_r(Em, A)
    cells = []
    for _, sl in groups:
        e, a = Em[:, sl], A[:, sl]; m = np.isfinite(e)
        cells.append(f'{np.nanmean(r[sl]):6.3f} / {np.polyfit(a[m], e[m], 1)[0]:6.3f}')
    print(f'{"M + %.1f·S" % c:>22s}', ''.join(f'{x:>22s}' for x in cells))
L, R = st[:, 0], st[:, 1]
Sp1, bh = spectra(L, cen); Sp2, _ = spectra(R, cen)
P = np.sqrt((Sp1 ** 2 + Sp2 ** 2) / 2); P = np.stack([np.interp(hz / bh, np.arange(P.shape[1]), s) for s in P])
A = step_bars(levels(P, 1.0), t); r = per_bar_r(Em, A)
cells = []
for _, sl in groups:
    e, a = Em[:, sl], A[:, sl]; m = np.isfinite(e)
    cells.append(f'{np.nanmean(r[sl]):6.3f} / {np.polyfit(a[m], e[m], 1)[0]:6.3f}')
print(f'{"güç ort.":>22s}', ''.join(f'{x:>22s}' for x in cells))
