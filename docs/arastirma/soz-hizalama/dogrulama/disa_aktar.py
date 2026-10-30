"""Rust hizalayıcıyı Python'daki ölçülen yöntemle karşılaştırmak için: her şarkının emisyonu (f32),
söz satırları (küçük harf), doğru satır başları ve Python'un sonuçları (satır atlamalı yerleşim, güven)."""
import sys, json, numpy as np
from pathlib import Path
sys.path.insert(0, "/tmp/claude-0/-home-user-Lyraska/4262c203-a61e-5ac0-b0bb-3cada8e7b304/scratchpad/soz-hizalama-denetim/betikler")
import hiza, hiza2, guven2, deney_metin as dm
OUT = Path(__file__).resolve().parent / "out"
S = dm.songs("hepsi")
json.dump({"chars": hiza.COLS_CHARS}, open(OUT / "vocab.json", "w"), ensure_ascii=False)
index = []
for n, s in enumerate(S):
    lp, dt = dm.em(s["em"])
    lines = [[w.replace("I", "ı").replace("İ", "i").lower() if s["lang"] == "tr" else w.lower() for w in l] for l in s["lines"]]
    first, wf, rng, skipped, path, score = hiza2.align_pen(lp, s["lines"], s["lang"], 6.0, 40.0)
    F = guven2.line_features(lp, dt, s["lines"], s["lang"], tau=0.5)
    starts = [float(first[r[0]] * dt) if r is not None else None for r in rng]
    conf = [F[j]["post"] if j in F else None for j in range(len(rng))]
    name = f"{n:03d}"
    lp.astype(np.float32).tofile(OUT / f"{name}.f32")
    json.dump(dict(set=s["set"], split=s["split"], sid=s["sid"], lang=s["lang"], frames=int(lp.shape[0]), cols=int(lp.shape[1]), dt=float(dt),
                   lines=lines, truth=[float(x) for x in s["ls"]], py_start=starts, py_skipped=[bool(x) for x in skipped], py_conf=conf),
              open(OUT / f"{name}.json", "w"), ensure_ascii=False)
    index.append(name)
json.dump(index, open(OUT / "index.json", "w"))
print(len(index), "şarkı")
