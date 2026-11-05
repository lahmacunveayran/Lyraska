"""analysis/beats.rs'in ilgili işlevlerinin birebir çevirisi; beats.rs:270, :349, :542 mutantları.

Kullanım: python -I beats_port.py
"""
import math

MIN_BPM, MAX_BPM, PREFERRED_BPM = 60.0, 200.0, 120.0
ACF_SMOOTHING = 2.5
TEMPO_PRIOR_OCTAVES = 1.0
TIGHTNESS = 100.0
MIN_RHYTHM_STRENGTH = 0.08
TEMPO_SEGMENT_SECONDS = 20.0
VARIABLE_TEMPO_RATIO = 1.08
SEGMENT_MIN_CLARITY = 0.2
GLOBAL_PULSE_MIN_CLARITY = 0.2
SIMPLE_RATIO_TOLERANCE = 0.03


def normalize(onset, fps, mutant=False):
    radius = int(round(fps * 0.25))
    prefix = [0.0]
    for x in onset:
        prefix.append(prefix[-1] + x)
    n = len(onset)
    high = []
    for i in range(n):
        lo = max(i - radius, 0)
        hi = min((i + radius * 1) if mutant else (i + radius + 1), n)
        mean = (prefix[hi] - prefix[lo]) / (hi - lo)
        high.append(max(onset[i] - mean, 0.0))
    m = sum(high) / n
    dev = math.sqrt(sum((x - m) ** 2 for x in high) / n)
    return [x / dev for x in high] if dev > 1e-9 else None


def autocorrelation(c, max_lag):
    out = []
    for lag in range(max_lag + 1):
        if lag >= len(c):
            out.append(0.0)
            continue
        n = len(c) - lag
        out.append(sum(c[i] * c[i + lag] for i in range(n)) / n)
    return out


def smooth(values, sigma):
    sigma = max(sigma, 0.5)
    radius = math.ceil(3 * sigma)
    kernel = [math.exp(-0.5 * (i / sigma) ** 2) for i in range(-radius, radius + 1)]
    n = len(values)
    out = []
    for i in range(n):
        s = 0.0
        for k, w in enumerate(kernel):
            j = i + k - radius
            if 0 <= j < n:
                s += w * values[j]
        out.append(s)
    return out


def parabola(left, center, right):
    d = left - 2 * center + right
    if abs(d) < 1e-12:
        return 0.0
    return min(max(0.5 * (left - right) / d, -0.5), 0.5)


def peak_offset(values, index, mutant=False):
    if index == 0 or index + 1 >= len(values):
        return 0.0
    left = values[index + 1] if mutant else values[index - 1]
    return parabola(left, values[index], values[index + 1])


def estimate_period_with_strength(strength, fps):
    min_lag = math.floor(fps * 60 / MAX_BPM)
    max_lag = math.ceil(fps * 60 / MIN_BPM)
    mean = sum(strength) / len(strength)
    centered = [x - mean for x in strength]
    acf = autocorrelation(centered, 2 * max_lag + 2)
    energy = acf[0]
    if energy <= 0:
        return None
    preferred = fps * 60 / PREFERRED_BPM

    def prior(lag):
        return math.exp(-0.5 * (math.log2(lag / preferred) / TEMPO_PRIOR_OCTAVES) ** 2)

    def comb(a, lag):
        return prior(lag) * (a[lag] + 0.5 * a[2 * lag] + 0.25 * (a[2 * lag - 1] + a[2 * lag + 1]))

    lags = range(max(min_lag, 2), max_lag + 1)

    def pick(a):
        best = None
        for lag in lags:  # Rust max_by: eşitlikte sonuncu
            if best is None or comb(a, lag) >= comb(a, best):
                best = lag
        return best

    sharp = pick(acf)
    clarity = acf[sharp] / energy
    if clarity < MIN_RHYTHM_STRENGTH:
        return None
    sm = smooth(strength, ACF_SMOOTHING)
    m2 = sum(sm) / len(sm)
    soft = pick(autocorrelation([x - m2 for x in sm], 2 * max_lag + 2))

    def three_halves(fast):
        return abs((sharp / fast) / 1.5 - 1) <= SIMPLE_RATIO_TOLERANCE

    best = sharp
    if soft is not None:
        for fast in (float(soft), soft / 2.0):
            if three_halves(fast):
                r = int(math.floor(fast + 0.5))
                if r >= max(min_lag, 2):
                    best = r
                break
    refined = best + parabola(acf[best - 1], acf[best], acf[best + 1])
    return refined, clarity


