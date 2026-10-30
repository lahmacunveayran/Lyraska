# Uygulamanın boru hattını (spectrum.rs → stepBars → targetExtents) kaydın kendi sesiyle benzetir ve
# ölçülenle aynı maskede, aynı ~24 kare/sn ızgarasında bölge istatistiklerini karşılaştırır.
# Ayrıca ölçüm gürültüsü: modelin "durgun" dediği yerlerde (genlik < 0,003 ve |Δgenlik| < 0,001)
# ölçülen |Δ|. Kullanım: python3 benzetim.py
import numpy as np
from model import *
from istatistik import grid
DT = np.diff(frames('a')).mean()
def sim(v, release=True):
    t = frames(v); lag = float(np.load(f'veri/{v}-lag.npy')[0])
    Em = resample_bars(E(v), 200)
    A = amps(v, t, lag)
    m = np.isfinite(Em)
    sol = np.polyfit(A[m], Em[m], 1)            # ölçülen = kesişim + eğim·genlik (tek, global)
    g = sol[0] * FULL / (CAP - REST)
    lv = levels(A, g)
    if release: lv = step_bars(lv, t)
    P = extents(lv) + (sol[1] - REST)           # ölçümün sabit tabanı (ışıltı) eklenir
    return t, Em, P, A, g
def region_rows(X, mask):
    X = np.where(mask, X, np.nan) * 100
    d = np.abs(np.diff(X, axis=0))
    out = []
    for s in range(10):
        sl = slice(20 * s, 20 * s + 20)
        dd = d[:, sl]; f = np.isfinite(dd)
        out.append((np.nanmean(X[:, sl]), np.nanmean(dd), 100 * (dd[f] > 0.5).mean() if f.sum() else np.nan))
    return np.array(out)
def main():
  for v in ['biz', 'a']:
      t, Em, P, A, g = sim(v)
      if v == 'biz':
          gg = np.arange(t[0], t[-1], DT); idx = np.abs(t[None] - gg[:, None]).argmin(1)
      else:
          idx = np.arange(len(t))
      mask = np.isfinite(Em[idx])
      meas = region_rows(Em[idx], mask); mod = region_rows(P[idx], mask)
      print(f'\n{v}: global kazanç g={g:.3f}')
      print(f'{"":30s}' + ''.join(f'{int(20+198*s):>7d}' for s in range(10)))
      for j, nm in enumerate(['ortalama boy %', '|Δ| %/kare (~24/sn)', 'hareketli kare %']):
          print(f'{"ölçülen  " + nm:30s}' + ''.join('     — ' if not np.isfinite(x) else f'{x:7.2f}' for x in meas[:, j]))
          print(f'{"model    " + nm:30s}' + ''.join('     — ' if not np.isfinite(x) else f'{x:7.2f}' for x in mod[:, j]))
      # ölçüm gürültüsü
      Ai = A[idx]; Ei = Em[idx]
      quiet = (Ai[1:] < 0.003) & (Ai[:-1] < 0.003) & (np.abs(np.diff(Ai, axis=0)) < 0.001)
      dE = np.abs(np.diff(Ei, axis=0)) * 100
      q = quiet & np.isfinite(dE)
      print(f'  gürültü tabanı: model durgunken ölçülen |Δ| ortalama {dE[q].mean():.3f} %H, >0,5 %H olan %{100*(dE[q] > 0.5).mean():.1f} (n={q.sum()})')

if __name__ == '__main__':
    main()
