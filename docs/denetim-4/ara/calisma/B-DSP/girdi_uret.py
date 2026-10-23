#!/usr/bin/env python3
"""EBU Tech 3341 (2016) ses yüksekliği ve gerçek tepe test sinyallerini üretir.

Çıktı: calisma/B-DSP/girdi/<ad>.f64  (ham, little-endian f64, kanallar iç içe) ve
manifest.csv (ad, hız, kanal, beklenen LUFS, tolerans, beklenen dBTP, tolerans).
Sinyaller belgedeki tanımlardan üretilir; koddan hiçbir şey alınmaz.
"""
import csv
import os
import sys

import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "girdi")
os.makedirs(OUT, exist_ok=True)
rows = []


def db(x):
    return 10 ** (x / 20.0)


def sine(freq, rate, seconds, amp_db, phase=0.0, start=0):
    n = int(round(seconds * rate))
    t = (np.arange(n) + start) / rate
    return db(amp_db) * np.sin(2 * np.pi * freq * t + phase)


def save(name, rate, data, lufs=None, lufs_tol=None, dbtp=None, dbtp_tol=None):
    """data: (frames, channels) dizisi."""
    data = np.ascontiguousarray(data, dtype="<f8")
    data.tofile(os.path.join(OUT, name + ".f64"))
    rows.append([name, rate, data.shape[1], "" if lufs is None else lufs,
                 "" if lufs_tol is None else lufs_tol, "" if dbtp is None else dbtp,
                 "" if dbtp_tol is None else dbtp_tol])


def stereo(parts, rate, freq=1000.0):
    """parts: [(saniye, dBFS)] art arda; her bölüm 1 kHz sinüs, iki kanal aynı; faz sürekli."""
    pieces = []
    start = 0
    for seconds, level in parts:
        s = sine(freq, rate, seconds, level, start=start)
        start += len(s)
        pieces.append(s)
    x = np.concatenate(pieces)
    return np.stack([x, x], axis=1)


# --- Tech 3341, Tablo 1: bütünleşik yükseklik durumları (hepsi 48 kHz'te tanımlı) -----------
for rate in (48000, 44100, 96000):
    tag = f"_{rate}"
    save("3341_case1" + tag, rate, stereo([(20, -23.0)], rate), -23.0, 0.1)
    save("3341_case2" + tag, rate, stereo([(20, -33.0)], rate), -33.0, 0.1)
# Durum 3, 4, 5 uzun: yalnızca 48 kHz.
save("3341_case3_48000", 48000, stereo([(10, -36.0), (60, -23.0), (10, -36.0)], 48000), -23.0, 0.1)
save("3341_case4_48000", 48000,
     stereo([(10, -72.0), (10, -36.0), (60, -23.0), (10, -36.0), (10, -72.0)], 48000), -23.0, 0.1)
save("3341_case5_48000", 48000, stereo([(20, -26.0), (20.1, -20.0), (20, -26.0)], 48000), -23.0, 0.1)
# Durum 6: 5.0 (L R C LFE Ls Rs sırası; LFE sessiz): L/R −28, C −24, Ls/Rs −30 → −23,0 LUFS.
rate = 48000
L = sine(1000, rate, 20, -28.0)
C = sine(1000, rate, 20, -24.0)
Ls = sine(1000, rate, 20, -30.0)
LFE = np.zeros_like(L)
save("3341_case6_48000", rate, np.stack([L, L, C, LFE, Ls, Ls], axis=1), -23.0, 0.1)
# Mutlak kapı sınırı: −69 dBFS (geçer) ve −71 dBFS (sessiz sayılmalı; ölçüm "yok").
save("gate_abs_-69_48000", rate, stereo([(10, -69.0)], rate), -69.0, 0.1)
save("gate_abs_-71_48000", rate, stereo([(10, -71.0)], rate), "NONE", 0)
# Göreli kapı tam sınırda: −23 (60 s) + −33,5 (20 s): −33,5 bloklar −23 − 10 = −33'ün altında → atılır → −23,0.
save("gate_rel_48000", rate, stereo([(60, -23.0), (20, -33.5)], rate), -23.0, 0.1)
# Kısa ses (< 400 ms): standartta blok oluşmaz; kod bütünü tek blok sayar. Sadece bilgi.
save("short_300ms_48000", rate, stereo([(0.3, -23.0)], rate), -23.0, 0.5)

# --- K-ağırlık eğrisi: −23 dBFS stereo sinüsler, çeşitli frekanslar (beklenen LUFS python'da hesaplanır) --
for rate in (48000, 44100, 96000):
    for f in (40, 100, 300, 1000, 2000, 3000, 6000, 10000, 16000, 20000):
        if f >= rate / 2:
            continue
        save(f"kweight_{f}_{rate}", rate, stereo([(8, -23.0)], rate, freq=f))

# --- Gerçek tepe (BS.1770-4 Ek 2 ilkeleri) ----------------------------------------------------
for rate in (48000, 44100, 96000):
    tag = f"_{rate}"
    # 997 Hz −6 dBFS sinüs: gerçek tepe −6,0 dBTP (±0,2; Tech 3341 TP durumları gibi).
    x = sine(997, rate, 5, -6.0)
    save("tp_997_-6" + tag, rate, np.stack([x, x], axis=1), dbtp=-6.0, dbtp_tol=0.2)
    # fs/4, 45° faz, örnek tepesi 0 dBFS: gerçek tepe +3,01 dBTP (örnekler arası).
    n = np.arange(int(5 * rate))
    x = np.sqrt(2) * np.sin(np.pi / 2 * n + np.pi / 4)
    save("tp_fs4_45deg" + tag, rate, np.stack([x, x], axis=1), dbtp=3.01, dbtp_tol=0.4)
    # 0,45·fs sinüs, genlik 1: gerçek tepe 0,0 dBTP; örnekler tepeye nadiren denk gelir.
    x = np.sin(2 * np.pi * 0.45 * n + 0.3)
    save("tp_045fs" + tag, rate, np.stack([x, x], axis=1), dbtp=0.0, dbtp_tol=0.3)
    # Sert kırpılmış 0,2·fs sinüs (1,6 → ±1): örnekler arası taşma.
    x = np.clip(1.6 * np.sin(2 * np.pi * 0.2 * n), -1, 1)
    save("tp_clip02fs" + tag, rate, np.stack([x, x], axis=1))
    # Tam ölçekli kırpılmış Gauss gürültü (σ = 0,7, ±1): kötü durum.
    rng = np.random.default_rng(7)
    x = np.clip(rng.normal(0, 0.7, int(5 * rate)), -1, 1)
    save("tp_clipnoise" + tag, rate, np.stack([x, x], axis=1))

with open(os.path.join(OUT, "manifest.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["name", "rate", "channels", "lufs", "lufs_tol", "dbtp", "dbtp_tol"])
    w.writerows(rows)
print(f"{len(rows)} sinyal yazıldı → {OUT}", file=sys.stderr)
