# Gerçek Rust çıktısından (60 kare/sn) arayüzün gösterdiği seviyeler: stepBars (τ = 20 ms, dt = 1/60)
# 60 kare/sn'de ilerletilir, video karelerinin anında (30 kare/sn, T0..T1) örneklenir.
# Kullanım: python3 seviyeler.py <rust.json> <T0> <T1> <çıktı.json> [kazanç çarpanı]
import json, sys
import numpy as np
R = json.load(open(sys.argv[1])); T0, T1 = float(sys.argv[2]), float(sys.argv[3])
mul = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
lv = np.clip(np.array(R['levels']) * mul, 0, 1)
keep = np.exp(-(1 / 60) / 0.02)
out = np.zeros_like(lv); prev = np.zeros(lv.shape[1])
for i in range(len(lv)):
    prev = np.where(lv[i] >= prev, lv[i], lv[i] + (prev - lv[i]) * keep); out[i] = prev
ts = np.arange(T0, T1 + 1e-9, 1 / 30)
idx = np.round((ts - R['t0']) * 60).astype(int)
json.dump({'t': ts.tolist(), 'levels': out[idx].round(5).tolist()}, open(sys.argv[4], 'w'))
print(len(ts), 'kare')
