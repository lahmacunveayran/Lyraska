"""crossfeed.rs:203 (ön bükme frekansı) ve normalize.rs:437 (iniş rampası) mutantları.

Kullanım: python -I crossfeed_normalize.py
"""
import cmath
import math

PI = math.pi
PRESETS = [("Hafif", 650.0, 9.5), ("Orta", 700.0, 6.0), ("Güçlü", 700.0, 4.5), ("Hoparlör gibi", 570.0, 1.0)]


def side_filter(cutoff, level_db, rate, mutant=False):
    """crossfeed.rs SideFilter::design"""
    r0 = min(max(10 ** (-level_db / 20.0), 0.0), 0.999)
    wc = 2 * PI * cutoff
    zero, pole = wc * (1 - r0), wc * (1 + r0)
    wm = math.sqrt(zero + pole) if mutant else math.sqrt(zero * pole)
    t = wm / (2 * rate)
    if not (t > 0 and t < PI / 2 * 0.99):
        return (1.0, 0.0, 0.0)
    k = wm / math.tan(t)
    norm = k + pole
    return ((k + zero) / norm, (zero - k) / norm, (pole - k) / norm)


def response(f, w):
    b0, b1, a1 = f
    z = cmath.exp(-1j * w)
    return (b0 + b1 * z) / (1 + a1 * z)


def ears(g):
    """Sola kaydırılmış ses: yakın (1+G)/2, uzak (1-G)/2."""
    return (1 + g) / 2, (1 - g) / 2


def crossfeed():
    print("== crossfeed.rs:203 (wm = sqrt(z*p) -> sqrt(z+p)) ==")
    worst_db, worst_us = 0.0, 0.0
    for rate in [44_100.0, 48_000.0, 96_000.0, 192_000.0]:
        for name, cutoff, level in PRESETS + [("uç1", 300.0, 1.0), ("uç2", 1200.0, 15.0), ("uç3", 1200.0, 1.0)]:
            fo = side_filter(cutoff, level, rate)
            fm = side_filter(cutoff, level, rate, True)
            for i in range(0, 401):
                hz = 20 * 1000 ** (i / 400)
                w = 2 * PI * hz / rate
                go, gm = response(fo, w), response(fm, w)
                no, fo_ = ears(go)
                nm, fm_ = ears(gm)
                for a, b in [(no, nm), (fo_, fm_)]:
                    if abs(a) > 1e-6 and abs(b) > 1e-6:
                        worst_db = max(worst_db, abs(20 * math.log10(abs(a) / abs(b))))
                if hz < 2000:
                    # kulaklar arası zaman farkı: arg(uzak/yakın) / ω (µs)
                    to = -cmath.phase(fo_ / no) / (2 * PI * hz) * 1e6
                    tm = -cmath.phase(fm_ / nm) / (2 * PI * hz) * 1e6
                    worst_us = max(worst_us, abs(to - tm))
    print(f"20 Hz–20 kHz, 4 hız, hazır ayarlar + uçlar: en büyük kulak seviyesi farkı {worst_db:.4f} dB, "
          f"2 kHz altı en büyük zaman farkı farkı {worst_us:.3f} µs")
    # Mutantın ön bükme frekansı (Hz) ile aslınınki
    for name, cutoff, level in PRESETS:
        r0 = 10 ** (-level / 20)
        wc = 2 * PI * cutoff
        print(f"  {name}: ön bükme orig {math.sqrt(wc * (1 - r0) * wc * (1 + r0)) / (2 * PI):.1f} Hz, "
              f"mutant {math.sqrt(wc * (1 - r0) + wc * (1 + r0)) / (2 * PI):.2f} Hz")


def db_to_linear(db):
    return 10 ** (db / 20)


def normalize():
    print("\n== normalize.rs:437 (protect += (next - protect) / n -> * n) ==")
    # 1. şarkı: quiet() (−20 LUFS, −12 dBTP) -> +6 dB eşitleme, boşluk −1 − (−12 + 6) = 5 dB.
    # 2. şarkı: −14 LUFS, −1 dBTP -> 0 dB, boşluk 0. Ekolayzer +6 dB:
    #    koruma1 = −(6 − 5) = −1 dB, koruma2 = −6 dB. Toplam +5 dB -> −6 dB: iniş (daha kısık).
    gain, protect = db_to_linear(6), db_to_linear(-1)
    next_target, next_protect = db_to_linear(0), db_to_linear(-6)
    ramp = 480  # 10 ms @ 48 kHz
    for mutant in [False, True]:
        g, p = gain, protect
        out = []
        for left in range(ramp, 0, -1):
            n = float(left)
            g += (next_target - g) / n
            if mutant:
                p += (next_protect - p) * n
            else:
                p += (next_protect - p) / n
            out.append(g * p)
        finite = [x for x in out if math.isfinite(x)]
        first_bad = next((i for i, x in enumerate(out) if not math.isfinite(x)), None)
        print(f"  {'mutant' if mutant else 'orig  '}: ilk 3 kazanç {[round(x, 4) for x in out[:3]]}, "
              f"en büyük |kazanç| {max(abs(x) for x in finite):.3g}, ilk sonsuz/NaN kare {first_bad}, "
              f"son kazanç {out[-1]} (beklenen {next_target * next_protect:.6f})")


if __name__ == "__main__":
    crossfeed()
    normalize()
