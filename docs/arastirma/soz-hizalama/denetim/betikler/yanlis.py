import numpy as np, hiza, guven2, jam
M = jam.meta(); ids = jam.split_ids("son_sinama")[0]
by = {}
for s in ids: by.setdefault(jam.LANG[M[s]["Language"]], []).append(s)
right, wrong = [], []
for lang, L in by.items():
    for i, sid in enumerate(L[:5]):
        lp, dt = hiza.load_em(f"omni300v2_karisim_{sid}")
        for which, src in [("doğru", sid), ("yanlış", L[(i + 1) % len(L)])]:
            lines = jam.song(src)[0]
            F = guven2.line_features(lp, dt, lines, lang, tau=0.5)
            low = np.mean([f["post"] < 0.225 for f in F.values()])
            (right if which == "doğru" else wrong).append(low)
print("düşük güvenli satır oranı: doğru söz", np.round(sorted(right), 2))
print("                          yanlış söz", np.round(sorted(wrong), 2))
