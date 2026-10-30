"""Güven ölçüsü denemesi: satır özellikleri → büyük hatayı (> 1 sn) ayırt ediyor mu? Eşik geliştirme+doğrulamada."""
import sys, json, numpy as np
import hiza, hiza2, guven2, deney_metin as dm, veri
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "sonuc"
def auroc(score_bad, y):
    # score_bad yüksek = kötü; y 1 = kötü
    s = np.asarray(score_bad); y = np.asarray(y).astype(bool)
    if y.all() or (~y).all(): return float("nan")
    r = np.argsort(np.argsort(s)) + 1
    return float((r[y].sum() - y.sum() * (y.sum() + 1) / 2) / (y.sum() * (~y).sum()))
def collect(S, tau):
    rows = []
    for s in S:
        lp, dt = dm.em(s["em"])
        F = guven2.line_features(lp, dt, s["lines"], s["lang"], tau=tau)
        lab, wf = hiza.build(s["lines"], s["lang"]); first, _, _ = hiza.viterbi(lp, lab); wt = hiza.word_times(first, wf, dt)
        k = 0; js = sorted(F)
        posts = np.array([F[j]["post"] for j in js]); heard = np.array([F[j]["heard"] for j in js])
        rate = np.array([F[j]["rate"] for j in js]); med_rate = np.median(rate)
        for n, j in enumerate(js):
            k = sum(len(l) for l in s["lines"][:j])
            e = abs(wt[k] - s["ls"][j])
            lo, hi = max(0, n - 1), min(len(js), n + 2)
            rows.append(dict(set=s["set"], split=s["split"], sid=s["sid"], e=float(e), post=F[j]["post"], post1=F[j]["post1"],
                             heard=F[j]["heard"], gap=F[j]["gap"], lrate=float(abs(np.log(rate[n] / med_rate))),
                             post_n=float(np.min(posts[lo:hi])), song_heard=float(heard.mean()), song_post=float(np.median(posts))))
    return rows
if __name__ == "__main__":
    tau = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
    S = dm.songs("hepsi")
    # tam kayıtlı makam (denetimin emisyonları): gerçekçi Türkçe koşul
    import emisyon
    for sp in ["dogrulama", "son_sinama"]:
        for s in veri.makam(sp):
            z = np.load(emisyon.EM / f"makamtam_{s.sid}.npz")
            dm._EM["T_" + s.sid] = (z["lp"].astype(np.float64), float(z["dt"]))
            S.append(dict(set="makamtam", split="son_sinama", sid=s.sid, lang="tr", lines=s.lines, ls=veri.makam_full(s), em="T_" + s.sid))
    rows = collect(S, tau)
    json.dump(rows, open(OUT / f"guven_{tau}.json", "w"))
    for part, sets in [(("gelistirme", "dogrulama"), ("jamendo", "makam", "vekil")), (("son_sinama",), ("jamendo", "makam", "vekil")), (("son_sinama",), ("jamendo",)), (("son_sinama",), ("makamtam",))]:
        R = [r for r in rows if r["split"] in part and r["set"] in sets]
        y = np.array([r["e"] > 1 for r in R])
        print(part, sets, "satır", len(R), "büyük hata", int(y.sum()))
        for f, sign in [("gap", -1), ("post", -1), ("post1", -1), ("post_n", -1), ("heard", -1), ("lrate", 1), ("song_heard", -1), ("song_post", -1)]:
            print(f"   AUROC {f:10s} {auroc(sign * np.array([r[f] for r in R]), y):.3f}")
