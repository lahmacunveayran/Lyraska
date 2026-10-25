# Çubuğun rengi ve ışıltısı.
# Kullanım:
#   python3 renk.py isilti <ad>          uzun ve komşuları kısa çubukların yatay kesiti (öz + ışıltı) ve
#                                        aynı yerin çubuksuz karelerdeki zemini
#   python3 renk.py baskin <resim>...    baskın renk kuralı: renklilik ağırlıklı ton vektörlerinin
#                                        ortalaması; tutarlılık = |ortalama| / ortalama renklilik
import colorsys, sys
import numpy as np
from PIL import Image

if sys.argv[1] == 'isilti':
    v = sys.argv[2]
    a = np.load(v + '-crop.npy', mmap_mode='r')
    E = np.load(v + '-E.npy')
    F, N = E.shape
    x0 = {200: 0.57, 220: 0.27}[N]
    p = 2168 / (N - 1)
    TOP = 90
    prof, bgs = [], []
    for f in range(F):
        for k in range(3, N - 3):
            e = E[f, k]
            nb = E[f, [k - 3, k - 2, k - 1, k + 1, k + 2, k + 3]]
            if not (np.isfinite(e) and e > 50 and np.all(np.isfinite(nb)) and e - nb.max() > 35):
                continue
            y0, y1 = TOP + int(nb.max()) + 15, TOP + int(e) - 8
            if y1 - y0 < 6:
                continue
            xi = int(round(x0 + k * p))
            free = [g for g in range(F) if np.all(np.isfinite(E[g, max(0, k - 3):k + 4]))
                    and np.nanmax(E[g, max(0, k - 3):k + 4]) < (y0 - TOP - 15)]
            if len(free) < 3:
                continue
            prof.append(np.array(a[f, y0:y1, xi - 12:xi + 13]).astype(float).mean(axis=0))
            bgs.append(np.array(a[free][:, y0:y1, xi - 12:xi + 13]).astype(float).mean(axis=(0, 1)))
    mp, mb = np.median(prof, axis=0), np.median(bgs, axis=0)
    print(f'{v}: {len(prof)} çubuk; sütun (çubuk ortasına göre px, 2168 genişlikte): çubuklu RGB | zemin RGB')
    for i in range(25):
        print('%+3d' % (i - 12), mp[i].round(0), mb[i].round(0))
elif sys.argv[1] == 'baskin':
    for f in sys.argv[2:]:
        im = np.asarray(Image.open(f).convert('RGB'))
        if im.shape[1] == 2712:
            im = im[:, 272:2440]
        px = np.asarray(Image.fromarray(im).resize((64, 36), Image.BILINEAR)).reshape(-1, 3).astype(float)
        C = (px.max(1) - px.min(1)) / 255
        h = np.array([colorsys.rgb_to_hsv(*(q / 255))[0] for q in px]) * 2 * np.pi
        m = np.array([(C * np.cos(h)).mean(), (C * np.sin(h)).mean()])
        coh = np.hypot(*m) / max(1e-9, C.mean())
        hue = (np.degrees(np.arctan2(m[1], m[0])) + 360) % 360
        t = np.clip((coh - 0.5) / 0.4, 0, 1) * np.clip(C.mean() / 0.08, 0, 1)
        rgb = [round(c * 255) for c in colorsys.hsv_to_rgb(hue / 360, t, 1)]
        print(f'{f}: tutarlılık {coh:.2f}, ortalama renklilik {C.mean():.3f}, ton {hue:.0f}° → renk {rgb}')
