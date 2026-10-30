# Bir karede ölçülen boy (yeşil nokta) ile modelin (kaydın sesi, global kazanç) boyu (mavi çizgi) üst üste.
# Kullanım: python3 kare_cizim.py <ad> <kare> <TOP> <çıktı.png> [x0 x1]
import sys
import numpy as np
from PIL import Image, ImageDraw
from benzetim import sim
from model import HGT
v, f, TOP, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
a = np.load(f'veri/{v}-crop.npy', mmap_mode='r')
t, Em, P, A, g = sim(v)
W = a.shape[2]; N = 200; p = W / (N - 1)
im = Image.fromarray(np.array(a[f])).convert('RGB'); d = ImageDraw.Draw(im)
for k in range(N):
    x = k * p
    y = TOP + P[f, k] * HGT[v]
    d.line([(x + 2, TOP), (x + 2, y)], fill=(0, 120, 255), width=1)
    if np.isfinite(Em[f, k]):
        ye = TOP + Em[f, k] * HGT[v]; d.ellipse([x - 2, ye - 2, x + 2, ye + 2], fill=(0, 255, 0))
x0, x1 = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (0, W)
im.crop((x0, 0, x1, min(a.shape[1], TOP + 260))).save(out)
