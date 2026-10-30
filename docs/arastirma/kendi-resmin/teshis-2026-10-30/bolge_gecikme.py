# Bölge başına en iyi kayma (s) ve sönmenin (stepBars, τ=20 ms) uyuma etkisi (Lyraska kaydı, 60 kare/sn).
import numpy as np
from model import *
for v in ['biz', 'a']:
    Em = resample_bars(E(v), 200); t = frames(v); lag0 = float(np.load(f'veri/{v}-lag.npy')[0])
    groups = [('20–416', slice(0, 40)), ('416–1010', slice(40, 100)), ('1010–2000', slice(100, 200))]
    best = {g: (-1, 0) for g, _ in groups}
    for lag in np.arange(lag0 - 0.06, lag0 + 0.061, 0.005):
        A = amps(v, t, lag); r = per_bar_r(Em, A)
        for g, sl in groups:
            x = np.nanmean(r[sl])
            if x > best[g][0]: best[g] = (x, lag)
    print(v, 'bölge en iyi kayma:', {g: (round(a, 3), round(b, 3)) for g, (a, b) in best.items()})
    A = amps(v, t, lag0)
    for tau in [0, 0.02, 0.05]:
        lv = levels(A, 1.0)
        if tau:
            import model; model.RELEASE_TAU = tau; lv = step_bars(lv, t)
        print(f'   sönme {tau*1000:.0f} ms: çubuk-başı r {np.nanmean(per_bar_r(Em, lv)):.3f}')
    import model; model.RELEASE_TAU = 0.02
