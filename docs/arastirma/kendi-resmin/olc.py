# Çubukların yerini ve her karede her çubuğun çizgiden aşağı boyunu ölçer.
# Kullanım: python3 olc.py <ad>   (kareler.py'nin çıktısıyla) → <ad>-E.npy (kare × çubuk, 1220 satırlık
# videonun pikseli; zemini açık olduğu için ölçülemeyen yer NaN)
import sys
import numpy as np

v = sys.argv[1]
a = np.load(v + '-crop.npy', mmap_mode='r')
F, H, W, _ = a.shape
TOP = 90  # çubukların üst kenarı: kırpıntıda 90. satır (tam görüntüde 610 = 1220 / 2)

# 1) Çubuk aralığı: çizginin hemen altındaki satırlarda (çubuk her zaman var) özün beyazımsı rengi
#    (en küçük bileşen) periyodik; Fourier tepesi aralığı, tepelere doğru uydurma başlangıcı verir.
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

# 2) Boy: çubuğun sütunu (3 px'in en parlağı, en küçük bileşen) ile zemin (aynı sütunun ve iki çubuk
#    arasının zamandaki %10'luk değeri) karşılaştırılır; öz ile zemin arasının yarısını geçen
#    kesintisiz satırlar çubuktur, alt kenar alt piksele inceltilir.
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
np.save(v + '-E.npy', E)
print(f'  ölçülebilen %{100 * np.isfinite(E).mean():.0f}; boy yüzdelikleri (1220 px):',
      np.nanpercentile(E, [5, 50, 95, 99]).round(1))
