# Kaydın sesi ile uygulamanın gördüğü ses arasındaki farkı basamak (raf) süzgeciyle uydurur: f ≥ fc'de
# genlik k ile çarpılır (fc 300–900 Hz, k 0,3–2). Havuz ilintisini en çok artıran (fc, k): kayıtta
# duyulan ses ile çubukların beslendiği ses arasındaki ses rengi farkı. Örnek a kontrol (k ≈ 1 beklenir).
import numpy as np
from model import *
for v in ['biz', 'a']:
    Em = resample_bars(E(v), 200); t = frames(v); lag = float(np.load(f'veri/{v}-lag.npy')[0])
    A = amps(v, t, lag); hz = bar_hz(); m = np.isfinite(Em)
    base = pooled(Em, A); best = (base, None, 1.0)
    for fc in range(300, 901, 50):
        for k in np.arange(0.3, 2.01, 0.05):
            X = A * np.where(hz >= fc, k, 1.0)[None]
            r = pooled(Em, X)
            if r > best[0]: best = (r, fc, k)
    r, fc, k = best
    print(f'{v}: doğrusal model havuz r {base:.3f} → basamak fc={fc} Hz, k={k:.2f} ({20*np.log10(k):+.1f} dB): r {r:.3f}')
