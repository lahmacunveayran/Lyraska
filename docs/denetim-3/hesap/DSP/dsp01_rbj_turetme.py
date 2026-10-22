"""DSP-01: RBJ tasarımının bağımsız türetmesi.

Analog prototipler RBJ Audio EQ Cookbook'tan elle yazıldı; sayısal karşılıkları scipy.signal.bilinear
ile (ön bükmeli) bulunur ve (1) biquad.rs formüllerinin Python kopyasıyla, (2) Rust'ın döktüğü
katsayılarla (rust_katsayilar.csv, varsa) karşılaştırılır. Ayrıca Spec::analog'un formülleri
(biquad.rs:108-130) cookbook prototipleriyle karşılaştırılır.

Çalıştır: python3 -I dsp01_rbj_turetme.py
"""
import csv
import math
import os
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))


def proto(kind, gain_db, q):
    """Cookbook analog prototipi, s ω0'a göre normalize (pay, payda; s'nin azalan kuvvetleri)."""
    A = 10 ** (gain_db / 40)
    if kind == "LP":
        return [0, 0, 1], [1, 1 / q, 1]
    if kind == "HP":
        return [1, 0, 0], [1, 1 / q, 1]
    if kind == "BP":
        return [0, 1 / q, 0], [1, 1 / q, 1]
    if kind == "NO":
        return [1, 0, 1], [1, 1 / q, 1]
    if kind == "AP":
        return [1, -1 / q, 1], [1, 1 / q, 1]
    if kind == "PK":
        return [1, A / q, 1], [1, 1 / (A * q), 1]
    if kind == "LS":
        return [A, A * math.sqrt(A) / q, A * A], [A, math.sqrt(A) / q, 1]
    if kind == "HS":
        return [A * A, A * math.sqrt(A) / q, A], [1, math.sqrt(A) / q, A]
    raise ValueError(kind)


def scipy_design(kind, f, gain_db, q, fs):
    w0 = 2 * math.pi * f / fs
    b, a = proto(kind, gain_db, q)
    # s_norm = s/ω0, BLT: s = 2·fs'·(z−1)/(z+1) ile s_norm = (1/tan(w0/2))·(z−1)/(z+1) → fs' = 1/(2 tan(w0/2)).
    fs_eff = 1 / (2 * math.tan(w0 / 2))
    bz, az = signal.bilinear(b, a, fs=fs_eff)
    return np.concatenate([bz / az[0], az[1:] / az[0]])


def code_rbj(kind, f, gain_db, q, fs):
    """biquad.rs:179-301 formüllerinin birebir Python kopyası (MAX_FREQ_RATIO kontrolü hariç)."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * f / fs
    s, c = math.sin(w0), math.cos(w0)
    al = s / (2 * q)
    if kind == "PK":
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "LS":
        k = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + k), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - k)]
        a = [(A + 1) + (A - 1) * c + k, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - k]
    elif kind == "HS":
        k = 2 * math.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + k), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - k)]
        a = [(A + 1) - (A - 1) * c + k, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - k]
    elif kind == "LP":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "HP":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "BP":
        b = [al, 0, -al]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "NO":
        b = [1, -2 * c, 1]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "AP":
        b = [1 - al, -2 * c, 1 + al]
        a = [1 + al, -2 * c, 1 - al]
    return np.array([b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]])


def code_analog(kind, f, gain_db, q, hz):
    """Spec::analog (biquad.rs:108-130) kopyası."""
    s = 1j * hz / f
    A = 10 ** (gain_db / 40)
    if kind == "PK":
        n, d = s * s + s * (A / q) + 1, s * s + s / (A * q) + 1
    elif kind == "LS":
        k = math.sqrt(A) / q
        n, d = (s * s + s * k + A) * A, s * s * A + s * k + 1
    elif kind == "HS":
        k = math.sqrt(A) / q
        n, d = (s * s * A + s * k + 1) * A, s * s + s * k + A
    elif kind == "LP":
        n, d = 1, s * s + s / q + 1
    elif kind == "HP":
        n, d = s * s, s * s + s / q + 1
    elif kind == "BP":
        n, d = s / q, s * s + s / q + 1
    elif kind == "NO":
        n, d = s * s + 1, s * s + s / q + 1
    else:
        n, d = s * s - s / q + 1, s * s + s / q + 1
    return n / d


def main():
    kinds = ["PK", "LS", "HS", "LP", "HP", "BP", "NO", "AP"]
    worst_formula = 0.0
    worst_analog = 0.0
    rng = np.random.default_rng(1)
    for _ in range(4000):
        kind = kinds[rng.integers(8)]
        fs = float(rng.choice([8000, 22050, 44100, 48000, 96000, 192000]))
        f = float(10 * (0.489 * fs / 10) ** rng.random())
        q = float(0.05 * (30 / 0.05) ** rng.random())
        g = float(rng.uniform(-30, 30)) if kind in ("PK", "LS", "HS") else 0.0
        a = scipy_design(kind, f, g, q, fs)
        b = code_rbj(kind, f, g, q, fs)
        rel = np.max(np.abs(a - b)) / max(1.0, np.max(np.abs(a)))
        worst_formula = max(worst_formula, rel)
        # Analog prototip: cookbook ile Spec::analog aynı mı?
        for hz in (f / 7, f / 1.3, f, f * 1.3, f * 7):
            bp, ap = proto(kind, g, q)
            w = 1j * hz / f
            h = np.polyval(bp, w) / np.polyval(ap, w)
            hc = code_analog(kind, f, g, q, hz)
            if abs(h) > 1e-12:
                worst_analog = max(worst_analog, abs(20 * math.log10(abs(hc) / abs(h))))
    print(f"[formül] 4000 rastgele ayarda biquad.rs formülleri ile scipy.bilinear (ön bükmeli cookbook) en büyük göreli fark: {worst_formula:.2e}")
    print(f"[analog] Spec::analog ile cookbook prototipi en büyük fark: {worst_analog:.2e} dB")

    path = os.path.join(HERE, "rust_katsayilar.csv")
    if not os.path.exists(path):
        print("rust_katsayilar.csv yok (önce Rust dökümünü çalıştırın)")
        return
    worst = (0.0, None)
    identity = []
    n = 0
    with open(path) as fh:
        for row in csv.DictReader(fh):
            if row["method"] != "rbj":
                continue
            fs, f, g, q = float(row["rate"]), float(row["freq"]), float(row["gain"]), float(row["q"])
            kind = row["kind"]
            got = np.array([float(row[k]) for k in ("b0", "b1", "b2", "a1", "a2")])
            if f >= 0.49 * fs:
                if kind in ("HP", "BP"):
                    want = code_rbj(kind, 0.49 * fs, g, q, fs)
                else:
                    want = np.array([1.0, 0, 0, 0, 0])
                    identity.append((kind, fs, f))
            else:
                want = scipy_design(kind, f, g, q, fs)
            n += 1
            d = np.max(np.abs(got - want)) / max(1.0, np.max(np.abs(want)))
            if d > worst[0]:
                worst = (d, row)
    print(f"[Rust] {n} RBJ satırı scipy ile karşılaştırıldı; en büyük göreli fark {worst[0]:.2e} ({worst[1] and {k: worst[1][k] for k in ('rate','kind','freq','gain','q')}})")
    print(f"[Rust] f ≥ 0,49·fs olup birim süzgece dönen satır: {len(identity)} (HP/BP 0,49·fs'e çekilir)")


if __name__ == "__main__":
    main()
