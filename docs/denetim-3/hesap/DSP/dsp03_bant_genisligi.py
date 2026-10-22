"""DSP-03: "BW Oct" → Q dönüşümü (peq.rs:451-455) ile RBJ Cookbook'un (ve peq.rs yorumuna göre
Equalizer APO'nun) sayısal bant genişliği tanımı arasındaki fark.

peq.rs: Q = 1/(2·sinh(ln2/2·BW))  → α = sin(w0)/(2Q) = sin(w0)·sinh(ln2/2·BW)
RBJ Cookbook (BW durumu): α = sin(w0)·sinh(ln2/2·BW·w0/sin(w0))

Çalıştır: python3 -I dsp03_bant_genisligi.py
"""
import math

import numpy as np
from scipy import signal


def pk(alpha, A, w0):
    c = math.cos(w0)
    b = [1 + alpha * A, -2 * c, 1 - alpha * A]
    a = [1 + alpha / A, -2 * c, 1 - alpha / A]
    return b, a


def main():
    for fs in (44100.0, 48000.0):
        for bw in (0.5, 1.0, 2.0):
            line = []
            for f0 in (1000, 4000, 8000, 12000, 16000, 19000):
                w0 = 2 * math.pi * f0 / fs
                A = 10 ** (6 / 40)
                a_code = math.sin(w0) * math.sinh(math.log(2) / 2 * bw)
                a_rbj = math.sin(w0) * math.sinh(math.log(2) / 2 * bw * w0 / math.sin(w0))
                hz = np.geomspace(20, min(20000, 0.499 * fs), 4000)
                w = 2 * np.pi * hz / fs
                _, h1 = signal.freqz(*pk(a_code, A, w0), worN=w)
                _, h2 = signal.freqz(*pk(a_rbj, A, w0), worN=w)
                d = np.max(np.abs(20 * np.log10(np.abs(h1) / np.abs(h2))))
                line.append(f"{f0 // 1000:>2}k {d:.2f}")
            print(f"fs {fs:.0f}, PK +6 dB, BW {bw} oct: en büyük eğri farkı (dB)  " + "  ".join(line))


if __name__ == "__main__":
    main()
