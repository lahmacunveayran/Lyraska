# Bölge kazancı: ölçülen boyun modele (kaydın sesi, tek global kazanç) oranı, ince gruplarda (10 çubuk ≈ 99 Hz).
# İki tahmin: (1) ters regresyon (genlik ~ boy; ölçüm gürültüsü eğimi kısmaz, model hatası da kısmaz değil:
#   iki yönün geometrik ortalaması = std oranı · işaret), (2) %95 − %5 aralık oranı.
# 1 = uygulama bu bölgede kaydın sesine göre bas bölgesiyle aynı ölçekte.
import numpy as np
from benzetim import sim
for v in ['biz', 'a']:
    t, Em, P, A, g = sim(v, release=True)
    print(f'\n{v}  (grup başı Hz: oran_std / oran_aralık / r / ölçülebilen%)')
    row = []
    for s in range(20):
        sl = slice(10 * s, 10 * s + 10)
        e, p = Em[:, sl], P[:, sl]; m = np.isfinite(e)
        if m.mean() < 0.15: row.append(f'{int(20+99*s):5d}:   —'); continue
        rs = []; ss = []; qs = []
        for k in range(e.shape[1]):
            mk = m[:, k]
            if mk.sum() < 20: continue
            ss.append(np.std(e[mk, k]) / max(np.std(p[mk, k]), 1e-9))
            qs.append(np.ptp(np.percentile(e[mk, k], [5, 95])) / max(np.ptp(np.percentile(p[mk, k], [5, 95])), 1e-9))
            rs.append(np.corrcoef(e[mk, k], p[mk, k])[0, 1])
        row.append(f'{int(20+99*s):5d}: {np.median(ss):4.2f} / {np.median(qs):4.2f} / {np.nanmedian(rs):4.2f} / {100*m.mean():3.0f}')
    print('\n'.join(row))
