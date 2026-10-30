# Tam videoda kendi sesiyle model kayması ve ölçeği (spectrum.rs modeli); 0–173 s.
import numpy as np, json
from model import *
Em = E('tam'); t = frames('tam')
sel = np.arange(0, len(t), 3)       # hız için her 3. kare
res = []
for lag in np.arange(-0.3, 0.31, 0.01):
    A = amps('tam', t[sel], lag); res.append((pooled(Em[sel], A), np.nanmean(per_bar_r(Em[sel], A)), lag))
res.sort(key=lambda r: -r[0])
print('en iyi kaymalar (havuz r, çubuk r, s):', [(round(a, 3), round(b, 3), round(c, 2)) for a, b, c in res[:5]])
lag = res[0][2]
fine = sorted((pooled(Em[sel], amps('tam', t[sel], l)), l) for l in np.arange(lag - 0.01, lag + 0.011, 0.0025))
lag = fine[-1][1]
A = amps('tam', t, lag); np.save('veri/tam-A.npy', A)
m = np.isfinite(Em); sol = np.polyfit(A[m], Em[m], 1)
print(f'kayma {lag:.4f} s; havuz r {pooled(Em, A):.3f}; çubuk r {np.nanmean(per_bar_r(Em, A)):.3f}; boy/H = {sol[1]:.4f} + {sol[0]:.3f}·genlik')
np.save('veri/tam-lag.npy', np.array([lag]))
