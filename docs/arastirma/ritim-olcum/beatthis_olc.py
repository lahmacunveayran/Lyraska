"""Beat This'i bir ses klasöründe ritim_olcum.rs ile aynı ölçütlerle ölçer (mir_eval ile).
Kullanım: beatthis_olc.py <ses klasörü> <işaret klasörü> <sonuç.jsonl> <model: final0|small0>"""
import sys, os, glob, json, time, numpy as np, mir_eval
from beat_this.inference import File2Beats
audio_dir, marks_dir, out, model = sys.argv[1:5]
marks = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob(f"{marks_dir}/**/*.beats", recursive=True)}
f2b = File2Beats(checkpoint_path=model, device="cpu", dbn=False)
def read(p):
    b, d = [], []
    for line in open(p):
        parts = line.split()
        if not parts: continue
        try: t = float(parts[0])
        except ValueError: continue
        b.append(t)
        if len(parts) > 1 and parts[1].replace('.0','') == '1': d.append(t)
    return np.array(sorted(b)), np.array(sorted(d))
def bpm(times):
    if len(times) < 4: return None
    return 60.0 / float(np.median(np.diff(times)))
def acc(e, t):
    near = lambda f: abs(e - t * f) <= 0.04 * t * f
    return near(1.0), any(near(f) for f in (1.0, 2.0, 0.5, 3.0, 1/3))
done = set()
if os.path.exists(out):
    done = {json.loads(l)["sarki"] for l in open(out)}
with open(out, "a") as fo:
    for p in sorted(glob.glob(f"{audio_dir}/**/*.wav", recursive=True)):
        stem = os.path.splitext(os.path.basename(p))[0]
        if stem not in marks or os.path.basename(p) in done: continue
        ref_b, ref_d = read(marks[stem])
        t = time.time()
        try:
            est_b, est_d = f2b(p)
        except Exception as e:
            fo.write(json.dumps({"sarki": os.path.basename(p), "tur": os.path.basename(os.path.dirname(p)), "hata": str(e)[:200]}, ensure_ascii=False) + "\n"); fo.flush()
            continue
        dt = time.time() - t
        est_b, est_d = np.asarray(est_b, float), np.asarray(est_d, float)
        f = mir_eval.beat.f_measure(ref_b, est_b, 0.07) if len(est_b) else 0.0
        ft = mir_eval.beat.f_measure(mir_eval.beat.trim_beats(ref_b), mir_eval.beat.trim_beats(est_b), 0.07) if len(est_b) else 0.0
        fd = (mir_eval.beat.f_measure(ref_d, est_d, 0.07) if len(est_d) else 0.0) if len(ref_d) else None
        e, tr = bpm(est_b), bpm(ref_b)
        a1, a2 = acc(e, tr) if e and tr else (None, None)
        fo.write(json.dumps({"sarki": os.path.basename(p), "tur": os.path.basename(os.path.dirname(p)), "vurus_f": f, "vurus_f_kirpik": ft,
            "olcu_basi_f": fd, "bpm": e, "gercek_bpm": tr, "acc1": a1, "acc2": a2, "analiz_sn": dt}, ensure_ascii=False) + "\n"); fo.flush()
