#!/usr/bin/env python3
"""Zipper ayrıntısı: saf ton girişinde, tonun bandı dışındaki çıkış içeriği = yapay (tık/zipper)."""
import os, numpy as np
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "olcum")
def load(n): return np.fromfile(os.path.join(D, n), dtype="<f8")
rate = 48000
for tag, lo, hi, sig_db in (("eq_zipper", 400, 24000, -6.0), ("eq_zipper2", 2500, 24000, -14.0), ("eq_zipper2", 20, 500, -14.0)):
    y = load(tag + "_out.f64")
    Y = np.fft.rfft(y)
    f = np.fft.rfftfreq(len(y), 1 / rate)
    Y[(f < lo) | (f > hi)] = 0
    art = np.fft.irfft(Y, len(y))
    win = 48  # 1 ms
    lv = 20 * np.log10(np.sqrt(np.convolve(art ** 2, np.ones(win) / win, mode="same")) + 1e-300)
    t = np.arange(len(y)) / rate
    print(f"{tag} [{lo}–{hi} Hz dışı içerik]: giriş {sig_db} dBFS; en yüksek 1 ms RMS {lv.max():.1f} dBFS @ {t[np.argmax(lv)]:.3f} s "
          f"(sinyale göre {lv.max()-sig_db:+.1f} dB); olay anlarında: " +
          ", ".join(f"{tt:.1f}s:{lv[int(tt*rate)+60]:.0f}" for tt in (0.5, 1.5, 2.0, 2.5)))
    # Yapay sinyalin spektrumu olay anında (geniş bantlı mı?)
    seg = art[int(0.5 * rate):int(0.6 * rate)]
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    ff = np.fft.rfftfreq(len(seg), 1 / rate)
    top = np.argsort(S)[-5:][::-1]
    print("   0,5–0,6 s'de en güçlü bileşenler (Hz): " + ", ".join(f"{ff[i]:.0f}" for i in top))
