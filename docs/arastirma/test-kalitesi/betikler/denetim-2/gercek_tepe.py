"""Gerçek tepe ölçerlerinin ve testlerdeki başvuru ölçerinin doğruluğu.

1. loudness.rs TruePeak (4×, faz başına 12 katsayı, Blackman, faz başına birim kazanç) aynen
   taklit edilir; fs/4'te 45° kaydırılmış tam ölçekli sinüsün gerçek tepesi tam 0 dBTP'dir
   (analitik: örnekler ±0,7071, sürekli dalganın tepesi 1).
2. limiter.rs testlerindeki başvuru `true_peak_8x` (8×, 64 katsayı, Hann) aynen taklit edilir ve
   kesin değere göre hatası ölçülür:
   a) fs/4, 45° sinüs, genlik 1 → kesin 0 dBTP.
   b) 44,1 kHz'te 1,6 genlikli, ±1'e kırpılmış 9 kHz sinüs: 49 örnekte tam periyodik
      (9000·49/44100 = 10 tur), kesin bant sınırlı ara değer FFT ile (periyodik sinc) bulunur.
Kullanım: py -3.8 -I -X utf8 gercek_tepe.py
"""
import numpy as np

PI = np.pi


def lyraska_truepeak(x, rate):
    factor = 4 if rate < 96000 else (2 if rate < 192000 else 1)
    taps = 12
    length = factor * taps
    center = (length - 1) / 2
    phases = np.zeros((factor, taps))
    for n in range(length):
        t = (n - center) / factor
        s = 1.0 if abs(t) < 1e-12 else np.sin(PI * t) / (PI * t)
        w = 0.42 - 0.5 * np.cos(2 * PI * n / (length - 1)) + 0.08 * np.cos(4 * PI * n / (length - 1))
        phases[n % factor, n // factor] = s * w
    phases /= phases.sum(axis=1, keepdims=True)
    peak = np.max(np.abs(x))
    # history[t]: t = 0 en yeni örnek
    for i in range(taps, len(x)):
        hist = x[i - taps + 1 : i + 1][::-1]
        for p in range(factor):
            peak = max(peak, abs(np.dot(phases[p], hist)))
    return peak


def reference_8x(signal):
    """limiter.rs testlerindeki true_peak_8x'in aynısı."""
    half = 32
    over = 8
    peak = 0.0
    ks = np.arange(-half, half)
    for n in range(half, len(signal) - half):
        seg = signal[n - half : n + half]
        for p in range(over):
            frac = p / over
            xx = ks - frac
            sinc = np.where(np.abs(xx) < 1e-12, 1.0, np.sin(PI * xx) / (PI * np.where(xx == 0, 1, xx)))
            window = 0.5 + 0.5 * np.cos(PI * xx / half)
            peak = max(peak, abs(np.dot(seg, sinc * window)))
    return peak


def exact_periodic_peak(period, up=4096):
    """Tam periyodik sinyalin bant sınırlı (periyodik sinc) ara değerinin tepesi."""
    n = len(period)
    spec = np.fft.rfft(period)
    m = n * up
    full = np.zeros(m // 2 + 1, dtype=complex)
    full[: len(spec)] = spec
    if n % 2 == 0:
        full[n // 2] *= 0.5  # Nyquist bileşeni paylaşılır
    y = np.fft.irfft(full, m) * up
    return np.max(np.abs(y))


db = lambda v: 20 * np.log10(v)

# 1. fs/4, 45°
n = np.arange(4800)
s = np.sin(PI / 2 * n + PI / 4)
tp = lyraska_truepeak(s, 48000)
print(f"loudness.rs TruePeak, fs/4 45° (kesin 0,000 dBTP): {db(tp):+.3f} dBTP")
print(f"  test sınırı: −0,3 < x < +0,2 (loudness.rs:430); EBU Tech 3341 toleransı +0,2/−0,4 dB")
for f in [12000.0, 15000.0, 18000.0, 20000.0]:
    # yüksek frekansta en kötü faz: örnekler tepeye en uzak
    worst = 0.0
    for ph in np.linspace(0, PI, 9):
        x = np.sin(2 * PI * f * np.arange(4800) / 48000 + ph)
        worst = min(worst, db(lyraska_truepeak(x[:600], 48000)))
    print(f"  {f/1000:.0f} kHz tam ölçekli sinüs, en kötü fazda TruePeak: {worst:+.3f} dBTP (kesin 0)")

# 2a. başvuru ölçerin fs/4 hatası
r = reference_8x(s[:400])
print(f"limiter testlerinin başvurusu true_peak_8x, fs/4 45° (kesin 0): {db(r):+.4f} dBTP")

# 2b. 9 kHz kırpılmış
rate = 44100
per = np.clip(1.6 * np.sin(2 * PI * 9000 * np.arange(49) / rate), -1, 1)
exact = exact_periodic_peak(per)
long = np.tile(per, 40)
ref = reference_8x(long[:800])
print(f"kırpılmış 9 kHz: kesin gerçek tepe {db(exact):+.3f} dBTP; true_peak_8x {db(ref):+.3f} dBTP;"
      f" hata {db(ref) - db(exact):+.3f} dB")
lt = lyraska_truepeak(long[:800], rate)
print(f"  loudness.rs TruePeak aynı sinyalde: {db(lt):+.3f} dBTP (hata {db(lt) - db(exact):+.3f} dB)")
