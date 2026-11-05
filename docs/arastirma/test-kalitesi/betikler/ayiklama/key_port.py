"""analysis/key.rs çevirisi: key.rs:261 (oy güveni) ve key.rs:428 (tepe koşulu) mutantları.

Kullanım: python -I key_port.py
"""
import cmath
import math

PITCH = 12
FINE_PER = 10
FINE = PITCH * FINE_PER
MIN_HZ, MAX_HZ = 65.0, 2100.0
TARGET_BIN_HZ = 2.7
PEAK_FLOOR_DB = -40.0
SILENCE_DB = -55.0
TUNING_MIN_HZ = 200.0
KEY_CONFIDENCE_MIN = 0.35
CORRELATION_MIN, CORRELATION_FULL, MARGIN_FULL = 0.45, 0.8, 0.08
SECTION_MIN_SECONDS = 8
VOTE_WINDOW_SECONDS = 15
VOTE_MAJORITY = 0.5
MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def fft(x):
    n = len(x)
    if n == 1:
        return x
    even, odd = fft(x[0::2]), fft(x[1::2])
    out = [0j] * n
    for k in range(n // 2):
        t = cmath.exp(-2j * math.pi * k / n) * odd[k]
        out[k] = even[k] + t
        out[k + n // 2] = even[k] - t
    return out


def correlation(a, b):
    n = 12.0
    ma, mb = sum(a) / n, sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    saa = sum((x - ma) ** 2 for x in a)
    sbb = sum((y - mb) ** 2 for y in b)
    if saa <= 1e-9 * max(ma * ma * n, 1e-12) or sbb <= 0:
        return None
    return sab / math.sqrt(saa * sbb)


def estimate(chroma):
    scores = []
    for tonic in range(12):
        for minor, prof in [(False, MAJOR), (True, MINOR)]:
            rot = [prof[(i + 12 - tonic) % 12] for i in range(12)]
            c = correlation(chroma, rot)
            if c is None:
                return None
            scores.append((c, tonic, minor))
    scores.sort(key=lambda s: -s[0])
    best, tonic, minor = scores[0]
    strength = min(max((best - CORRELATION_MIN) / (CORRELATION_FULL - CORRELATION_MIN), 0), 1)
    margin = min(max((best - scores[1][0]) / MARGIN_FULL, 0), 1)
    conf = min(max(strength * math.sqrt(margin), 0.0), 1.0)
    return (tonic, minor, conf)


def song_key(chroma, mutant=False):
    whole = estimate([sum(row[i] for row in chroma) for i in range(12)])
    votes = []
    total = 0.0
    windows = 0
    for s in range(0, len(chroma), VOTE_WINDOW_SECONDS):
        window = chroma[s:s + VOTE_WINDOW_SECONDS]
        sounding = sum(1 for c in window if any(v > 0 for v in c))
        if sounding < SECTION_MIN_SECONDS:
            continue
        key = estimate([sum(row[i] for row in window) for i in range(12)])
        if key is None or key[2] < KEY_CONFIDENCE_MIN:
            continue
        windows += 1
        weight = float(sounding)
        total += weight
        for v in votes:
            if (v[0][0], v[0][1]) == (key[0], key[1]):
                v[1] += weight
                v[2] += weight * key[2]
                break
        else:
            votes.append([key, weight, (weight + key[2]) if mutant else (weight * key[2])])
    if votes:
        winner = max(votes, key=lambda v: v[1])
        if windows >= 2 and winner[1] >= VOTE_MAJORITY * total:
            conf = min(max((winner[2] / winner[1]) * (winner[1] / total), 0.0), 1.0)
            return (winner[0][0], winner[0][1], conf)
    return whole


def tuning_of(samples, rate, mutant=False):
    """ChromaAnalyzer: process() + finish() içindeki akort kayması (yarım ton)."""
    size = int(min(max(2 ** round(math.log2(rate / TARGET_BIN_HZ)), 4096), 32768))
    hann = [0.5 - 0.5 * math.cos(2 * math.pi * i / size) for i in range(size)]
    norm = 2.0 / sum(hann)
    bin_hz = rate / size
    lo = max(math.floor(MIN_HZ / bin_hz), 2)
    hi = min(math.ceil(MAX_HZ / bin_hz), size // 2 - 2)
    ts = tc = 0.0
    fine = [0.0] * FINE
    for start in range(0, len(samples) - size + 1, size):
        frame = samples[start:start + size]
        spec = fft([complex(x * w, 0) for x, w in zip(frame, hann)])
        mags = {k: abs(spec[k]) * norm for k in range(lo - 1, hi + 2)}
        loudest = max(mags.values())
        floor = loudest * 10 ** (PEAK_FLOOR_DB / 20)
        for k in range(lo, hi):
            a, b, c = mags[k - 1], mags[k], mags[k + 1]
            skip = b <= floor or ((b > a) if mutant else (b <= a)) or b < c
            if skip:
                continue
            la, lb, lc = math.log(max(a, 1e-12)), math.log(b), math.log(max(c, 1e-12))
            d = la - 2 * lb + lc
            p = min(max(0.5 * (la - lc) / d, -0.5), 0.5) if abs(d) > 1e-12 else 0.0
            hz = (k + p) * bin_hz
            mag = math.exp(lb - 0.25 * (la - lc) * p)
            midi = 69 + 12 * math.log2(hz / 440)
            w = math.sqrt(mag)
            fine[int(math.floor(midi * FINE_PER + 0.5)) % FINE] += w
            if hz >= TUNING_MIN_HZ:
                ang = 2 * math.pi * (midi - round(midi))
                ts += w * math.sin(ang)
                tc += w * math.cos(ang)
    tuning = 0.0 if ts == 0 and tc == 0 else math.atan2(ts, tc) / (2 * math.pi)
    return tuning, fine


def main():
    print("== key.rs:428 (tepe yerine iniş yamacındaki kutular) ==")
    rate = 22_050
    for hz in [220.0, 440.0, 440.0 * 2 ** (30 / 1200), 523.25, 1000.0]:
        x = [0.5 * math.sin(2 * math.pi * hz * i / rate) for i in range(3 * 8192)]
        to, fo = tuning_of(x, rate)
        tm, fm = tuning_of(x, rate, True)
        true_cents = 100 * ((69 + 12 * math.log2(hz / 440)) - round(69 + 12 * math.log2(hz / 440)))
        print(f"  {hz:8.2f} Hz sinüs: gerçek kayma {true_cents:+.2f} sent; aslı {100 * to:+.2f}, mutant {100 * tm:+.2f} sent; "
              f"dolu ince kutu sayısı aslı {sum(1 for v in fo if v > 0)}, mutant {sum(1 for v in fm if v > 0)}")

    print("\n== key.rs:261 (ilk oyun güveni weight + c) ==")
    # C majör profili ile G majör profilinin karışımı: güven 0,35–1 arasında olsun.
    for mix in [0.0, 0.3, 0.5, 0.6]:
        blend = [MAJOR[i] + mix * MAJOR[(i + 12 - 7) % 12] for i in range(12)]
        top = max(blend)
        row = [int(round(v / top * 255)) for v in blend]
        chroma = [row] * 30
        single = estimate([15 * v for v in row])
        o = song_key(chroma)
        m = song_key(chroma, True)
        print(f"  karışım {mix}: pencere tahmini {single}; şarkı tonu aslı {o}, mutant {m}")


if __name__ == "__main__":
    main()
