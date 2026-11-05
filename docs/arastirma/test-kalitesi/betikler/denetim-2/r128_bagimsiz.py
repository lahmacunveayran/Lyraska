"""BS.1770-4 / EBU Tech 3341 bağımsız başvuru hesabı (NumPy, Lyraska kodundan bağımsız).

K-ağırlıklı süzgeç katsayıları doğrudan BS.1770-4 Tablo 1 ve 2'den (48 kHz) alınır; kapılama
standarttaki gibi: 400 ms blok, %75 örtüşme, −70 LUFS mutlak, −10 LU göreli kapı.
Kanal ağırlıkları BS.1770-4 Tablo 3: L, R, C = 1,0; Ls, Rs = 1,41; LFE yok.

Ayrıca Lyraska'nın kanal ağırlığı kuralı (loudness.rs:228-235) aynen taklit edilerek
EBU 3341 durum 6 (5.0 kanal) için ne vereceği hesaplanır.

Kullanım: py -3.8 -I -X utf8 r128_bagimsiz.py
"""
import numpy as np

FS = 48000
# BS.1770-4 Tablo 1 (raf) ve Tablo 2 (RLB yüksek geçiren), 48 kHz
SHELF_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
SHELF_A = [1.0, -1.69065929318241, 0.73248077421585]
HP_B = [1.0, -2.0, 1.0]
HP_A = [1.0, -1.99004745483398, 0.99007225036621]


def lfilter(b, a, x):
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0, b1, b2 = b
    _, a1, a2 = a
    # Döngü yavaş ama açık; 20 sn × 48 kHz için kabul edilebilir.
    for n in range(len(x)):
        xn = x[n]
        yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, xn
        y2, y1 = y1, yn
        y[n] = yn
    return y


def kfilter_ms_per_block(x):
    """Bir kanalın K-ağırlıklı karelerinin 100 ms'lik toplamları."""
    y = lfilter(HP_B, HP_A, lfilter(SHELF_B, SHELF_A, x))
    hop = FS // 10
    n = len(y) // hop
    return np.array([np.sum(y[i * hop : (i + 1) * hop] ** 2) for i in range(n)]), hop


def integrated(channels, weights):
    sub = None
    for x, w in zip(channels, weights):
        s, hop = kfilter_ms_per_block(x)
        sub = w * s if sub is None else sub + w * s
    blocks = np.array([sub[i : i + 4].sum() / (4 * hop) for i in range(len(sub) - 3)])
    lufs = lambda z: -0.691 + 10 * np.log10(z)
    g = blocks[lufs(blocks) > -70]
    rel = lufs(g.mean()) - 10
    k = g[lufs(g) > rel]
    return lufs(k.mean())


def sine(db, secs, f=1000.0, start=0):
    n = np.arange(start, start + int(secs * FS))
    return 10 ** (db / 20) * np.sin(2 * np.pi * f * n / FS)


def parts(spec):
    out = []
    n0 = 0
    for secs, db in spec:
        out.append(sine(db, secs, start=n0))
        n0 += int(secs * FS)
    return np.concatenate(out)


def lyraska_weights(channels):
    # loudness.rs:228-235'in aynısı
    w = []
    for c in range(channels):
        if channels == 1:
            w.append(2.0)
        elif c == 3 and channels >= 6:
            w.append(0.0)
        elif c in (4, 5) and channels >= 6:
            w.append(1.41)
        else:
            w.append(1.0)
    return w


def main():
    print("EBU Tech 3341, bağımsız BS.1770-4 hesabı (beklenen −23,0 ±0,1 LUFS; durum 2: −33,0)")
    c1 = sine(-23, 20)
    print("durum 1 stereo −23 dBFS:", round(integrated([c1, c1], [1, 1]), 3))
    c2 = sine(-33, 20)
    print("durum 2 stereo −33 dBFS:", round(integrated([c2, c2], [1, 1]), 3))
    c3 = parts([(10, -36), (60, -23), (10, -36)])
    print("durum 3:", round(integrated([c3, c3], [1, 1]), 3))
    c5 = parts([(20, -26), (20.1, -20), (20, -26)])
    print("durum 5:", round(integrated([c5, c5], [1, 1]), 3))
    # Durum 6: 5.0 kanal; L, R, C −28 dBFS; Ls, Rs −24 dBFS
    front = sine(-28, 20)
    surround = sine(-24, 20)
    ch5 = [front, front, front, surround, surround]
    std = integrated(ch5, [1, 1, 1, 1.41, 1.41])
    lyr = integrated(ch5, lyraska_weights(5))
    print("durum 6 (5.0) BS.1770 ağırlıklarıyla:", round(std, 3))
    print("durum 6 (5.0) Lyraska ağırlıklarıyla", lyraska_weights(5), ":", round(lyr, 3))
    # 5.1 (6 kanal; LFE sessiz) aynı içerik: Lyraska ağırlıkları doğru mu?
    ch6 = [front, front, front, np.zeros_like(front), surround, surround]
    print("aynı içerik 5.1 düzeninde Lyraska ağırlıklarıyla", lyraska_weights(6), ":",
          round(integrated(ch6, lyraska_weights(6)), 3))
    # Tek kanal: BS.1770 tek kanalı bir kanal sayar (ağırlık 1); Lyraska 2 sayar
    m = sine(-23, 10)
    print("tek kanal −23 dBFS, BS.1770 (ağırlık 1):", round(integrated([m], [1.0]), 3))
    print("tek kanal −23 dBFS, Lyraska (ağırlık 2):", round(integrated([m], [2.0]), 3))


main()
