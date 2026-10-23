#!/usr/bin/env python3
"""Sınırlayıcı ölçümü: bağımsız gerçek tepe ölçer (32× ve BS.1770-4 tarzı 4×), gecikme,
THD+N, pompalama, bit bit geçiş."""
import csv
import os

import numpy as np
from scipy import signal

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "olcum")


def load(name):
    return np.fromfile(os.path.join(D, name), dtype="<f8")


import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tp_ref import tp_fft_db as true_peak_db  # FFT tabanlı ideal 32× ara değerleme, kenarlar atılır (tp_ref.py)


def true_peak_bs1770_db(x):
    """ITU-R BS.1770-4 Ek 2: 4× sık örnekleme, 48 katsayılı (faz başına 12) FIR."""
    # Standarttaki katsayılar 4 fazlı, faz başına 12 katsayı (Tablo 2'deki değerler)
    c = np.array([
        [0.0017089843750, 0.0109863281250, -0.0196533203125, 0.0332031250000, -0.0594482421875,
         0.1373291015625, 0.9721679687500, -0.1022949218750, 0.0476074218750, -0.0266113281250,
         0.0148925781250, -0.0083007812500],
        [-0.0291748046875, 0.0292968750000, -0.0517578125000, 0.0891113281250, -0.1665039062500,
         0.4650878906250, 0.7797851562500, -0.2003173828125, 0.1015625000000, -0.0582275390625,
         0.0330810546875, -0.0189208984375],
        [-0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625000000, -0.2003173828125,
         0.7797851562500, 0.4650878906250, -0.1665039062500, 0.0891113281250, -0.0517578125000,
         0.0292968750000, -0.0291748046875],
        [-0.0083007812500, 0.0148925781250, -0.0266113281250, 0.0476074218750, -0.1022949218750,
         0.9721679687500, 0.1373291015625, -0.0594482421875, 0.0332031250000, -0.0196533203125,
         0.0109863281250, 0.0017089843750],
    ])
    peak = 0.0
    for ph in c:
        peak = max(peak, np.max(np.abs(np.convolve(x, ph, mode="valid"))))
    return 20 * np.log10(peak + 1e-300)


def thdn_db(x, freq, rate):
    t = np.arange(len(x)) / rate
    A = np.stack([np.sin(2 * np.pi * freq * t), np.cos(2 * np.pi * freq * t)], axis=1)
    c, *_ = np.linalg.lstsq(A, x, rcond=None)
    res = x - A @ c
    amp = np.hypot(*c)
    return 20 * np.log10(np.sqrt(np.mean(res ** 2)) / (amp / np.sqrt(2)) + 1e-300), amp


