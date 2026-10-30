import numpy as np, time, hiza, jam, guven2
name = "Pure_Mids_-_The_Leader"
lines, ls, wl = jam.song(name); lp, dt = hiza.load_em(f"omni300v2_karisim_{name}")
t = time.time(); F = guven2.line_features(lp, dt, lines, "en", tau=0.5); print("süre", time.time() - t)
lab, wf = hiza.build(lines, "en"); first, _, _ = hiza.viterbi(lp, lab); wt = hiza.word_times(first, wf, dt)
k = 0
for j, l in enumerate(lines):
    e = abs(wt[k] - ls[j]); k += len(l)
    f = F[j]; print(f"{j:3d} hata {e:6.2f} post {f["post"]:.2f} p1 {f["post1"]:.2f} heard {f['heard']:.2f} gap {f['gap']:6.2f} hız {f['rate']:5.1f}")
