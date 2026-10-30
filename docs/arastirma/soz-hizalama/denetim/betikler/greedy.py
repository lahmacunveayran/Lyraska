import sys, numpy as np, hiza
from pathlib import Path
EM = Path(__file__).resolve().parent.parent / "em"
inv = {v: k for k, v in hiza.COL.items()}
def greedy(lp, dt, a, b):
    am = lp[int(a/dt):int(b/dt)].argmax(1); out, prev = [], 0
    for c in am:
        if c != prev and c != 0: out.append(inv[c])
        prev = c
    return "".join(out)
if __name__ == "__main__":
    z = np.load(EM / f"{sys.argv[1]}.npz"); lp, dt = z["lp"].astype(float), float(z["dt"])
    for i in range(0, int(len(lp)*dt), 10): print(f"{i:4d}-{i+10:4d}: {greedy(lp, dt, i, i+10)}")
