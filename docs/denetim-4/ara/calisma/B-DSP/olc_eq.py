#!/usr/bin/env python3
"""Ekolayzer ölçümü: dürtü yanıtının FFT'si ↔ sürgü hedefi; tasarım eğrisiyle tutarlılık;
kararlılık (IR sönümü); zipper; gürültü tabanı. Girdi: olcum/eq_*.f64 ve CSV'ler."""
import csv
import os
import sys

import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "olcum")
CENTERS = np.array([31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000.0])


def load(name):
    return np.fromfile(os.path.join(D, name), dtype="<f8")


_cache = {}


def response_db(ir, rate, freqs):
    """Dürtü yanıtının verilen frekanslardaki genliği (dB): 2^21 noktalı FFT (çözünürlük
    ≤ 0,09 Hz) ve dB'de doğrusal ara değer."""
    key = id(ir)
    if key not in _cache:
        n = 1 << 21
        mag = 20 * np.log10(np.abs(np.fft.rfft(ir, n)) + 1e-300)
        _cache.clear()
        _cache[key] = (np.fft.rfftfreq(n, 1 / rate), mag)
    f, mag = _cache[key]
    return np.interp(freqs, f, mag)


def slider_target(gains, hz):
    """Kullanıcının beklediği eğri: bant ortalarında sürgü, arada log eksende doğrusal; uçların
    dışında sabit (sürgü değeri)."""
    x = np.log2(hz / CENTERS[0])
    return np.interp(x, np.arange(10), gains)


rows = list(csv.DictReader(open(os.path.join(D, "eq_manifest.csv"))))
design = {}
for r in csv.DictReader(open(os.path.join(D, "eq_design_curve.csv"))):
    design.setdefault((int(r["rate"]), r["name"]), []).append((float(r["hz"]), float(r["design_db"])))

out = open(os.path.join(D, "eq_sonuc.csv"), "w", newline="")
w = csv.writer(out)
w.writerow(["rate", "name", "max_center_err_db", "max_mid_err_db", "max_curve_vs_design_db",
            "max_audible_dev_from_slider_db", "worst_hz", "ir_tail_db", "nan", "dc_db", "nyq_db"])
worst = {}
for r in rows:
    rate = int(r["rate"])
    gains = np.array([float(g) for g in r["gains"].split(";")])
    ir = load(r["file"])
    used = CENTERS < 0.4 * rate  # kodun kullandığı bantlar
    # Tasarım noktaları: bant ortaları + geometrik aralar.
    centers = CENTERS[used]
    mids = np.sqrt(centers[:-1] * centers[1:])
    resp_c = response_db(ir, rate, centers)
    resp_m = response_db(ir, rate, mids)
    g_used = gains[used]
    err_c = np.max(np.abs(resp_c - g_used))
    err_m = np.max(np.abs(resp_m - 0.5 * (g_used[:-1] + g_used[1:]))) if len(mids) else 0.0
    # Tasarımın iddia ettiği eğri vs. gerçek dürtü yanıtı (aynı frekanslarda).
    dpts = np.array(design[(rate, r["name"])])
    sel = dpts[:, 0] < rate / 2 * 0.999
    resp_d = response_db(ir, rate, dpts[sel, 0])
    err_d = np.max(np.abs(resp_d - dpts[sel, 1]))
    # Duyulur bantta (20 Hz – min(20 kHz, 0,45 fs)) sürgü-arası eğriden sapma.
    aud = dpts[(dpts[:, 0] >= 20) & (dpts[:, 0] <= min(20000, 0.45 * rate)), 0]
    resp_a = response_db(ir, rate, aud)
    dev = np.abs(resp_a - slider_target(gains if rate >= 40000 else np.where(used, gains, 0), aud))
    k = int(np.argmax(dev))
    # Kararlılık: IR'nin son %10'unun seviyesi (dB, tepeye göre).
    tail = ir[int(0.9 * len(ir)):]
    tail_db = 20 * np.log10(np.max(np.abs(tail)) / max(np.max(np.abs(ir)), 1e-300) + 1e-300)
    dc = 20 * np.log10(abs(np.sum(ir)) + 1e-300)
    nyq = 20 * np.log10(abs(np.sum(ir * (-1.0) ** np.arange(len(ir)))) + 1e-300)
    w.writerow([rate, r["name"], f"{err_c:.3f}", f"{err_m:.3f}", f"{err_d:.4f}", f"{dev[k]:.3f}",
                f"{aud[k]:.0f}", f"{tail_db:.1f}", int(np.any(~np.isfinite(ir))), f"{dc:.2f}", f"{nyq:.2f}"])
    key = rate
    cur = worst.get(key, (0, 0, 0, 0, ""))
    worst[key] = (max(cur[0], err_c), max(cur[1], err_m), max(cur[2], err_d), max(cur[3], dev[k]),
                  r["name"] if dev[k] > cur[3] else cur[4])
