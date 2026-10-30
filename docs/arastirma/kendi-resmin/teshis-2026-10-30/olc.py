# Her karede her çubuğun çizgiden aşağı boyunu ölçer (docs/arastirma/kendi-resmin/olc.py'nin uyarlaması:
# çizgi satırı ve çubuk sayısı/aralığı parametre; çubuk yerleri biliniyorsa doğrudan verilir).
# Kullanım: python3 olc.py <ad> <TOP> [N]   (N verilirse ortalar k·W/(N−1), ilk sol kenarda)
#   → veri/<ad>-E.npy (kare × çubuk, piksel; ölçülemeyen NaN), veri/<ad>-ok.npy (çubuk × satır ölçülebilir mi)
import sys
import numpy as np
v = sys.argv[1]; TOP = int(sys.argv[2])
a = np.load('veri/' + v + '-crop.npy', mmap_mode='r')
F, H, W, _ = a.shape
if len(sys.argv) > 3:
    N = int(sys.argv[3]); x0 = 0.0; p = W / (N - 1)
else:
    band = np.array(a[:, TOP + 2:TOP + 9]).astype(float)
    g = band.min(axis=3).mean(axis=(0, 1))
    x = g - np.convolve(g, np.ones(31) / 31, 'same')
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), len(x) * 8))
    k = np.argmax(spec[100:]) + 100
    p = len(x) * 8 / k
    peaks = np.array([i for i in range(2, len(x) - 2) if x[i] == x[i - 2:i + 3].max() and x[i] > 5])
    for _ in range(3):
        idx = np.round((peaks - peaks[0]) / p)
        A = np.vstack([np.ones_like(idx), idx]).T
        sol = np.linalg.lstsq(A, peaks, rcond=None)[0]
        r = peaks - A @ sol
        peaks, p = peaks[abs(r) < 2], sol[1]
    x0 = sol[0] - np.floor(sol[0] / sol[1]) * sol[1]
    N = int(round((W - x0) / p)) + 1
    print(f'{v}: çubuk aralığı {p:.4f} px, ilk çubuk x={x0:.2f}, {N} çubuk (W/(N−1) = {W / (N - 1):.4f})')
    p = W / (N - 1)
xs = [min(W - 1, int(round(x0 + k * p))) for k in range(N)]
S = np.zeros((F, H, N), np.float32)
M = np.zeros((F, H, N), np.float32)
for k, xc in enumerate(xs):
    S[:, :, k] = np.array(a[:, :, max(0, xc - 1):min(W, xc + 2)]).min(axis=3).max(axis=2)
    xm = [min(W - 1, max(0, int(round(x0 + (k + d) * p)))) for d in (-0.5, 0.5)]
    M[:, :, k] = np.array(a[:, :, xm]).min(axis=3).mean(axis=2)
CORE = np.percentile(S[:, TOP + 2:TOP + 5, :], 50)
bg = np.minimum(np.percentile(S, 10, axis=0), np.percentile(M, 10, axis=0))
ok = (CORE - bg) > 70
on = (S - bg[None]) > 0.5 * (CORE - bg[None])
E = np.full((F, N), np.nan, np.float32)
for f in range(F):
    for k in range(N):
        y = TOP + 3
        while y < H and on[f, y, k] and ok[y, k]:
            y += 1
        if y >= H - 1 or not ok[y, k]:
            continue
        lev = (S[f, y, k] - bg[y, k]) / (CORE - bg[y, k])
        E[f, k] = (y - TOP) + max(0, min(1, lev))
np.save('veri/' + v + '-E.npy', E)
np.save('veri/' + v + '-ok.npy', ok.T)
print(f'  CORE={CORE:.0f}; ölçülebilen %{100 * np.isfinite(E).mean():.0f}; boy yüzdelikleri:',
      np.nanpercentile(E, [5, 50, 95, 99]).round(1))
fin = np.isfinite(E).mean(axis=0)
print('  10 dilimde ölçülebilen %:', ' '.join(f'{100*fin[i*N//10:(i+1)*N//10].mean():.0f}' for i in range(10)))