man = list(csv.DictReader(open(os.path.join(D, "lim_manifest.csv"))))
CEIL = -1.0
print("ad | hız | gecikme | giriş TP (32×) | çıkış TP 32× | çıkış TP BS1770-4× | çıkış örnek tepe | en düşük kazanç | not")
for m in man:
    name, rate, ch = m["name"], int(m["rate"]), int(m["channels"])
    x = load(f"lim_{rate}_{name}_in.f64")
    y = load(f"lim_{rate}_{name}_out.f64")
    g = load(f"lim_{rate}_{name}_gain.f64")
    lat = int(m["latency"])
    if ch == 2:
        xl, yl = x[0::2], y[0::2]
    else:
        xl, yl = x, y
    # İlk 0,25 s (açılış) atlanır; kenar etkisi için son 0,05 s de.
    a, b = int(0.25 * rate), len(yl) - int(0.05 * rate)
    note = ""
    if name == "impulse":
        k_in = int(np.argmax(np.abs(xl)))
        k_out = int(np.argmax(np.abs(yl)))
        note = f"darbe giriş {k_in} → çıkış {k_out} (fark {k_out - k_in}, beklenen {lat}); çıkış değeri {yl[k_out]:.4f}"
    elif name == "sine_1k_0dBFS":
        thdn, amp = thdn_db(yl[a:b], 1000.0, rate)
        note = f"kararlı durum THD+N {thdn:.1f} dB, genlik {20*np.log10(amp):.3f} dBFS"
    elif name == "pumping":
        # 100 Hz taşıyıcının genliği 10 ms pencerelerde: modülasyon derinliği.
        win = rate // 100
        amps = []
        for k in range(a // win, b // win):
            seg = yl[k * win:(k + 1) * win]
            t = np.arange(k * win, (k + 1) * win) / rate
            A = np.stack([np.sin(2 * np.pi * 100 * t), np.cos(2 * np.pi * 100 * t)], axis=1)
            c, *_ = np.linalg.lstsq(A, seg, rcond=None)
            amps.append(np.hypot(*c))
        amps = np.array(amps)
        note = f"100 Hz taşıyıcı genliği {20*np.log10(amps.min()):.2f}..{20*np.log10(amps.max()):.2f} dBFS (pompalama derinliği {20*np.log10(amps.max()/amps.min()):.2f} dB)"
    elif name.startswith("master_-1.5") or name == "stereo":
        same = np.array_equal(yl[lat:], xl[:len(xl) - lat])
        note = f"bit bit aynı (gecikmeli): {same}"
        if name == "stereo":
            xr, yr = x[1::2], y[1::2]
            note += f"; sağ kanal (taşmayan) en düşük kazanç {g.min():.3f}: sağ çıkış/giriş oranı min {np.min(np.abs(yr[lat+1000:]) / np.maximum(np.abs(xr[1000:len(xr)-lat]), 1e-9)):.3f}"
    elif name.startswith("master_-0.3"):
        same = np.array_equal(yl[lat:], xl[:len(xl) - lat])
        diff = yl[lat:] - xl[:len(xl) - lat]
        note = f"bit bit aynı: {same}; fark RMS {20*np.log10(np.sqrt(np.mean(diff**2))+1e-300):.1f} dBFS; kazanç <1 olan kare oranı {np.mean(g < 1.0)*100:.1f} %"
    tp_in = true_peak_db(xl[a:b])
    tp_out = true_peak_db(yl[a:b])
    tp_bs = true_peak_bs1770_db(yl[a:b])
    sp = 20 * np.log10(np.max(np.abs(yl[a:b])) + 1e-300)
    flag = "AŞIM" if tp_out > CEIL + 0.1 else ""
    print(f"{name:20s} {rate:6d} {lat:3d} | {tp_in:6.2f} | {tp_out:6.2f} {flag} | {tp_bs:6.2f} | {sp:6.2f} | {g.min():.3f} | {note}")

# Kazanç adımı (tık): en büyük kare-başına kazanç değişimi.
print("\nKazanç eğrisinin en büyük adımı (kare başına, doğrusal) ve 80 ms geri dönüş denetimi:")
for m in man:
    name, rate = m["name"], int(m["rate"])
    if name not in ("spikes_in_sine", "pumping", "clipnoise"):
        continue
    g = load(f"lim_{rate}_{name}_gain.f64")
    print(f"  {name} {rate}: max |Δg| = {np.max(np.abs(np.diff(g))):.5f}; kazanç<1 oranı {np.mean(g<1)*100:.1f} %")

# Geri dönüş zaman sabiti: spikes_in_sine 48k, ilk darbeden sonra kazancın 1−1/e'ye dönüşü.
g = load("lim_48000_spikes_in_sine_gain.f64")
k0 = int(np.argmin(g[:10000]))
gmin = g[k0]
target = gmin + (1 - gmin) * (1 - np.exp(-1))
k1 = k0 + int(np.argmax(g[k0:] >= target))
print(f"  geri dönüş: en düşük {gmin:.3f} @ {k0}; 1−1/e'ye {(k1-k0)/48000*1000:.1f} ms sonra (hedef 80 ms + ~1,3 ms ortalama)")
