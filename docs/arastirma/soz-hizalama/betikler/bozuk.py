"""Kullanıcının yapıştırdığı söz şarkıyla birebir aynı değilse: dayanıklılık denemesi.

Bozmalar (tohum = şarkı adının özeti; her şarkıda aynı):
  eksik  : ortadaki üçte birlikten art arda 3 satır metinden silinir (ör. "Nakarat x2" yazılıp tekrar yazılmamış)
  fazla  : başka bir şarkıdan 2 satır metne eklenir (söylenmeyen satır, ör. "[Nakarat]" başlığı ya da çeviri)
Ölçüm yalnızca metinde kalan, gerçekten söylenen satırlarda.
Kullanım: python bozuk.py <veri> <bölüm> <kaynak> <ceza1,ceza2,...>   (ceza "yok" = joker kapalı)
"""

import json
import sys

import numpy as np

import ayrim
import ctc
import ortak
from ortak import CACHE, _h


def perturb(song, kind, others):
    rng = np.random.default_rng(_h(song.sid + kind))
    n = len(song.lines)
    keep = list(range(n))
    lines = [list(l) for l in song.lines]
    truth = list(song.line_starts)
    if kind == "eksik":
        a = int(rng.integers(n // 3, max(n // 3 + 1, 2 * n // 3 - 3)))
        drop = set(range(a, min(n, a + 3)))
        keep = [i for i in range(n) if i not in drop]
        return [lines[i] for i in keep], [truth[i] for i in keep], [True] * len(keep)
    if kind == "fazla":
        o = others[int(rng.integers(0, len(others)))]
        extra = [list(o.lines[int(rng.integers(0, len(o.lines)))]) for _ in range(2)]
        a = int(rng.integers(n // 3, 2 * n // 3))
        new = lines[:a] + extra + lines[a:]
        tr = truth[:a] + [None, None] + truth[a:]
        return new, tr, [t is not None for t in tr]
    return lines, truth, [True] * n


def main():
    data, split, src, pens = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split(",")
    songs = ortak.dataset(data, split)
    out = {}
    for kind in ["tam", "eksik", "fazla"]:
        for pen in pens:
            errs, per = [], []
            for s in songs:
                others = [o for o in songs if o.sid != s.sid and o.lang == s.lang] or songs
                lines, truth, valid = perturb(s, kind, others)
                x = ayrim.vocals(s, src)
                lp, dt, _ = ctc.emissions(x, key=f"omni300v2_{src}_{s.sid}")
                star = pen != "yok"
                pred, conf, _ = ctc.align(lp, dt, lines, s.lang, star=star, star_pen=float(pen) if star else 0)
                e = [abs(p[0] - t) for p, t, v in zip(pred, truth, valid) if v]
                errs += e
                per.append(float(np.mean(e)))
            sm = ortak.summarize(errs)
            out[f"{kind}/{pen}"] = {**sm, "sarki_ort": float(np.mean(per))}
            print(kind, pen, {k: round(v, 3) for k, v in sm.items()}, "şarkı ort", round(float(np.mean(per)), 3), flush=True)
    (CACHE / "sonuc" / f"bozuk_{data}_{split}_{src}.json").write_text(json.dumps(out), encoding="utf-8")


if __name__ == "__main__":
    main()
