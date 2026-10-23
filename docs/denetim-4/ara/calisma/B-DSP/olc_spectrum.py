#!/usr/bin/env python3
"""Spektrum (32 bant, 60 kare/sn) ve VU: bant sınırları, taramada doğru bant, dB ölçeği, kare
zamanlaması, RMS/tepe, VU referansı (bağımsız yeniden hesap)."""
import csv
import os

import numpy as np

B = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(B, "olcum")

edges = {}
for r in csv.DictReader(open(os.path.join(D, "spec_edges.csv"))):
    edges.setdefault(int(r["rate"]), {})[int(r["i"])] = float(r["edge_hz"])
print("=== Bant sınırları (kodun band_edges'i) ===")
for rate, e in sorted(edges.items()):
    arr = np.array([e[i] for i in range(33)])
    bin_hz = rate / (2048 if rate <= 48000 else 4096 if rate <= 96000 else 8192)
    narrow = int(np.sum(np.diff(arr) < bin_hz))
    print(f"{rate}: {arr[0]:.1f} Hz … {arr[-1]:.0f} Hz, oran/bant {arr[1]/arr[0]:.4f} "
          f"({12*np.log2(arr[1]/arr[0]):.2f} yarım ton); FFT kutusu {bin_hz:.2f} Hz; kutudan dar bant sayısı {narrow}"
          f" (ilk {narrow} bant); Hann ana lob ±2 kutu = ±{2*bin_hz:.0f} Hz")

print("\n=== Tarama: ton → en parlak bant, beklenen bant; komşu bantlara sızma ===")
rows = list(csv.DictReader(open(os.path.join(D, "spec_sweep.csv"))))
for rate in sorted(edges):
    e = np.array([edges[rate][i] for i in range(33)])
    wrong, total, details = 0, 0, []
    smear = []
    for r in rows:
        if int(r["rate"]) != rate or r["amp_db"] != "-20":
            continue
        f = float(r["tone_hz"])
        lv = np.array([float(r[f"b{i}"]) for i in range(32)])
        if f < e[0] or f >= e[-1]:
            continue
        exp = int(np.searchsorted(e, f, side="right") - 1)
        got = int(np.argmax(lv))
        total += 1
        # "Doğru" sayılacak: beklenen bant ya da eşit düzeyde komşu (dar bantlar tek kutuyu paylaşır).
        if got != exp and not (abs(lv[got] - lv[exp]) < 0.02):
            wrong += 1
            details.append((f, exp, got, lv[exp], lv[got]))
        # Sızma: beklenen bandın ±3 bant dışında en yüksek seviye (dB olarak 60·level)
        far = np.concatenate([lv[:max(0, exp - 3)], lv[exp + 4:]])
        smear.append((f, 60 * (far.max() - lv[exp]) if far.size else -99))
    print(f"{rate}: {total} ton, en parlak bant yanlış: {wrong}")
    for d in details[:12]:
        print(f"   ton {d[0]:8.1f} Hz: beklenen bant {d[1]} ({d[3]:.3f}), bulunan {d[2]} ({d[4]:.3f})")
    sm = np.array(smear)
    print("   ±3 bant dışına sızma (dB, tona göre), frekansa göre örnekler: " +
          ", ".join(f"{f:.0f}Hz:{s:+.0f}" for f, s in sm[::16]))
    # Düşük bantlarda kaç bant birden 'yanıyor' (tonun seviyesinin 6 dB içinde)?
    for r in rows:
        if int(r["rate"]) == rate and r["amp_db"] == "-20":
            f = float(r["tone_hz"])
            if 38 < f < 42 or 58 < f < 64 or 118 < f < 126 or 950 < f < 1050:
                lv = np.array([float(r[f"b{i}"]) for i in range(32)])
                lit = np.where(60 * (lv.max() - lv) < 6)[0]
                print(f"   ton {f:.0f} Hz: 6 dB içinde yanan bantlar {list(lit)} (sayı {len(lit)}), tepe {lv.max():.3f}")

print("\n=== dB ölçeği: 1 kHz tonlar (beklenen seviye = (dBFS + 66)/60, 1 kHz'te eğim 0) ===")
for rate in sorted(edges):
    e = np.array([edges[rate][i] for i in range(33)])
    for r in rows:
        if int(r["rate"]) != rate or r["amp_db"] == "-20" and r["tone_hz"] not in ("100", "10000"):
            continue
        if r["tone_hz"] not in ("1000", "100", "10000"):
            continue
        f, a = float(r["tone_hz"]), float(r["amp_db"])
        band = int(np.searchsorted(e, f, side="right") - 1)
        lv = np.array([float(r[f"b{i}"]) for i in range(32)])
        tilt = 3.0 * np.log2(np.sqrt(e[band] * e[band + 1]) / 1000)
        exp = np.clip((a + tilt + 66) / 60, 0, 1)
        print(f"  {rate} {f:6.0f} Hz {a:5.0f} dBFS: bant {band} seviye {lv[band]:.3f} (beklenen {exp:.3f}, "
              f"fark {60*(lv[band]-exp):+.2f} dB; argmax bant {int(np.argmax(lv))})")

