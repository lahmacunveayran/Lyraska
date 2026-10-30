# Soru 2 (son kısım): aday modeller, iki videoda ölçülen boylara karşı. Skorlar: havuz ilintisi (bütün
# çubuk×kare; çubuklar arası ölçeği de sınar), çubuk-başı ortalama ilinti (yalnız zaman biçimi), ve
# Spearman havuz (sıra; eğri biçiminden bağımsız). Her aday kendi en iyi kesişim+eğimiyle doğrusal uydurulur.
import numpy as np
from scipy.stats import spearmanr
from model import *
def logaxis(n=BARS): return 20 * (2000 / 20) ** (np.arange(n) / (n - 1))
def cands(v, t, lag):
    A = amps(v, t, lag)
    out = {'doğrusal (uygulama)': A}
    for gm in [0.5, 0.7, 1.3]: out[f'güç {gm}'] = A ** gm
    out['dB (−60 taban)'] = np.maximum(20 * np.log10(A + 1e-9), -60)
    out['sıkıştırma A/(A+0,02)'] = A / (A + 0.02)
    m = A.mean(0, keepdims=True)
    out['bant normalize A/ort^0,5'] = A / np.sqrt(m + 1e-6)
    out['bant normalize A/ort'] = A / (m + 1e-6)
    out['pencere 2048'] = amps(v, t, lag, L=2048)
    out['pencere 8192'] = amps(v, t, lag, L=8192)
    out['log eksen 20–2000'] = amps(v, t, lag, hz=logaxis())
    out['doğrusal 20–4000'] = amps(v, t, lag, hz=20 + 3980 * np.arange(BARS) / BARS)
    return out
for v in ['a', 'biz']:
    Em = resample_bars(E(v), 200); t = frames(v); lag = float(np.load(f'veri/{v}-lag.npy')[0])
    m = np.isfinite(Em)
    print(f'\n{v}:{"":30s}{"havuz r":>9s}{"çubuk r":>9s}{"Spearman":>10s}')
    for k, X in cands(v, t, lag).items():
        rs = spearmanr(Em[m], X[m])[0]
        print(f'  {k:32s}{pooled(Em, X):9.3f}{np.nanmean(per_bar_r(Em, X)):9.3f}{rs:10.3f}')
