"""Modelden emisyon (birinci ekibin pencereleme yöntemiyle aynı: 30 sn pencere, 20 sn adım, orta kısım)."""
import numpy as np, subprocess, time, onnxruntime as ort
from pathlib import Path
import hiza
DEN = Path(__file__).resolve().parent.parent
EM = DEN / "em"; EM.mkdir(exist_ok=True)
COLS = [0] + [hiza._TOK[c] for c in hiza.COLS_CHARS]
_S = {}
def sess(threads=4):
    if threads not in _S:
        o = ort.SessionOptions(); o.intra_op_num_threads = threads; o.inter_op_num_threads = 1
        _S[threads] = ort.InferenceSession(str(hiza.OMNI / "model.int8.onnx"), o)
    return _S[threads]
def load(path, sr=16000, start=None, dur=None):
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error"]
    if start is not None: cmd += ["-ss", f"{start:.6f}"]
    cmd += ["-i", str(path)]
    if dur is not None: cmd += ["-t", f"{dur:.6f}"]
    cmd += ["-f", "f32le", "-ac", "1", "-ar", str(sr), "-"]
    return np.frombuffer(subprocess.run(cmd, check=True, capture_output=True).stdout, dtype=np.float32).copy()
def atempo(x, f, sr=16000):
    p = subprocess.run(["ffmpeg","-nostdin","-loglevel","error","-f","f32le","-ar",str(sr),"-ac","1","-i","-",
                        "-filter:a",f"atempo={f}","-f","f32le","-ar",str(sr),"-ac","1","-"], input=x.astype(np.float32).tobytes(),
                       check=True, capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()
def emissions(x, key=None, win=30.0, hop=20.0, threads=4):
    if key and (EM / f"{key}.npz").exists():
        z = np.load(EM / f"{key}.npz"); return z["lp"].astype(np.float64), float(z["dt"])
    s = sess(threads); SR = 16000; n = len(x); W, H = int(win*SR), int(hop*SR)
    T = int(np.ceil(n / 320)); out = np.full((T, len(COLS)), -1e4, np.float32); filled = np.zeros(T, bool)
    starts = list(range(0, max(1, n - W) + 1, H))
    if starts[-1] + W < n: starts.append(max(0, n - W))
    t0 = time.time()
    for k, st in enumerate(starts):
        seg = x[st:st + W].astype(np.float32)
        if len(seg) < 1600: continue
        seg = (seg - seg.mean()) / np.sqrt(seg.var() + 1e-5)
        lg = s.run(None, {"x": seg[None]})[0][0]
        lp = lg - np.logaddexp.reduce(lg, axis=1, keepdims=True); lp = lp[:, COLS]
        fr = len(seg) / lg.shape[0]; margin = (win - hop) / 2
        lo = 0 if k == 0 else margin; hi = len(seg) / SR if st + W >= n else win - margin
        for j in range(lg.shape[0]):
            tj = (j + 0.5) * fr / SR
            if tj < lo or tj > hi: continue
            g = int((st + (j + 0.5) * fr) / 320)
            if 0 <= g < T and not filled[g]: out[g] = lp[j]; filled[g] = True
    if not filled.all():
        idx = np.where(filled)[0]
        for g in np.where(~filled)[0]: out[g] = out[idx[np.argmin(np.abs(idx - g))]]
    if key: np.savez(EM / f"{key}.npz", lp=out.astype(np.float16), dt=320/16000, sure=time.time()-t0)
    return out.astype(np.float64), 320 / 16000
