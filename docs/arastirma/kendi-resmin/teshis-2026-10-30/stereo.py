# Lyraska kaydının sol/sağ ilişkisi: bant bant ilinti, (L+R)/2 karışımının kaybı, kanallar arası kayma.
import numpy as np
from scipy.signal import butter, sosfiltfilt, correlate
from model import audio, SR
st = audio('biz', True); L, R = st[:, 0], st[:, 1]
c = correlate(L[:SR*2], R[:SR*2], 'full', method='fft'); lagm = np.argmax(np.abs(c)) - (SR*2 - 1)
print('en güçlü kanallar arası kayma', lagm, 'örnek, işaret', np.sign(c[np.argmax(np.abs(c))]))
print(f'{"bant Hz":>12s} {"ilinti":>7s} {"(L+R)/2 kaybı dB":>17s} {"S/M dB":>7s}')
for lo, hi in [(20, 120), (120, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 8000)]:
    sos = butter(4, [lo, hi], 'band', fs=SR, output='sos')
    l, r = sosfiltfilt(sos, L), sosfiltfilt(sos, R)
    rho = np.corrcoef(l, r)[0, 1]
    m = (l + r) / 2; s = (l - r) / 2
    loss = 10 * np.log10((m**2).mean() / (((l**2).mean() + (r**2).mean()) / 2))
    print(f'{lo:5d}–{hi:5d} {rho:7.3f} {loss:17.2f} {10*np.log10((s**2).mean()/(m**2).mean()):7.2f}')
