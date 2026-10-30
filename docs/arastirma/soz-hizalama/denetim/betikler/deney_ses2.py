"""Ek ses karşı örnekleri (gerçek müzik): başka şarkının vokalli 30 sn'si başa (konuşma/skeç/başka şarkı),
şarkının kendi eşliğinden 40 sn ortaya (gitar solosu gibi enstrümantal ara)."""
import json, numpy as np
import hiza, emisyon, veri
from hiza import KOK1
from deney_ses import evaluate, SR, OUT
res = {}
def record(exp, cond, sid, le, we):
    res.setdefault(exp, {}).setdefault(cond, []).append(dict(sid=sid, satir=le, kelime=we))
    print(f"{exp:10s} {cond:16s} {sid[:38]:38s} satır ort {np.mean(le):6.2f} ≤0,3 {np.mean(np.array(le)<=.3)*100:5.1f}%", flush=True)
    (OUT / "ses2.json").write_text(json.dumps(res))
names = ["HILA_-_Give_Me_the_Same", "Keine_Lust_-_Jonny_M", "Esencia_-_NandoMalo_", "Drei_Nüsse_-_patrouille"]
other = {n: names[(i + 1) % 4] for i, n in enumerate(names)}
for name in names:
    lines, ls, wl, lang = veri.jamendo(name)
    x = emisyon.load(KOK1 / "dl/jamendolyrics/mp3" / f"{name}.mp3")
    v = np.load(KOK1 / "cache/ayrim/spleeter" / f"{name}.npy").astype(np.float32); n = min(len(x), len(v)); x, v = x[:n], v[:n]
    acc = x - v
    ol, ols, _, _ = veri.jamendo(other[name]); ox = emisyon.load(KOK1 / "dl/jamendolyrics/mp3" / f"{other[name]}.mp3")
    a = int(ols[len(ols) // 2] * SR); pre = ox[a:a + 30 * SR]
    y = np.concatenate([pre, x])
    le, we = evaluate(*emisyon.emissions(y, key=f"jm_yabanci30_{name}"), lines, [t + 30 for t in ls], [[t + 30 for t in r] for r in wl], lang)
    record("jamendo2", "yabanci_giris30", name, le, we)
    m = len(lines) // 2; cut = int((ls[m] - 0.15) * SR); mid = len(acc) // 2
    y = np.concatenate([x[:cut], acc[mid:mid + 40 * SR], x[cut:]])
    sh = lambda t: t + 40 if t >= ls[m] - 0.15 else t
    le, we = evaluate(*emisyon.emissions(y, key=f"jm_enstara40_{name}"), lines, [sh(t) for t in ls], [[sh(t) for t in r] for r in wl], lang)
    record("jamendo2", "enst_ara40", name, le, we)
