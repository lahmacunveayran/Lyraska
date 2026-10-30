# Kaydın sesini tam videonun sesinde bulur (ham dalga çapraz ilintisi, normalize). Çıktı: kaydın ses örneği 0'ın
# tam videodaki zamanı (s) ve tepe ilintisi. Kullanım: python3 hizala.py <ad> <ara_başı_s> <ara_sonu_s>
import sys, json
import numpy as np
from scipy.signal import correlate
from model import audio, SR, meta
v, a0, a1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
x = audio(v); y = audio('tam')[int(a0 * SR):int(a1 * SR)]
c = correlate(y, x, 'valid', method='fft')
e = np.sqrt(np.convolve(y ** 2, np.ones(len(x)), 'valid')) * np.sqrt((x ** 2).sum())
r = c / np.maximum(e, 1e-12)
i = np.argmax(np.abs(r)); off = a0 + i / SR
json.dump({'offset': off, 'r': float(r[i])}, open(f'veri/{v}-hiza.json', 'w'))
print(f'{v}: kayıt sesinin 0. örneği tam videoda {off:.4f} s (video saati {off + meta(v)["audio_start"]:.4f} − kayıt ses başı); r={r[i]:.3f}; ikinci en iyi |r| {np.sort(np.abs(r))[-200]:.3f}')
