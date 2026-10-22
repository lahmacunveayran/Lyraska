"""DSP-02: Eşlenmiş tasarımın (biquad.rs::matched) geniş taraması — Rust'ın döktüğü katsayılarla.

Girdi: rust_katsayilar.csv (Rust testi denetim_dsp_katsayi_dokumu). Her satır için:
- kararlılık (scipy.signal.tf2zpk kutupları |p| < 1), en küçük faz (sıfırlar |z| ≤ 1, AP hariç),
- sık ızgarada (20 Hz – min(20 kHz, 0,4995·fs), 1000 log nokta) analog eğriden ağırlıklı en büyük sapma
  (biquad.rs::error_weight ile aynı ölçü) — RBJ ile karşılaştırma,
- f ≥ 0,49·fs satırlarında sessiz etkisizlik: analog eğrinin duyulur banttaki büyüklüğü.

Çalıştır: python3 -I dsp02_eslenmis_tarama.py
"""
import csv
import math
import os
from collections import defaultdict

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
FLOOR_DB = -30.0


def analog_db(kind, f0, g, q, hz):
    s = 1j * hz / f0
    A = 10 ** (g / 40)
    if kind == "PK":
        n, d = s * s + s * (A / q) + 1, s * s + s / (A * q) + 1
    elif kind == "LS":
        k = math.sqrt(A) / q
        n, d = (s * s + s * k + A) * A, s * s * A + s * k + 1
    elif kind == "HS":
        k = math.sqrt(A) / q
        n, d = (s * s * A + s * k + 1) * A, s * s + s * k + A
    elif kind == "LP":
        n, d = np.ones_like(s), s * s + s / q + 1
    elif kind == "HP":
        n, d = s * s, s * s + s / q + 1
    elif kind == "BP":
        n, d = s / q, s * s + s / q + 1
    elif kind == "NO":
        n, d = s * s + 1, s * s + s / q + 1
    else:
        n, d = s * s - s / q + 1, s * s + s / q + 1
    return 10 * np.log10(np.maximum(np.abs(n / d) ** 2, 1e-300))


def digital_db(c, w):
    _, h = signal.freqz([c[0], c[1], c[2]], [1.0, c[3], c[4]], worN=w)
    return 10 * np.log10(np.maximum(np.abs(h) ** 2, 1e-300))


def weight(ref):
    return np.clip((ref - FLOOR_DB) / 18.0, 0.25, 1.0)


def main():
    path = os.path.join(HERE, "rust_katsayilar.csv")
    rows = defaultdict(dict)
    with open(path) as fh:
        for r in csv.DictReader(fh):
            key = (float(r["rate"]), r["kind"], float(r["freq"]), float(r["gain"]), float(r["q"]))
            rows[key][r["method"]] = np.array([float(r[k]) for k in ("b0", "b1", "b2", "a1", "a2")])
    print(f"{len(rows)} ayar okundu")
    unstable, nonmin, nonfinite = [], [], []
    worse = []
    per = defaultdict(lambda: [0.0, 0.0, 0])
    silent = []
    fallback = defaultdict(lambda: [0, 0])
    for (fs, kind, f0, g, q), m in rows.items():
        cm, cr = m["matched"], m["rbj"]
        for name, c in (("matched", cm), ("rbj", cr)):
            if not np.all(np.isfinite(c)):
                nonfinite.append((fs, kind, f0, g, q, name))
                continue
            p = np.roots([1.0, c[3], c[4]])
            if np.max(np.abs(p)) >= 1.0:
                unstable.append((fs, kind, f0, g, q, name, float(np.max(np.abs(p)))))
        if kind != "AP" and np.all(np.isfinite(cm)) and cm[0] != 0:
            z = np.roots(cm[:3])
            if len(z) and np.max(np.abs(z)) > 1 + 1e-9:
                nonmin.append((fs, kind, f0, g, q, float(np.max(np.abs(z)))))
        high = min(fs / 2 * 0.999, 20000.0)
        hz = np.geomspace(20.0, high, 1000)
        w = 2 * np.pi * hz / fs
        ref = analog_db(kind, f0, g, q, hz)
        used = ref > FLOOR_DB
        if not np.any(used):
            continue
        if f0 >= 0.49 * fs:
            if np.allclose(cm, [1, 0, 0, 0, 0]):
                silent.append((fs, kind, f0, g, q, float(np.max(np.abs(ref[used])))))
            continue
        em = np.max(np.abs(digital_db(cm, w) - ref)[used] * weight(ref[used]))
        er = np.max(np.abs(digital_db(cr, w) - ref)[used] * weight(ref[used]))
        if em > er + 0.05:
            worse.append((em - er, fs, kind, f0, g, q, em, er))
        k = (fs, kind)
        per[k][0] += er
        per[k][1] += em
        per[k][2] += 1
        fallback[kind][0] += 1
        if np.allclose(cm, cr, rtol=0, atol=1e-15):
            fallback[kind][1] += 1
    print(f"Sonlu olmayan katsayı: {len(nonfinite)}  {nonfinite[:3]}")
    print(f"Kararsız: {len(unstable)}  {unstable[:5]}")
    print(f"En küçük fazlı olmayan eşlenmiş: {len(nonmin)}  {sorted(nonmin, key=lambda x: -x[-1])[:5]}")
    worse.sort(reverse=True)
    print(f"Eşlenmiş, sık ızgarada RBJ'den > 0,05 dB kötü: {len(worse)} ayar; en kötü 10:")
    for x in worse[:10]:
        print(f"  +{x[0]:.2f} dB  fs {x[1]:.0f} {x[2]} f {x[3]:.1f} g {x[4]:+g} Q {x[5]:g}: eşlenmiş {x[6]:.2f}, RBJ {x[7]:.2f}")
    by_kind = defaultdict(int)
    for x in worse:
        by_kind[(x[2], x[1])] += 1
    print("  türe ve hıza göre:", dict(sorted(by_kind.items())))
    print("Ortalama ağırlıklı sapma (RBJ → eşlenmiş), hız × tür:")
    for fs in sorted({k[0] for k in per}):
        line = []
        for kind in ("PK", "LS", "HS", "LP", "HP", "BP", "NO", "AP"):
            s = per.get((fs, kind))
            if s and s[2]:
                line.append(f"{kind} {s[0] / s[2]:.2f}→{s[1] / s[2]:.2f}")
        print(f"  {fs:>8.0f}: " + "  ".join(line))
    print("RBJ'ye geri düşen eşlenmiş tasarım oranı:", {k: f"{v[1]}/{v[0]}" for k, v in fallback.items()})
    silent.sort(key=lambda x: -x[-1])
    print(f"f ≥ 0,49·fs olup birim süzgece dönen (sessizce etkisiz) ayar: {len(silent)}; analog eğrinin duyulur bantta en büyük |dB|'si:")
    for x in silent[:8]:
        print(f"  fs {x[0]:.0f} {x[1]} f {x[2]:.0f} g {x[3]:+g} Q {x[4]:g}: analog en çok {x[5]:.1f} dB, çalınan 0 dB")


if __name__ == "__main__":
    main()
