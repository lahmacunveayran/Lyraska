# WCAG pencere ölçümü (341/1024·W × 256/1024·W pencere, bağıl parlaklık ortalaması).
# Kullanım:
#   python3 parlama.py ornek <ad>       örnek videonun kendi pencere değişimi (1/3 sn içinde en büyük aralık)
#   python3 parlama.py ekran <önek>     önizlemenin ekran görüntüleri (<önek>-rest.png çubuksuz,
#                                       <önek>-000.png ... ardışık kareler): çubuksuza göre artış ve
#                                       kareden kareye değişim
import glob, sys
import numpy as np
from PIL import Image

def lum(x):
    c = x / 255.0
    l = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * l[..., 0] + 0.7152 * l[..., 1] + 0.0722 * l[..., 2]

def means(L, ww, wh, step):
    H, W = L.shape[-2:]
    c = np.pad(L, ((0, 0),) * (L.ndim - 2) + ((1, 0), (1, 0))).cumsum(-2).cumsum(-1)
    ys = np.arange(0, H - wh + 1, step)
    xs = np.arange(0, W - ww + 1, step)
    Y, X = ys[:, None], xs[None]
    return (c[..., Y + wh, X + ww] - c[..., Y, X + ww] - c[..., Y + wh, X] + c[..., Y, X]) / (ww * wh)

if sys.argv[1] == 'ornek':
    v = sys.argv[2]
    a = np.load(v + '-crop.npy', mmap_mode='r')
    W = 2168
    L = np.stack([lum(np.array(a[f, ::4, ::4]).astype(np.float32)) for f in range(a.shape[0])])
    m = means(L, round(341 * W / 1024) // 4, min(L.shape[1], round(256 * W / 1024) // 4), 2)
    worst = max((m[i:i + 8].max(0) - m[i:i + 8].min(0)).max() for i in range(len(m)))
    print(f'{v}: pencerede 1/3 sn içinde en büyük aralık {worst:.3f} (kırpıntı: çizgiden aşağısı)')
else:
    prefix = sys.argv[2]
    rest = lum(np.asarray(Image.open(prefix + '-rest.png').convert('RGB')).astype(float))
    H, W = rest.shape
    ww, wh = round(341 * W / 1024), min(H, round(256 * W / 1024))
    M0 = means(rest, ww, wh, 8)
    Ms = [means(lum(np.asarray(Image.open(f).convert('RGB')).astype(float)), ww, wh, 8)
          for f in sorted(glob.glob(prefix + '-[0-9]*.png'))]
    up = max((m - M0).max() for m in Ms)
    step = max(np.abs(Ms[i] - Ms[i - 1]).max() for i in range(1, len(Ms)))
    print(f'{prefix}: {len(Ms)} kare · çubuksuza göre en büyük artış {up:.4f} · karede en büyük değişim {step:.4f}')
