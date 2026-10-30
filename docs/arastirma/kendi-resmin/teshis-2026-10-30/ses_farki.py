# Soru 3: sahibinin kaydındaki ses ile tam videonun sesi AYNI ANDA: frekansa göre fark (dB), orta (M) ve yan (S)
# ayrı; kanallar arası ilinti iki tarafta; şarkının tümleşik LUFS'i (uygulamanın −14 kazancı).
import json
import numpy as np, pyloudnorm as pyln
from scipy.signal import welch, butter, sosfiltfilt
from model import audio, SR
off = json.load(open('veri/biz-hiza.json'))['offset']
rec = audio('biz', True); full = audio('tam', True)
i0 = int(round(off * SR)); ref = full[i0:i0 + len(rec)]
L = pyln.Meter(SR).integrated_loudness(full)
print(f'şarkının tümleşik ses yüksekliği {L:.2f} LUFS → uygulamanın kazancı {-14 - L:+.2f} dB ({10**((-14-L)/20):.3f})')
print(f'aynı 4,4 sn: kayıt {pyln.Meter(SR, block_size=0.4).integrated_loudness(rec):.2f} LUFS, video {pyln.Meter(SR, block_size=0.4).integrated_loudness(ref):.2f} LUFS')
def mono(x, s): return (x[:, 0] + s * x[:, 1]) / 2
f, Pm_r = welch(mono(rec, 1), SR, nperseg=8192); _, Pm_v = welch(mono(ref, 1), SR, nperseg=8192)
_, Ps_r = welch(mono(rec, -1), SR, nperseg=8192); _, Ps_v = welch(mono(ref, -1), SR, nperseg=8192)
edges = [20, 40, 63, 100, 160, 250, 400, 500, 630, 800, 1000, 1600, 2000, 3150, 5000, 8000, 12500, 16000]
print(f'{"bant Hz":>13s} {"M: kayıt−video dB":>18s} {"S: kayıt−video dB":>18s}')
for lo, hi in zip(edges[:-1], edges[1:]):
    b = (f >= lo) & (f < hi)
    print(f'{lo:6d}–{hi:5d} {10*np.log10(Pm_r[b].sum()/Pm_v[b].sum()):18.2f} {10*np.log10(Ps_r[b].sum()/Ps_v[b].sum()):18.2f}')
print('kanallar arası ilinti (kayıt / video):')
for lo, hi in [(20, 120), (120, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 8000)]:
    sos = butter(4, [lo, hi], 'band', fs=SR, output='sos')
    rr = [np.corrcoef(sosfiltfilt(sos, x[:, 0]), sosfiltfilt(sos, x[:, 1]))[0, 1] for x in (rec, ref)]
    print(f'  {lo:5d}–{hi:5d}: {rr[0]:6.3f} / {rr[1]:6.3f}')
# aynı anın şarkı geneline göre yeri: video sesinde 1 sn'lik kısa süreli ses yüksekliği
