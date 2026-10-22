"""DSP-09: Ekranda çizilen eğri hangi hızda? Kulaklık düzeltmesi 48 kHz'te (peq.rs DISPLAY_RATE), parametrik
96 kHz'te (ANALYSIS_RATE), arayüzün sürükleme önizlemesi analog (parametric.ts analogDb). Ses aygıt hızında
(44,1 / 48 kHz) çalar. Aynı RBJ (APO) katsayılarının farklı hızlarda eğrisi karşılaştırılır.

Çalıştır: python3 -I dsp09_cizim_hizi.py
"""
import math

import numpy as np
from scipy import signal


def rbj(kind, f0, g, q, fs):
    A = 10 ** (g / 40)
    w0 = 2 * math.pi * f0 / fs
    s, c = math.sin(w0), math.cos(w0)
    al = s / (2 * q)
    if kind == "PK":
        b, a = [1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "HS":
        k = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + k), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - k)]
        a = [(A + 1) - (A - 1) * c + k, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - k]
    else:  # LS
        k = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + k), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - k)]
        a = [(A + 1) + (A - 1) * c + k, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - k]
    return b, a


def curve(filters, fs, hz):
    tot = np.zeros_like(hz)
    for kf in filters:
        _, h = signal.freqz(*rbj(*kf, fs), worN=2 * np.pi * hz / fs)
        tot += 20 * np.log10(np.abs(h))
    return tot


def main():
    hz = np.geomspace(20, 20000, 241)
    # Tipik bir AutoEq profili (tiz bölgede birkaç süzgeç).
    profile = [("LS", 105, 5.5, 0.7), ("PK", 1923, -3.2, 1.31), ("PK", 3500, 4.0, 2.0), ("PK", 6200, -4.5, 3.0),
               ("PK", 9800, 3.5, 2.5), ("PK", 14000, 4.0, 1.5), ("HS", 10000, 2.0, 0.7)]
    d48 = curve(profile, 48000, hz)
    d96 = curve(profile, 96000, hz)
    p441 = curve(profile, 44100, hz)
    p48 = d48
    for name, disp in (("kulaklık ekranı (48k)", d48), ("parametrik ekranı (96k)", d96)):
        for pname, play in (("44,1k", p441), ("48k", p48)):
            d = disp - play
            i = int(np.argmax(np.abs(d)))
            print(f"{name} − çalınan {pname}: en büyük fark {d[i]:+.2f} dB @ {hz[i]:.0f} Hz")


if __name__ == "__main__":
    main()
