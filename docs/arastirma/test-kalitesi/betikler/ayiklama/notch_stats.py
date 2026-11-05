"""notch_matched.py'nin değişen ayarlarında mutant analog eğriye yaklaşıyor mu, uzaklaşıyor mu?
Ayrıca sözleşme denetimi: seçilen süzgeç RBJ değilse |H(0)| = 1 ya da |H(π)| = 1 olmalı.
Kullanım: python -I notch_stats.py"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I ile betiğin kendi klasörü
import notch_matched as nm  # noqa: E402

rates = [44_100.0, 48_000.0, 96_000.0, 192_000.0]
qs = [0.05, 0.1, 0.2, 0.3, 0.5, 0.707, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 30, 50]
better = worse = 0
worst_loss = (0.0, None)
contract_orig = contract_mut = 0
for rate in rates:
    for i in range(301):
        f0 = 10 * (0.49 * rate / 10) ** (i / 300) * 0.9999
        for q in qs:
            fo, no = nm.matched_notch(f0, q, rate, False)
            fm, nmut = nm.matched_notch(f0, q, rate, True)
            for f, name, which in [(fo, no, "o"), (fm, nmut, "m")]:
                if name != "rbj":
                    h0 = nm.power_gain(f, nm.phi(0.0))
                    hp = nm.power_gain(f, nm.phi(math.pi))
                    ok = abs(h0 - 1) < 1e-9 or abs(hp - 1) < 1e-9
                    if not ok:
                        if which == "o":
                            contract_orig += 1
                        else:
                            contract_mut += 1
            if fo == fm:
                continue
            high = min(20_000.0, rate / 2 * 0.999)
            eo = em = 0.0
            for k in range(400):
                hz = 20 * (high / 20) ** (k / 399)
                ref = 10 * math.log10(max(nm.analog_sq(f0, q, hz), 1e-300))
                if ref > nm.FLOOR_DB:
                    w = nm.error_weight(ref)
                    eo = max(eo, abs(nm.resp_db(fo, hz, rate) - ref) * w)
                    em = max(em, abs(nm.resp_db(fm, hz, rate) - ref) * w)
            if em < eo:
                better += 1
            else:
                worse += 1
                if em - eo > worst_loss[0]:
                    worst_loss = (em - eo, (rate, round(f0, 2), q, no, nmut, round(eo, 3), round(em, 3)))
print(f"mutant analog eğriye daha yakın: {better}, daha uzak ya da eşit: {worse}")
print(f"en büyük kötüleşme: {worst_loss}")
print(f"sözleşmeyi (H(0)=1 ya da H(pi)=1) bozan: aslı {contract_orig}, mutant {contract_mut}")
