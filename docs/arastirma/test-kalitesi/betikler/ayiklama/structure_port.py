"""analysis/structure.rs çevirisi: structure.rs:484 (phase_agreement) ve :544 (section_boundaries).
Kullanım: python -I structure_port.py"""
import math

METER_WINDOW_BARS = 8
NOVELTY_HALF_WIDTH = 4
MIN_SECTION_BARS = 4


def mean(v):
    return sum(v) / len(v) if v else 0.0


def std_dev(v):
    m = mean(v)
    return math.sqrt(mean([(x - m) ** 2 for x in v]))


def phase_agreement(score, meter, phase, mutant=False):
    meter = max(meter, 1)
    window = METER_WINDOW_BARS * meter
    step = max(window // 2, 1)
    windows = agree = 0
    start = 0
    while start + window <= len(score) or (windows == 0 and start == 0):
        end = min(start * window if mutant else start + window, len(score))
        best = None
        for p in range(meter):  # Rust max_by: eşitlikte sonuncu
            m = mean([score[i] for i in range(start, end) if i % meter == p])
            if best is None or m >= best[1]:
                best = (p, m)
        windows += 1
        if best[0] == phase % meter:
            agree += 1
        start += step
    return agree / max(windows, 1)


def gauss(x, sigma):
    return math.exp(-0.5 * (x / sigma) ** 2)


def section_boundaries(features, mutant=False):
    n = len(features)
    w = NOVELTY_HALF_WIDTH
    if n < 2 * w + 2:
        return []
    dims = len(features[0])
    norm = [list(f) for f in features]
    for d in range(dims):
        col = [f[d] for f in features]
        m, s = mean(col), max(std_dev(col), 1e-9)
        for row, x in zip(norm, col):
            row[d] = (x - m) / s

    def dist(a, b):
        return math.sqrt(sum((x - y) ** 2 for x, y in zip(norm[a], norm[b])))

    nov = []
    for k in range(n):
        if k < w or k + w > n:
            nov.append(0.0)
            continue
        s = 0.0
        for i in range(k - w, k + w):
            for j in range(k - w, k + w):
                same = (i < k) == (j < k)
                taper = gauss(i + 0.5 - k, w) * gauss(j + 0.5 - k, w)
                s += (1.0 if same else -1.0) * taper * (-dist(i, j))
        nov.append(s)
    th = mean(nov) + 0.5 * std_dev(nov)
    peaks = []
    for k in range(w, max(n - (w - 1), 0)):
        cond = nov[k] >= th if mutant else nov[k] > th
        if cond and all(nov[j] <= nov[k] for j in range(max(k - MIN_SECTION_BARS, 0), min(k + MIN_SECTION_BARS, n))):
            peaks.append(k)
    return peaks


# Önerilen test girdisi: 4/4, ilk 64 vuruşta ölçü başı 0. konumda, son 64'te 2. konumda (daha güçlü).
score = [0.0] * 128
for i in range(128):
    if i < 64 and i % 4 == 0:
        score[i] = 1.0
    if i >= 64 and i % 4 == 2:
        score[i] = 2.0
for mutant in (False, True):
    print(f"{'mutant' if mutant else 'aslı  '}: phase_agreement(faz 0) = {phase_agreement(score, 4, 0, mutant):.6f}, "
          f"(faz 2) = {phase_agreement(score, 4, 2, mutant):.6f}")
print("el hesabı: pencereler [0,32) [16,48) [32,64) [48,80) [64,96) [80,112) [96,128); faz 0 ilk üçünde -> 3/7 =",
      3 / 7)
# Sabit özellikler: yenilik yok, sınır olmamalı.
flat = [[1.0] * 5 for _ in range(40)]
print("düz özelliklerde sınırlar: aslı", section_boundaries(flat), "mutant", section_boundaries(flat, True))
