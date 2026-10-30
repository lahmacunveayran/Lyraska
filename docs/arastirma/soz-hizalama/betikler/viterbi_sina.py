"""ctc.align'ın küçük sınaması: doğru yolu bilinen yapay olasılık matrisi (tekrar eden harf dahil)."""
import numpy as np
import ctc
chars, _ = ctc.columns()
idx = {c: i + 1 for i, c in enumerate(chars)}
lines = [["anne", "gel"], ["ışık", "İz"]]
# hedef: her harf 3 kare, harfler arası 2 kare boşluk, kelimeler arası boşluk simgesi
seq, truth, t = [], [], 0
def put(k, n):
    global t
    for _ in range(n): seq.append(k)
    t += n
put(0, 10)
for li, line in enumerate(lines):
    for wi, w in enumerate(line):
        if li or wi:
            put(idx[" "], 2); put(0, 2)
        truth.append(t * 0.02)
        for c in ctc.lower(w, "tr"):
            put(idx[c], 3); put(0, 2)
    put(0, 15)
T = len(seq); K = len(chars) + 1
lp = np.full((T, K), np.log(0.01 / (K - 1)), dtype=np.float32)
lp[np.arange(T), seq] = np.log(0.99)
starts, conf, score = ctc.align(lp, 0.02, lines, "tr")
got = [s for row in starts for s in row]
print("doğru", np.round(truth, 2)); print("bulunan", np.round(got, 2))
assert np.allclose(got, truth), "HATA"
print("tamam: tekrar eden harf (nn), Türkçe ı/İ, kelime arası boşluk")
