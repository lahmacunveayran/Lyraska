#!/usr/bin/env python3
"""Uçtan uca ses yolu: giriş = çıkış mı (bit bit / −140 dB); duraklat-devam geçişinde tık."""
import csv
import os

import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "olcum")


def load(name):
    return np.fromfile(os.path.join(D, name), dtype="<f8")


man = list(csv.DictReader(open(os.path.join(D, "e2e_manifest.csv"))))
for m in man:
    name, rate, ch, lat, block = m["name"], int(m["rate"]), int(m["channels"]), int(m["latency"]), int(m["block"])
    x = load(f"e2e_{rate}_{name}_in.f64")
    y = load(f"e2e_{rate}_{name}_out.f64")
    xl, xr = x[0::2], x[1::2]
    yl, yr = y[0::2], y[1::2]
    n = len(xl)
    fade = int(0.010 * rate) + 2
    if name != "pause":
        # Beklenen: çıkış = giriş, `lat` kare gecikmeli; açılış 10 ms sonrası.
        a = fade
        dl = yl[lat + a:lat + n] - xl[a:n]
        dr = yr[lat + a:lat + n] - xr[a:n]
        same = not np.any(dl) and not np.any(dr)
        rms = 20 * np.log10(np.sqrt(np.mean(np.concatenate([dl, dr]) ** 2)) + 1e-300)
        ratio = np.median(np.abs(yl[lat + a:lat + n]) / np.maximum(np.abs(xl[a:n]), 1e-6))
        print(f"{rate} {name:36s} gecikme {lat}: bit bit aynı: {same}; fark RMS {rms:7.1f} dBFS; "
              f"ortanca çıkış/giriş {20*np.log10(ratio):+.3f} dB; giriş tepe {20*np.log10(np.max(np.abs(xl))):.2f} dBFS; "
              f"gecikme sonrası kuyruk sessiz: {not np.any(y[2*(lat+n)+2*fade:])}")
    else:
        # Duraklatma 1,0–1,5 s ve 2,0–2,004 s (blok 48 kare ≈ 1 ms). Tık: ardışık örnek farkı,
        # sinüsün kendi en büyük adımıyla karşılaştırılır (440 Hz, 0,5 genlik).
        natural = 0.5 * 2 * np.pi * 440 / rate
        d = np.abs(np.diff(yl))
        t = np.arange(len(d)) / rate
        regions = {"duraklat 1,0 s": (0.99, 1.03), "devam 1,5 s": (1.49, 1.53), "kısa duraklat 2,0 s": (1.99, 2.03)}
        print(f"{rate} pause: sinüsün doğal en büyük adımı {natural:.5f}")
        for label, (a, b) in regions.items():
            sel = (t >= a) & (t < b)
            print(f"   {label}: en büyük örnek adımı {d[sel].max():.5f} ({d[sel].max()/natural:.2f}× doğal); "
                  f"çıkış tam sıfıra iniyor mu: {np.any(yl[int(a*rate):int(b*rate)] == 0.0)}")
        # Kazanç eğrisini çıkar: çıkış / gecikmeli giriş (sıfıra bölme hariç) → geçiş süresi.
        g = yl[lat:lat + n] / np.where(np.abs(xl[:n]) > 0.05, xl[:n], np.nan)
        tt = np.arange(n) / rate
        sel = (tt > 0.98) & (tt < 1.03)
        gg = g[sel]
        ok = ~np.isnan(gg)
        first_below = tt[sel][ok][np.argmax(gg[ok] < 0.999)] if np.any(gg[ok] < 0.999) else None
        last_above0 = tt[sel][ok][np.where(gg[ok] > 0.001)[0][-1]] if np.any(gg[ok] > 0.001) else None
        if first_below is not None and last_above0 is not None:
            print(f"   duraklatma geçişi: kazanç 1'den ayrılış {first_below:.4f} s, sıfıra varış ≈ {last_above0:.4f} s "
                  f"→ süre ≈ {(last_above0-first_below)*1000:.1f} ms (hedef 10 ms)")
        # Devam: kaldığı yerden mi sürüyor? Duraklatma boyunca tüketilen giriş: çıkışın devamdan sonraki
        # fazını girişle eşle.
        resume = int(1.5 * rate) + lat + fade + 200
        seg = yl[resume:resume + 2000]
        best = None
        for shift in range(0, int(0.6 * rate)):
            cand = xl[resume - lat - shift:resume - lat - shift + 2000]
            err = np.max(np.abs(cand - seg))
            if best is None or err < best[1]:
                best = (shift, err)
        print(f"   devam sonrası çıkış, girişin {best[0]/rate*1000:.2f} ms geri kaydırılmışıyla eşleşir "
              f"(duraklatma 500 ms − geçişte tüketilen 10 ms ≈ 490 ms beklenir); en büyük fark {best[1]:.2e}")
