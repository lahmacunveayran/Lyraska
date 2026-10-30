"""İşlemci çekişmesi: 60 kare/sn 'görüntü' döngüsü (her karede 4 ms iş) ve 10 ms 'ses' döngüsü (0,3 ms iş)
gecikmeleri. Kullanım: cekisme.py <süre_sn> <ses_politikası normal|fifo>"""
import sys, os, time, threading, numpy as np
dur, pol = float(sys.argv[1]), sys.argv[2]
def busy(ms):
    e = time.perf_counter() + ms / 1000
    while time.perf_counter() < e: pass
def loop(period, work, out, fifo=False):
    if fifo:
        try: os.sched_setscheduler(0, os.SCHED_FIFO, os.sched_param(50))
        except Exception as ex: print("fifo yok", ex)
    nxt = time.perf_counter() + period; end = time.perf_counter() + dur
    while nxt < end:
        busy(work)
        now = time.perf_counter()
        if now < nxt: time.sleep(nxt - now)
        out.append(time.perf_counter() - nxt); nxt += period
vis, aud = [], []
# Not: Python GIL iki döngüyü aynı süreçte etkiler; bu yüzden ses döngüsü ayrı süreçte çalıştırılır.
if os.fork() == 0:
    a = []; loop(0.010, 0.3, a, pol == "fifo"); a = np.array(a) * 1000
    print(f"  ses (10 ms dönem): p99 gecikme {np.percentile(a,99):6.2f} ms, en kötü {a.max():6.2f} ms, >5 ms gecikme %{(a>5).mean()*100:.2f}", flush=True)
    os._exit(0)
loop(1 / 60, 4.0, vis); v = np.array(vis) * 1000
print(f"  görüntü (16,7 ms): p99 gecikme {np.percentile(v,99):6.2f} ms, kaçan kare (>16,7 ms) %{(v>16.7).mean()*100:.2f}", flush=True)
os.wait()
