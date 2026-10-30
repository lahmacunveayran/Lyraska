"""cache/sonuc/*.json → Markdown tabloları (rapor için).

Kullanım: python tablo.py [bölüm ...]   (varsayılan: gelistirme dogrulama)
"""

import json
import sys

import numpy as np

from ortak import CACHE


def fmt(x, d=2):
    return "—" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{d}f}".replace(".", ",")


def row(r):
    s, w = r.get("satir", {}), r.get("kelime", {})
    secs = [x.get("toplam_sn", 0) for x in r["sarkilar"]]
    audio = [x.get("ses_sn", 0) for x in r["sarkilar"]]
    rtf = sum(secs) / max(sum(audio), 1e-9)
    return (
        f"| {r['yontem']} | {len(r['sarkilar'])} | {fmt(s.get('ort'))} | {fmt(s.get('ortanca'))} | "
        f"{fmt(s.get('%0.3'), 1)} | {fmt(s.get('%1'), 1)} | {fmt(w.get('ort'))} | {fmt(w.get('ortanca'))} | "
        f"{fmt(w.get('%0.3'), 1)} | {fmt(w.get('%1'), 1)} | {fmt(r.get('satir_sarki_ort'))} |"
    )


def main():
    splits = sys.argv[1:] or ["gelistirme", "dogrulama"]
    files = sorted((CACHE / "sonuc").glob("*.json"))
    for data in ["jamendo", "makam", "vekil"]:
        for sp in splits:
            rs = [json.loads(f.read_text(encoding="utf-8")) for f in files if f.name.startswith(f"{data}_{sp}_")]
            if not rs:
                continue
            print(f"\n### {data} / {sp}\n")
            print(
                "| Yöntem | Şarkı | Satır ort. (sn) | Satır ortanca | Satır ≤0,3 sn % | Satır ≤1 sn % | "
                "Kelime ort. | Kelime ortanca | Kelime ≤0,3 % | Kelime ≤1 % | Şarkı başına satır ort. |"
            )
            print("|---|---|---|---|---|---|---|---|---|---|---|")
            for r in sorted(rs, key=lambda r: r["yontem"]):
                print(row(r))


if __name__ == "__main__":
    main()
