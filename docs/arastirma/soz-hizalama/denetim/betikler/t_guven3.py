import numpy as np, hiza, hiza2, jam, guven2
name = "Pure_Mids_-_The_Leader"
lines, ls, wl = jam.song(name); lp, dt = hiza.load_em(f"omni300v2_karisim_{name}")
lab, wf, rng = hiza2.build_lines(lines, "en"); L=len(lab); S=2*L+1
emit = np.zeros(S, np.int64); emit[1::2] = lab
skip_ok = np.zeros(S, np.bool_); skip_ok[3::2] = lab[1:] != lab[:-1]
first, _, _, _, path, _ = hiza2.align(lp, lines, "en")
tg = np.array([2*rng[j][0]+1 for j in range(4)])
for tau in [1.0, 0.5, 0.2]:
    P = guven2.entry_post(np.ascontiguousarray(lp*tau), emit, skip_ok, tg)
    print(tau, [(int(first[rng[j][0]]), int(P[j].argmax()), round(float(P[j].sum()),3), round(float(P[j].max()),3)) for j in range(4)], "gerçek", [round(x/dt) for x in ls[:4]])
