"""Gerçek tepe ara değerleyicileri: limiter.rs:245 ve loudness.rs:192 mutantlarının etkisi.

Kullanım: python -I interp.py
Rust kodunun birebir çevirisi (limiter.rs `interpolator`, loudness.rs `TruePeak::new/add`).
"""
import cmath
import math

PI = math.pi
# Ani başlayan sinüsün ilk örneklerindeki çınlama ölçüme girmesin.
WARMUP = 48


def windowed_phases(factor, taps, mutant_limiter=False):
    length = factor * taps
    center = (length - 1.0) / 2.0
    phases = [[0.0] * taps for _ in range(factor)]
    for n in range(length):
        x = (n - center) / factor
        sinc = 1.0 if abs(x) < 1e-12 else math.sin(PI * x) / (PI * x)
        a = 2.0 * PI * n / (length - 1.0)
        if mutant_limiter:
            # 4.0 * PI / n as f64 / (len - 1): n = 0'da sonsuz -> cos(inf) = NaN
            arg = (4.0 * PI / n) / (length - 1.0) if n != 0 else float("inf")
            third = math.cos(arg) if math.isfinite(arg) else float("nan")
        else:
            third = math.cos(4.0 * PI * n / (length - 1.0))
        w = 0.42 - 0.5 * math.cos(a) + 0.08 * third
        phases[n % factor][n // factor] = sinc * w
    for p in phases:
        s = sum(p)
        # Rust: if sum.abs() > 1e-12 (NaN için yanlış: bölme yapılmaz)
        if abs(s) > 1e-12:
            for i in range(len(p)):
                p[i] /= s
    return phases


def fmax(a, b):
    """Rust f64::max: NaN olanı yok sayar."""
    if math.isnan(a):
        return b
    if math.isnan(b):
        return a
    return max(a, b)


def max_gain(phases):
    g = 0.0
    for p in phases:
        g = fmax(g, sum(abs(c) for c in p))
    return g


def limiter_detect(phases, signal, taps=16, delay=8):
    """limiter.rs true_peak'in tepe bulma kısmı (atlamasız: hepsi hesaplanır)."""
    hist = [0.0] * taps
    head = 0
    peak = 0.0
    for i, x in enumerate(signal):
        if i == WARMUP:
            peak = 0.0
        hist[head] = x
        peak = fmax(peak, abs(hist[(head + taps - delay) % taps]))
        for p in phases:
            s = 0.0
            for t, c in enumerate(p):
                s += c * hist[(head + taps - t) % taps]
            peak = fmax(peak, abs(s))
        head = (head + 1) % taps
    return peak


def truepeak_detect(phases, signal, taps=12, mutant=False):
    """loudness.rs TruePeak::add (atlamasız)."""
    hist = [0.0] * taps
    head = 0
    peak = 0.0
    for i, x in enumerate(signal):
        if i == WARMUP:
            peak = 0.0
        hist[head] = x
        head = (head + 1) % taps
        peak = fmax(peak, abs(x))
        for p in phases:
            s = 0.0
            for t, c in enumerate(p):
                if mutant:
                    index = (head + taps - t) % taps  # TAPS / 1 - t
                else:
                    index = (head + taps - 1 - t) % taps
                s += c * hist[index]
            peak = fmax(peak, abs(s))
    return peak


def sine(freq, rate, n, phase, amp=1.0):
    w = 2 * PI * freq / rate
    return [amp * math.sin(w * i + phase) for i in range(n)]


def db(x):
    return 20 * math.log10(x)


def sweep(detect, phases, rate, freqs, nphase, n):
    """Her frekansta en kötü başlangıç fazındaki okuma (dB, gerçek tepe 0 dB)."""
    out = []
    for f in freqs:
        worst_low, worst_high = 1e9, -1e9
        for k in range(nphase):
            sig = sine(f, rate, n, 2 * PI * k / nphase)
            v = db(detect(phases, sig))
            worst_low = min(worst_low, v)
            worst_high = max(worst_high, v)
        out.append((f, worst_low, worst_high))
    return out


def main():
    print("== limiter.rs:245 (Blackman -> mutant pencere) ==")
    for rate, factor in [(44_100, 8), (96_000, 4), (192_000, 2)]:
        orig = windowed_phases(factor, 16)
        mut = windowed_phases(factor, 16, mutant_limiter=True)
        nan_phases = [i for i, p in enumerate(mut) if any(math.isnan(c) for c in p)]
        print(f"fs={rate}: NaN içeren fazlar (mutant): {nan_phases}; "
              f"max_gain orig={max_gain(orig):.6f} mutant={max_gain(mut):.6f}")
        freqs = [1000, 5000, rate / 8, rate / 4, 0.3 * rate, 0.4 * rate, min(20_000, 0.45 * rate)]
        so = sweep(lambda ph, s: limiter_detect(ph, s), orig, rate, freqs, 24, 400)
        sm = sweep(lambda ph, s: limiter_detect(ph, s), mut, rate, freqs, 24, 400)
        for (f, lo_o, hi_o), (_, lo_m, hi_m) in zip(so, sm):
            print(f"  {f:8.0f} Hz  orig [{lo_o:+.3f}, {hi_o:+.3f}] dB   "
                  f"mutant [{lo_m:+.3f}, {hi_m:+.3f}] dB")

    print("\n== loudness.rs:192 (dizin bir örnek kayar) ==")
    for rate, factor in [(48_000, 4), (96_000, 2), (192_000, 1)]:
        ph = windowed_phases(factor, 12)
        c0 = [p[0] for p in ph]
        print(f"fs={rate}: fazların t=0 katsayıları {['%.2e' % c for c in c0]}; "
              f"hata sınırı 2*max|c0| = {2 * max(abs(c) for c in c0):.2e} (tam ölçeğe göre)")
        freqs = [997, 5000, rate / 4, 0.45 * rate]
        so = sweep(lambda p, s: truepeak_detect(p, s), ph, rate, freqs, 24, 400)
        sm = sweep(lambda p, s: truepeak_detect(p, s, mutant=True), ph, rate, freqs, 24, 400)
        worst = 0.0
        for (f, lo_o, hi_o), (_, lo_m, hi_m) in zip(so, sm):
            worst = max(worst, abs(lo_o - lo_m), abs(hi_o - hi_m))
            print(f"  {f:8.0f} Hz  orig [{lo_o:+.4f}, {hi_o:+.4f}]  mutant [{lo_m:+.4f}, {hi_m:+.4f}] dB")
        print(f"  en büyük fark: {worst:.5f} dB")
    # EBU Tech 3341 gerçek tepe sinyali benzeri: 48 kHz, fs/4, 45° faz (tepe +3,01 dB örnekler arası)
    ph = windowed_phases(4, 12)
    sig = [0.5 * math.sin(PI / 2 * i + PI / 4) for i in range(4800)]
    o = db(truepeak_detect(ph, sig))
    m = db(truepeak_detect(ph, sig, mutant=True))
    print(f"fs/4, 45° faz, örnek tepesi {db(0.5 * math.sin(PI / 4)):+.3f} dBFS, gerçek tepe {db(0.5):+.3f}: "
          f"orig {o:+.4f}, mutant {m:+.4f} dBTP")


if __name__ == "__main__":
    main()
