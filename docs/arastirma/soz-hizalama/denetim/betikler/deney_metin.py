"""Metin tarafı karşı örnekleri (önbellekteki emisyonlar; model çalıştırılmaz)."""
import sys, json, re, numpy as np
import hiza, hiza2, jam, veri, duzelt
from hiza import KOK1
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "sonuc"; OUT.mkdir(exist_ok=True)
NUMW = {"tr": {"bir": "1", "iki": "2", "üç": "3", "dört": "4", "beş": "5", "on": "10", "yüz": "100", "bin": "1000"},
        "en": {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "ten": "10", "hundred": "100"},
        "de": {"eins": "1", "zwei": "2", "drei": "3", "vier": "4", "zehn": "10"},
        "es": {"uno": "1", "dos": "2", "tres": "3", "cuatro": "4", "diez": "10"},
        "fr": {"un": "1", "deux": "2", "trois": "3", "quatre": "4", "dix": "10"}}
def key(l): return " ".join(l).lower()
def songs(which):
    out = []
    if which in ("jamendo", "hepsi"):
        M = jam.meta()
        for sp in ["gelistirme", "dogrulama", "son_sinama"]:
            for sid in jam.split_ids(sp)[0]:
                lines, ls, wl = jam.song(sid)
                out.append(dict(set="jamendo", split=sp, sid=sid, lang=jam.LANG[M[sid]["Language"]], lines=lines, ls=ls,
                                em=f"omni300v2_karisim_{sid}", genre=M[sid]["Genre"], flags=(M[sid]["LyricOverlap"], M[sid]["Polyphonic"], M[sid]["NonLexical"])))
    if which in ("turkce", "hepsi"):
        for sp in ["gelistirme", "dogrulama", "son_sinama"]:
            for s in veri.makam(sp):
                out.append(dict(set="makam", split=sp, sid=s.sid, lang="tr", lines=s.lines, ls=s.line_starts, em=f"omni300v2_karisim_{s.sid}"))
            for p in sorted((KOK1 / "cache/vekil" / sp).glob("*.json")):
                lines, ls, wl, _ = veri.vekil(sp, p.stem)
                out.append(dict(set="vekil", split=sp, sid=p.stem, lang="tr", lines=lines, ls=ls, em=f"omni300v2_karisim_{p.stem}"))
    return out
