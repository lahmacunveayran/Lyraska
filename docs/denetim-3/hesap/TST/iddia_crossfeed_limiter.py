"""Belgedeki sayısal iddiaların bağımsız yeniden hesabı (crossfeed.rs ve limiter.rs modül belgeleri).

Çalıştırma: python3 -I iddia_crossfeed_limiter.py
Kod, src-tauri/src/audio/crossfeed.rs (SideFilter::design) ve limiter.rs (interpolator) ile aynı
formüllerle yazıldı; Rust kodu çağrılmaz.

İddialar:
  C1 crossfeed.rs:27-29  "Bu sınıra yalnızca tam ölçekli ters fazlı kare dalga yaklaşır (Orta: +4 dB)"
  C2 crossfeed.rs:28-29  "tam ölçekli geniş gürültüde ~1,6 dB"
  C3 crossfeed.rs:20     "700 Hz'te ~0,23 ms; baş modelinde ±30° için ~0,28 ms"
  L1 limiter.rs:14-16    "Ölçülen kaçırma payı fs/4 sinüste 0,04 dB, sert kırpılmış 9 kHz'te 0,06 dB
                          (BS.1770'in 4× / 12 katsayılı süzgeci sırasıyla 0,17 ve 0,16 dB kaçırır)"
"""
import numpy as np

PRESETS = [("Hafif", 650.0, 9.5), ("Orta", 700.0, 6.0), ("Güçlü", 700.0, 4.5), ("Hoparlör gibi", 570.0, 1.0)]


def side_filter(cutoff, level_db, fs):
    r0 = min(max(10 ** (-level_db / 20), 0.0), 0.999)
    wc = 2 * np.pi * cutoff
    zero, pole = wc * (1 - r0), wc * (1 + r0)
    wm = np.sqrt(zero * pole)
    t = wm / (2 * fs)
    k = wm / np.tan(t)
    norm = k + pole
    return (k + zero) / norm, (zero - k) / norm, (pole - k) / norm


def run_side(b0, b1, a1, x):
    # Devrik doğrudan biçim II, birinci derece: y = b0·x + s; s = b1·x − a1·y (lfilter ile aynı).
    from scipy.signal import lfilter
    return lfilter([b0, b1], [1.0, a1], x)


def crossfeed(L, R, cutoff, level, fs):
    b0, b1, a1 = side_filter(cutoff, level, fs)
    mid = (L + R) * 0.5
    side = run_side(b0, b1, a1, (L - R) * 0.5)
    return mid + side, mid - side


print("== C1: örnek tepesi sınırı ‖g‖₁ = 2·b0 − G(1) (dB) ==")
for fs in (44100.0, 48000.0):
    for name, fc, lv in PRESETS:
        b0, b1, a1 = side_filter(fc, lv, fs)
        g_dc = (b0 + b1) / (1 + a1)
        bound = 2 * b0 - g_dc
        print(f"  {fs:.0f} Hz {name:14s} sınır = {bound:.4f}  ({20*np.log10(bound):+.2f} dB)")

print("\n== C2: tam ölçekli geniş gürültüde çıkış tepesi (dB, 10 sn, 48 kHz, 5 tohum) ==")
fs = 48000.0
for kind in ("bağımsız düzgün ±1", "bağımsız Gauss (tepe 1'e kırpılmış, σ=0.3)", "ters fazlı düzgün ±1 (L=−R)"):
    row = []
    for name, fc, lv in PRESETS:
        peaks = []
        for seed in range(5):
            rng = np.random.default_rng(seed)
            n = int(fs * 10)
            if kind.startswith("bağımsız düzgün"):
                L = rng.uniform(-1, 1, n); R = rng.uniform(-1, 1, n)
            elif kind.startswith("bağımsız Gauss"):
                L = np.clip(rng.normal(0, 0.3, n), -1, 1); R = np.clip(rng.normal(0, 0.3, n), -1, 1)
            else:
                L = rng.uniform(-1, 1, n); R = -L
            Lo, Ro = crossfeed(L, R, fc, lv, fs)
            peaks.append(max(np.abs(Lo).max(), np.abs(Ro).max()))
        row.append(f"{name}: {20*np.log10(np.mean(peaks)):+.2f}")
    print(f"  {kind}: " + ", ".join(row))

print("\n== C3: zaman farkı 1/(2π·fc) ==")
for name, fc, lv in PRESETS:
    print(f"  {name:14s} {1e3/(2*np.pi*fc):.3f} ms")


