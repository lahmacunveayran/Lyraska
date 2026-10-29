"""Gerçek drop vuruşlarında güven: tam model ve tek kanıt sıfırlanınca (yeniden uydurmadan, kaba karşı olgu)."""
import json, math, sys
from pathlib import Path
W=[0.1738,-0.02596,-0.09134,-0.1424,-0.01309,0.1859,0.2815,0.1438,5.042,3.838,-1.118,0.3679];B=-11.64
DW=[0.04252,0.06307,0.09696,-0.1121,0.01125,0.07967,0.1218,0.1381,3.57,2.307,-0.3117,-0.01409];DS,DB=0.2259,-6.419
def conf(x, drop=None):
    x=[0 if j==drop else v for j,v in enumerate(x)]
    z=B+sum(w*v for w,v in zip(W,x)); return 1/(1+math.exp(-(DB+DS*z+sum(w*v for w,v in zip(DW,x)))))
names=None
for oz, folder, kinds in [("oz-karsi","set",None),("oz-son","/tmp/claude-0/dropset/son",None),("oz-son","/tmp/claude-0/dropset/son",{"rock"})]:
    xs=[]
    for f in sorted(Path(oz).glob("*.oz.json")):
        t=json.loads((Path(folder)/(f.name[:-8]+".json")).read_text())
        if kinds and t["tur"] not in kinds: continue
        d=json.loads(f.read_text()); names=d["names"]
        for dt in t["drops"]:
            i=min(range(len(d["beats"])),key=lambda k:abs(d["beats"][k]-dt))
            if d["features"][i]: xs.append(d["features"][i])
    row=lambda j: sum(conf(x,j)>=0.6 for x in xs)
    print(oz, kinds or "", f"gerçek drop {len(xs)}: güven≥0,6 {row(None)}; sıfırlanınca:", " ".join(f"{n}:{row(j)}" for j,n in enumerate(names) if j in (3,5,6,7,9)))