def perturb(s, kind, pool):
    rng = np.random.default_rng(abs(hash((s["sid"], kind))) % 2**32)
    L, T, lang = [list(l) for l in s["lines"]], list(s["ls"]), s["lang"]
    items = list(zip(L, T))
    if kind == "tam": return items, lang
    if kind == "x2":
        out = []
        for i, (l, t) in enumerate(items):
            if out and out[-1][0] and key([w for w in out[-1][0] if w != "(x2)"]) == key(l) and out[-1][0][-1] != "(x2)":
                out[-1] = (out[-1][0] + ["(x2)"], out[-1][1]); continue
            out.append((l, t))
        return (out if len(out) < len(items) else None), lang
    if kind == "nakarat":
        seen, rep = set(), []
        for l, t in items: rep.append(key(l) in seen); seen.add(key(l))
        out, i, changed, first_done = [], 0, False, set()
        while i < len(items):
            if rep[i]:
                j = i
                while j < len(items) and rep[j]: j += 1
                if j - i >= 2: out += [(["[Nakarat]"], None), ([], None)]; changed = True; i = j; continue
            out.append(items[i]); i += 1
        if not changed: return None, lang
        # ilk geçişin önüne başlık + arkasına boş satır (web sitelerindeki gibi)
        firsts = {key(l) for (l, t), r in zip(items, rep) if not r}
        # ilk tekrar eden bloğun ilk geçişi: tekrarlanan satırlardan ilki
        reps = [key(l) for (l, t), r in zip(items, rep) if r]
        k0 = next(i for i, (l, t) in enumerate(out) if key(l) in reps)
        k1 = k0
        while k1 < len(out) and key(out[k1][0]) in reps: k1 += 1
        out = out[:k0] + [(["Nakarat:"], None)] + out[k0:k1] + [([], None)] + out[k1:]
        return out, lang
    if kind == "baslik":
        out = []
        for i, it in enumerate(items):
            if i % 4 == 0: out.append(([["[Kıta]"], ["[Nakarat]"], ["[Verse]"], ["Chorus:"]][(i // 4) % 4][0].split(), None))
            out.append(it)
        return out, lang
    if kind == "takas":
        m = len(items) // 2; items[m], items[m + 1] = items[m + 1], items[m]; return items, lang
    if kind == "rakam":
        nm, ch, out = NUMW[lang], False, []
        for l, t in items:
            nl = [nm.get(w.lower(), w) for w in l]; ch |= nl != l; out.append((nl, t))
        return (out if ch else None), lang
    if kind == "dil":
        if lang == "tr": return [([w.upper() for w in l], t) for l, t in items], "en"
        return items, "tr"
    if kind == "yarim": return items[: len(items) // 2], lang
    if kind == "ceviri":
        o = pool[int(rng.integers(len(pool)))]
        return items + [([], None)] + [(list(l), None) for l in o["lines"][:6]], lang
    if kind == "eksik10":
        keep = rng.random(len(items)) > 0.1; return [it for it, k in zip(items, keep) if k], lang
    raise ValueError(kind)
def run(lp, dt, items, lang, P):
    lines = [l for l, t in items]
    if P is None:
        first, wf, rng, sk, path, sc = hiza2.align(lp, lines, lang)
    else:
        a, b = P
        # satır cezası = a·harf + b (atlamayı yalnızca model satırı duymuyorsa)
        first, wf, rng, sk, path, sc = hiza2.align_pen(lp, lines, lang, a, b)
    # her satırın ilk kelimesinin zamanı
    out, k = [], 0
    for l in lines:
        t = None
        for w in l:
            if wf[k] >= 0 and t is None: t = first[wf[k]] * dt
            k += 1
        out.append(t)
    return out, sk

KINDS = ["tam", "x2", "nakarat", "baslik", "takas", "rakam", "dil", "yarim", "ceviri", "eksik10"]
_EM = {}
def em(k):
    if k not in _EM: _EM[k] = hiza.load_em(k)
    return _EM[k]
def evaluate(S, kinds, methods):
    res = {}
    for s in S:
        lp, dt = em(s["em"])
        pool = [o for o in S if o["set"] == s["set"] and o["sid"] != s["sid"] and o["lang"] != s["lang"]] or \
               [o for o in S if o["sid"] != s["sid"]]
        for kind in kinds:
            items, lang = perturb(s, kind, pool)
            if items is None: continue
            for mname, (norm, P) in methods.items():
                its = duzelt.normalize(items, lang) if norm else items
                pred, sk = run(lp, dt, its, lang, P)
                e = [abs(p - t) for (l, t), p in zip(its, pred) if t is not None and p is not None]
                miss = sum(1 for (l, t), p in zip(its, pred) if t is not None and p is None)
                res.setdefault(kind, {}).setdefault(mname, []).append(dict(sid=s["sid"], set=s["set"], e=e, kayip=miss))
    return res
def table(res):
    rows = []
    for kind, mm in res.items():
        for m, lst in mm.items():
            e = np.concatenate([np.array(x["e"]) for x in lst]) if lst else np.array([])
            per = [np.mean(x["e"]) for x in lst if x["e"]]
            rows.append((kind, m, len(lst), len(e), e.mean(), np.median(e), (e <= .3).mean() * 100, (e <= 1).mean() * 100, np.mean(per)))
    return rows
if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "ayar":   # yalnızca geliştirme setlerinde ceza ayarı
        S = [s for s in songs("hepsi") if s["split"] == "gelistirme"]
        grid = [None] + [(a, b) for a in [4.0, 6.0, 9.0, 13.0] for b in [10.0, 40.0]]
        methods = {str(P): (False, P) for P in grid}
        res = evaluate(S, ["tam", "baslik", "ceviri", "nakarat", "yarim"], methods)
        for r in table(res): print("%-8s %-12s şarkı %3d satır %5d ort %6.2f ortanca %5.3f ≤0,3 %5.1f ≤1 %5.1f şarkı-ort %6.2f" % r, flush=True)
    else:                # son sınama: önceden seçilmiş ayarla bir kez
        a, b = float(sys.argv[2]), float(sys.argv[3]); sp = sys.argv[4] if len(sys.argv) > 4 else "son_sinama"
        S = [s for s in songs("hepsi") if s["split"] == sp]
        methods = {"taban": (False, None), "duzelt": (True, None), "atla": (False, (a, b)), "duzelt+atla": (True, (a, b))}
        for st in ["jamendo", "makam", "vekil"]:
            res = evaluate([s for s in S if s["set"] == st], KINDS, methods)
            json.dump(res, open(OUT / f"metin_{st}_{sp}.json", "w"))
            for r in table(res): print(st, "%-8s %-12s şarkı %3d satır %5d ort %6.2f ortanca %5.3f ≤0,3 %5.1f ≤1 %5.1f şarkı-ort %6.2f" % r, flush=True)
# ikinci koşu (düzeltici hatası giderildikten sonra; yalnızca baslik ve nakarat)
def ikinci(sp, a=6.0, b=40.0):
    S = [s for s in songs("hepsi") if s["split"] == sp]
    methods = {"taban": (False, None), "duzelt": (True, None), "duzelt+atla": (True, (a, b))}
    for st in ["jamendo", "makam", "vekil"]:
        res = evaluate([s for s in S if s["set"] == st], ["baslik", "nakarat"], methods)
        json.dump(res, open(OUT / f"metin2_{st}_{sp}.json", "w"))
        for r in table(res): print(sp, st, "%-8s %-12s şarkı %3d satır %5d ort %6.2f ortanca %5.3f ≤0,3 %5.1f ≤1 %5.1f şarkı-ort %6.2f" % r, flush=True)
