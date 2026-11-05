"""biquad.rs `tasarimlar_beklenen_egriyi_verir` testinin beklenen değerlerini bağımsız hesaplar.

RBJ "Audio EQ Cookbook" formülleri (Bristow-Johnson) ve analog prototip (s düzlemi) ile;
testin sınırına göre kullanılan payı gösterir (pay oranı = |gerçek − beklenen| / tolerans).
Ayrıca analog prototipin bilinen noktaları: tepe süzgecin f0'daki kazancı = G, rafın DC'deki
kazancı = G, f0'da G/2 (dB); bunlar Spec::analog'un (biquad.rs:110-133) bağımsız sınamasıdır.
Kullanım: py -3.8 -I -X utf8 biquad_pay.py
"""
import numpy as np

FS = 48000.0


def rbj(kind, f0, g, q, fs=FS):
    A = 10 ** (g / 40)
    w0 = 2 * np.pi * f0 / fs
    c, s = np.cos(w0), np.sin(w0)
    al = s / (2 * q)
    if kind == "peak":
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "ls":
        k = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + k), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - k)]
        a = [(A + 1) + (A - 1) * c + k, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - k]
    elif kind == "hs":
        k = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + k), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - k)]
        a = [(A + 1) - (A - 1) * c + k, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - k]
    elif kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    elif kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
        a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]


def resp_db(ba, hz, fs=FS):
    b, a = ba
    z = np.exp(-1j * 2 * np.pi * hz / fs)
    h = (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    return 20 * np.log10(abs(h))


cases = [
    # (açıklama, süzgeç, Hz, beklenen, tolerans, tür)
    ("LS 100 Hz +9 dB Q0,707 @20 Hz", rbj("ls", 100, 9, 0.707), 20, 9.0, 0.3, "abs"),
    ("LS 100 Hz +9 dB @100 Hz (köşede yarısı)", rbj("ls", 100, 9, 0.707), 100, 4.5, 0.2, "abs"),
    ("LS 100 Hz +9 dB @2 kHz", rbj("ls", 100, 9, 0.707), 2000, 0.0, 0.05, "abs"),
    ("HS 8 kHz −6 dB @20 kHz", rbj("hs", 8000, -6, 0.707), 20000, -6.0, 0.5, "abs"),
    ("HS 8 kHz −6 dB @200 Hz", rbj("hs", 8000, -6, 0.707), 200, 0.0, 0.05, "abs"),
    ("PK 1 kHz +6 @1 kHz", rbj("peak", 1000, 6, 1.0), 1000, 6.0, 1e-9, "abs"),
    ("LP 120 Hz Butterworth @20 Hz", rbj("lp", 120, 0, 1 / np.sqrt(2)), 20, 0.0, 0.05, "abs"),
    ("LP 120 Hz @120 Hz (−3,01)", rbj("lp", 120, 0, 1 / np.sqrt(2)), 120, -3.0103, 0.05, "abs"),
    ("LP 120 Hz @1200 Hz (< −39)", rbj("lp", 120, 0, 1 / np.sqrt(2)), 1200, -39.0, None, "lt"),
    ("HP 120 Hz @2 kHz", rbj("hp", 120, 0, 1 / np.sqrt(2)), 2000, 0.0, 0.05, "abs"),
    ("HP 120 Hz @12 Hz (< −39)", rbj("hp", 120, 0, 1 / np.sqrt(2)), 12, -39.0, None, "lt"),
]
print(f"{'durum':44s} {'gerçek':>9s} {'beklenen':>9s} {'tolerans':>9s} {'pay':>6s}")
for name, ba, hz, want, tol, kind in cases:
    got = resp_db(ba, hz)
    if kind == "abs":
        used = abs(got - want) / tol if tol > 1e-6 else abs(got - want)
        print(f"{name:44s} {got:9.4f} {want:9.4f} {tol:9.2g} {used:6.2f}")
    else:
        print(f"{name:44s} {got:9.4f} {'<' + str(want):>9s} {'-':>9s} {'marj ' + format(want - got, '.2f'):>6s}")


# Analog prototip: bilinen noktalar (RBJ'nin analog H(s)'i)
def analog_db(kind, f0, g, q, hz):
    s = 1j * hz / f0
    A = 10 ** (g / 40)
    if kind == "peak":
        h = (s * s + s * A / q + 1) / (s * s + s / (A * q) + 1)
    elif kind == "ls":
        k = np.sqrt(A) / q
        h = A * (s * s + s * k + A) / (A * s * s + s * k + 1)
    elif kind == "hs":
        k = np.sqrt(A) / q
        h = A * (A * s * s + s * k + 1) / (s * s + s * k + A)
    return 20 * np.log10(abs(h))


print("\nAnalog prototip bilinen noktalar (Spec::analog için bağımsız sınama önerisi):")
for g in [-12, 6, 18]:
    print(f"  PK f0'da {g:+d} dB → {analog_db('peak', 1000, g, 1.3, 1000):+.6f}")
    print(f"  LS DC'de (1e-6·f0) {g:+d} dB → {analog_db('ls', 100, g, 0.707, 1e-4):+.6f};"
          f" f0'da → {analog_db('ls', 100, g, 0.707, 100):+.6f} (G/2 = {g/2:+.1f})")
    print(f"  HS çok yüksekte (1e4·f0) {g:+d} dB → {analog_db('hs', 100, g, 0.707, 1e6):+.6f};"
          f" f0'da → {analog_db('hs', 100, g, 0.707, 100):+.6f}")
