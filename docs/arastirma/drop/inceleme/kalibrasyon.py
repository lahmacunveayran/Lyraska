"""Güvenin kalibrasyonu: drop_olcum --ayrinti çıktısındaki 'yeni'/'eski' adaylar (güven ≥ 0,2), etiket: ±1 vuruşta
işaretli drop. Belirsiz (±1 sn) adaylar atılır. Kullanım: kalibrasyon.py <olcum.txt> <set klasörü> [eski|yeni]"""
import json
import re
import sys
from pathlib import Path

text, folder = Path(sys.argv[1]).read_text(), Path(sys.argv[2])
method = sys.argv[3] if len(sys.argv) > 3 else "yeni"
rows = []
for line in text.splitlines():
    m = re.match(rf"{method} (\S+): .*bulunan (.*?) · ±vuruş", line)
    if not m:
        continue
    truth = json.loads((folder / f"{m.group(1)}.json").read_text())
    beat = 60 / truth["bpm"]
    for t, c in re.findall(r"([\d.]+)\(([\d.]+)\)", m.group(2)):
        t, c = float(t), float(c)
        if any(abs(t - u) <= 1 for u in truth.get("belirsiz", [])):
            continue
        y = any(abs(t - d) <= beat + 1e-9 for d in truth["drops"])
        rows.append((c, y, truth["tur"]))
n = len(rows)
brier = sum((c - y) ** 2 for c, y, _ in rows) / max(n, 1)
base = sum(y for _, y, _ in rows) / max(n, 1)
print(f"{method}: aday {n}, doğru oranı {base:.2f}, Brier {brier:.3f} (sabit tahminle {base * (1 - base):.3f})")
print("| Güven aralığı | Aday | Ortalama güven | Gerçek drop oranı |")
print("| --- | --- | --- | --- |")
for lo, hi in ((0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 0.9), (0.9, 1.01)):
    b = [(c, y) for c, y, _ in rows if lo <= c < hi]
    if b:
        print(f"| {lo:.1f}–{min(hi, 1):.1f} | {len(b)} | {sum(c for c, _ in b) / len(b):.2f} | "
              f"{sum(y for _, y in b) / len(b):.2f} |")
