"""ARY: "BW Oct" ile yazılmış tepe süzgecinin Equalizer APO'daki (RBJ Cookbook, BW durumu:
alpha = sin(w0)·sinh(ln2/2 · BW · w0/sin(w0))) ve Lyraska'daki (peq.rs q_from_bandwidth:
Q = 1/(2·sinh(ln2/2 · BW)), sonra RBJ alpha = sin(w0)/(2Q)) karşılığı arasındaki fark.
Çalıştırma: python3 -I bw_oct.py"""
import numpy as np


def peaking(f0, gain_db, alpha, fs, f):
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / fs
    b = np.array([1 + alpha * a, -2 * np.cos(w0), 1 - alpha * a])
    den = np.array([1 + alpha / a, -2 * np.cos(w0), 1 - alpha / a])
    z = np.exp(-1j * 2 * np.pi * f / fs)
    h = (b[0] + b[1] * z + b[2] * z * z) / (den[0] + den[1] * z + den[2] * z * z)
    return 20 * np.log10(np.abs(h))


f = np.geomspace(20, 20000, 2000)
print(f"{'fs':>6} {'Fc':>6} {'BW':>4} {'Q (Lyraska)':>12} {'eşdeğer Q (APO)':>16} {'en büyük fark':>14}")
for fs in (44100.0, 48000.0):
    for f0 in (1000.0, 5000.0, 8000.0, 10000.0, 14000.0):
        for bw in (0.5, 1.0, 2.0):
            w0 = 2 * np.pi * f0 / fs
            q_lyraska = 1 / (2 * np.sinh(np.log(2) / 2 * bw))
            alpha_lyraska = np.sin(w0) / (2 * q_lyraska)
            alpha_apo = np.sin(w0) * np.sinh(np.log(2) / 2 * bw * w0 / np.sin(w0))
            q_apo = np.sin(w0) / (2 * alpha_apo)
            d = np.max(np.abs(peaking(f0, 6, alpha_lyraska, fs, f) - peaking(f0, 6, alpha_apo, fs, f)))
            print(f"{fs:6.0f} {f0:6.0f} {bw:4.1f} {q_lyraska:12.3f} {q_apo:16.3f} {d:11.2f} dB")
