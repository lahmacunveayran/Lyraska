"""F-ölçüsü: Lyraska'nın eski (en yakın, açgözlü) ve yeni (en erken boş tahmin) eşleştirmesi mir_eval'e karşı."""
# Çalıştırma: pip install mir_eval==0.8.2 numpy; python -I f_olcusu.py (beklenen çıktı: eski 682 farklı, yeni 0).
import random
import numpy as np
import mir_eval

def old(est, truth, tol):
    used = [False] * len(est); start = 0; hits = 0
    for t in truth:
        while start < len(est) and est[start] < t - tol: start += 1
        cand = [i for i in range(start, len(est)) if est[i] <= t + tol]
        # take_while: dur ilk aşan tahminde
        c = []
        for i in range(start, len(est)):
            if est[i] <= t + tol: c.append(i)
            else: break
        c = [i for i in c if not used[i]]
        if c:
            i = min(c, key=lambda i: abs(est[i] - t)); used[i] = True; hits += 1
    return f(hits, est, truth)

def new(est, truth, tol):
    nxt = 0; hits = 0
    for t in truth:
        while nxt < len(est) and est[nxt] < t - tol: nxt += 1
        if nxt < len(est) and est[nxt] <= t + tol: hits += 1; nxt += 1
    return f(hits, est, truth)

def f(hits, est, truth):
    if not est or not truth or hits == 0: return 0.0
    p = hits / len(est); r = hits / len(truth); return 2 * p * r / (p + r)

def ref(est, truth, tol):
    if not est or not truth: return 0.0
    m = mir_eval.util.match_events(np.array(truth), np.array(est), tol)
    return f(len(m), est, truth)

print("el hesabı örneği: eski", old([0.94, 1.05], [1.0, 1.1], 0.07), "yeni", new([0.94, 1.05], [1.0, 1.1], 0.07),
      "mir_eval", ref([0.94, 1.05], [1.0, 1.1], 0.07))
print("tam sınır (0,0625): yeni", new([1.0625, 1.9375], [1.0, 2.0], 0.0625), "mir_eval", ref([1.0625, 1.9375], [1.0, 2.0], 0.0625))
rng = random.Random(1)
diff_old = diff_new = 0; n = 20000
for _ in range(n):
    k = rng.randint(1, 12); m = rng.randint(1, 12)
    truth = sorted(rng.uniform(0, 1.5) for _ in range(k)); est = sorted(rng.uniform(0, 1.5) for _ in range(m))
    r = ref(est, truth, 0.07)
    diff_old += abs(old(est, truth, 0.07) - r) > 1e-12
    diff_new += abs(new(est, truth, 0.07) - r) > 1e-12
print(f"{n} rastgele girdi (sık vuruş, 0–1,5 sn'de 1–12 vuruş): eski {diff_old} farklı, yeni {diff_new} farklı")
