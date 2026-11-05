"""VU ibresi (src/lib/vu.ts:61-80) aynen taklit; IEC 60268-17 / ANSI C16.5 ölçütleriyle karşılaştırma.
Standart: 0 VU'luk ani sinüste ibre 300 ms'de (±%10) son değerin %99'una ulaşır, en az %1, en çok %1,5 aşar."""
import math
W, Z, H, PEG = 13.1, 0.8, 0.002, 1.06
target = 10 ** (0 / 20) / 10 ** (3 / 20)
p = v = 0.0
pos = []
t = 0.0
while t < 1.5:
    rem = min(1/60, 0.25)
    while rem > 1e-9:
        h = min(H, rem)
        a = W*W*(target-p) - 2*Z*W*v
        v += a*h; p += v*h
        rem -= h
    pos.append(p); t += 1/60
reach = next(i for i, x in enumerate(pos) if x >= 0.99*target) / 60
over = max(pos)/target - 1
print(f"hedef konum {target:.4f}")
print(f"%99'a ulaşma: {reach*1000:.1f} ms (standart 270–330 ms; test 260–340 ms)")
print(f"aşma: %{over*100:.3f} (standart %1,0–%1,5; test %0,5–%2,5)")
print(f"analitik sürekli zamanda aşma: %{100*math.exp(-Z*math.pi/math.sqrt(1-Z*Z)):.3f}")