def pulse_clarity(strength, period):
    mean = sum(strength) / max(len(strength), 1)
    c = [x - mean for x in strength]
    lag = math.floor(period)
    acf = autocorrelation(c, lag + 1)
    if acf and acf[0] > 0:
        return max(acf[lag], acf[lag + 1]) / acf[0]
    return 0.0


def segment_periods(strength, fps, global_, mutant=False):
    segment = int(TEMPO_SEGMENT_SECONDS * fps)
    count = len(strength) // segment
    if count < 2:
        return None
    ratios = [2.0 % 3.0 if mutant else 2.0 / 3.0, 1.5, 0.75, 4.0 / 3.0]
    segments = []
    for i in range(count):
        start = i * segment
        end = len(strength) if i + 1 == count else start + segment
        est = estimate_period_with_strength(strength[start:end], fps)
        period = est[0] if est is not None and est[1] >= SEGMENT_MIN_CLARITY else global_
        while period > global_ * 1.5:
            period /= 2
        while period < global_ / 1.5:
            period *= 2
        ratio = period / global_
        simple = any(abs(ratio / r - 1) <= SIMPLE_RATIO_TOLERANCE for r in ratios)
        pc = pulse_clarity(strength[start:end], global_)
        if simple and pc >= GLOBAL_PULSE_MIN_CLARITY:
            period = global_
        segments.append(((start, end), period, est, pc))
    lo = min(s[1] for s in segments)
    hi = max(s[1] for s in segments)
    return (segments if hi / lo > VARIABLE_TEMPO_RATIO else None), segments


def dynamic_beats(local, period):
    n = len(local)
    near = max(round(period / 2), 1)
    far = round(period * 2)
    score = [0.0] * n
    back = [None] * n
    for t in range(n):
        best = None
        if t >= near:
            first = max(t - far, 0)
            for p in range(first, t - near + 1):
                gap = (t - p) / period
                value = score[p] - TIGHTNESS * math.log(gap) ** 2
                if best is None or value > best[0]:
                    best = (value, p)
        if best is not None and best[0] > 0:
            score[t] = local[t] + best[0]
            back[t] = best[1]
        else:
            score[t] = local[t]
    tail = max(n - max(far, 1), 0)
    t = None
    for i in range(tail, n):
        if t is None or score[i] >= score[t]:
            t = i
    beats = [t]
    while back[t] is not None:
        t = back[t]
        beats.append(t)
    beats.reverse()
    return beats


def trim_quiet_ends(local, beats):
    if not beats:
        return beats
    rms = math.sqrt(sum(local[b] ** 2 for b in beats) / len(beats))
    th = 0.5 * rms
    idx = [i for i, b in enumerate(beats) if local[b] >= th]
    return beats[idx[0]: idx[-1] + 1] if idx else []


class Lcg:
    def __init__(self, seed):
        self.s = seed

    def next(self):
        self.s = (self.s * 6364136223846793005 + 1442695040888963407) % (1 << 64)
        return (self.s >> 11) / float(1 << 53)


def synthetic_onset(bpm, seconds, fps, seed, offset_frames=0.37, noise=0.15):
    """Vuruşlarda (kesirli kare konumunda) Gauss biçimli başlangıç gücü + gürültü."""
    rng = Lcg(seed)
    n = int(seconds * fps)
    period = fps * 60 / bpm
    onset = [noise * rng.next() for _ in range(n)]
    truth = []
    k = 0
    while True:
        c = 10 + offset_frames + k * period
        if c >= n - 3:
            break
        amp = 0.7 + 0.3 * rng.next()
        for i in range(max(0, int(c) - 4), min(n, int(c) + 5)):
            onset[i] += amp * math.exp(-0.5 * ((i - c) / 1.0) ** 2)
        truth.append(c / fps)
        k += 1
    return onset, truth, period


