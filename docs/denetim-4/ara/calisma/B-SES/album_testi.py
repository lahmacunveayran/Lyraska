#!/usr/bin/env python3
"""B-SES boşluksuz albüm testi: tek sürekli sinüs üç parçaya bölünüp her biçimde kodlandı.
Parçalar Lyraska çözücüsüyle art arda çözülüp birleştirilir; ekleme noktalarında kaynağa göre
eksik/fazla örnek ve süreksizlik ölçülür."""
import json
import os
import subprocess
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ALBUM = os.path.join(HERE, "album")
BIN = "/home/user/denetim-bagimsiz/target/debug/examples/denetim_coz"
TMP = os.path.join(HERE, "tmp")
BOUNDS = [0, 90001, 90001 + 70003, 264715]


def decode(path):
    out = os.path.join(TMP, "alb.f64")
    res = subprocess.run([BIN, path, out], capture_output=True, text=True, check=True)
    info = json.loads(res.stdout.strip().splitlines()[-1])
    return info, np.fromfile(out, dtype="<f8").reshape(-1, info["channels"])


w = wave.open(os.path.join(ALBUM, "butun.wav"))
src = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, 2).astype(np.float64) / 32768.0
w.close()
src = src[: BOUNDS[-1]]
print("| biçim | parça kare sayıları (beklenen 90001/70003/104711) | toplam | 1→2 ekleme sapması | 2→3 ekleme sapması | ekleme noktasındaki en büyük hata | ortadaki en büyük hata |")
print("|---|---|---|---|---|---|---|")
for ext in ["flac", "mp3", "m4a", "ogg", "-alac.m4a"]:
    parts = []
    for i in range(1, 4):
        name = f"parca{i}{ext}" if ext.startswith("-") else f"parca{i}.{ext}"
        info, data = decode(os.path.join(ALBUM, name))
        parts.append(data)
    joined = np.concatenate(parts)
    counts = [len(p) for p in parts]
    # Her parçanın başlangıcının kaynağa göre gerçek yeri: ilk 4000 örneğini kaynakta ±100 örnek ara.
    def offset_of(seg, expected):
        best = (None, 1e9)
        for lag in range(-200, 201):
            s = expected + lag
            if s < 0 or s + 4000 > len(src):
                continue
            e = np.sqrt(np.mean((src[s:s + 4000, 0] - seg[:4000, 0]) ** 2))
            if e < best[1]:
                best = (lag, e)
        return best[0]
    # Birleştirilmiş akışta 2. ve 3. parçanın başladığı kare ile kaynaktaki gerçek yeri arasındaki fark.
    pos = np.cumsum([0] + counts)
    dev = []
    for k in (1, 2):
        real = BOUNDS[k] + offset_of(parts[k], BOUNDS[k])
        dev.append(pos[k] - real)  # pozitif: akışta fazla örnek (boşluk), negatif: eksik
    n = min(len(joined), len(src))
    err = np.abs(joined[:n, 0] - src[:n, 0])
    join_err = max(err[max(pos[1] - 50, 0):pos[1] + 50].max(), err[max(pos[2] - 50, 0):pos[2] + 50].max())
    mid_err = err[20000:60000].max()
    print(f"| {ext} | {counts} | {len(joined)} (beklenen 264715) | {dev[0]:+d} örnek | {dev[1]:+d} örnek | {join_err:.4f} | {mid_err:.4f} |")
