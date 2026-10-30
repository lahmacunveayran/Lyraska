# Sahibinin Lyraska kaydındaki çubuklar, videonun ORİJİNAL sesiyle (uygulamanın gerçekten okuduğu dosyaya en
# yakın ses) açıklanıyor mu? Kayma, eğim (beklenen: 1,567 × −14 LUFS kazancı), bölge oranları.
import json
import numpy as np
from model import *
off = json.load(open('veri/biz-hiza.json'))['offset']
Em = E('biz'); t = frames('biz')
res = []
for lag in np.arange(-0.2, 0.2, 0.005):
    A = amps('tam', t + off, lag); res.append((pooled(Em, A), lag))
res.sort(); r0, lag = res[-1]
A = amps('tam', t + off, lag); m = np.isfinite(Em)
sol = np.polyfit(A[m], Em[m], 1)
g_app = 10 ** ((-14 - (-4.53)) / 20)
print(f'kayma {lag:.3f} s; havuz r {r0:.3f} (kaydın kendi sesiyle 0,895); çubuk r {np.nanmean(per_bar_r(Em, A)):.3f}')
print(f'eğim {sol[0]:.3f}/genlik, beklenen (uygulama, −14 LUFS kazancı {g_app:.3f}) {1.567*g_app:.3f}; kesişim {sol[1]*991:.1f} px')
json.dump({'lag': lag, 'slope': sol[0], 'icpt': sol[1]}, open('veri/biz-tam.json', 'w'))
# bölge oranları (std oranı, ölçülen / uygulama modeli)
P = step_bars(levels(A, g_app), t); P = extents(P)
print('bölge (10 çubuk) ölçülen/model std oranı:')
row = []
for s in range(20):
    sl = slice(10 * s, 10 * s + 10); e, p = Em[:, sl], P[:, sl]; mm = np.isfinite(e)
    ss = [np.std(e[mm[:, k], k]) / np.std(p[mm[:, k], k]) for k in range(10) if mm[:, k].sum() > 20]
    row.append(f'{int(20+99*s)}:{np.median(ss):.2f}' if ss else f'{int(20+99*s)}:—')
print('  ' + '  '.join(row))
