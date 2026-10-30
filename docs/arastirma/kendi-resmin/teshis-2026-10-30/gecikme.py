# Ses–görüntü kayması ve ölçek: doğrusal genlik modeliyle (spectrum.rs) kaymayı tarar, en iyi
# kaymada ölçülen boy = a + b · genlik eğimini ve buradan uygulamanın kullandığı kazancı bulur.
# Kullanım: python3 gecikme.py <ad>
import sys
import numpy as np
from model import *
v = sys.argv[1]
Em = E(v); t = frames(v)
res = []
for lag in np.arange(-0.6, 0.6, 0.01):
    A = amps(v, t, lag)
    m = np.isfinite(Em) & (np.arange(BARS)[None] < 200)
    res.append((pooled(Em, A), np.nanmean(per_bar_r(Em, A)), lag))
res.sort(key=lambda r: -r[0])
print(v, 'en iyi kaymalar (havuz r, çubuk başı r, s):', [(round(a, 3), round(b, 3), round(c, 2)) for a, b, c in res[:6]])
lag = res[0][2]
# ince tarama
fine = []
for l2 in np.arange(lag - 0.015, lag + 0.016, 0.0025):
    A = amps(v, t, l2); fine.append((pooled(Em, A), l2))
fine.sort(); lag = fine[-1][1]
A = amps(v, t, lag)
m = np.isfinite(Em) & (A * 0 == 0)
sol = np.polyfit(A[m], Em[m], 1)
print(f'  ince kayma {lag:.4f} s, havuz r={fine[-1][0]:.3f}; boy/yükseklik = {sol[1]:.4f} + {sol[0]:.3f}·genlik')
# uygulamanın modeli: boy = REST + genlik·g/FULL·(CAP−REST) → g = eğim·FULL/(CAP−REST)
print(f'  eşdeğer kazanç g = {sol[0] * FULL / (CAP - REST):.3f} ({20*np.log10(sol[0] * FULL / (CAP - REST)):.1f} dB); kesişim {sol[1]*HGT[v]:.1f} px')
np.save(f'veri/{v}-lag.npy', np.array([lag]))
