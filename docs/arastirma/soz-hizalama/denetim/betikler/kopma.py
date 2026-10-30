"""Kelimenin ilk harfi kelimenin geri kalanından kopuyor mu (CTC'de blank her şeyi yutabilir)?
İlk harf ile ikinci harfin ilk kareleri arası > 0,4 sn olan kelimeler ve hataları; düzeltme: ikinci harften geri say."""
import numpy as np, hiza, jam
M = jam.meta(); tot = det = 0; e_base, e_fix = [], []
for sp in ["son_sinama"]:
    for sid in jam.split_ids(sp)[0]:
        lines, ls, wl = jam.song(sid); lang = jam.LANG[M[sid]["Language"]]
        lp, dt = hiza.load_em(f"omni300v2_karisim_{sid}")
        lab, wf = hiza.build(lines, lang); first, path, _ = hiza.viterbi(lp, lab)
        truth = [t for r in wl for t in r]
        for k, f in enumerate(wf):
            if f < 0 or f + 1 >= len(lab) or lab[f + 1] == hiza.COL[" "]: continue
            tot += 1; g = (first[f + 1] - first[f]) * dt
            t0 = first[f] * dt; tf = t0 if g <= 0.4 else first[f + 1] * dt - 0.1
            e_base.append(abs(t0 - truth[k])); e_fix.append(abs(tf - truth[k]))
            if g > 0.4: det += 1
e_base, e_fix = np.array(e_base), np.array(e_fix)
print(f"kelime {tot}, ilk harfi > 0,4 sn kopuk {det} (%{det/tot*100:.1f})")
print(f"≤0,3 sn: taban %{(e_base<=.3).mean()*100:.2f}, düzeltilmiş %{(e_fix<=.3).mean()*100:.2f}; ortalama {e_base.mean():.3f} → {e_fix.mean():.3f}")
