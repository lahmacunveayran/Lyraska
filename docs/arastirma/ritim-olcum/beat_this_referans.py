"""Ritim modelinin (`src-tauri/src/analysis/rhythm_model.rs`) testlerindeki referans değerleri üretir: torchaudio log-mel ve Beat This bölme / son işlem (pip `beat-this` 1.1.0, `torchaudio`)."""
import math, numpy as np, torch, torchaudio
from beat_this.preprocessing import LogMelSpect
from beat_this.inference import split_piece
from beat_this.model.postprocessor import Postprocessor
sr = 22050
N = 3 * sr
n = np.arange(N, dtype=np.float64)
x = (0.5 * np.sin(2 * math.pi * 440 * n / sr) + 0.25 * np.sin(2 * math.pi * 3000 * n / sr + 1.0)
     + 0.1 * np.sin(2 * math.pi * 60 * n / sr))
x[(n.astype(int) % 11025) == 100] += 0.9
spec = LogMelSpect()(torch.tensor(x, dtype=torch.float32)).numpy()
print("şekil", spec.shape)
for f in [0, 1, 75, 150]:
    print(f, [f"{spec[f, b]:.6f}" for b in [0, 1, 10, 64, 100, 127]])
fb = torchaudio.functional.melscale_fbanks(513, 30, 11000, 128, sr, None, "slaney").numpy()
for b in [0, 1, 64, 127]:
    nz = np.nonzero(fb[:, b])[0]
    print("süzgeç", b, "kutu", nz.min(), nz.max(), "tepe", fb[:, b].max(), "kutu 5:", fb[5, b])
# Kısa sinyal (kare sayısı)
for L in [513, 1000, 22050]:
    print("uzunluk", L, "kare", LogMelSpect()(torch.zeros(L)).shape[0])
# Bölme
for L in [100, 1488, 1500, 3000, 5000]:
    _, starts = split_piece(torch.zeros(L, 128), 1500, 6)
    print("bölme", L, list(map(int, starts)))
# Son işlem
pp = Postprocessor("minimal")
T = 60
b = torch.full((T,), -5.0); d = torch.full((T,), -5.0)
b[5] = 2.0; b[10] = 1.0; b[11] = 1.0; b[20] = 3.0; b[22] = 2.5; b[30] = -0.5; b[40] = 1.0; b[41] = 1.0; b[42] = 1.0; b[50] = 0.1
d[6] = 1.0; d[39] = 2.0; d[45] = 0.5
bt, dt = pp(b, d)
print("vuruş", list(bt), "ölçü başı", list(dt))
