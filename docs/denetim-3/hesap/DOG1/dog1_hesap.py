"""DOĞRULAMA-1: DSP-06 (ara değerleyici), DSP-08/ARY-14 (BW Oct), DSP-09 (K ağırlığı) bağımsız hesapları.
Kod formülleri src-tauri/src/audio/{limiter,peq}.rs'ten elle aktarıldı; referanslar RBJ Cookbook ve
ITU-R BS.1770-4 (48 kHz katsayıları). Kullanım: python3 -I dog1_hesap.py
"""
import numpy as np
from scipy import signal

LN2 = np.log(2)


def rbj_peak(f0, g, q, fs):
    A = 10 ** (g / 40)
    w0 = 2 * np.pi * f0 / fs
    al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return np.array(b) / a[0], np.array(a) / a[0]


def resp_db(b, a, f, fs):
    _, h = signal.freqz(b, a, worN=f, fs=fs)
    return 20 * np.log10(np.abs(h))


print("=== DSP-08 / ARY-14: BW Oct → Q ===")
print("Lyraska: Q = 1/(2 sinh(ln2/2·BW)) (analog tanım). RBJ Cookbook / APO: α = sin w0 · sinh(ln2/2·BW·w0/sin w0).")
for fs in (44100, 48000):
    for bw in (1.0, 2.0, 0.5):
        row = []
        for f0 in (1000, 4000, 8000, 10000, 12000, 16000):
            w0 = 2 * np.pi * f0 / fs
            q_lyr = 1 / (2 * np.sinh(LN2 / 2 * bw))
            q_apo = 1 / (2 * np.sinh(LN2 / 2 * bw * w0 / np.sin(w0)))
            f = np.geomspace(20, min(20000, 0.49 * fs), 4000)
            d = np.max(np.abs(resp_db(*rbj_peak(f0, 6, q_lyr, fs), f, fs) - resp_db(*rbj_peak(f0, 6, q_apo, fs), f, fs)))
            row.append(f"{f0 // 1000 if f0 >= 1000 else f0}k:{d:.2f}")
        print(f"  {fs} Hz, PK +6 dB, BW {bw}: en büyük eğri farkı (dB)  " + "  ".join(row))

print()
print("=== DSP-09: A/B telafisindeki 'K ağırlığı' (analog RBJ raf + YG) ile BS.1770-4'ün 48 kHz süzgeci ===")
fs = 48000
b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
a1 = [1.0, -1.69065929318241, 0.73248077421585]
b2 = [1.0, -2.0, 1.0]
a2 = [1.0, -1.99004745483398, 0.99007225036621]
f = np.geomspace(20, 20000, 241)
k_ref = resp_db(b1, a1, f, fs) + resp_db(b2, a2, f, fs)


def analog_shelf(f, f0, g, q):
    A = 10 ** (g / 40)
    s = 1j * f / f0
    k = np.sqrt(A) / q
    return 20 * np.log10(np.abs(A * (s * s * A + s * k + 1) / (s * s + s * k + A)))


def analog_hp(f, f0, q):
    s = 1j * f / f0
    return 20 * np.log10(np.abs(s * s / (s * s + s / q + 1)))


k_code = analog_shelf(f, 1681.974450955533, 3.999843853973347, 0.7071752369554196) + analog_hp(f, 38.13547087602444, 0.5003270373238773)
# Tek bir sabit kayma önemsizdir (telafi oransaldır): 1 kHz'e göre normalize ederek de bak.
d = k_code - k_ref
i1k = np.argmin(np.abs(f - 1000))
print(f"  en büyük mutlak fark {np.max(np.abs(d)):.3f} dB @ {f[np.argmax(np.abs(d))]:.0f} Hz; 1 kHz'e göre normalize: {np.max(np.abs(d - d[i1k])):.3f} dB")


def comp(weights_db, filt_db):
    w = 10 ** (weights_db / 10)
    return 10 * np.log10(np.sum(w * 10 ** (filt_db / 10)) / np.sum(w))


for (f0, g, q) in ((1500, 12, 0.7), (3000, 6, 1.0), (100, 6, 0.7), (8000, 6, 2.0)):
    pk = resp_db(*rbj_peak(f0, g, q, 96000), f, 96000)
    print(f"  PK {f0} Hz {g:+} dB Q {q}: telafi kodun ağırlığıyla {comp(k_code, pk):.3f} dB, BS.1770 ağırlığıyla {comp(k_ref, pk):.3f} dB, fark {comp(k_code, pk) - comp(k_ref, pk):+.3f} dB")

print()
print("=== DSP-06: sınırlayıcının ara değerleyicisi (limiter.rs interpolator, 8×, 16 katsayı/faz) ===")


def interpolator(fs, taps=16):
    factor = 8 if fs < 96000 else (4 if fs < 192000 else 2)
    n_len = factor * taps
    center = (n_len - 1) / 2
    ph = np.zeros((factor, taps))
    for n in range(n_len):
        x = (n - center) / factor
        s = 1.0 if abs(x) < 1e-12 else np.sin(np.pi * x) / (np.pi * x)
        w = 0.42 - 0.5 * np.cos(2 * np.pi * n / (n_len - 1)) + 0.08 * np.cos(4 * np.pi * n / (n_len - 1))
        ph[n % factor, n // factor] = s * w
    ph /= ph.sum(axis=1, keepdims=True)
    return ph


for fs in (44100, 48000):
    ph = interpolator(fs)
    for hz in (10000, 15000, 18000, 19000, 20000):
        w = 2 * np.pi * hz / fs
        mags = [20 * np.log10(abs(np.sum(p * np.exp(-1j * w * np.arange(len(p)))))) for p in ph]
        print(f"  {fs} Hz, {hz} Hz: fazların genliği en çok {max(mags):+.2f}, en az {min(mags):+.2f} dB")
