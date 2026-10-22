"""DSP-07: Ön kazanç tepe taraması (peq.rs:424-438): 20 Hz – 0,49·fs, oktavda 48 nokta. Belge:
"dar (Q = 3) bir tepe bile 0,05 dB içinde bulunur". Q sınırı 30 (profil) ve 30 (parametrik).
En kötü durum: tepe iki tarama noktasının tam ortasında (1/96 oktav uzakta). Ayrıca 20 Hz altındaki
tepeler hiç taranmaz (MIN_FREQ = 10 Hz).

Çalıştır: python3 -I dsp07_tepe_taramasi.py
"""
import math

import numpy as np
from scipy import signal


def rbj_pk(f0, g, q, fs):
    A = 10 ** (g / 40)
    w0 = 2 * math.pi * f0 / fs
    al = math.sin(w0) / (2 * q)
    c = math.cos(w0)
    return [1 + al * A, -2 * c, 1 - al * A], [1 + al / A, -2 * c, 1 - al / A]


def scan_points(fs):
    top = fs * 0.49
    octaves = math.log2(top / 20.0)
    points = math.ceil(octaves * 48)
    return 20.0 * 2 ** (octaves * np.arange(points + 1) / points)


def main():
    fs = 48000.0
    pts = scan_points(fs)
    mid = math.sqrt(pts[300] * pts[301])
    print(f"Tarama noktaları: {len(pts)}; örnek ara frekans {mid:.2f} Hz")
    for g in (6.0, 12.0):
        row = []
        for q in (1, 3, 6, 10, 20, 30):
            b, a = rbj_pk(mid, g, q, fs)
            _, h = signal.freqz(b, a, worN=2 * np.pi * pts / fs)
            seen = np.max(20 * np.log10(np.abs(h)))
            row.append(f"Q{q}: {g - seen:.3f}")
        print(f"  PK +{g:g} dB tepe iki noktanın ortasında, kaçırılan (dB): " + "  ".join(row))
    for f0, g, q in ((14.0, 12.0, 2.0), (12.0, 12.0, 4.0), (10.0, 24.0, 4.0)):
        b, a = rbj_pk(f0, g, q, fs)
        _, h = signal.freqz(b, a, worN=2 * np.pi * pts / fs)
        seen = np.max(20 * np.log10(np.abs(h)))
        print(f"  PK {f0:g} Hz +{g:g} dB Q {q:g}: tarama {seen:.2f} dB görür, gerçek tepe {g:.2f} dB (kaçırılan {g - seen:.2f})")


if __name__ == "__main__":
    main()
