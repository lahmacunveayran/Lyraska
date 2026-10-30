import json, numpy as np, jam
from hiza import KOK1
M = jam.meta(); rows = []
for sp in ["gelistirme", "dogrulama", "son_sinama"]:
    r = json.load(open(KOK1 / f"cache/sonuc/jamendo_{sp}_ctc-karisim.json"))
    for s in r["sarkilar"]: rows.append((sp, s["sid"], M[s["sid"]], np.array(s["satir_hata"]), np.array(s["kelime_hata"])))
def rep(name, sel):
    S = [x for x in rows if sel(x)]
    if not S: return
    le = np.concatenate([x[3] for x in S]); we = np.concatenate([x[4] for x in S])
    bad = sum(1 for x in S if x[3].mean() > 1)
    print(f"{name:28s} şarkı {len(S):2d} satır≤0,3 {np.mean(le<=.3)*100:5.1f}% kelime≤0,3 {np.mean(we<=.3)*100:5.1f}% satır ort {le.mean():5.2f}  ort>1sn şarkı {bad}")
rep("hepsi (79)", lambda x: True)
for g in sorted({x[2]["Genre"] for x in rows}): rep("tür " + g, lambda x, g=g: x[2]["Genre"] == g)
rep("NonLexical", lambda x: x[2]["NonLexical"] == "true")
rep("Polyphonic", lambda x: x[2]["Polyphonic"] == "true")
rep("LyricOverlap", lambda x: x[2]["LyricOverlap"] == "true")
rep("bayraksız", lambda x: x[2]["NonLexical"] != "true" and x[2]["Polyphonic"] != "true" and x[2]["LyricOverlap"] != "true")
for sid in ["Avercage_-_Embers", "Pure_Mids_-_The_Leader", "Color_Out_-_Falling_Star", "Fantasma_-_Los_Rombos", "CHRISTMAS_AVEC_TOI_-_imfreshyourepretty"]:
    m = M[sid]; print(sid, m["Genre"], m["LyricOverlap"], m["Polyphonic"], m["NonLexical"])
