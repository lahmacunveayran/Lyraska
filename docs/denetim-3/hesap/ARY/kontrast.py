"""ARY kontrast hesabı (WCAG 2.2, 1.4.3 / 1.4.11). Değerler src/styles/global.css @ 5805853'ten.
Çekmece zemini: --glass-strong rgba(9,12,20,0.8) bir sahne pikselinin üstünde. Üç sahne:
 koyu gökyüzü --bg #02040b (en iyi durum), --sky-horizon #0b1b2c ve kuzey ışığı --aurora #46f0a6
 (en kötü durum; bulanıklık gerçekte bunu biraz yumuşatır).
Yarı saydam renkler alttaki zeminle karıştırılır (alfa birleştirme, sRGB uzayında, tarayıcının yaptığı gibi).
Çalıştırma: python3 -I kontrast.py"""


def blend(fg, a, bg):
    return tuple(a * f + (1 - a) * b for f, b in zip(fg, bg))


def lum(c):
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (ch(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def hexc(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


scenes = {
    "koyu gök #02040b": hexc("#02040b"),
    "ufuk #0b1b2c": hexc("#0b1b2c"),
    "kuzey ışığı #46f0a6": hexc("#46f0a6"),
}
WHITE = (244, 247, 251)
rows = [
    ("--text-muted (peq__keys 11px, peq-field__label 10px, hp__meta 12px)", WHITE, 0.5, None, 4.5),
    ("--text-muted, .xf.is-off içinde opacity .45 (crossfeed kapalıyken lejant/eksen)", WHITE, 0.5 * 0.45, None, 4.5),
    (".eq__scale span #4d575e (parametrik grafiğin dB etiketleri, 10px)", hexc("#4d575e"), 1.0, None, 4.5),
    (".chip renk #aeb8be, .chip zemini rgba(255,255,255,.05)", hexc("#aeb8be"), 1.0, ((255, 255, 255), 0.05), 4.5),
    ("--ink-3 (çekmece sekmesi, seçili değil, 13px)", WHITE, 0.48, None, 4.5),
    (".peq-node kenarı --violet #7c5cff (1.4.11, grafik)", hexc("#7c5cff"), 1.0, None, 3.0),
    (".peq__band-line rgba(124,92,255,.45) (bant eğrisi, 1.4.11)", hexc("#7c5cff"), 0.45, None, 3.0),
    (".eq__grid--zero rgba(108,246,223,.18) (0 dB çizgisi)", hexc("#6cf6df"), 0.18, None, 3.0),
    (".peq__board.is-comparing .eq__line #3a4247 (A/B'de eğri)", hexc("#3a4247"), 1.0, None, 3.0),
]
out = []
for scene_name, scene in scenes.items():
    panel = blend((9, 12, 20), 0.8, scene)
    out.append(f"\n== Sahne: {scene_name}; çekmece zemini ≈ {tuple(round(v) for v in panel)} ==")
    for name, color, alpha, layer, need in rows:
        bg = panel if layer is None else blend(layer[0], layer[1], panel)
        fg = blend(color, alpha, bg)
        r = ratio(fg, bg)
        out.append(f"{'GEÇER' if r >= need else 'KALIR'}  {r:5.2f}:1 (gereken {need}:1)  {name}")

# Odak: sayı kutusunun kenarı odaksız rgba(255,255,255,.12) → odaklı rgba(108,246,223,.5); 1px.
panel = blend((9, 12, 20), 0.8, scenes["koyu gök #02040b"])
off = blend((255, 255, 255), 0.12, panel)
on = blend(hexc("#6cf6df"), 0.5, panel)
out.append(
    f"\nOdak (.peq-field__box): kenar odaksız {tuple(round(v) for v in off)} → odaklı "
    f"{tuple(round(v) for v in on)}; iki hâl arası oran {ratio(on, off):.2f}:1, kalınlık 1px"
)
print("\n".join(out))
