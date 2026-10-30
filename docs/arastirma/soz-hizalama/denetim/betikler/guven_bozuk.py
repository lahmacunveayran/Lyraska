import numpy as np, hiza, hiza2, guven2, deney_metin as dm
S = [s for s in dm.songs("hepsi") if s["split"] == "son_sinama"]
for kind in ["eksik10", "yarim", "nakarat", "takas"]:
    E, Pp = [], []
    for s in S:
        items, lang = dm.perturb(s, kind, [])
        if items is None: continue
        items = [it for it in items if it[0]]
        lines = [l for l, t in items]; lp, dt = dm.em(s["em"])
        F = guven2.line_features(lp, dt, lines, lang, tau=0.5)
        pred, sk = dm.run(lp, dt, items, lang, None)
        for j, ((l, t), p) in enumerate(zip(items, pred)):
            if t is None or p is None or j not in F: continue
            E.append(abs(p - t)); Pp.append(F[j]["post"])
    E, Pp = np.array(E), np.array(Pp); flag = Pp < 0.225; big = E > 1
    print(f"{kind:8s} satır {len(E)} büyük hata {big.sum()} | işaretli %{flag.mean()*100:.1f}, yakalanan {(flag&big).sum()}/{big.sum()}, işaretsizlerde >1 sn %{(E[~flag]>1).mean()*100:.1f}, ≤0,3 sn %{(E[~flag]<=.3).mean()*100:.1f} (tümü %{(E<=.3).mean()*100:.1f})")
