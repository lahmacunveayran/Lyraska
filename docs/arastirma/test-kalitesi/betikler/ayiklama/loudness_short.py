"""loudness.rs:287 için önerilen test: 400 ms'den kısa (0,3 sn) EBU Tech 3341 durum 1 sinyali
(1 kHz, kanal başına −23 dBFS, stereo) bütünüyle tek blok ölçülünce −23,0 LUFS'e ne kadar yakın?
K-ağırlıklı süzgeç loudness.rs k_weighting'in çevirisi. Kullanım: python -I loudness_short.py"""
import math

PI = math.pi


def k_weighting(rate):
    f0, g, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(PI * f0 / rate)
    vh = 10 ** (g / 20)
    vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf = ([(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0],
             [2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0])
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(PI * f0 / rate)
    a0 = 1 + k / q + k * k
    hp = ([1.0, -2.0, 1.0], [2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0])
    return [shelf, hp]


def run(filt, xs):
    b, a = filt
    x1 = x2 = y1 = y2 = 0.0
    out = []
    for x in xs:
        y = b[0] * x + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out.append(y)
    return out


for seconds in [0.1, 0.2, 0.3, 0.39]:
    rate = 48_000
    amp = 10 ** (-23 / 20) * math.sqrt(2)  # Tech 3341: −23 dBFS RMS? tepe değeri için aşağıda ikisi de
    for label, a in [("tepe -23 dBFS", 10 ** (-23 / 20))]:
        xs = [a * math.sin(2 * PI * 1000 * i / rate) for i in range(int(seconds * rate))]
        ys = xs
        for f in k_weighting(rate):
            ys = run(f, ys)
        z = 2 * sum(y * y for y in ys) / len(ys)  # iki kanal, ağırlık 1
        print(f"{seconds:.2f} sn, {label}: {-0.691 + 10 * math.log10(z):+.3f} LUFS")
