"""Drop modelinin ağırlıklarını uydurur (`src-tauri/src/analysis/drop.rs`'teki sabitler).

Kullanım:
  cargo run --release --example drop_olcum -- <set> --oz <özellik klasörü>   # özellikleri yazar
  python3 docs/arastirma/drop/uydur.py <set> <özellik klasörü>

<set>: `uret2.py`'nin ürettiği klasör (ad.json: doğru droplar); <özellik klasörü>: programın yazdığı
ad.oz.json (her vuruşun kanıtları). Yalnızca geliştirme seti (tohum 1–3) verilir.

1. aşama (sıralama): her vuruş için lojistik model. Pozitif: işaretli drop'a en yakın vuruş (yarım
   vuruş içinde); onun ±2 vuruş komşuları ve belirsiz geçişlerin ±1 sn'si eğitime girmez (aynı
   olayın kaymış hâlleri). L2 = 1 (özellikler standartlaştırılarak).
2. aşama (karar): 1. aşamanın puanıyla 32 vuruşluk en-büyük-kalır elemesinden (NMS) geçen adaylarda
   lojistik model. Pozitif: ±1 vuruşta işaretli drop. Girdi [z, kanıtlar], L2 = 3.
Çıktı: Rust sabitleri (standartlaştırma geri alınmış: doğrudan ham kanıtlarla çarpılır) ve MODEL.md
tablosu (ağırlık × kanıtın standart sapması = standart etki).
"""

import json
import sys
from pathlib import Path

import numpy as np

GAP = 32
MIN_SCORE = -12.0


def fit_logistic(X, y, l2):
    """L2 cezalı lojistik regresyon (Newton). Sabit terim cezalanmaz."""
    Xb = np.c_[np.ones(len(X)), X]
    w = np.zeros(Xb.shape[1])
    pen = np.r_[0, np.ones(Xb.shape[1] - 1)]
    for _ in range(100):
        p = 1 / (1 + np.exp(-Xb @ w))
        g = Xb.T @ (p - y) + l2 * pen * w
        H = (Xb * (p * (1 - p))[:, None]).T @ Xb + l2 * np.diag(pen)
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-10:
            break
    return w


def load(set_dir, feature_dir):
    songs = []
    for tp in sorted(Path(set_dir).glob("*.json")):
        oz = Path(feature_dir) / f"{tp.stem}.oz.json"
        if "." in tp.stem or not oz.exists():
            continue
        t = json.loads(tp.read_text())
        o = json.loads(oz.read_text())
        beats = np.array(o["beats"])
        n = len(o["names"])
        X = np.array([f if f is not None else [np.nan] * n for f in o["features"]], float)
        beat = 60 / t["bpm"]
        y = np.zeros(len(beats))
        ignore = np.zeros(len(beats), bool)
        for d in t["drops"]:
            dist = np.abs(beats - d)
            j = dist.argmin()
            if dist[j] <= 0.5 * beat:
                y[j] = 1
            ignore |= (dist <= 2.2 * beat) & (y == 0)
        for u in t.get("belirsiz", []):
            ignore |= np.abs(beats - u) <= 1.0
        songs.append(dict(t=t, beats=beats, X=X, y=y, ignore=ignore, names=o["names"]))
    return songs


def standardized_fit(X, y, l2):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    v = fit_logistic((X - mu) / sd, y, l2)
    return v[0] - (v[1:] * mu / sd).sum(), v[1:] / sd


def peaks(song, bias, w):
    X = song["X"]
    ok = ~np.isnan(X).any(1)
    z = np.full(len(X), -np.inf)
    z[ok] = bias + X[ok] @ w
    chosen = []
    for i in np.argsort(-z):
        if not np.isfinite(z[i]) or z[i] < MIN_SCORE:
            break
        if all(abs(i - c) >= GAP for c in chosen):
            chosen.append(i)
    return chosen, z


def main():
    songs = load(sys.argv[1], sys.argv[2])
    names = songs[0]["names"]
    X = np.vstack([s["X"] for s in songs])
    y = np.concatenate([s["y"] for s in songs])
    ok = ~np.isnan(X).any(1) & ~np.concatenate([s["ignore"] for s in songs])
    bias, w = standardized_fit(X[ok], y[ok], 1.0)
    rows, labels = [], []
    for s in songs:
        chosen, z = peaks(s, bias, w)
        beat = 60 / s["t"]["bpm"]
        for i in chosen:
            t = s["beats"][i]
            if any(abs(t - u) <= 1 for u in s["t"].get("belirsiz", [])):
                continue
            rows.append(np.r_[z[i], s["X"][i]])
            labels.append(float(any(abs(t - m) <= beat for m in s["t"]["drops"])))
    rows = np.array(rows)
    c0, c = standardized_fit(rows, np.array(labels), 3.0)
    fmt = lambda xs: ", ".join(f"{x:.4}" for x in xs)
    print(f"const WEIGHTS: [f64; FEATURE_COUNT] = [{fmt(w)}];")
    print(f"const BIAS: f64 = {bias:.4};")
    print(f"const DECISION_WEIGHTS: [f64; FEATURE_COUNT] = [{fmt(c[1:])}];")
    print(f"const DECISION_SCORE: f64 = {c[0]:.4};")
    print(f"const DECISION_BIAS: f64 = {c0:.4};")
    print(f"\n{len(songs)} şarkı, {int(y.sum())} drop vuruşu, {int(ok.sum())} eğitim vuruşu, {len(rows)} aday")
    sd1 = X[ok].std(0)
    sd2 = rows.std(0)
    print("\n| Kanıt | 1. aşama ağırlığı | standart etki | 2. aşama ağırlığı | standart etki |")
    print("| --- | --- | --- | --- | --- |")
    for n, wi, s1, ci, s2 in zip(names, w, sd1, c[1:], sd2[1:]):
        print(f"| `{n}` | {wi:.3f} | {wi * s1:+.2f} | {ci:.3f} | {ci * s2:+.2f} |")
    print(f"| `z` (1. aşama puanı) | – | – | {c[0]:.3f} | {c[0] * sd2[0]:+.2f} |")


if __name__ == "__main__":
    main()
