# Soru 2: orijinal videoda model (kendi sesi, spectrum.rs, tek global eğim) ↔ ölçülen, şarkı boyunca 10 sn'lik
# pencerelerde ve 5 frekans bölgesinde: ölçülen/model std oranı (1 = model aynı ölçekte). Pencerenin ses
# yüksekliği (LUFS) ile oran arasında ilişki varsa çizici sıkıştırma/otomatik kazanç kullanıyor demektir.
import numpy as np, pyloudnorm as pyln
from model import E, frames, audio, SR, pooled, per_bar_r
Em = E('tam'); A = np.load('veri/tam-A.npy'); t = np.array(frames('tam'))
m = np.isfinite(Em); sol = np.polyfit(A[m], Em[m], 1); P = sol[1] + sol[0] * A
st = audio('tam', True); meter = pyln.Meter(SR)
groups = [(0, 20), (20, 60), (60, 100), (100, 150), (150, 200)]
print('pencere   LUFS   havuz r  çubuk r | std oranı: 20–218  218–614  614–1010  1010–1505  1505–2000 | ort. genlik')
allr = []
for w0 in range(0, 170, 10):
    sel = (t >= w0) & (t < w0 + 10)
    e, p = Em[sel], P[sel]
    seg = st[int(w0 * SR):int((w0 + 10) * SR)]
    lufs = meter.integrated_loudness(seg)
    cells = []
    for a, b in groups:
        ee, pp = e[:, a:b], p[:, a:b]; mm = np.isfinite(ee)
        rs = [np.std(ee[mm[:, k], k]) / np.std(pp[mm[:, k], k]) for k in range(b - a) if mm[:, k].sum() > 60 and np.std(pp[mm[:, k], k]) > 1e-4]
        cells.append(np.median(rs) if rs else np.nan); allr.append((lufs, cells[-1]))
    print(f'{w0:3d}–{w0+10:3d} {lufs:6.1f}  {pooled(e, p):7.3f} {np.nanmean(per_bar_r(e, p)):7.3f} | ' +
          '  '.join(f'{c:7.2f}' for c in cells) + f' | {A[sel].mean():.4f}')
x = np.array([a for a, b in allr if np.isfinite(b) and np.isfinite(a)]); y = np.array([b for a, b in allr if np.isfinite(b) and np.isfinite(a)])
print(f'oran ↔ pencere LUFS ilintisi {np.corrcoef(x, y)[0,1]:.3f}, eğim {np.polyfit(x, y, 1)[0]:.3f}/dB; oranların ortancası {np.median(y):.2f}, %10–%90 {np.percentile(y,10):.2f}–{np.percentile(y,90):.2f}')