print("\n=== Zamanlama: 1 kHz 50 ms patlama t = 2,000–2,050 s; VU basamakları 3,0 s'den ===")
t_rows = list(csv.DictReader(open(os.path.join(D, "spec_timing.csv"))))
for rate in sorted(edges):
    rs = [r for r in t_rows if int(r["rate"]) == rate]
    t = np.array([float(r["t"]) for r in rs])
    lv = np.array([float(r["band_level"]) for r in rs])
    rms_l = np.array([float(r["rms_l_db"]) for r in rs])
    peak_l = np.array([float(r["peak_l_db"]) for r in rs])
    rms_r = np.array([float(r["rms_r_db"]) for r in rs])
    on = np.where((lv > 0.02) & (t > 1.5) & (t < 2.5))[0]
    vu_on = np.where((rms_l > -59) & (t > 1.5) & (t < 2.5))[0]
    fft = 2048 if rate <= 48000 else 4096 if rate <= 96000 else 8192
    print(f"{rate}: spektrum patlamayı görür: t = {t[on[0]]:.3f}…{t[on[-1]]:.3f} s "
          f"(gerçek 2,000–2,050; pencere {fft/rate*1000:.1f} ms); tepe seviye {lv.max():.3f}; "
          f"VU (meters_at) görür: {t[vu_on[0]]:.3f}…{t[vu_on[-1]]:.3f} s")
    # VU basamakları: her basamağın ortasında rms/peak (beklenen rms = dBFS − 3,01, sağ −6,02).
    steps = [-30.0, -20.0, -12.0, -6.0, -3.0, -40.0, -8.0, -60.0]
    out = []
    for k, db in enumerate(steps):
        tm = 3.0 + k * 0.3 + 0.15
        i = int(np.argmin(np.abs(t - tm)))
        out.append(f"{db:.0f}→rms {rms_l[i]:.2f}/{rms_r[i]:.2f} tepe {peak_l[i]:.2f}")
    print("   VU basamakları (sol rms / sağ rms, sol tepe, dBFS): " + "; ".join(out))

print("\n=== VU referansı: kod ↔ python (300 ms kayan güç ortalaması, −50 dB kapı, %95) ===")
vu = list(csv.DictReader(open(os.path.join(D, "spec_vu.csv"))))
fr = list(csv.DictReader(open(os.path.join(D, "vu_frames.csv"))))
rms = np.array([max(float(r["rms_l_db"]), float(r["rms_r_db"])) for r in fr])
# Kodun sakladığı kareler 0,25 dB'ye yuvarlı; python önce aynı karelerden, sonra ham sinyalden hesaplar.
power = np.where(rms <= -60, 0.0, 10 ** (rms / 10))
w = 18  # round(0,3 × 60)
mov = np.convolve(power, np.ones(w) / w, mode="valid")
db = 10 * np.log10(np.maximum(mov, 1e-30))
db = db[db > -50]
ref_frames = np.sort(db)[int(round((len(db) - 1) * 0.95))]
sig = np.fromfile(os.path.join(D, "vu_signal.f64"), dtype="<f8")
# Ham sinyalden: 300 ms pencere, 1/60 s adım, güç ortalaması.
hop = 800
win = 14400
p = np.array([np.mean(sig[i:i + win] ** 2) for i in range(0, len(sig) - win, hop)])
dbp = 10 * np.log10(np.maximum(p, 1e-30))
dbp = dbp[dbp > -50]
ref_raw = np.sort(dbp)[int(round((len(dbp) - 1) * 0.95))]
code = [r for r in vu if r["rate"] == "48000_direct"][0]["vu_reference_db"]
print(f"  kod: {float(code):.3f} dBFS; python (saklanan karelerden) {ref_frames:.3f}; python (ham sinyalden) {ref_raw:.3f}")
print("  sentetik zamanlama sinyalinin referansı (kod), hızlara göre: " +
      ", ".join(f"{r['rate']}: {float(r['vu_reference_db']):.2f}" for r in vu if r["rate"] != "48000_direct"))
