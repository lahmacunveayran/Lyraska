# Aynı müzik anında bölge bölge: orijinal video (kendi karesi, 0,12 s önden: aynı sesi gösteren kare), Lyraska'nın
# gerçek çizimi (lyr), istenirse sahibinin Windows kaydı (biz). Boylar ekran yüksekliğinin %'si; 30 kare/sn.
# Kullanım: python3 ayni_an.py <lyr adı> [T0 T1]  (varsayılan 20–35 s)
import sys, json
import numpy as np
from model import E, frames, pooled, per_bar_r
name = sys.argv[1] if len(sys.argv) > 1 else 'lyr'
T = np.array(frames(name)); El = E(name)
LEAD = float(np.load('veri/tam-lag.npy')[0])
T0, T1 = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (T[0], T[-1])
sel = (T >= T0 - 1e-6) & (T <= T1 + 1e-6); T = T[sel]; El = El[sel]
Et_all = E('tam'); Et = Et_all[np.clip(np.round((T - LEAD) * 30).astype(int), 0, len(Et_all) - 1)]
rows = {'tam': Et, name: El}
if len(sys.argv) > 3 or name == 'biz':
    pass
try:
    off = json.load(open('veri/biz-hiza.json'))['offset']; lagb = json.load(open('veri/biz-tam.json'))['lag']
    tb = np.array(frames('biz')); Eb = E('biz'); content = off + tb + lagb
    if content[0] <= T0 + 0.05 and content[-1] >= T1 - 0.05:
        rows['biz'] = Eb[np.abs(content[None] - T[:, None]).argmin(1)]
except FileNotFoundError:
    pass
def stats(X, mask):
    X = np.where(mask, X, np.nan) * 100; d = np.abs(np.diff(X, axis=0)); out = []
    for s in range(10):
        sl = slice(20 * s, 20 * s + 20); x = X[:, sl]; dd = d[:, sl]; f = np.isfinite(dd)
        out.append([np.isfinite(x).mean() * 100, np.nanmean(x), np.nanmean(np.nanstd(x, axis=0)), np.nanmean(dd),
                    100 * (dd[f] > 0.5).mean() if f.sum() else np.nan])
    return np.array(out)
mask = np.ones_like(El, bool)
for X in rows.values(): mask &= np.isfinite(X)
print(f'{T0:.2f}–{T1:.2f} s, {len(T)} kare; ortak ölçülebilir maske; dilim başı Hz:', ' '.join(f'{int(20+198*s)}' for s in range(10)))
labels = ['ölçülebilen %', 'ortalama boy %H', 'zaman std %H', '|Δ| %H/kare', 'hareketli kare %']
S = {k: stats(v, mask) for k, v in rows.items()}
for j, lab in enumerate(labels):
    for k in S:
        print(f'{lab:18s} {k:4s}' + ''.join(f'{x:7.1f}' if np.isfinite(x) else '     — ' for x in S[k][:, j]))
for k, v in rows.items():
    if k == 'tam': continue
    m = mask
    print(f'{k} ↔ video benzerliği: havuz r {pooled(np.where(m, v, np.nan), Et):.3f}, çubuk r {np.nanmean(per_bar_r(np.where(m, v, np.nan), Et)):.3f}; '
          f'ortalama boy oranı {np.nanmean(np.where(m, v, np.nan)) / np.nanmean(np.where(m, Et, np.nan)):.2f}')
