"""Drop modelinin ağırlıklarını uydurur ve tür dışarıda bırakılarak (leave-one-genre-out) sınar.

Kullanım:
  cargo run --release --example drop_olcum -- <set> --oz <özellik klasörü>   # kanıtları yazar
  python3 docs/arastirma/drop/uydur.py <set> <özellik klasörü> [--cv]

<set>: `uret2.py`'nin ürettiği klasör (ad.json: doğru droplar); <özellik klasörü>: programın yazdığı
ad.oz.json (her vuruşun kanıtları). Yalnızca geliştirme seti (tohum 1–3) verilir.

1. aşama (sıralama): her vuruş için lojistik model. Pozitif: işaretli drop'a en yakın vuruş (yarım
   vuruş içinde); onun ±2 vuruş komşuları ve belirsiz geçişlerin ±1 sn'si eğitime girmez. L2 = 1.
2. aşama (karar): 1. aşamanın puanıyla 32 vuruşluk NMS'ten geçen adaylarda lojistik model. Pozitif: ±1
   vuruşta işaretli drop. Girdi [z, kanıtlar], L2 = 3.
İkisinde de:
- İşaret kısıtı: her kanıtın fiziksel yönü bellidir (SIGNS). Uydurulan ağırlık ters yöne düşerse o kanıt
  o aşamadan çıkarılır (ağırlığı 0) ve yeniden uydurulur. Üretecin bir alışkanlığı (ör. riser yüzünden
  drop'ta tizin düşmesi) böylece ters işaretli kanıt olarak modele sızamaz.
- Ölçü güveni bilinmeyen şarkı: her satır bir kez de `downbeat` = 0 ile (ölçü güveni 0) eğitime girer;
  sabit terim ölçü başı kanıtını yutmaz, ölçüsü bulunamayan şarkıda drop bastırılmaz.
--cv: her türü sırayla dışarıda bırakıp kalanlarla uydurur, dışarıdakini ölçer (isabet, yanlış, güvenin
kalibrasyonu, Brier, eşik tablosu). Ağırlıkların ve eşiğin seçimi bu ölçüme göre yapılır.
Araştırma seçenekleri: `--haric=a,b` (kanıtları dışarıda bırak; kanıt seçimi böyle yapıldı), `--kisit=a,b` (yalnızca
bunlarda işaret kısıtı), `--l2a=`, `--l2b=` (L2 cezaları).
Çıktı: Rust sabitleri (standartlaştırma geri alınmış: doğrudan ham kanıtlarla çarpılır) ve MODEL.md tabloları.
"""

import json
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

