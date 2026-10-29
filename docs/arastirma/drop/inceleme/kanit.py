"""Gerçek drop vuruşlarında kanıtlar ve 2. aşama logitine katkıları (drop.rs sabitleri).
Kullanım: kanit.py <oz klasörü> <set klasörü> [tür,...]"""
import json
import math
import sys
from pathlib import Path

W = [0.1738, -0.02596, -0.09134, -0.1424, -0.01309, 0.1859, 0.2815, 0.1438, 5.042, 3.838, -1.118, 0.3679]
B = -11.64
DW = [0.04252, 0.06307, 0.09696, -0.1121, 0.01125, 0.07967, 0.1218, 0.1381, 3.57, 2.307, -0.3117, -0.01409]
DS, DB = 0.2259, -6.419
oz, folder = Path(sys.argv[1]), Path(sys.argv[2])
only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
rows = []
for f in sorted(oz.glob("*.oz.json")):
    name = f.name[: -len(".oz.json")]
    truth = json.loads((folder / f"{name}.json").read_text())
    if only and truth["tur"] not in only:
        continue
    d = json.loads(f.read_text())
    beats, feats, names = d["beats"], d["features"], d["names"]
    for t in truth["drops"]:
        i = min(range(len(beats)), key=lambda k: abs(beats[k] - t))
        x = feats[i]
        if x is None:
            print(f"{name} {t:.2f}: vuruş {i} — pencere sığmıyor (aday olamaz)")
            continue
        z = B + sum(w * v for w, v in zip(W, x))
        logit = DB + DS * z + sum(w * v for w, v in zip(DW, x))
        p = 1 / (1 + math.exp(-logit))
        rows.append((name, truth["tur"], x, z, p))
        print(f"{name} {t:.2f} vuruş {i}: z {z:.1f} güven {p:.2f} | " +
              " ".join(f"{n}={v:.1f}" for n, v in zip(names, x)))
if rows:
    print("ortalama kanıt:", " ".join(f"{n}={sum(r[2][j] for r in rows) / len(rows):.2f}" for j, n in enumerate(names)))
    print(f"ortalama z {sum(r[3] for r in rows) / len(rows):.2f}, güven {sum(r[4] for r in rows) / len(rows):.2f}")
