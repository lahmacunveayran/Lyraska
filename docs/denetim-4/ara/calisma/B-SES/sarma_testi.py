#!/usr/bin/env python3
"""B-SES sarma doğruluğu: birçok konumda sarma sonrası ilk örneğin gerçek yerini (tam çözümle
karşılaştırarak) bulur, `seek()`'in bildirdiği kareyle ve istenen konumla farkını örnek cinsinden verir."""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SESLER = os.path.join(HERE, "sesler")
BIN = "/home/user/denetim-bagimsiz/target/debug/examples/denetim_coz"
TMP = os.path.join(HERE, "tmp")


def decode(path, seek=None):
    out = os.path.join(TMP, "sar.f64")
    args = [BIN, path, out] + ([str(seek)] if seek is not None else [])
    res = subprocess.run(args, capture_output=True, text=True, check=True)
    info = json.loads(res.stdout.strip().splitlines()[-1])
    if "error" in info:
        return info, None
    return info, np.fromfile(out, dtype="<f8").reshape(-1, info["channels"])


def locate(full, seg, expected, window=4000, n=3000):
    """seg'in full içindeki gerçek başlangıcı (expected ± window)."""
    best = (None, 1e9)
    for s in range(max(expected - window, 0), min(expected + window, len(full) - n)):
        e = np.sqrt(np.mean((full[s:s + n, 0] - seg[:n, 0]) ** 2))
        if e < best[1]:
            best = (s, e)
    return best


files = sys.argv[1:] or [
    "s16-44100-2.wav", "flac-44100-2.flac", "alac-44100-2.m4a", "mp3cbr-44100-2.mp3", "mp3vbr-44100-2.mp3",
    "mp3noxing-44100-2.mp3", "aac-44100-2.m4a", "aac-44100-2.aac", "vorbis-44100-2.ogg", "vorbis-48000-1.ogg",
    "mp3cbr-22050-1.mp3", "aac-22050-1.m4a",
]
print("| dosya | süre (bildirilen) | hedef (sn) | seek() bildirdi (kare) | gerçek ilk örnek (kare) | hata: gerçek − istenen | gerçek − bildirilen | ilk 3000 örnek RMS farkı |")
print("|---|---|---|---|---|---|---|---|")
for name in files:
    path = os.path.join(SESLER, name)
    info, full = decode(path)
    rate = info["sampleRate"]
    dur = info["duration"]
    real_dur = len(full) / rate
    targets = [0.0, 0.001, 0.0133, 0.5, 1.0, 1.23456, real_dur / 2, real_dur - 0.05, real_dur - 0.001,
               dur - 0.0005 if dur > 0 else real_dur, real_dur + 0.5, 100.0, -3.0]
    for t in targets:
        sinfo, seg = decode(path, t)
        if seg is None:
            print(f"| {name} | {dur:.4f} | {t:.4f} | HATA: {sinfo['error']} | | | | |")
            continue
        landed = sinfo["landed"]
        if len(seg) < 3000:
            # Sona yakın: kalan örnek sayısından yeri hesapla.
            real = len(full) - len(seg)
            rms = float(np.sqrt(np.mean((full[real:real + len(seg)] - seg) ** 2))) if len(seg) else 0.0
        else:
            real, rms = locate(full, seg, landed)
        wanted = int(round(min(max(t, 0.0), real_dur) * rate))
        print(f"| {name} | {dur:.4f} | {t:.4f} | {landed} | {real} | {real - wanted:+d} | {real - landed:+d} | {rms:.2e} |")