def beat_times(onset, fps, period, mutant_norm=False, mutant_peak=False):
    strength = normalize(onset, fps, mutant_norm)
    local = smooth(strength, period / 32)
    frames = trim_quiet_ends(local, dynamic_beats(local, period))
    return [(b + peak_offset(local, b, mutant_peak)) / fps for b in frames]


def nearest_errors(beats, truth):
    return [min(abs(b - t) for t in truth) for b in beats]


def main():
    fps = 60.0
    print("== beats.rs:349 (yerel ortalama penceresi bir kare kısalır) ==")
    worst = 0.0
    for bpm, seed in [(84, 1), (100, 2), (120, 3), (128, 4), (143, 5), (174, 6)]:
        for offset in [0.0, 0.25, 0.5, 0.75]:
            onset, truth, period = synthetic_onset(bpm, 20, fps, seed, offset)
            a = beat_times(onset, fps, period)
            b = beat_times(onset, fps, period, mutant_norm=True)
            if len(a) != len(b):
                print(f"  {bpm} BPM: vuruş sayısı değişti {len(a)} -> {len(b)}")
                continue
            d = max(abs(x - y) for x, y in zip(a, b)) * 1000
            worst = max(worst, d)
    print(f"  6 tempo × 4 kesirli konum: vuruş zamanlarındaki en büyük fark {worst:.3f} ms")

    print("\n== beats.rs:542 (kare altı kayma hep 0) ==")
    rows = []
    for bpm, seed in [(84, 1), (100, 2), (120, 3), (128, 4), (143, 5), (174, 6)]:
        for offset in [0.0, 0.25, 0.5]:
            onset, truth, period = synthetic_onset(bpm, 20, fps, seed, offset, noise=0.02)
            a = nearest_errors(beat_times(onset, fps, period), truth)
            b = nearest_errors(beat_times(onset, fps, period, mutant_peak=True), truth)
            rows.append((bpm, offset, 1000 * sum(a) / len(a), 1000 * max(a), 1000 * sum(b) / len(b), 1000 * max(b)))
    for r in rows:
        print("  %3d BPM kayma %.2f kare: aslı ort %.2f / en çok %.2f ms, mutant ort %.2f / en çok %.2f ms" % r)
    print(f"  peak_offset([0, 1, 0.5], 1): aslı {peak_offset([0, 1, 0.5], 1):.6f}, "
          f"mutant {peak_offset([0, 1, 0.5], 1, True):.6f}  (el hesabı: 1/6 = {1 / 6:.6f})")

    print("\n== beats.rs:270 (2/3 oranı 2 olur) — önerilen testin sınaması ==")
    fps = 100.0
    n = 3 * int(TEMPO_SEGMENT_SECONDS * fps)  # üç parça
    strength = [0.0] * n
    for t in range(0, n, 66):  # bütünün nabzı 66 kare (90,9 BPM) her yerde
        strength[t] += 0.8
    seg = int(TEMPO_SEGMENT_SECONDS * fps)
    for t in range(seg, 2 * seg, 45):  # orta parçada 45 karelik (133 BPM) güçlü vuruş
        strength[t] += 1.0
    for mutant in (False, True):
        result, segments = segment_periods(strength, fps, 66.0, mutant)
        desc = [(s[0], round(s[1], 3), None if s[2] is None else (round(s[2][0], 3), round(s[2][1], 3)), round(s[3], 3))
                for s in segments]
        print(f"  {'mutant' if mutant else 'aslı  '}: sonuç {'None' if result is None else 'Some'}; parçalar {desc}")
    print(f"  oran 45/66 = {45 / 66:.4f}; 2/3 ile göreli fark {abs((45 / 66) / (2 / 3) - 1):.4f} (tolerans 0,03)")


if __name__ == "__main__":
    main()
