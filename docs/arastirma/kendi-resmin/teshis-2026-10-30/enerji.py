# Soru 3: iki kaydın sesi aynı modelden (spectrum.rs, 4096 Hann, 200 doğrusal çubuk) geçer; ikisi de
# klibin kendi LUFS'iyle −14 LUFS'e getirilir. Bölge bölge: ortalama genlik → uygulamanın seviyesi
# (genlik/0,285), %90, zamanda std, kareden kareye değişim (60 kare/sn'de). Bizimki için ayrıca
# farklı kanal karışımları: (L+R)/2 (uygulama), yalnız L, yalnız R, güç ortalaması √((|L|²+|R|²)/2).
import numpy as np, pyloudnorm as pyln
from model import *
def stats(A, label):
    lv = A / FULL * 100   # uygulamanın seviyesi (%)
    d = np.abs(np.diff(lv, axis=0))
    print(f'  {label:38s}', ' '.join(f'{lv[:, 20*s:20*s+20].mean():5.1f}' for s in range(10)), ' | ',
          ' '.join(f'{d[:, 20*s:20*s+20].mean():4.2f}' for s in range(10)))
print('seviye % = genlik/0,285 (bölge ortalaması)  ||  kareden kareye |Δseviye| % (60 kare/sn)')
print(' ' * 40, ' '.join(f'{int(20+198*s):5d}' for s in range(10)))
for v in ['a', 'biz']:
    st = audio(v, True)
    lufs = pyln.Meter(SR, block_size=0.4).integrated_loudness(st)
    g = 10 ** ((-14 - lufs) / 20)
    t = np.arange(0.15, len(st) / SR - 0.15, 1 / 60)
    t0 = meta(v)['audio_start']
    c = (t - t0) * SR
    print(f'{v}: klip {lufs:.2f} LUFS → kazanç {20*np.log10(g):+.2f} dB')
    mixes = {'(L+R)/2 (uygulama)': (st[:, 0] + st[:, 1]) / 2}
    if v == 'biz':
        mixes['yalnız L'] = st[:, 0]; mixes['yalnız R'] = st[:, 1]
    hz = bar_hz()
    spec = {}
    for k, x in mixes.items():
        S, bh = spectra(x, c)
        spec[k] = np.stack([np.interp(hz / bh, np.arange(S.shape[1]), s) for s in S]) * g
        stats(spec[k], k)
    if v == 'biz':
        SL, bh = spectra(st[:, 0], c); SR_, _ = spectra(st[:, 1], c)
        P = np.sqrt((SL ** 2 + SR_ ** 2) / 2)
        stats(np.stack([np.interp(hz / bh, np.arange(P.shape[1]), s) for s in P]) * g, 'güç ort. √((|L|²+|R|²)/2)')
