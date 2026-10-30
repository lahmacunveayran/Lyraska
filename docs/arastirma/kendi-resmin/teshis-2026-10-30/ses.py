# Kayıtların ses düzeyi: klibin LUFS'i (pyloudnorm, 4 sn: kısa süreli tümleşik), tepe, kanallar.
import numpy as np, pyloudnorm as pyln
from model import audio, SR
for v in ['biz', 'a']:
    st = audio(v, True)
    m = pyln.Meter(SR, block_size=0.4)
    l = m.integrated_loudness(st)
    print(f'{v}: klip LUFS {l:.2f}, tepe {20*np.log10(np.abs(st).max()):.2f} dBFS, RMS L/R {20*np.log10(np.sqrt((st**2).mean(0)))}, '
          f'L−R ilinti {np.corrcoef(st[:,0], st[:,1])[0,1]:.3f}; −14 LUFS için kazanç {-14-l:+.2f} dB')
