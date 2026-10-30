import json, numpy as np
R = json.load(open("../sonuc/guven_0.5.json"))
dev = [r for r in R if r["split"] in ("gelistirme", "dogrulama") and r["set"] != "makamtam"]
def stats(rows, f, th, sign):
    v = np.array([sign * r[f] for r in rows]); e = np.array([r["e"] for r in rows])
    flag = v > th  # yüksek = kötü
    big = e > 1
    return dict(isaretli=flag.mean() * 100, yakalanan=f"{(flag & big).sum()}/{big.sum()}",
                isaretsiz_gt1=(e[~flag] > 1).mean() * 100, isaretsiz_le03=(e[~flag] <= .3).mean() * 100, isaretli_gt1=(e[flag] > 1).mean() * 100 if flag.any() else 0)
for f, sign in [("post", -1), ("gap", -1)]:
    # eşik: geliştirme+doğrulamada büyük hataların %80'ini yakalayan en gevşek eşik
    v = np.array([sign * r[f] for r in dev]); e = np.array([r["e"] for r in dev]); bv = np.sort(v[e > 1])
    th = bv[int(len(bv) * 0.2)] - 1e-9
    print(f, "eşik", round(-th if sign < 0 else th, 3))
    for name, rows in [("gel+dog", dev), ("son (jamendo+makam+vekil)", [r for r in R if r["split"] == "son_sinama" and r["set"] != "makamtam"]),
                       ("son jamendo", [r for r in R if r["split"] == "son_sinama" and r["set"] == "jamendo"]), ("makam tam kayıt", [r for r in R if r["set"] == "makamtam"])]:
        print("  ", name, {k: (round(v, 1) if isinstance(v, float) else v) for k, v in stats(rows, f, th, sign).items()})
# şarkı düzeyi: düşük güvenli satır oranı
th = 0.5
print("şarkı düzeyi (post<0,5 olan satır oranı) — son jamendo:")
by = {}
for r in R:
    if r["split"] == "son_sinama" and r["set"] in ("jamendo", "makamtam"): by.setdefault((r["set"], r["sid"]), []).append(r)
for (st, sid), rows in sorted(by.items(), key=lambda kv: -np.mean([r["e"] for r in kv[1]])):
    low = np.mean([r["post"] < th for r in rows]); me = np.mean([r["e"] for r in rows])
    if me > 0.5 or low > 0.2: print(f"   {st:8s} {sid[:40]:40s} ort hata {me:6.2f}  düşük güvenli satır %{low*100:4.0f}")
