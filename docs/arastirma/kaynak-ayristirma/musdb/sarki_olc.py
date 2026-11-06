"""Bir MUSDB şarkısının tahminlerini museval (SiSEC 2018 ayarı: 1 sn pencere, L=512) ile ölçer."""
import sys, json, numpy as np, soundfile as sf, museval, time
ref_dir, est_dir = sys.argv[1], sys.argv[2]
names = ["vocals", "drums", "bass", "other"]
refs = np.stack([sf.read(f"{ref_dir}/{n}.wav")[0] for n in names])
ests = np.stack([sf.read(f"{est_dir}/{n}.wav")[0] for n in names])
t = time.time()
sdr, isr, sir, sar = museval.evaluate(refs, ests)
out = {n: {"SDR": float(np.nanmedian(sdr[i])), "SIR": float(np.nanmedian(sir[i])), "SAR": float(np.nanmedian(sar[i]))} for i, n in enumerate(names)}
out["sure_sn"] = round(time.time() - t, 1)
print(json.dumps(out, ensure_ascii=False))
