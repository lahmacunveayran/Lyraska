"""Sınırlayıcının ara değerleyicisi (limiter.rs interpolator ile aynı) kırpılmış 9 kHz'i 44,1 ve 48 kHz'te
ne kadar kaçırıyor? Referans: tam sayıda periyotlu sinyalin FFT ile kesin bant sınırlı ara değeri.
Çalıştırma: python3 -I kirpilmis_48k.py"""
import numpy as np
from scipy.signal import resample


def interpolator(fs, taps=16):
    factor = 8 if fs < 96000 else (4 if fs < 192000 else 2)
    length = factor * taps
    center = (length - 1) / 2
    phases = np.zeros((factor, taps))
    for n in range(length):
        x = (n - center) / factor
        s = 1.0 if abs(x) < 1e-12 else np.sin(np.pi * x) / (np.pi * x)
        w = 0.42 - 0.5 * np.cos(2 * np.pi * n / (length - 1)) + 0.08 * np.cos(4 * np.pi * n / (length - 1))
        phases[n % factor, n // factor] = s * w
    phases /= phases.sum(axis=1, keepdims=True)
    return phases


for fs, N in ((44100, 4900), (48000, 4800)):
    n = np.arange(N)
    for f, amp in ((9000, 1.6), (9000, 1.3), (11025 if fs == 44100 else 12000, 1.6), (7000, 1.6)):
        x = np.clip(amp * np.sin(2 * np.pi * f * n / fs), -1, 1)
        exact = np.abs(resample(x, N * 256)).max()
        det = np.abs(x).max()
        for p in interpolator(fs):
            det = max(det, np.abs(np.convolve(np.tile(x, 3), p, mode="valid")).max())
        print(f"{fs} Hz, {f} Hz × {amp} kırpılmış: kesin {20*np.log10(exact):+.3f} dBTP, "
              f"sınırlayıcının gördüğü {20*np.log10(det):+.3f} dBTP, kaçırma {20*np.log10(exact/det):.3f} dB")
