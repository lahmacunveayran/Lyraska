"""DOĞRULAMA-1 / ARY-08, ARY-18: WCAG kontrastı bağımsız hesap. Zemin: çekmece --glass-strong
rgba(9,12,20,0.8) (global.css:949), altında sahne rengi; pano zemini var(--glass) tanımsız olduğu için
saydam (ARY-18). Kullanım: python3 -I dog1_kontrast.py
"""


def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def over(fg, a, bg):
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3))


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


scenes = {"siyah #000000": (0, 0, 0), "koyu #02040b": hexc("02040b"), "orta gri #404040": (64, 64, 64), "kuzey ışığı #46f0a6": hexc("46f0a6")}
items = [
    (".eq__scale span #4d575e (10 px metin)", hexc("4d575e"), 1.0, 4.5),
    (".peq__band-line rgba(124,92,255,.45) (grafik)", (124, 92, 255), 0.45, 3.0),
    (".is-comparing .eq__line #3a4247 (grafik)", hexc("3a4247"), 1.0, 3.0),
    ("--text-muted rgba(244,247,251,.5) (metin)", (244, 247, 251), 0.5, 4.5),
    ("--text-muted × opacity .45 (.xf.is-off)", (244, 247, 251), 0.5 * 0.45, 4.5),
]
for sname, scene in scenes.items():
    bg = over((9, 12, 20), 0.8, scene)
    print(f"Zemin: --glass-strong üstünde sahne {sname} → {tuple(round(x) for x in bg)}")
    for name, fg, alpha, need in items:
        c = over(fg, alpha, bg)
        r = ratio(c, bg)
        print(f"   {'GEÇER' if r >= need else 'KALIR'} {r:5.2f}:1 (gereken {need}:1)  {name}")
