#!/usr/bin/env python3
"""Ses yüksekliği: kodun ölçümü ↔ EBU 3341 beklentileri; K-ağırlık eğrisi bağımsız (analog
prototip → scipy bilinear) hesapla karşılaştırma; gerçek tepe ↔ 32× referans."""
import csv
import os

import numpy as np
from scipy import signal

B = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(B, "olcum")
G = os.path.join(B, "girdi")


def k_weight_db(freq, rate):
    """BS.1770-4 K ağırlığı: 1. aşama raf (analog: f0 1681,97 Hz, +3,9998 dB, Q 0,7072), 2. aşama
    RLB yüksek geçiren (f0 38,135 Hz, Q 0,5003); çift doğrusal dönüşüm (önbükme f0'da)."""
    # Raf: analog prototip H(s) = (s² + s·√A·... ) — libebur128/pyloudnorm'un kullandığı biçim:
    # yüksek raf: H(s) = (A·s² + (√A/Q)... ). Standartın verdiği 48 kHz katsayılarından
    # bağımsız olmak için analog eğriyi doğrudan kurup bilinear ile sayısallaştırıyoruz.
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    A = 10 ** (gain / 40)
    w0 = 2 * np.pi * f0
    # RBJ yüksek raf analog: H(s) = A·(A s² + (√A/Q) w0 s + w0²) / (s² + (√A/Q) w0 s + A w0²)
    num = [A * A, A * np.sqrt(A) / q * w0, A * w0 ** 2]
    den = [1.0, np.sqrt(A) / q * w0, A * w0 ** 2]
    bz, az = signal.bilinear(num, den, fs=rate)  # scipy bilinear fs: önbükme yok
    # Önbükme için f0'ı çevir: scipy.bilinear önbükmez; w0'ı tan ile düzelt.
    w0d = 2 * rate * np.tan(w0 / (2 * rate))
    num = [A * A, A * np.sqrt(A) / q * w0d, A * w0d ** 2]
    den = [1.0, np.sqrt(A) / q * w0d, A * w0d ** 2]
    bz, az = signal.bilinear(num, den, fs=rate)
    f1, q1 = 38.13547087602444, 0.5003270373238773
    w1 = 2 * rate * np.tan(2 * np.pi * f1 / (2 * rate))
    bh, ah = signal.bilinear([1.0, 0.0, 0.0], [1.0, w1 / q1, w1 ** 2], fs=rate)
    w = 2 * np.pi * np.atleast_1d(freq) / rate
    _, h1 = signal.freqz(bz, az, worN=w)
    _, h2 = signal.freqz(bh, ah, worN=w)
    return 20 * np.log10(np.abs(h1 * h2))


import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tp_ref import tp_fft_db as true_peak_db


man = {r["name"]: r for r in csv.DictReader(open(os.path.join(G, "manifest.csv")))}
res = {r["name"]: r for r in csv.DictReader(open(os.path.join(D, "loud_results.csv")))}

print("=== EBU Tech 3341 bütünleşik yükseklik ve kapılar ===")
for name, m in man.items():
    if m["lufs"] == "":
        continue
    r = res[name]
    if m["lufs"] == "NONE":
        ok = r["lufs"] == "NONE"
        print(f"{name:24s} beklenen: ölçüm yok (sessiz)   kod: {r['lufs']:>8s}  {'GEÇTİ' if ok else 'KALDI'}")
        continue
    exp, tol = float(m["lufs"]), float(m["lufs_tol"])
    got = float(r["lufs"]) if r["lufs"] != "NONE" else float("nan")
    ok = abs(got - exp) <= tol
    print(f"{name:24s} beklenen {exp:6.1f} ±{tol}  kod {got:8.3f}  fark {got-exp:+.3f}  {'GEÇTİ' if ok else 'KALDI'}")

print("\n=== K-ağırlık eğrisi: −23 dBFS stereo sinüs → beklenen LUFS = −23 + K(f) − K(1 kHz) ===")
print("(1 kHz'te K ≈ +0,691 dB olduğundan standart ofset −0,691 ile −23,0 verir)")
for name, m in man.items():
    if not name.startswith("kweight_"):
        continue
    _, f, rate = name.split("_")
    f, rate = float(f), int(rate)
    k = k_weight_db(f, rate)[0]
    exp = -23.0 + 10 * np.log10(2 * 10 ** (-2.3) / 2 * 10 ** (k / 10)) - 10 * np.log10(10 ** (-2.3)) - 0.691 + 23.0 - 23.0
    # Daha açık: LUFS = −0,691 + 10·log10(Σ z_c), z_c = (A²/2)·|K(f)|², A = 10^(−23/20), iki kanal.
    exp = -0.691 + 10 * np.log10(2 * (10 ** (-2.3) / 2) * 10 ** (k / 10))
    got = float(res[name]["lufs"])
    print(f"  {rate:6d} Hz  {f:7.0f} Hz: K(f) = {k:+.3f} dB → beklenen {exp:8.3f}  kod {got:8.3f}  fark {got-exp:+.4f}")

print("\n=== Gerçek tepe: kodun 4×/12 katsayılı ölçeri ↔ 32× referans (python) ===")
for name, m in man.items():
    if not name.startswith("tp_"):
        continue
    rate, ch = int(m["rate"]), int(m["channels"])
    x = np.fromfile(os.path.join(G, name + ".f64"), dtype="<f8")[0::ch]
    ref = true_peak_db(x[1000:-1000])
    got = float(res[name]["dbtp"])
    sp = 20 * np.log10(np.max(np.abs(x)))
    exp = f"(belge: {m['dbtp']} ±{m['dbtp_tol']})" if m["dbtp"] else ""
    print(f"  {name:22s} örnek tepe {sp:6.2f}  referans 32× {ref:6.2f}  kod {got:6.2f}  kaçırma {got-ref:+.3f} dB {exp}")

print("\n=== Eşitleme kazancı (Loudness::gain_db, hedef −14 LUFS, tavan −1 dBTP) ===")
for r in csv.DictReader(open(os.path.join(D, "loud_gain.csv"))):
    lufs, tp, g = float(r["lufs"]), float(r["dbtp"]), float(r["gain_db"])
    exp = -14 - lufs
    if exp > 0:
        exp = min(exp, max(0.0, -1 - tp))
    print(f"  {lufs:6.1f} LUFS, {tp:5.1f} dBTP → kod {g:+.2f} dB, beklenen {exp:+.2f} dB  {'OK' if abs(g-exp)<1e-9 else 'FARK'}")
