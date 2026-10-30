import numpy as np, hiza, hiza2, jam, time
name="HILA_-_Give_Me_the_Same"
lines, ls, wl = jam.song(name); lp, dt = hiza.load_em(f"omni300v2_karisim_{name}")
lab, wf = hiza.build(lines, "en"); f1, _, s1 = hiza.viterbi(lp, lab)
t=time.time(); f2, wf2, rng, sk, path, s2 = hiza2.align(lp, lines, "en"); print("süre", time.time()-t)
print("aynı ilk kareler:", (f1==f2).all(), s1, s2)
t=time.time(); f3, _, _, sk3, _, s3 = hiza2.align(lp, lines, "en", P=20.0); print("atlamalı süre", time.time()-t, "atlanan", sum(sk3), "aynı", (f1==f3).mean())
# yapay: başa ve ortaya söylenmeyen 3 satır ekle
other = jam.song("Keine_Lust_-_Jonny_M")[0]
bad = other[:2] + lines[:10] + other[5:7] + lines[10:]
f4, wf4, rng4, sk4, _, _ = hiza2.align(lp, bad, "en", P=20.0); print("eklenen satırlar atlandı mı:", sk4[:2], sk4[12:14], "diğer atlanan", sum(sk4)-sum(sk4[:2])-sum(sk4[12:14]))
