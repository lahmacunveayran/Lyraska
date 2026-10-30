"""Birinci ekibin Jamendo sayılarını bağımsız kodla yeniden ölçer (önbellekteki emisyonlardan)."""
import sys, json, numpy as np
import hiza, jam
M = jam.meta()
def run(split, sep=True, names=None):
    ids, theirs = jam.split_ids(split)
    if names: ids = [i for i in ids if i in names]
    L, W, per = [], [], {}
    for sid in ids:
        lines, ls, wl = jam.song(sid)
        lang = jam.LANG[M[sid]["Language"]]
        lp, dt = hiza.load_em(f"omni300v2_karisim_{sid}")
        lab, wf = hiza.build(lines, lang, sep)
        first, path, sc = hiza.viterbi(lp, lab)
        wt = hiza.word_times(first, wf, dt)
        k = 0; le, we = [], []
        for l, s0, ws in zip(lines, ls, wl):
            p = wt[k:k + len(l)]; k += len(l)
            le.append(abs(p[0] - s0)); we += [abs(a - b) for a, b in zip(p, ws)]
        L += le; W += we
        per[sid] = (np.mean(le), np.mean(we), theirs[sid]["satir_ort"], theirs[sid]["kelime_ort"])
    L, W = np.array(L), np.array(W)
    return per, dict(n_satir=len(L), satir_ort=L.mean(), satir_ortanca=np.median(L), satir03=(L<=.3).mean()*100,
                     n_kel=len(W), kel_ort=W.mean(), kel_ortanca=np.median(W), kel03=(W<=.3).mean()*100,
                     sarki_satir_ort=np.mean([v[0] for v in per.values()]))
if __name__ == "__main__":
    split = sys.argv[1]; sep = sys.argv[2] == "sep" if len(sys.argv) > 2 else True
    per, tot = run(split, sep)
    for k, v in per.items(): print(f"{k[:40]:40s} benim satır {v[0]:7.3f} kelime {v[1]:7.3f} | onların {v[2]:7.3f} {v[3]:7.3f}")
    print(json.dumps({k: round(float(v), 4) for k, v in tot.items()}))
