"""Düşünce deneyi (kod değiştirilmez): low shelf'in Q'su yanlış olsaydı biquad testi yakalar mıydı?
tasarimlar_beklenen_egriyi_verir yalnızca 20 Hz (±0,3), 100 Hz (±0,2) ve 2 kHz (±0,05) bakar."""
import numpy as np
src = open("biquad_pay.py", encoding="utf-8").read().split("cases = [")[0]
ns = {}; exec(src, ns)
rbj, resp_db = ns["rbj"], ns["resp_db"]
for q in [0.5, 0.707, 1.0, 1.4]:
    f = rbj("ls", 100, 9, q)
    vals = [resp_db(f, hz) for hz in (20, 100, 2000, 50, 200)]
    ok = abs(vals[0]-9) < 0.3 and abs(vals[1]-4.5) < 0.2 and abs(vals[2]) < 0.05
    print(f"Q={q:5.3f}: 20 Hz {vals[0]:6.3f}, 100 Hz {vals[1]:6.3f}, 2 kHz {vals[2]:7.4f} | 50 Hz {vals[3]:6.3f}, 200 Hz {vals[4]:6.3f} -> test {'GEÇER' if ok else 'kalır'}")
