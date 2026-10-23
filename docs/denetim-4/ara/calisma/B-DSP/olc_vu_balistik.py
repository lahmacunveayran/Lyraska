#!/usr/bin/env python3
"""VU ibresi balistiği (src/lib/vu.ts: ω = 13,1 rad/s, ζ = 0,8, yarı-örtük Euler 2 ms):
IEC 60268-17: 0 VU basamağına 300 ms'de (%±10) %99 varış, aşma %1–1,5.
Hem kodun ayrık algoritması (aynen yazılmış) hem de analitik ikinci dereceden çözüm."""
import numpy as np

W, Z, H, PEG = 13.1, 0.8, 0.002, 1.06


def step_needle(pos, vel, target, dt):
    rem = dt
    while rem > 1e-9:
        h = min(H, rem)
        acc = W * W * (target - pos) - 2 * Z * W * vel
        vel += acc * h
        pos += vel * h
        if pos < 0:
            pos, vel = 0.0, max(0.0, vel)
        elif pos > PEG:
            pos, vel = PEG, min(0.0, vel)
        rem -= h
    return pos, vel


target = 10 ** ((0 - 3) / 20)  # 0 VU konumu (0,708)
pos, vel, t, hist = 0.0, 0.0, 0.0, []
dt = 1 / 60
while t < 2.0:
    pos, vel = step_needle(pos, vel, target, dt)
    t += dt
    hist.append((t, pos))
hist = np.array(hist)
t99 = hist[np.argmax(hist[:, 1] >= 0.99 * target), 0]
overshoot = (hist[:, 1].max() / target - 1) * 100
print(f"ayrık (kod algoritması, 60 fps): %99'a varış {t99*1000:.0f} ms, aşma {overshoot:.2f} %")
# Analitik: ζ<1 → x(t) = 1 − e^{−ζωt}(cos ωd t + ζ/√(1−ζ²) sin ωd t)
wd = W * np.sqrt(1 - Z * Z)
tt = np.linspace(0, 2, 200001)
x = 1 - np.exp(-Z * W * tt) * (np.cos(wd * tt) + Z / np.sqrt(1 - Z * Z) * np.sin(wd * tt))
t99a = tt[np.argmax(x >= 0.99)]
print(f"analitik: %99'a varış {t99a*1000:.1f} ms, aşma {(x.max()-1)*100:.2f} % "
      f"(IEC 60268-17: 300 ms ±10 %, aşma 1–1,5 %)")
# Ölçek: 0 VU konumu 10^(−3/20) = %70,8 (gerçek VU ölçeğinde 0 VU ≈ %71): ölçek işaretleri
marks = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]
print("ölçek konumları (%): " + ", ".join(f"{m}:{100*10**((m-3)/20):.1f}" for m in marks))
# Sıfır VU eşiği: levelToPosition(rmsDb, ref) = 10^((rms−ref−3)/20): rms = ref → 0 VU. Doğru.
# Lamba: +1 VU ve üstünde yanar, 0,5 s tutma → en çok 2 yanış/sn (epilepsi sınırı 3).