out.close()
print("hız: en kötü bant-ortası sapma / ara-nokta sapma / tasarım-eğrisi-tutarsızlığı / sürgü-arası eğriden sapma (ayar)")
for rate, v in sorted(worst.items()):
    print(f"{rate}: {v[0]:.2f} dB / {v[1]:.2f} dB / {v[2]:.4f} dB / {v[3]:.2f} dB ({v[4]})")

# Ayrıntı: seçilmiş ayarlar 48 kHz'te, bant ortaları.
print("\n48 kHz, bant ortalarında gerçek kazanç (dB):")
for r in rows:
    if int(r["rate"]) != 48000 or r["name"] not in ("all+12", "all-12", "zigzag", "single0+12", "single9+12",
                                                     "preset_bas", "preset_rock", "all+6", "tiny+0.5"):
        continue
    ir = load(r["file"])
    resp = response_db(ir, 48000, CENTERS)
    extra = response_db(ir, 48000, np.array([20.0, 20000.0, 10.0, 23000.0]))
    print(f"  {r['name']:12s} " + " ".join(f"{x:6.2f}" for x in resp) +
          f"   | 20 Hz {extra[0]:6.2f}  20 kHz {extra[1]:6.2f}  10 Hz {extra[2]:6.2f}  23 kHz {extra[3]:6.2f}")

# Uç bantlar 44,1 kHz'te.
print("\n44,1 kHz uç noktalar (all+12): ")
for r in rows:
    if int(r["rate"]) == 44100 and r["name"] == "all+12":
        ir = load(r["file"])
        e = response_db(ir, 44100, np.array([20.0, 16000.0, 18000.0, 20000.0, 21000.0, 22000.0]))
        print("  20 Hz %.2f  16k %.2f  18k %.2f  20k %.2f  21k %.2f  22k %.2f" % tuple(e))

# ---- Zipper -------------------------------------------------------------------------
print("\nZipper / tık ölçümü (48 kHz):")


def window_fit(x, freq, rate, win=480):
    """Her 10 ms pencerede sinüse uydur: genlik (dB) ve kalan (dB, tam ölçeğe göre)."""
    n = len(x) // win
    t = np.arange(win) / rate
    amps, resid = [], []
    for k in range(n):
        seg = x[k * win:(k + 1) * win]
        tt = t + k * win / rate
        A = np.stack([np.sin(2 * np.pi * freq * tt), np.cos(2 * np.pi * freq * tt)], axis=1)
        c, *_ = np.linalg.lstsq(A, seg, rcond=None)
        fit = A @ c
        amps.append(20 * np.log10(np.hypot(*c) + 1e-300))
        resid.append(20 * np.log10(np.sqrt(np.mean((seg - fit) ** 2)) + 1e-300))
    return np.array(amps), np.array(resid)


for tag, freq in (("eq_zipper", 100.0), ("eq_zipper2", 1000.0)):
    x_in = load(tag + "_in.f64")
    x_out = load(tag + "_out.f64")
    amps, resid = window_fit(x_out, freq, 48000)
    ref_amp = 20 * np.log10(np.max(np.abs(x_in)))
    steps = np.abs(np.diff(amps))
    print(f"  {tag}: giriş {ref_amp:.1f} dBFS; en yüksek kalan (10 ms pencere) {resid.max():.1f} dBFS "
          f"(sabit bölgede {np.median(resid):.1f}); genlik aralığı {amps.min():.2f}..{amps.max():.2f} dB; "
          f"pencereler arası en büyük genlik adımı {steps.max():.2f} dB")
    # Nerede?
    k = int(np.argmax(resid))
    print(f"     en yüksek kalan t = {k * 0.01:.2f} s; kalan dizisi (dB) 0,4–0,7 s: " +
          " ".join(f"{v:.0f}" for v in resid[40:70]))

# ---- Gürültü tabanı --------------------------------------------------------------------
x_in = load("eq_noise_in.f64")
x_out = load("eq_noise_out.f64")
seg = x_out[48000:]
t = np.arange(48000, 96000) / 48000
A = np.stack([np.sin(2 * np.pi * 1000 * t), np.cos(2 * np.pi * 1000 * t)], axis=1)
c, *_ = np.linalg.lstsq(A, seg, rcond=None)
res = seg - A @ c
print(f"\nGürültü tabanı: −60 dBFS 1 kHz, Rock: çıkış genliği {20*np.log10(np.hypot(*c)):.2f} dBFS, "
      f"kalan {20*np.log10(np.sqrt(np.mean(res**2))):.1f} dBFS "
      f"(sinüse göre {20*np.log10(np.sqrt(np.mean(res**2))/np.hypot(*c)*np.sqrt(2)):.1f} dB)")
