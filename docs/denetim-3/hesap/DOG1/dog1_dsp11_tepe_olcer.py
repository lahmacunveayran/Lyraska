"""DOĞRULAMA-1 / DSP-11: analizdeki gerçek tepe ölçerin (loudness.rs TruePeak: 4×, faz başına 12
katsayı, Blackman pencereli sinc, örnekler dahil) FFT referansına göre ne kadar az ölçtüğü.
Ölçer Python'a satır satır aktarıldı. Kullanım: python3 -I dog1_dsp11_tepe_olcer.py
"""
import numpy as np
from scipy import signal

rng = np.random.default_rng(11)


def phases(fs, taps=12):
    factor = 4 if fs < 96000 else (2 if fs < 192000 else 1)
    n_len = factor * taps
    c = (n_len - 1) / 2
    ph = np.zeros((factor, taps))
    for n in range(n_len):
        x = (n - c) / factor
        s = 1.0 if abs(x) < 1e-12 else np.sin(np.pi * x) / (np.pi * x)
        w = 0.42 - 0.5 * np.cos(2 * np.pi * n / (n_len - 1)) + 0.08 * np.cos(4 * np.pi * n / (n_len - 1))
        ph[n % factor, n // factor] = s * w
    return ph / ph.sum(axis=1, keepdims=True)


def meter(x, fs):
    peak = np.max(np.abs(x))
    for p in phases(fs):
        # t = 0 en yeni örnek: y[n] = Σ c[t]·x[n−t]
        y = np.convolve(x, p)[: len(x)]
        peak = max(peak, np.max(np.abs(y)))
    return peak


def ref(x, up=16):
    y = signal.resample(x, len(x) * up)
    e = len(y) // 20
    return np.max(np.abs(y[e:-e]))


def noise(n, fs, lo, hi, slope=0.0):
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / fs)
    g = np.where((f >= lo) & (f <= hi), (np.maximum(f, 1) / 1000) ** (slope / 6.0206), 0)
    return np.fft.irfft(X * g, n)


for fs in (44100, 48000):
    n = fs * 4
    win = signal.windows.tukey(n, 0.1)
    for name, x in (
        ("pembe 20–20k", noise(n, fs, 20, 20000, -3)),
        ("beyaz 20–20k", noise(n, fs, 20, 20000)),
        ("tiz 12–20k", noise(n, fs, 12000, 20000)),
        ("orta 1–4k", noise(n, fs, 1000, 4000)),
    ):
        x = x * win
        x /= np.max(np.abs(x))
        m, r = meter(x, fs), ref(x)
        print(f"{fs} {name:<14} ölçer {20*np.log10(m):+.2f} dBTP, referans {20*np.log10(r):+.2f} dBTP, az ölçüm {20*np.log10(m/r):+.2f} dB")
