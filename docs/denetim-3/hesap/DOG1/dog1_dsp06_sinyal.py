"""DOĞRULAMA-1 / DSP-06: sınırlayıcı için bağımsız sinyaller üretir (`uret`) ya da çıkışın gerçek
tepesini ölçer (`olc`). Gerçek tepe: bütün sinyalin FFT ile 16× ara değerlenmesi (ideal bant sınırlı
yeniden kurma). Kullanım:
  python3 -I dog1_dsp06_sinyal.py uret
  cargo test --lib dog1_dsp06_sinirlayici_dosyalar -- --ignored --nocapture
  python3 -I dog1_dsp06_sinyal.py olc
"""
import os
import sys

import numpy as np
from scipy import signal

D = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(20261022)


def shaped_noise(n, fs, lo, hi, slope_db_oct=0.0):
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / fs)
    mask = (f >= lo) & (f <= hi)
    g = np.zeros_like(f)
    g[mask] = (f[mask] / 1000.0) ** (slope_db_oct / (20 * np.log10(2)))
    return np.fft.irfft(X * g, n)


def true_peak(x, up=16):
    y = signal.resample(x, len(x) * up)
    e = len(y) // 20  # kenarlar atılır (dairesel FFT)
    return np.max(np.abs(y[e:-e]))


def db(v):
    return 20 * np.log10(v)


def make():
    rows = []
    for fs in (44100, 48000):
        n = fs * 4
        win = np.ones(n)
        r = fs // 10
        win[:r] = np.hanning(2 * r)[:r]
        win[-r:] = np.hanning(2 * r)[r:]
        sigs = {
            "pembe": shaped_noise(n, fs, 20, 20000, -3.0),
            "beyaz": shaped_noise(n, fs, 20, 20000, 0.0),
            "tiz_8_16k": shaped_noise(n, fs, 8000, 16000),
            "tiz_14_20k": shaped_noise(n, fs, 14000, 20000),
            "orta_1_4k": shaped_noise(n, fs, 1000, 4000),
        }
        t = np.arange(n) / fs
        z = np.zeros(n)
        for _ in range(40):
            f0 = rng.uniform(3000, 15000)
            start = rng.uniform(0, 3.5)
            env = np.where(t >= start, np.exp(-(t - start) * rng.uniform(3, 12)), 0)
            z += env * np.sin(2 * np.pi * f0 * t + rng.uniform(0, 6.28))
        sigs["zil"] = z
        for name, x in sigs.items():
            x = x * win
            x = x / np.max(np.abs(x)) * 1.4  # örnek tepesi 1,4 (+2,9 dBFS): sınırlayıcı çalışsın
            key = f"{name}_{fs}"
            x.astype("<f8").tofile(os.path.join(D, f"g_{key}.f64"))
            rows.append(f"{key} {fs}")
            print(f"{key}: giriş örnek tepesi {db(np.max(np.abs(x))):+.2f} dBFS, gerçek tepe {db(true_peak(x)):+.2f} dBTP")
    with open(os.path.join(D, "sinir_liste.txt"), "w") as fh:
        fh.write("\n".join(rows) + "\n")


def measure():
    with open(os.path.join(D, "sinir_liste.txt")) as fh:
        lines = fh.read().split("\n")
    for line in lines:
        if not line.strip():
            continue
        key, _fs = line.split()
        y = np.fromfile(os.path.join(D, f"c_{key}.f64"), dtype="<f8")
        sp = np.max(np.abs(y))
        tp = true_peak(y)
        print(f"{key:<18} çıkış örnek tepesi {db(sp):+.3f} dBFS, gerçek tepe {db(tp):+.3f} dBTP (tavan −1,000; aşım {db(tp) + 1:+.3f} dB)")


if __name__ == "__main__":
    {"uret": make, "olc": measure}[sys.argv[1]]()
