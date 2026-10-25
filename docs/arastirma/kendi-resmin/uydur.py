# Ölçülen boyları (olc.py) kaydın sesiyle karşılaştırıp modeli seçer.
# Kullanım: python3 uydur.py <ad> <adım>
#   gecikme  : bas zarfı (30–150 Hz) ile soldaki 30 çubuğun ortalama boyunun ilintisiyle ses–görüntü kayması
#   eksen    : doğrusal / logaritmik frekans ekseni, uçlar (f0, f1), kayma araması
#   pencere  : pencere türü ve boyu, çubuk = tek frekans mı aralığın en büyüğü/ortalaması mı
#   olcek    : boy ~ doğrusal genlik mi, karekök mü, dB mi; kesişim (sessizlik boyu)
#   agirlik  : frekansa göre eğim (10 frekans grubunda boy/genlik oranı)
#   zaman    : sönme (tepe tutma ve üstel ortalama) uyumu artırıyor mu
# Skor: çubuk başına ilintinin ortalaması (ölçülebilen karelerin yarısından çoğu olan çubuklar).
import sys
import numpy as np
from scipy.signal import butter, sosfiltfilt
from model import NB, LAG, T0, SR, audio, frames, spec, bar_freqs, predict, score, pooled

v, step = sys.argv[1], sys.argv[2]
E = np.load(v + '-E.npy')
N = NB[v]
pts = frames(v)
lin_axis = lambda: 20 + 1980 / N * np.arange(N)

if step == 'gecikme':
    x = audio(v)
    y = sosfiltfilt(butter(4, [30, 150], 'band', fs=SR, output='sos'), x)
    env = np.sqrt(np.convolve(y ** 2, np.ones(1024) / 1024, 'same'))
    e = np.nanmean(E[:, :30], axis=1)
    res = []
    for lag in np.arange(-1, 1, 0.005):
        idx = ((pts + lag - T0) * SR).astype(int)
        m = (idx > 0) & (idx < len(env)) & np.isfinite(e)
        if m.sum() > 20:
            res.append((np.corrcoef(e[m], env[idx[m]])[0, 1], lag))
    res.sort()
    print(v, 'en iyi kaymalar (r, s):', [(round(r, 3), round(l, 3)) for r, l in res[-5:]])
elif step == 'eksen':
    res = []
    for lag in np.arange(LAG[v] - 0.06, LAG[v] + 0.061, 0.015):
        S, bh = spec(v, 4096, lag, pad=4)
        for kind in ['lin', 'log']:
            f0s = [0, 10, 20, 30, 50] if kind == 'lin' else [20, 30, 40, 60]
            for f0 in f0s:
                for f1 in [500, 800, 1000, 1500, 1800, 1900, 2000, 2100, 2200, 3000, 5000, 10000, 16000]:
                    if f1 <= 2 * max(f0, 1):
                        continue
                    fk = f0 + (f1 - f0) / N * np.arange(N) if kind == 'lin' else bar_freqs(N, f0, f1, 'log')
                    res.append((round(score(E, predict(S, bh, fk))[0], 4), kind, f0, f1, round(lag, 3)))
    res.sort(key=lambda r: -r[0])
    for r in res[:8]:
        print(r)
    print('en iyi logaritmik:', next(r for r in res if r[1] == 'log'))
elif step == 'pencere':
    k = np.arange(N)
    for win in ['hann', 'rect', 'blackman']:
        for L in [2048, 3072, 3969, 4096, 5120, 8192]:
            S, bh = spec(v, L, LAG[v], pad=8, win=win)
            out = [('tek', round(score(E, predict(S, bh, lin_axis()))[0], 3))]
            mid = lin_axis() + 1980 / N / 2
            for agg in ['max', 'mean']:
                out.append((agg, round(score(E, predict(S, bh, mid, agg=agg))[0], 3)))
            print(win, L, out)
elif step == 'olcek':
    S, bh = spec(v, 4096, LAG[v], pad=8)
    A = predict(S, bh, lin_axis())
    m = np.isfinite(E)
    e, a = E[m], A[m]
    print(v, 'havuz ilintisi: doğrusal %.3f karekök %.3f dB %.3f' % (
        pooled(E, A), pooled(E, np.sqrt(A)), pooled(E, 20 * np.log10(A + 1e-6))))
    best = None
    for gm in np.arange(0.3, 2.01, 0.05):
        X = np.vstack([np.ones_like(a), a ** gm]).T
        sol = np.linalg.lstsq(X, e, rcond=None)[0]
        r = np.corrcoef(X @ sol, e)[0, 1]
        if best is None or r > best[0]:
            best = (r, gm, sol)
    print('  en iyi üs %.2f (r=%.3f), boy = %.1f + %.0f · genlik^üs (1220 px, kaydın ffmpeg tek kanal genliği)' % (
        best[1], best[0], *best[2]))
    X = np.vstack([np.ones_like(a), a]).T
    sol = np.linalg.lstsq(X, e, rcond=None)[0]
    print('  doğrusal: boy = %.1f + %.0f · genlik' % tuple(sol))
elif step == 'agirlik':
    S, bh = spec(v, 4096, LAG[v], pad=8)
    A = predict(S, bh, lin_axis())
    fk = lin_axis()
    for g0 in range(0, N, N // 10):
        sl = slice(g0, g0 + N // 10)
        e, a = E[:, sl], A[:, sl]
        m = np.isfinite(e)
        X = np.vstack([np.ones(m.sum()), a[m]]).T
        sol = np.linalg.lstsq(X, e[m], rcond=None)[0]
        print('%4.0f–%4.0f Hz  eğim %5.0f  kesişim %4.1f  r=%.3f' % (
            fk[g0], fk[min(N - 1, g0 + N // 10 - 1)], sol[1], sol[0], np.corrcoef(a[m], e[m])[0, 1]))
elif step == 'zaman':
    def smooth(A, mode, tau):
        if tau == 0:
            return A
        out, prev = np.zeros_like(A), np.zeros(A.shape[1])
        for i in range(len(A)):
            keep = np.exp(-(pts[i] - pts[i - 1] if i else 0.041) / tau)
            prev = np.maximum(A[i], prev * keep) if mode == 'tepe' else A[i] + (prev - A[i]) * keep
            out[i] = prev
        return out
    S, bh = spec(v, 4096, LAG[v], pad=8)
    A = predict(S, bh, lin_axis())
    for mode in ['tepe', 'ortalama']:
        print(mode, [(tau, round(score(E, smooth(A, mode, tau))[0], 4)) for tau in [0, 0.02, 0.04, 0.07, 0.1, 0.15]])
