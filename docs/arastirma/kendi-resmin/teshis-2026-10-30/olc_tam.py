# olc.py'nin tam video sürümü: en küçük bileşen dizisinden (tam_cikar.py), vektörel. Çubuk aralığını Fourier'le
# bulur (sayıyı denetlemek için), sonra N çubuk k·W/(N−1) yerinde ölçer.
# Kullanım: python3 olc_tam.py <ad> <TOP> [N]  → veri/<ad>-E.npy (kare × çubuk, px; NaN ölçülemeyen)
import sys
import numpy as np
v = sys.argv[1]; TOP = int(sys.argv[2])
a = np.load(f'veri/{v}-min.npy', mmap_mode='r')
F, H, W = a.shape
g = np.array(a[::10, TOP + 2:TOP + 5]).astype(float).mean(axis=(0, 1))
x = g - np.convolve(g, np.ones(15) / 15, 'same')
spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), len(x) * 8))
k = np.argmax(spec[200:]) + 200
print(f'{v}: Fourier aralığı {len(x) * 8 / k:.4f} px → {W / (len(x) * 8 / k) + 1:.1f} çubuk')
N = int(sys.argv[3]) if len(sys.argv) > 3 else int(round(W / (len(x) * 8 / k))) + 1
import os
p = (W if os.environ.get("PITCH_W") else W - 1) / (N - 1)
xs = [min(W - 1, int(round(k * p))) for k in range(N)]
S = np.zeros((F, H, N), np.uint8); M = np.zeros((F, H, N), np.uint8)
for k, xc in enumerate(xs):
    S[:, :, k] = np.array(a[:, :, max(0, xc - 1):min(W, xc + 2)]).max(axis=2)
    xm = [min(W - 1, max(0, int(round((k + d) * p)))) for d in (-0.5, 0.5)]
    M[:, :, k] = np.array(a[:, :, xm]).astype(np.uint16).mean(axis=2).astype(np.uint8)
CORE = np.percentile(S[::10, TOP + 1:TOP + 3, :], 50)
bg = np.minimum(np.percentile(S[::5], 10, axis=0), np.percentile(M[::5], 10, axis=0)).astype(np.float32)
ok = (CORE - bg) > 70
E = np.full((F, N), np.nan, np.float32)
y0 = TOP + 2
for f0 in range(0, F, 500):
    Sf = S[f0:f0 + 500].astype(np.float32)
    on = ((Sf - bg[None]) > 0.5 * (CORE - bg[None])) & ok[None]
    stop = ~on[:, y0:, :]                         # ilk "değil" satırı
    has = stop.any(axis=1)
    yy = np.argmax(stop, axis=1) + y0             # (kare, çubuk)
    good = has & (yy < H - 1) & ok[np.minimum(yy, H - 1), np.arange(N)[None]]
    fi = np.arange(Sf.shape[0])[:, None]
    lev = (Sf[fi, yy, np.arange(N)[None]] - bg[yy, np.arange(N)[None]]) / (CORE - bg[yy, np.arange(N)[None]])
    e = (yy - TOP) + np.clip(lev, 0, 1)
    E[f0:f0 + 500] = np.where(good, e, np.nan)
np.save(f'veri/{v}-E.npy', E)
print(f'  N={N}, CORE={CORE:.0f}; ölçülebilen %{100 * np.isfinite(E).mean():.0f}; boy yüzdelikleri (px):',
      np.nanpercentile(E, [5, 50, 95, 99]).round(2))
fin = np.isfinite(E).mean(axis=0)
print('  10 dilimde ölçülebilen %:', ' '.join(f'{100*fin[i*N//10:(i+1)*N//10].mean():.0f}' for i in range(10)))
