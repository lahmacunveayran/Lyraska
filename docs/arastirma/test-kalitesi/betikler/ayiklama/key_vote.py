"""key.rs:261 için test girdisi: güveni 0,35–0,8 arasında olan bir kroma satırı bulur ve
30 sn'lik (iki oy penceresi) aynı kromada aslı ile mutantın şarkı güvenini karşılaştırır.
Kullanım: python -I key_vote.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I ile betiğin kendi klasörü
import key_port as k  # noqa: E402

for mix in [0.6, 0.7, 0.8, 0.9, 1.0]:
    # Do majör ile La minörün (paralel: aynı notalar) karışımı: iki ton yakın, güven düşer.
    blend = [k.MAJOR[i] + mix * k.MINOR[(i + 12 - 9) % 12] for i in range(12)]
    top = max(blend)
    row = [int(round(v / top * 255)) for v in blend]
    single = k.estimate([15 * v for v in row])
    o = k.song_key([row] * 30)
    m = k.song_key([row] * 30, True)
    print(f"karışım {mix}: satır {row}; pencere {single}; aslı {o}; mutant {m}")
