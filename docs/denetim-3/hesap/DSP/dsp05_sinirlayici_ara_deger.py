"""DSP-05: Sınırlayıcının gerçek tepe ara değerleyicisi (limiter.rs:262-305) yüksek frekansta ne kadar
tepe kaçırır? loudness.rs'teki 4×/12 katsayılı ölçer de aynı biçimde (karşılaştırma için).

Ara değerleyici: Blackman pencereli sinc, kesim tam fs/2 (geçiş bandı payı yok), her faz birim DC
kazancına normalize. Tam ölçekli sinüs için gerçek tepe tam 1'dir; ölçer max_p |Σ c_p[t]·x[n−t]|
verir. Kaçırma = −20·log10(ölçülen/1), sinüsün fazı taranarak en kötüsü.

Çalıştır: python3 -I dsp05_sinirlayici_ara_deger.py
"""
import math

import numpy as np


def interpolator(rate, taps=16):
    factor = 8 if rate < 96000 else (4 if rate < 192000 else 2)
    n_len = factor * taps
    center = (n_len - 1) / 2
    phases = np.zeros((factor, taps))
    for n in range(n_len):
        x = (n - center) / factor
        sinc = 1.0 if abs(x) < 1e-12 else math.sin(math.pi * x) / (math.pi * x)
        w = 0.42 - 0.5 * math.cos(2 * math.pi * n / (n_len - 1)) + 0.08 * math.cos(4 * math.pi * n / (n_len - 1))
        phases[n % factor, n // factor] = sinc * w
    phases /= phases.sum(axis=1, keepdims=True)
    return phases


def loudness_tp(rate, taps=12):
    """loudness.rs TruePeak: aynı kurgu, 4× (96 kHz altı), 12 katsayı."""
    factor = 4 if rate < 96000 else (2 if rate < 192000 else 1)
    return interpolator_generic(factor, taps)


def interpolator_generic(factor, taps):
    n_len = factor * taps
    center = (n_len - 1) / 2
    phases = np.zeros((factor, taps))
    for n in range(n_len):
        x = (n - center) / factor
        sinc = 1.0 if abs(x) < 1e-12 else math.sin(math.pi * x) / (math.pi * x)
        w = 0.42 - 0.5 * math.cos(2 * math.pi * n / (n_len - 1)) + 0.08 * math.cos(4 * math.pi * n / (n_len - 1))
        phases[n % factor, n // factor] = sinc * w
    phases /= phases.sum(axis=1, keepdims=True)
    return phases


def underread(phases, f, rate):
    """Tam ölçekli sinüste, faz taranarak en kötü ölçülen tepe (dB, ≤ 0)."""
    taps = phases.shape[1]
    w = 2 * math.pi * f / rate
    worst = 0.0
    for ph in np.linspace(0, 2 * math.pi, 64, endpoint=False):
        n = np.arange(400)
        x = np.sin(w * n + ph)
        peak = np.max(np.abs(x[taps:]))
        for p in phases:
            y = np.convolve(x, p, mode="valid")
            peak = max(peak, np.max(np.abs(y[taps:])))
        worst = min(worst, 20 * math.log10(peak)) if worst != 0.0 else 20 * math.log10(peak)
    return worst


def main():
    print("Sınırlayıcı (limiter.rs) ara değerleyicisinin tam ölçekli sinüste en kötü ölçümü (dBTP; gerçek 0,00):")
    for rate in (44100.0, 48000.0, 96000.0, 192000.0):
        ph = interpolator(rate)
        vals = [(f, underread(ph, f, rate)) for f in (1000, 5000, 11025 if rate == 44100 else 12000, 15000, 17000, 18000, 19000, 20000)]
        print(f"  {rate:>8.0f}: " + "  ".join(f"{f / 1000:g}k {v:+.2f}" for f, v in vals))
    print("Analiz ölçeri (loudness.rs 4×/12) aynı sinüslerde:")
    for rate in (44100.0, 48000.0):
        ph = loudness_tp(rate)
        vals = [(f, underread(ph, f, rate)) for f in (5000, 11025 if rate == 44100 else 12000, 15000, 18000, 20000)]
        print(f"  {rate:>8.0f}: " + "  ".join(f"{f / 1000:g}k {v:+.2f}" for f, v in vals))
    # Fazların genlik yanıtı (44,1 kHz).
    ph = interpolator(44100.0)
    for f in (15000, 18000, 20000):
        w = 2 * math.pi * f / 44100.0
        mags = [20 * math.log10(abs(np.sum(p * np.exp(-1j * w * np.arange(len(p)))))) for p in ph]
        print(f"  44,1 kHz fazların {f} Hz kazancı: " + " ".join(f"{m:+.2f}" for m in mags))


def noise_test():
    """Bant sınırlı gürültü bloklarında gerçek tepe (32× FFT ara değerleme) ile ölçülen tepe
    arasındaki en kötü fark."""
    from scipy import signal as sg
    rng = np.random.default_rng(5)
    for rate, which in ((44100.0, "sınırlayıcı 8×16"), (48000.0, "sınırlayıcı 8×16"), (44100.0, "analiz 4×12"), (48000.0, "analiz 4×12")):
        ph = interpolator(rate) if which.startswith("sın") else loudness_tp(rate)
        for lo, hi in ((20, 20000), (12000, 20000), (16000, 20000)):
            sos = sg.butter(12, [lo, hi], btype="band", fs=rate, output="sos")
            worst = 0.0
            for _ in range(300):
                x = sg.sosfilt(sos, rng.standard_normal(4096))[2048:]
                x /= np.max(np.abs(x))
                up = sg.resample(x, len(x) * 32)
                true = np.max(np.abs(up[32 * 64:-32 * 64]))
                est = np.max(np.abs(x[64:-64]))
                for p in ph:
                    y = np.convolve(x, p, mode="same")
                    est = max(est, np.max(np.abs(y[64:-64])))
                worst = min(worst, 20 * math.log10(est / true))
            print(f"  {which}, {rate:.0f} Hz, {lo}-{hi} Hz gürültü: en kötü kaçırma {worst:+.2f} dB")


if __name__ == "__main__":
    main()
    print("Bant sınırlı gürültüde kaçırma (sınırlayıcı ara değerleyicisi):")
    noise_test()
