"""Ses tarafı karşı örnekleri: model yeniden çalıştırılır. Sonuç: ../sonuc/ses_<deney>.json"""
import sys, json, numpy as np, time
import hiza, emisyon, veri
from hiza import KOK1
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "sonuc"; OUT.mkdir(exist_ok=True)
SR = 16000
def evaluate(lp, dt, lines, ls, wl, lang):
    lab, wf = hiza.build(lines, lang, True)
    first, path, sc = hiza.viterbi(lp, lab)
    wt = hiza.word_times(first, wf, dt)
    k, le, we = 0, [], []
    for i, l in enumerate(lines):
        p = wt[k:k + len(l)]; k += len(l)
        le.append(abs(p[0] - ls[i]))
        if wl is not None: we += [abs(a - b) for a, b in zip(p, wl[i])]
    return le, we
def summ(e):
    e = np.array(e); return dict(n=len(e), ort=float(e.mean()), ortanca=float(np.median(e)), p03=float((e<=.3).mean()*100), p1=float((e<=1).mean()*100)) if len(e) else {}
res = {}
def record(exp, cond, sid, le, we, extra=None):
    res.setdefault(exp, {}).setdefault(cond, []).append(dict(sid=sid, satir=le, kelime=we, **(extra or {})))
    print(f"{exp:10s} {cond:14s} {sid[:38]:38s} satır ort {np.mean(le):6.2f} ≤0,3 {np.mean(np.array(le)<=.3)*100:5.1f}%", flush=True)
    (OUT / "ses.json").write_text(json.dumps(res))

which = sys.argv[1:] if __name__ == "__main__" else []
if __name__ == "__main__" and not which: which = ["makam", "vekil", "jamendo"]
if "makam" in which:
    for split in ["dogrulama", "son_sinama"]:
        for s in veri.makam(split):
            ab = veri.makam_full(s)
            x = emisyon.load(s.audio)
            lp, dt = emisyon.emissions(x, key=f"makamtam_{s.sid}")
            le, _ = evaluate(lp, dt, s.lines, ab, None, "tr")
            record("makam", "tam_kayit", s.sid, le, [], dict(sure=len(x)/SR, birlesik=sum(d for a, d in s.segments)))
            # birinci ekibin koşulu (bölümler art arda) aynı kod ile: karşılaştırma için
            lp2, dt2 = hiza.load_em(f"omni300v2_karisim_{s.sid}")
            le2, _ = evaluate(lp2, dt2, s.lines, s.line_starts, None, "tr")
            record("makam", "birlesik", s.sid, le2, [])
if "vekil" in which:
    for name in ["vekil_0200", "vekil_0201", "vekil_0202", "vekil_0203"]:
        lines, ls, wl, wav = veri.vekil("son_sinama", name)
        x = emisyon.load(wav)
        intro = x[: int((ls[0] - 0.3) * SR)]
        loop = np.tile(intro, int(np.ceil(60 * SR / len(intro))))
        # 1) 60 sn enstrümantal giriş
        y = np.concatenate([loop[:60 * SR], x])
        le, we = evaluate(*emisyon.emissions(y, key=f"vk_giris60_{name}"), lines, [t + 60 for t in ls], [[t + 60 for t in r] for r in wl], "tr")
        record("vekil", "giris60", name, le, we)
        # 2) ortada 40 sn enstrümantal ara (orta satırın başından 0,15 sn önce)
        m = len(lines) // 2; cut = int((ls[m] - 0.15) * SR)
        y = np.concatenate([x[:cut], loop[:40 * SR], x[cut:]])
        sh = lambda t: t + 40 if t >= ls[m] - 0.15 else t
        le, we = evaluate(*emisyon.emissions(y, key=f"vk_ara40_{name}"), lines, [sh(t) for t in ls], [[sh(t) for t in r] for r in wl], "tr")
        record("vekil", "ara40", name, le, we)
        # 3) hızlı (rap benzeri) ve 4) yavaş (uzatılmış heceler)
        for f, c in [(1.6, "hizli1.6"), (0.6, "yavas0.6")]:
            y = emisyon.atempo(x, f)
            le, we = evaluate(*emisyon.emissions(y, key=f"vk_{c}_{name}"), lines, [t / f for t in ls], [[t / f for t in r] for r in wl], "tr")
            record("vekil", c, name, le, we)
if "jamendo" in which:
    for name in ["HILA_-_Give_Me_the_Same", "Keine_Lust_-_Jonny_M", "Esencia_-_NandoMalo_", "Drei_Nüsse_-_patrouille"]:
        lines, ls, wl, lang = veri.jamendo(name)
        x = emisyon.load(KOK1 / "dl/jamendolyrics/mp3" / f"{name}.mp3")
        v = np.load(KOK1 / "cache/ayrim/spleeter" / f"{name}.npy").astype(np.float32)
        n = min(len(x), len(v)); x, v = x[:n], v[:n]; acc = x - v
        for g in [-6, -12]:
            y = acc + v * 10 ** (g / 20)
            le, we = evaluate(*emisyon.emissions(y, key=f"jm_gomulu{g}_{name}"), lines, ls, wl, lang)
            record("jamendo", f"vokal{g}dB", name, le, we)
        for dly in [1.0, 2.5]:
            d = int(dly * SR); y = x.copy(); y[d:] += 0.7 * v[:-d]
            le, we = evaluate(*emisyon.emissions(y, key=f"jm_eko{dly}_{name}"), lines, ls, wl, lang)
            record("jamendo", f"geri_vokal{dly}s", name, le, we)
        le, we = evaluate(*hiza.load_em(f"omni300v2_karisim_{name}"), lines, ls, wl, lang)
        record("jamendo", "orijinal", name, le, we)