GAP = 32
L2_RANK = float(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--l2a=")), 1.0))
L2_DECISION = float(next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--l2b=")), 3.0))
MIN_SCORE = -12.0
# Kanıtların fiziksel yönü: +1 drop olasılığını artırmalı, −1 azaltmalı.
SIGNS = {"bass_jump": 1, "bass_far": 1, "gain": 1, "hi_jump": 1, "gap": 1, "accent": 1, "full": 1, "level": 1,
         "sustain": 1, "downbeat": 1, "inhomog": -1, "spec_step": 1, "peak_bass": 1, "peak_loud": 1}
DOWNBEAT = "downbeat"
# Aday kapısı (dB; `drop.rs`'teki MIN_BASS_RETURN_DB ile aynı): `--kapi=` ile denenir.
GATE = next((float(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--kapi=")), 3.0)
CONSTRAINED = set(next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--kisit=")), SIGNS))
# Araştırma: `--haric a,b` bu kanıtları dışarıda bırakır (Rust'taki kanıt listesini değiştirmeden denemek için).
EXCLUDED = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--haric=")), [])


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


def constrained_fit(X, y, l2, signs):
    """İşaret kısıtlı, L2 cezalı lojistik regresyon (standartlaştırılmış kanıtlarla; L-BFGS-B, sınırlı).

    `signs`: sütun başına +1 (ağırlık ≥ 0), −1 (ağırlık ≤ 0) ya da 0 (kısıtsız; `--kisit=` dışındakiler)."""
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = np.c_[np.ones(len(X)), (X - mu) / sd]

    def loss(v):
        m = Z @ v
        p = 1 / (1 + np.exp(-m))
        nll = np.sum(np.logaddexp(0, m) - y * m) + 0.5 * l2 * np.sum(v[1:] ** 2)
        g = Z.T @ (p - y) + l2 * np.r_[0, v[1:]]
        return nll, g

    bounds = [(None, None)] + [(None, None) if s_ == 0 else ((0, None) if s_ > 0 else (None, 0)) for s_ in signs]
    v = minimize(loss, np.zeros(Z.shape[1]), jac=True, method="L-BFGS-B", bounds=bounds,
                 options={"maxiter": 2000, "gtol": 1e-8}).x
    # Standartlaştırma geri alınır (sabit terim ham kanıtlara göre).
    ws = v[1:] / sd
    return v[0] - (ws * mu).sum(), ws


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
        keep = [j for j, name in enumerate(o["names"]) if name not in EXCLUDED]
        X = X[:, keep]
        o["names"] = [o["names"][j] for j in keep]
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
        songs.append(dict(name=tp.stem, t=t, beats=beats, X=X, y=y, ignore=ignore, names=o["names"]))
    return songs


def peaks(song, bias, w):
    X = song["X"]
    ok = ~np.isnan(X).any(1)
    if GATE is not None and "bass_jump" in song["names"]:
        # Aday kapısı: bas dönüşü (yakın ya da uzak pencereye göre) en az GATE dB.
        names = song["names"]
        jump = np.fmax(X[:, names.index("bass_jump")], X[:, names.index("bass_far")])
        ok &= np.nan_to_num(jump, nan=-1e9) >= GATE
    z = np.full(len(X), -np.inf)
    z[ok] = bias + X[ok] @ w
    chosen = []
    for i in np.argsort(-z):
        if not np.isfinite(z[i]) or z[i] < MIN_SCORE:
            break
        if all(abs(i - c) >= GAP for c in chosen):
            chosen.append(i)
    return chosen, z


def with_unknown_meter(X, names):
    """Satırların ölçü güveni bilinmeyen kopyası (downbeat = 0)."""
    U = X.copy()
    if DOWNBEAT in names:
        U[:, names.index(DOWNBEAT)] = 0.0
    return U


def candidate_rows(songs, bias, w):
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
    return np.array(rows), np.array(labels)


def fit(songs):
    names = songs[0]["names"]
    X = np.vstack([s["X"] for s in songs])
    y = np.concatenate([s["y"] for s in songs])
    ok = ~np.isnan(X).any(1) & ~np.concatenate([s["ignore"] for s in songs])
    X, y = X[ok], y[ok]
    X = np.vstack([X, with_unknown_meter(X, names)])
    y = np.r_[y, y]
    signs = [SIGNS[n] if n in CONSTRAINED else 0 for n in names]
    bias, w = constrained_fit(X, y, L2_RANK, signs)
    rows, labels = candidate_rows(songs, bias, w)
    rows = np.vstack([rows, np.c_[rows[:, :1], with_unknown_meter(rows[:, 1:], names)]])
    labels = np.r_[labels, labels]
    c0, c = constrained_fit(rows, labels, L2_DECISION, [1] + signs)
    return bias, w, c0, c


def predict(song, model):
    """Her aday için (vuruş zamanı, güven, doğru mu)."""
    bias, w, c0, c = model
    chosen, z = peaks(song, bias, w)
    beat = 60 / song["t"]["bpm"]
    out = []
    for i in chosen:
        t = song["beats"][i]
        if any(abs(t - u) <= 1 for u in song["t"].get("belirsiz", [])):
            continue
        p = 1 / (1 + np.exp(-(c0 + c[0] * z[i] + song["X"][i] @ c[1:])))
        out.append((t, p, any(abs(t - m) <= beat for m in song["t"]["drops"])))
    return out


def score(songs, preds, threshold):
    hits = marked = false = 0
    for s, pr in zip(songs, preds):
        beat = 60 / s["t"]["bpm"]
        shown = [t for t, p, _ in pr if p >= threshold]
        marked += len(s["t"]["drops"])
        hits += sum(any(abs(t - m) <= beat for t in shown) for m in s["t"]["drops"])
        false += sum(all(abs(t - m) > beat for m in s["t"]["drops"]) for t in shown)
    return hits, marked, false


def cross_validate(songs):
    kinds = sorted({s["t"]["tur"] for s in songs})
    preds = {}
    per_kind = []
    for k in kinds:
        train = [s for s in songs if s["t"]["tur"] != k]
        test = [s for s in songs if s["t"]["tur"] == k]
        model = fit(train)
        pr = [predict(s, model) for s in test]
        for s, p in zip(test, pr):
            preds[s["name"]] = p
        per_kind.append((k, *score(test, pr, THRESHOLD)))
    pr = [preds[s["name"]] for s in songs]
    print(f"\nTür dışarıda bırakılarak (her tür, kendisi hiç görülmeden; eşik {THRESHOLD}):")
    print("| Tür | İsabet ±1 vuruş | Yanlış |")
    print("| --- | --- | --- |")
    for k, h, m, f in per_kind:
        print(f"| {k} | {h}/{m} | {f} |" if m else f"| {k} | – | {f} |")
    h, m, f = score(songs, pr, THRESHOLD)
    print(f"| **Toplam** | {h}/{m} | {f} |")
    print("\n| Eşik | İsabet | Yanlış |")
    print("| --- | --- | --- |")
    for thr in (0.3, 0.4, 0.5, 0.6, 0.7):
        h, m, f = score(songs, pr, thr)
        print(f"| {thr} | {h}/{m} | {f} |")
    cands = [(p, y) for p_list in pr for _, p, y in p_list if p >= 0.05]
    ps = np.array([p for p, _ in cands])
    ys = np.array([y for _, y in cands], float)
    brier = np.mean((ps - ys) ** 2)
    base = np.mean((ys.mean() - ys) ** 2)
    print(f"\nKalibrasyon (güveni ≥ 0,05 olan {len(ps)} aday): Brier {brier:.3f} (sabit tahmin {base:.3f})")
    print("| Güven | Aday | Gerçekten drop | Ortalama güven |")
    print("| --- | --- | --- | --- |")
    for lo, hi in ((0.05, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)):
        m = (ps >= lo) & (ps < hi)
        if m.any():
            print(f"| {lo:.2f}–{min(hi, 1):.2f} | {m.sum()} | %{100 * ys[m].mean():.0f} | {ps[m].mean():.2f} |")


THRESHOLD = 0.6


def main():
    songs = load(sys.argv[1], sys.argv[2])
    names = songs[0]["names"]
    bias, w, c0, c = fit(songs)
    fmt = lambda xs: ", ".join(f"{x:.4}" for x in xs)
    print(f"const WEIGHTS: [f64; FEATURE_COUNT] = [{fmt(w)}];")
    print(f"const BIAS: f64 = {bias:.4};")
    print(f"const DECISION_WEIGHTS: [f64; FEATURE_COUNT] = [{fmt(c[1:])}];")
    print(f"const DECISION_SCORE: f64 = {c[0]:.4};")
    print(f"const DECISION_BIAS: f64 = {c0:.4};")
    X = np.vstack([s["X"] for s in songs])
    ok = ~np.isnan(X).any(1)
    sd1 = X[ok].std(0)
    rows, _ = candidate_rows(songs, bias, w)
    sd2 = rows.std(0)
    print(f"\n{len(songs)} şarkı, {int(sum(s['y'].sum() for s in songs))} drop vuruşu, {len(rows)} aday")
    print("\n| Kanıt | Yön | 1. aşama ağırlığı | standart etki | 2. aşama ağırlığı | standart etki |")
    print("| --- | --- | --- | --- | --- | --- |")
    for n, wi, s1, ci, s2 in zip(names, w, sd1, c[1:], sd2[1:]):
        print(f"| `{n}` | {'+' if SIGNS[n] > 0 else '−'} | {wi:.3f} | {wi * s1:+.2f} | {ci:.3f} | {ci * s2:+.2f} |")
    print(f"| `z` (1. aşama puanı) | + | – | – | {c[0]:.3f} | {c[0] * sd2[0]:+.2f} |")
    if "--cv" in sys.argv:
        cross_validate(songs)


if __name__ == "__main__":
    main()
