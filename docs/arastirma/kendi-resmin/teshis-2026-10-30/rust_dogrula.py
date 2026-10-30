# model.py ↔ gerçek Rust (spectrum.rs) çıktısı: aynı anlarda 200 çubuk seviyesi farkı.
import json, numpy as np
from model import *
R = json.load(open('veri/tam-rust60.json')); lv = np.array(R['levels']); g = 10 ** (R['gain_db'] / 20)
idx = np.arange(1200, 2400, 37)              # 20–40 s
t = R['t0'] + idx / 60
# Rust: pencere [⌊t·sr+2048⌋−4095, ⌊t·sr+2048⌋] → merkez ⌊t·sr+2048⌋−2047,5; model round(c)−2048 başlangıç
P = levels(amps('tam', t + (np.floor(t * SR + 2048) - 2048 - t * SR) / SR, 0), g)
d = np.abs(P - lv[idx])
print(f'{len(idx)} kare × 200 çubuk: en büyük fark {d.max():.2e}, ortalama {d.mean():.2e}; seviye ortalaması {lv[idx].mean():.4f}')
