"""biquad.rs:379 mutantı: eşlenmiş çentik tasarımında Nyquist'e göre ölçekli aday.

Kullanım: python -I notch_matched.py
`Biquad::matched` (Kind::Notch dalı), `Grid::new/error`, `rbj notch` birebir çevrilmiştir.
Soru: Nyquist adayı hiç seçiliyor mu? Seçilmiyorsa mutant (yalnızca o adayı bozar) eşdeğerdir.
"""
import math

PI = math.pi
MAX_FREQ_RATIO = 0.49
FLOOR_DB = -30.0


def phi(w):
    s, c = math.sin(w / 2), math.cos(w / 2)
    p0, p1 = c * c, s * s
    return p0, p1, 4 * p0 * p1


def power(c0, c1, c2):
    return ((c0 + c1 + c2) ** 2, (c0 - c1 + c2) ** 2, -4 * c0 * c2)


def power_gain(f, ph):
    b0, b1, b2, a1, a2 = f
    n = power(b0, b1, b2)
    d = power(1.0, a1, a2)
    num = n[0] * ph[0] + n[1] * ph[1] + n[2] * ph[2]
    den = d[0] * ph[0] + d[1] * ph[1] + d[2] * ph[2]
    return max(num, 1e-300) / max(den, 1e-300)


def is_stable(f):
    _, _, _, a1, a2 = f
    return abs(a2) < 1 and abs(a1) < 1 + a2


def analog_sq(f0, q, hz):
    x = hz / f0
    s = complex(0, x)
    return abs((s * s + 1) / (s * s + s / q + 1)) ** 2


def error_weight(ref_db):
    return min(max((ref_db - FLOOR_DB) / 18.0, 0.25), 1.0)


def grid(f0, q, rate):
    low, high = 20.0, min(rate * MAX_FREQ_RATIO, 20_000.0)
    pts = []
    ratio = high / low
    for i in range(48):
        pts.append(low * ratio ** (i / 47))
    step = 0.25 / max(q, 1e-3)
    for j in range(17):
        hz = f0 * 2 ** ((j - 8) * step)
        if low <= hz <= high:
            pts.append(hz)
    out = []
    for hz in pts:
        t = analog_sq(f0, q, hz)
        ref = 10 * math.log10(max(t, 1e-300))
        if ref > FLOOR_DB:
            out.append((phi(2 * PI * hz / rate), ref, error_weight(ref)))
    return out


def grid_error(g, f):
    if not is_stable(f):
        return math.inf
    worst = 0.0
    for ph, ref, w in g:
        e = abs(10 * math.log10(power_gain(f, ph)) - ref) * w
        worst = max(worst, e)
    return worst


def rbj_notch(f0, q, rate):
    if f0 >= rate * MAX_FREQ_RATIO:
        return (1.0, 0.0, 0.0, 0.0, 0.0)
    w0 = 2 * PI * f0 / rate
    s, c = math.sin(w0), math.cos(w0)
    alpha = s / (2 * q)
    a0 = 1 + alpha
    return (1 / a0, -2 * c / a0, 1 / a0, -2 * c / a0, (1 - alpha) / a0)


def matched_poles(wn, zeta):
    if zeta < 1:
        r = math.exp(-zeta * wn)
        return -2 * r * math.cos(wn * math.sqrt(1 - zeta * zeta)), r * r
    d = math.sqrt(zeta * zeta - 1)
    z1, z2 = math.exp(wn * (-zeta + d)), math.exp(wn * (-zeta - d))
    return -(z1 + z2), z1 * z2


def matched_notch(f0, q, rate, mutant):
    rbj = rbj_notch(f0, q, rate)
    if f0 >= rate * MAX_FREQ_RATIO:
        return rbj, "rbj"
    g = grid(f0, q, rate)
    zeta = 1 / (2 * q)
    a1, a2 = matched_poles(2 * PI * f0 / rate, zeta)
    w0 = 2 * PI * f0 / rate
    c = math.cos(w0)
    dc = (1 + a1 + a2) / (2 - 2 * c)
    nyq = ((1 - a1 - a2) if mutant else (1 - a1 + a2)) / (2 + 2 * c)
    best = None
    for name, k in [("dc", dc), ("nyquist", nyq)]:
        cand = (k, -2 * c * k, k, a1, a2)
        e = grid_error(g, cand)
        if math.isfinite(e) and (best is None or e < best[0]):
            best = (e, cand, name)
    if best is not None and best[0] <= grid_error(g, rbj) + 1e-9:
        return best[1], best[2]
    return rbj, "rbj"


