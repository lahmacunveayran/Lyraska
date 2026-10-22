"""DSP-06: Crossfeed (crossfeed.rs) bağımsız türetme ve bs2b karşılaştırması.

1. G(s) = (1 − ρ)/(1 + ρ), ρ = r0/(1 + s/ωc) → G(s) = (s + ωc(1−r0))/(s + ωc(1+r0)) sembolik/sayısal doğrulama.
2. Çift doğrusal dönüşüm (ön bükme √(z·p)) scipy.signal.bilinear ile.
3. ‖g‖₁ = 2·b0 − G(1) ve "Orta +4 dB" iddiası.
4. bs2b (libbs2b 3.1.0, bs2b.c init/cross_feed_d) ile hazır ayarların kulaklar arası oranı: alçak frekans
   seviye farkı (ILD) ve grup gecikmesi (ITD). Belge: "Hazır ayarlar bs2b'nin bilinen değerlerinin
   (kesim frekansı, seviye farkı) karşılığıdır".

Çalıştır: python3 -I dsp06_crossfeed.py
"""
import math

import numpy as np
from scipy import signal

PRESETS = [("Hafif", 650.0, 9.5), ("Orta", 700.0, 6.0), ("Güçlü", 700.0, 4.5), ("Hoparlör gibi", 570.0, 1.0)]


def lyraska(cut, level, fs):
    r0 = 10 ** (-level / 20)
    wc = 2 * math.pi * cut
    z, p = wc * (1 - r0), wc * (1 + r0)
    wm = math.sqrt(z * p)
    k = wm / math.tan(wm / (2 * fs))
    n = k + p
    return (k + z) / n, (z - k) / n, (p - k) / n  # b0, b1, a1


def lyraska_scipy(cut, level, fs):
    r0 = 10 ** (-level / 20)
    wc = 2 * math.pi * cut
    z, p = wc * (1 - r0), wc * (1 + r0)
    wm = math.sqrt(z * p)
    fs_eff = wm / (2 * math.tan(wm / (2 * fs)))  # bilinear: s = 2·fs_eff·(z−1)/(z+1)
    bz, az = signal.bilinear([1, z], [1, p], fs=fs_eff)
    return bz[0] / az[0], bz[1] / az[0], az[1] / az[0]


def bs2b(cut, level, fs):
    """libbs2b init(): alçak geçiren (karşı kanal) ve tiz yükselten (aynı kanal) birinci derece süzgeçler."""
    gb_lo = level * -5.0 / 6.0 - 3.0
    gb_hi = level / 6.0 - 3.0
    g_lo = 10 ** (gb_lo / 20)
    g_hi = 1.0 - 10 ** (gb_hi / 20)
    fc_hi = cut * 2.0 ** ((gb_lo - 20.0 * math.log10(g_hi)) / 12.0)
    x = math.exp(-2.0 * math.pi * cut / fs)
    lo = ([g_lo * (1 - x)], [1, -x])
    x = math.exp(-2.0 * math.pi * fc_hi / fs)
    hi = ([1.0 - g_hi * (1 - x), -x], [1, -x])
    return lo, hi


def ratio_props(h_far, h_near, w, fs):
    rho = h_far / h_near
    ild = -20 * np.log10(np.abs(rho))
    ph = np.unwrap(np.angle(rho))
    gd = -np.gradient(ph, w) / fs  # saniye
    return ild, gd


