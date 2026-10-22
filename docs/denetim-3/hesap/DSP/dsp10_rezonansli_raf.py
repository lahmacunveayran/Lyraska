"""DSP-10: Eşlenmiş tasarımın RBJ'den kötü olduğu rezonanslı raf örneği (Rust dökümünden):
HS 8695,9 Hz +12 dB Q 8 @ 48 kHz. Analog, RBJ ve eşlenmiş eğrileri ve eşlenmiş tasarımın ızgarası
(biquad.rs Grid: 48 log + merkez çevresinde 17 nokta, adım 0,25/Q oktav + raf için ±2 oktav 9 nokta).

Çalıştır: python3 -I dsp10_rezonansli_raf.py
"""
import math

import numpy as np
from scipy import signal

FS = 48000.0
F0, G, Q = 8695.891718, 12.0, 8.0
RBJ = ([2.60316878039083210e0, -3.27984523695147612e0, 2.36956044149950351e0], [1, -1.90034497939933739e-1, 8.82918482878792932e-1])
MAT = ([2.72260017800010568e0, -3.47211501516776888e0, 2.62881272719246484e0], [1, 6.13728569869605653e-2, 8.17925033037840699e-1])


def analog_db(hz):
    s = 1j * hz / F0
    A = 10 ** (G / 40)
    k = math.sqrt(A) / Q
    return 20 * np.log10(np.abs((s * s * A + s * k + 1) * A / (s * s + s * k + A)))


def main():
    hz = np.geomspace(2000, 20000, 4000)
    w = 2 * np.pi * hz / FS
    a = analog_db(hz)
    r = 20 * np.log10(np.abs(signal.freqz(*RBJ, worN=w)[1]))
    m = 20 * np.log10(np.abs(signal.freqz(*MAT, worN=w)[1]))
    for name, c in (("RBJ", r), ("eşlenmiş", m)):
        d = c - a
        i = np.argmax(np.abs(d))
        print(f"{name}: analogdan en büyük sapma {d[i]:+.2f} dB @ {hz[i]:.0f} Hz; tepe {np.max(c):.2f} dB @ {hz[np.argmax(c)]:.0f} Hz")
    print(f"analog tepe {np.max(a):.2f} dB @ {hz[np.argmax(a)]:.0f} Hz; analog kutup doğal frekansı √A·f0 = {math.sqrt(10 ** (G / 40)) * F0:.0f} Hz")
    near = [F0 * 2 ** ((j - 8) * 0.25 / Q) for j in range(17)]
    print(f"merkez çevresi ızgara: {near[0]:.0f} – {near[-1]:.0f} Hz (kutup bölgesini kapsamıyor)")
    for f in (9000, 10000, 11000, 12000, 12300, 13000, 14000):
        j = np.argmin(np.abs(hz - f))
        print(f"  {f} Hz: analog {a[j]:+.2f}  RBJ {r[j]:+.2f}  eşlenmiş {m[j]:+.2f}")


if __name__ == "__main__":
    main()
