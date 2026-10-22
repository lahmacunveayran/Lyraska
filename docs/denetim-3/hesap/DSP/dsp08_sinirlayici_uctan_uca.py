"""DSP-08: Sınırlayıcı uçtan uca: gerçek Rust Limiter'ın çıkışının gerçek tepesi −1 dBTP'yi aşıyor mu?

Adım 1 (bu betik, `uret`): 44,1 kHz'te üç tam ölçek üstü bant sınırlı sinyal üretir (beyaz 20 Hz–20 kHz,
pembe, 12–20 kHz "zil"), örnek tepesi 1,4'e ölçekler, sinir_giris_*.f64 olarak yazar.
Adım 2 (Rust testi denetim_dsp_sinirlayici_dosya): her dosyayı Limiter'dan geçirip sinir_cikis_*.f64 yazar.
Adım 3 (bu betik, `olc`): çıkışın gerçek tepesini 32× FFT ara değerlemesiyle (8192'lik örtüşen bloklar)
ölçer.

Çalıştır: python3 -I dsp08_sinirlayici_uctan_uca.py uret ; (Rust testi) ; python3 -I dsp08_sinirlayici_uctan_uca.py olc
"""
import math
import os
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
FS = 44100.0
N = int(FS * 20)


def uret():
    rng = np.random.default_rng(11)
    sigs = {}
    sos = signal.butter(12, [20, 20000], btype="band", fs=FS, output="sos")
    sigs["beyaz"] = signal.sosfilt(sos, rng.standard_normal(N))
    # Pembe: 1/f güç (frekans alanında 1/√f), sonra aynı bant.
    spec = np.fft.rfft(rng.standard_normal(N))
    f = np.fft.rfftfreq(N, 1 / FS)
    spec[1:] /= np.sqrt(f[1:])
    spec[0] = 0
    sigs["pembe"] = signal.sosfilt(sos, np.fft.irfft(spec, N))
    sos2 = signal.butter(12, [12000, 20000], btype="band", fs=FS, output="sos")
    sigs["zil"] = signal.sosfilt(sos2, rng.standard_normal(N))
    for name, x in sigs.items():
        x = x / np.max(np.abs(x)) * 1.4
        x.astype("<f8").tofile(os.path.join(HERE, f"sinir_giris_{name}.f64"))
        print(f"{name}: yazıldı ({len(x)} örnek)")


def true_peak(x, up=32, block=8192):
    peak = 0.0
    for start in range(0, len(x) - block, block // 2):
        seg = x[start : start + block] * np.hanning(block) ** 0  # dikdörtgen; kenarlar atılır
        y = signal.resample(seg, block * up)
        core = y[up * 512 : up * (block - 512)]
        peak = max(peak, float(np.max(np.abs(core))))
    return peak


def olc():
    for name in ("beyaz", "pembe", "zil"):
        p = os.path.join(HERE, f"sinir_cikis_{name}.f64")
        if not os.path.exists(p):
            print(f"{name}: çıkış yok")
            continue
        y = np.fromfile(p, dtype="<f8")[int(FS):]  # ilk saniye atılır
        sp = np.max(np.abs(y))
        tp = true_peak(y)
        print(f"{name}: çıkış örnek tepesi {20 * math.log10(sp):+.2f} dBFS, gerçek tepe {20 * math.log10(tp):+.2f} dBTP (tavan −1,00)")


if __name__ == "__main__":
    {"uret": uret, "olc": olc}[sys.argv[1] if len(sys.argv) > 1 else "uret"]()