def main():
    fs = 48000.0
    # 1–2: türetme ve BLT
    worst = 0.0
    for cut in (300, 650, 700, 1200):
        for level in (1, 4.5, 6, 9.5, 15):
            for rate in (8000, 44100, 48000, 96000, 192000):
                a = np.array(lyraska(cut, level, rate))
                b = np.array(lyraska_scipy(cut, level, rate))
                worst = max(worst, np.max(np.abs(a - b)))
            r0 = 10 ** (-level / 20)
            wc = 2 * math.pi * cut
            for f in (10, 300, 1000, 5000):
                s = 1j * 2 * math.pi * f
                rho = r0 / (1 + s / wc)
                g1 = (1 - rho) / (1 + rho)
                g2 = (s + wc * (1 - r0)) / (s + wc * (1 + r0))
                assert abs(g1 - g2) < 1e-12
    print(f"[türetme] G(s) özdeşliği doğrulandı; crossfeed.rs katsayıları ile scipy.bilinear farkı en çok {worst:.1e}")

    # 3: ‖g‖₁
    for name, cut, level in PRESETS:
        b0, b1, a1 = lyraska(cut, level, fs)
        imp = signal.lfilter([b0, b1], [1, a1], np.r_[1.0, np.zeros(200000)])
        l1 = np.sum(np.abs(imp))
        dc = (b0 + b1) / (1 + a1)
        print(f"[‖g‖₁] {name}: {l1:.4f} (2·b0 − G(1) = {2 * b0 - dc:.4f}) → {20 * math.log10(l1):+.2f} dB")

    # 4: bs2b karşılaştırması
    w = 2 * math.pi * np.array([20.0, 50.0, 100.0, 300.0, 1000.0, 2000.0, 5000.0]) / fs
    print("[bs2b] alçak frekansta (50 Hz) ILD ve ITD; 1/2/5 kHz'te karşı kulak payı (dB):")
    for name, cut, level in PRESETS[:3]:
        lo, hi = bs2b(cut, level, fs)
        _, hl = signal.freqz(*lo, worN=w)
        _, hh = signal.freqz(*hi, worN=w)
        ild_b, gd_b = ratio_props(hl, hh, w, fs)
        b0, b1, a1 = lyraska(cut, level, fs)
        _, g = signal.freqz([b0, b1], [1, a1], worN=w)
        far, near = (1 - g) / 2, (1 + g) / 2
        ild_l, gd_l = ratio_props(far, near, w, fs)
        # ITD sayısal türevle, 50 Hz noktası (dizinin 2. elemanı) — sık ızgarada yeniden:
        wd = 2 * math.pi * np.linspace(10, 100, 200) / fs
        _, hl2 = signal.freqz(*lo, worN=wd)
        _, hh2 = signal.freqz(*hi, worN=wd)
        _, g2 = signal.freqz([b0, b1], [1, a1], worN=wd)
        _, gd_b2 = ratio_props(hl2, hh2, wd, fs)
        _, gd_l2 = ratio_props((1 - g2) / 2, (1 + g2) / 2, wd, fs)
        print(
            f"  {name} ({cut:.0f} Hz, {level} dB): ILD bs2b {ild_b[1]:.2f} / Lyraska {ild_l[1]:.2f} dB; "
            f"ITD bs2b {gd_b2[50] * 1e6:.0f} µs / Lyraska {gd_l2[50] * 1e6:.0f} µs; "
            f"karşı kulak (ρ) 1k/2k/5k bs2b {-ild_b[4]:.1f}/{-ild_b[5]:.1f}/{-ild_b[6]:.1f}, "
            f"Lyraska {-ild_l[4]:.1f}/{-ild_l[5]:.1f}/{-ild_l[6]:.1f}"
        )

    # 5: tam ölçekli ilintisiz gürültüde örnek tepesi (belge: "~1,6 dB")
    rng = np.random.default_rng(3)
    L = rng.uniform(-1, 1, 480000)
    R = rng.uniform(-1, 1, 480000)
    for name, cut, level in PRESETS:
        b0, b1, a1 = lyraska(cut, level, fs)
        side = signal.lfilter([b0, b1], [1, a1], (L - R) / 2)
        mid = (L + R) / 2
        peak = max(np.max(np.abs(mid + side)), np.max(np.abs(mid - side)))
        print(f"[gürültü] {name}: düzgün ±1 ilintisiz, 10 sn → örnek tepesi {20 * math.log10(peak):+.2f} dBFS")


if __name__ == "__main__":
    main()