# ---- Sınırlayıcının ara değerleyicisi (limiter.rs interpolator) ----
def interpolator(fs, taps=16):
    factor = 8 if fs < 96000 else (4 if fs < 192000 else 2)
    length = factor * taps
    center = (length - 1) / 2
    phases = np.zeros((factor, taps))
    for n in range(length):
        x = (n - center) / factor
        s = 1.0 if abs(x) < 1e-12 else np.sin(np.pi * x) / (np.pi * x)
        w = 0.42 - 0.5 * np.cos(2 * np.pi * n / (length - 1)) + 0.08 * np.cos(4 * np.pi * n / (length - 1))
        phases[n % factor, n // factor] = s * w
    phases /= phases.sum(axis=1, keepdims=True)
    return phases, factor


def detected_peak(x, fs):
    """Sınırlayıcının gördüğü tepe: örnekler + fazların ara değerleri (t=0 en yeni örnek)."""
    phases, factor = interpolator(fs)
    taps = phases.shape[1]
    peak = np.abs(x).max()
    for p in range(factor):
        # sum_t c[t] * x[n - t]
        y = np.convolve(x, phases[p], mode="valid")
        peak = max(peak, np.abs(y).max())
    return peak


def true_peak_ref(x, os=64, half=256):
    """Referans gerçek tepe: 64× sık örnekleme, uzun Hann pencereli sinc (kenarlar atlanır)."""
    n = np.arange(-half, half)
    peak = 0.0
    for p in range(os):
        frac = p / os
        k = n - frac
        h = np.sinc(k) * (0.5 + 0.5 * np.cos(np.pi * k / half))
        y = np.convolve(x, h[::-1], mode="valid")
        peak = max(peak, np.abs(y).max())
    return peak


def bs1770_4x(x):
    """BS.1770-4 Ek 2'nin 4×, 48 katsayılı (faz başına 12) süzgeci."""
    h = np.array([
        0.0017089843750, 0.0109863281250, -0.0196533203125, 0.0332031250000, -0.0594482421875, 0.1373291015625,
        0.9721679687500, -0.1022949218750, 0.0476074218750, -0.0266113281250, 0.0148925781250, -0.0083007812500,
        -0.0291748046875, 0.0292968750000, -0.0517578125000, 0.0891113281250, -0.1665039062500, 0.4650878906250,
        0.7797851562500, -0.2003173828125, 0.1015625000000, -0.0582275390625, 0.0330810546875, -0.0189208984375,
        -0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625000000, -0.2003173828125, 0.7797851562500,
        0.4650878906250, -0.1665039062500, 0.0891113281250, -0.0517578125000, 0.0292968750000, -0.0291748046875,
        -0.0083007812500, 0.0148925781250, -0.0266113281250, 0.0476074218750, -0.1022949218750, 0.9721679687500,
        0.1373291015625, -0.0594482421875, 0.0332031250000, -0.0196533203125, 0.0109863281250, 0.0017089843750,
    ]).reshape(4, 12)
    peak = np.abs(x).max()
    for p in range(4):
        peak = max(peak, np.abs(np.convolve(x, h[p], mode="valid")).max())
    return peak


print("\n== L1: sınırlayıcının ara değerleyicisinin kaçırdığı gerçek tepe (dB) ==")
for fs in (44100.0, 48000.0):
    n = np.arange(int(fs // 4))
    worst_q = 0.0
    worst_b = 0.0
    for phase_deg in range(0, 91, 3):
        x = 0.5 * np.sin(np.pi / 2 * n + np.radians(phase_deg))
        ref = 0.5
        worst_q = max(worst_q, 20 * np.log10(ref / detected_peak(x, fs)))
        worst_b = max(worst_b, 20 * np.log10(ref / bs1770_4x(x)))
    print(f"  {fs:.0f} Hz fs/4 sinüs (31 faz): Lyraska {worst_q:.3f} dB, BS.1770 4×/12 {worst_b:.3f} dB")
    f = 9000.0
    x = np.clip(1.6 * np.sin(2 * np.pi * f * np.arange(int(fs // 4)) / fs), -1, 1) * 0.5
    ref = true_peak_ref(x)
    print(f"  {fs:.0f} Hz kırpılmış 9 kHz: Lyraska {20*np.log10(ref/detected_peak(x, fs)):.3f} dB, "
          f"BS.1770 4×/12 {20*np.log10(ref/bs1770_4x(x)):.3f} dB")
for fs in (96000.0, 192000.0):
    n = np.arange(int(fs // 8))
    worst = 0.0
    for f in (10000.0, 15000.0, 20000.0, fs / 4):
        for phase_deg in range(0, 91, 9):
            x = 0.5 * np.sin(2 * np.pi * f * n / fs + np.radians(phase_deg))
            worst = max(worst, 20 * np.log10(0.5 / detected_peak(x, fs)))
        print(f"  {fs:.0f} Hz, {f:.0f} Hz sinüs: Lyraska en kötü kaçırma {worst:.3f} dB")
