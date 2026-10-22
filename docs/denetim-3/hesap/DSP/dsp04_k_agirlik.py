"""DSP-04: peq.rs::loudness_gain_db'deki "K ağırlığı" BS.1770'in K ağırlığı mı?

peq.rs:844-855 K ağırlığını Spec{HighShelf, 1681.97 Hz, 3.9998 dB, Q 0.7072}.analog() (RBJ raf
prototipi) ve Spec{HighPass, 38.135 Hz, Q 0.5003}.analog() ile kurar. Bu parametreler libebur128'in
K süzgecini (Vh/Vb biçimi: loudness.rs:90-121) üretmek için türetilmiş değerlerdir; RBJ raf
prototipine konunca farklı bir eğri çıkar. Karşılaştırma, BS.1770-4 Tablo 1/2'deki 48 kHz
katsayılarıyla yapılır.

Çalıştır: python3 -I dsp04_k_agirlik.py
"""
import math

import numpy as np
from scipy import signal

FS = 48000.0
# ITU-R BS.1770-4, 48 kHz katsayıları (1. aşama raf, 2. aşama RLB yüksek geçiren).
B1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
A1 = [1.0, -1.69065929318241, 0.73248077421585]
B2 = [1.0, -2.0, 1.0]
A2 = [1.0, -1.99004745483398, 0.99007225036621]

F0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
FH, QH = 38.13547087602444, 0.5003270373238773


def rbj_hs_analog_db(hz):
    s = 1j * hz / F0
    A = 10 ** (G / 40)
    k = math.sqrt(A) / Q
    h = (s * s * A + s * k + 1) * A / (s * s + s * k + A)
    return 20 * np.log10(np.abs(h))


def rbj_hp_analog_db(hz):
    s = 1j * hz / FH
    return 20 * np.log10(np.abs(s * s / (s * s + s / QH + 1)))


def ebur128_analog_db(hz):
    """libebur128 biçimi: H(s) = (Vh·s² + Vb·s/Q + 1)/(s² + s/Q + 1), s ω0'a göre."""
    s = 1j * hz / F0
    vh = 10 ** (G / 20)
    vb = vh ** 0.4996667741545416
    return 20 * np.log10(np.abs((vh * s * s + vb * s / Q + 1) / (s * s + s / Q + 1)))


def main():
    hz = np.geomspace(20, 20000, 2001)
    w = 2 * np.pi * hz / FS
    _, h1 = signal.freqz(B1, A1, worN=w)
    _, h2 = signal.freqz(B2, A2, worN=w)
    std = 20 * np.log10(np.abs(h1 * h2))
    code = rbj_hs_analog_db(hz) + rbj_hp_analog_db(hz)
    alt = ebur128_analog_db(hz) + rbj_hp_analog_db(hz)
    d = code - std
    i = np.argmax(np.abs(d))
    print(f"peq.rs K ağırlığı − BS.1770 (48 kHz): en büyük fark {d[i]:+.3f} dB @ {hz[i]:.0f} Hz")
    for f in (100, 500, 1000, 1500, 2000, 3000, 5000, 10000):
        j = np.argmin(np.abs(hz - f))
        print(f"  {f:>6} Hz: BS.1770 {std[j]:+.3f}  peq.rs {code[j]:+.3f}  (fark {d[j]:+.3f})")
    d2 = alt - std
    print(f"libebur128 biçimiyle (Vh/Vb) kurulsaydı en büyük fark: {np.max(np.abs(d2[hz < 15000])):.3f} dB (<15 kHz)")

    # Etkisi: pembe gürültüde ses yüksekliği farkı (loudness_gain_db) tipik ayarlarda.
    def peaking_db(f0, g, q, f):
        s = 1j * f / f0
        A = 10 ** (g / 40)
        return 20 * np.log10(np.abs((s * s + s * A / q + 1) / (s * s + s / (A * q) + 1)))

    pts = np.array([20 * 1000 ** (i / 240) for i in range(241)])
    w_code = 10 ** ((rbj_hs_analog_db(pts) + rbj_hp_analog_db(pts)) / 10)
    w_pts = 2 * np.pi * pts / FS
    _, a = signal.freqz(B1, A1, worN=w_pts)
    _, b = signal.freqz(B2, A2, worN=w_pts)
    w_std = np.abs(a * b) ** 2
    for name, curve in [
        ("PK 3 kHz +6 Q1", peaking_db(3000, 6, 1, pts)),
        ("PK 1.5 kHz +12 Q0.7", peaking_db(1500, 12, 0.7, pts)),
        ("PK 100 Hz +9 Q0.7", peaking_db(100, 9, 0.7, pts)),
    ]:
        g = 10 ** (curve / 10)
        lc = 10 * math.log10(np.sum(w_code * g) / np.sum(w_code))
        ls = 10 * math.log10(np.sum(w_std * g) / np.sum(w_std))
        print(f"  {name}: telafi peq.rs {lc:.3f} dB, gerçek K ağırlığıyla {ls:.3f} dB (fark {lc - ls:+.3f})")


if __name__ == "__main__":
    main()
