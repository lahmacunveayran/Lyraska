"""Analog çentik |H(jω)| ≤ 1 (pay ve paydanın gerçek kısmı aynı, paydanın sanal kısmı ω/Q):
eşlenmiş çentik hiçbir frekansta sesi yükseltmemeli. Aslı ve mutantı bu özellikle karşılaştırır.
Kullanım: python -I notch_gain.py"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I ile betiğin kendi klasörü
import notch_matched as nm  # noqa: E402

for rate in [44_100.0, 48_000.0, 96_000.0, 192_000.0]:
    worst = {False: (-1e9, None), True: (-1e9, None)}
    for i in range(301):
        f0 = 10 * (0.49 * rate / 10) ** (i / 300) * 0.9999
        for q in [0.05, 0.1, 0.2, 0.3, 0.5, 0.707, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 30, 50]:
            for mut in (False, True):
                f, name = nm.matched_notch(f0, q, rate, mut)
                top = max(10 * math.log10(nm.power_gain(f, nm.phi(math.pi * k / 2000))) for k in range(2001))
                if top > worst[mut][0]:
                    worst[mut] = (top, (round(f0, 1), q, name))
    print(f"fs={rate:.0f}: en büyük kazanç aslı {worst[False][0]:+.4f} dB {worst[False][1]}, "
          f"mutant {worst[True][0]:+.4f} dB {worst[True][1]}")
