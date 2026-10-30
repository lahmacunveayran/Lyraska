# Kare düşmesi / donma: ardışık iki karede çubuk bölgesinin pikselleri aynı mı? (ham kırpıntıdan)
# Ayrıca çubuk boylarının kaç karede bir değiştiği (güncelleme aralığı dağılımı).
import sys
import numpy as np
v = sys.argv[1]; TOP = int(sys.argv[2])
a = np.load(f'veri/{v}-crop.npy', mmap_mode='r')
F = a.shape[0]
d = np.array([np.abs(a[i + 1, TOP:TOP + 200].astype(np.int16) - a[i, TOP:TOP + 200]).mean() for i in range(F - 1)])
print(v, 'ardışık kare farkı (ortalama piksel): yüzdelik 0/5/25/50', np.percentile(d, [0, 5, 25, 50]).round(3))
print('  neredeyse aynı (<0,05) kare çifti:', (d < 0.05).sum(), '/', F - 1)
E = np.load(f'veri/{v}-E.npy')
same = np.array([np.nanmax(np.abs(E[i + 1] - E[i])) < 0.5 for i in range(F - 1)])
print('  bütün çubuk boyları değişmeyen kare çifti:', same.sum(), '/', F - 1)
runs = []; r = 1
for s in same:
    if s: r += 1
    else: runs.append(r); r = 1
runs.append(r)
u, c = np.unique(runs, return_counts=True)
print('  güncelleme aralığı (kare) dağılımı:', dict(zip(u.tolist(), c.tolist())))
