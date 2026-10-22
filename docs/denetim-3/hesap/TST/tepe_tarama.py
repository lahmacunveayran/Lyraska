"""peq.rs:69-71 iddiası: "Tepe 20 Hz'ten 0,49·fs'e kadar oktavda 48 noktayla taranır: dar (Q = 3) bir tepe bile
0,05 dB içinde bulunur." `coefs_peak_db` (peq.rs:424-438) ile aynı tarama, RBJ tepe süzgeci (biquad.rs:190-198).
Parametrik ekolayzer Q'yu 30'a kadar kabul eder (MAX_Q = 30). Taramanın kaçırdığı tepe = korumaya eksik bildirilen
yükseltme (ve kulaklık profilinde eksik ön kazanç).
Çalıştırma: python3 -I tepe_tarama.py"""
import numpy as np


def rbj_peak(f0, gain_db, q, fs):
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / fs
    alpha = np.sin(w0) / (2 * q)
    b = np.array([1 + alpha * a, -2 * np.cos(w0), 1 - alpha * a])
    den = np.array([1 + alpha / a, -2 * np.cos(w0), 1 - alpha / a])
    return b / den[0], den / den[0]


def mag_db(b, a, f, fs):
    z = np.exp(-1j * 2 * np.pi * np.asarray(f) / fs)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return 20 * np.log10(np.abs(h))


def scan_grid(fs):
    top = fs * 0.49
    octaves = max(np.log2(top / 20.0), 0.0)
    points = int(np.ceil(octaves * 48.0))
    i = np.arange(points + 1)
    return 20.0 * 2 ** (octaves * i / points)


fs = 48000.0
grid = scan_grid(fs)
for q in (3.0, 10.0, 30.0):
    for gain in (6.0, 24.0):
        worst = 0.0
        worst_f = None
        # Merkezi iki tarama noktası arasında 200 adımda kaydır (1–2 kHz arası, tipik bölge).
        for f0 in np.geomspace(1000, 2000, 2001):
            b, a = rbj_peak(f0, gain, q, fs)
            scanned = mag_db(b, a, grid, fs).max()
            true = mag_db(b, a, [f0], fs)[0]  # RBJ tepesi tam merkezde (kazanç = gain)
            miss = true - scanned
            if miss > worst:
                worst, worst_f = miss, f0
        print(f"Q={q:5.1f} kazanç {gain:+5.1f} dB: taramanın en çok kaçırdığı {worst:.3f} dB (merkez {worst_f:.1f} Hz)")