def main():
    rates = [44_100.0, 48_000.0, 88_200.0, 96_000.0, 176_400.0, 192_000.0]
    qs = [0.05, 0.1, 0.2, 0.3, 0.5, 0.707, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 30, 50]
    total = differ = 0
    picked = {"dc": 0, "nyquist": 0, "rbj": 0}
    examples = []
    for rate in rates:
        for i in range(301):
            f0 = 10 * (0.49 * rate / 10) ** (i / 300) * 0.9999
            for q in qs:
                fo, no = matched_notch(f0, q, rate, False)
                fm, nm = matched_notch(f0, q, rate, True)
                total += 1
                picked[no] += 1
                if fo != fm:
                    differ += 1
                    if len(examples) < 8:
                        examples.append((rate, round(f0, 1), q, no, nm))
    print(f"{total} çentik ayarı (6 hız, 10 Hz–0,49·fs, Q 0,05–50)")
    print(f"aslında seçilen aday: {picked}")
    print(f"mutantta sonucu değişen ayar: {differ}")
    for e in examples:
        print("  örnek:", e)


if __name__ == "__main__":
    main()


def resp_db(f, hz, rate):
    return 10 * math.log10(power_gain(f, phi(2 * PI * hz / rate)))


def impact():
    """Değişen ayarlarda iki süzgecin 20 Hz–20 kHz'te en büyük yanıt farkı (dB) ve analog eğriden
    sapmanın (ağırlıklı, yoğun ızgara) değişimi."""
    rates = [44_100.0, 48_000.0, 96_000.0, 192_000.0]
    qs = [0.05, 0.1, 0.2, 0.3, 0.5, 0.707, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 30, 50]
    rows = []
    for rate in rates:
        for i in range(301):
            f0 = 10 * (0.49 * rate / 10) ** (i / 300) * 0.9999
            for q in qs:
                fo, no = matched_notch(f0, q, rate, False)
                fm, nm = matched_notch(f0, q, rate, True)
                if fo == fm:
                    continue
                high = min(20_000.0, rate / 2 * 0.999)
                diff = 0.0
                eo = em = 0.0
                for k in range(400):
                    hz = 20 * (high / 20) ** (k / 399)
                    a, b = resp_db(fo, hz, rate), resp_db(fm, hz, rate)
                    ref = 10 * math.log10(max(analog_sq(f0, q, hz), 1e-300))
                    if ref > FLOOR_DB:
                        w = error_weight(ref)
                        diff = max(diff, abs(a - b) * w)
                        eo = max(eo, abs(a - ref) * w)
                        em = max(em, abs(b - ref) * w)
                rows.append((diff, rate, f0, q, no, nm, eo, em))
    rows.sort(reverse=True)
    print(f"\ndeğişen {len(rows)} ayar; ağırlıklı yanıt farkı en büyük 12:")
    for r in rows[:12]:
        print("  fark %.3f dB  fs=%d f0=%.1f Q=%g  %s->%s  analogdan sapma %.3f -> %.3f dB" % r)
    bands = [(0, 0.1), (0.1, 0.5), (0.5, 1), (1, 3), (3, 1e9)]
    for lo, hi in bands:
        print(f"  fark {lo}–{hi} dB: {sum(1 for r in rows if lo <= r[0] < hi)} ayar")
    audible = [r for r in rows if 20 <= r[2] <= 20_000 and r[3] <= 30]
    print(f"  bunlardan f0 20 Hz–20 kHz ve Q <= 30 olan: {len(audible)}; en büyük fark "
          f"{max((r[0] for r in audible), default=0):.3f} dB")


if __name__ == "__main__":
    impact()
