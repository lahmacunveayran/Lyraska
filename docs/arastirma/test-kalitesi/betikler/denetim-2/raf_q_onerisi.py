"""Raf süzgecinin Q'suna duyarlı noktalar: önerilen testlerin beklenen değerleri (RBJ ve analog)."""
import numpy as np
src = open("biquad_pay.py", encoding="utf-8").read()
ns = {}; exec(src.split("cases = [")[0], ns)
exec("def analog_db" + src.split("def analog_db")[1].split("print(")[0], ns)
rbj, resp_db, analog_db = ns["rbj"], ns["resp_db"], ns["analog_db"]
print("LS 100 Hz +9 dB Q0,707 @48 kHz: RBJ 50 Hz = %.4f, 200 Hz = %.4f; analog 50 Hz = %.4f, 200 Hz = %.4f"
      % (resp_db(rbj("ls",100,9,0.707),50), resp_db(rbj("ls",100,9,0.707),200), analog_db("ls",100,9,0.707,50), analog_db("ls",100,9,0.707,200)))
print("peq testi (LS 100 Hz +8, ön kazanç −8): 20 Hz'teki toplam, Q'ya göre (test ±0,3 ister):")
for q in [0.5, 0.707, 1.0, 1.4, 2.0]:
    print("  Q=%.3f: RBJ %.3f, analog %.3f dB" % (q, resp_db(rbj("ls",100,8,q),20)-8, analog_db("ls",100,8,q,20)-8))
print("PK 1 kHz +6 dB @48 kHz, Q'ya duyarlı noktalar (500 Hz, 2 kHz):")
for q in [0.7, 1.0, 1.4]:
    f = rbj("peak", 1000, 6, q)
    print("  Q=%.1f: RBJ 500 Hz %.4f, 2 kHz %.4f | analog 500 Hz %.4f, 2 kHz %.4f"
          % (q, resp_db(f, 500), resp_db(f, 2000), analog_db("peak", 1000, 6, q, 500), analog_db("peak", 1000, 6, q, 2000)))
print("HS 8 kHz −6 dB Q0,707 @48 kHz: 4 kHz %.4f, 16 kHz %.4f (RBJ); analog 4 kHz %.4f"
      % (resp_db(rbj("hs", 8000, -6, 0.707), 4000), resp_db(rbj("hs", 8000, -6, 0.707), 16000), analog_db("hs", 8000, -6, 0.707, 4000)))
