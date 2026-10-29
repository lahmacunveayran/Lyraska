"""drop.rs'in `features`/`score`/`confidence`'ının Python eşi; birim testi taslaklarını Rust'a geçmeden denemek için."""
import math
W=[0.1738,-0.02596,-0.09134,-0.1424,-0.01309,0.1859,0.2815,0.1438,5.042,3.838,-1.118,0.3679];B=-11.64
DW=[0.04252,0.06307,0.09696,-0.1121,0.01125,0.07967,0.1218,0.1381,3.57,2.307,-0.3117,-0.01409];DS,DB=0.2259,-6.419
def pct(v,q):
    s=sorted(v);p=(len(s)-1)*q;lo=int(p);hi=min(lo+1,len(s)-1);return s[lo]+(s[hi]-s[lo])*(p-lo)
def run(parts, mconf=1.0):
    bass,high,loud,spec,starts=[],[],[],[],[]
    for (n,b,m,h,l) in parts:
        starts.append(len(bass))
        for j in range(n):
            x=j/(max(n,2)-1); at=lambda r: r[0]+(r[1]-r[0])*x if isinstance(r,tuple) else r
            bb,mm,hh=at(b),at(m),at(h); bass.append(bb);high.append(hh);loud.append(at(l))
            spec.append([bb]*8+[mm]*16+[hh]*8)
    N=len(bass); mean=lambda x,a,b:(sum(x[max(a,0):min(b,len(x))])/(min(b,len(x))-max(a,0))) if min(b,len(x))>max(a,0) else 0
    sm=lambda a,b,k: sum(spec[i][k] for i in range(a,b))/(b-a)
    fr,lr=pct(high,.8),pct(bass,.9); out=[]
    for i in range(N):
        if i<16 or i+12>N: out.append(None);continue
        after=mean(bass,i,i+8)
        f=[after-mean(bass,i-8,i), after-mean(bass,i-12,i-4),
           sum(max(0,sm(i,i+8,k)-sm(i-8,i,k)) for k in range(32))/32,
           mean(high,i,i+8)-mean(high,i-8,i), max(0,mean(loud,i-8,i-2)-min(loud[i-2],loud[i-1])),
           mean(high,i,i+4)-mean(high,i+4,i+8), min(0,mean(high,i,i+8)-fr), min(0,after-lr)]
        fl=mean(bass,i,i+4)-6; w=bass[i:i+32]; f.append(sum(v>=fl for v in w)/len(w))
        f.append(mconf*((1 if i%4==0 else 0)-0.25))
        f.append(sum(abs(sm(i,i+4,k)-sm(i+4,i+12,k)) for k in range(8,24))/16)
        f.append(sum(abs(sm(i,i+2,k)-sm(i-2,i,k)) for k in range(32))/32)
        out.append(f)
    sc=sorted(((B+sum(w*v for w,v in zip(W,f)),i) for i,f in enumerate(out) if f), reverse=True)
    ch=[]
    for z,i in sc:
        if z>=-12 and all(abs(i-c)>=32 for _,c in ch): ch.append((z,i))
    res=[]
    for z,i in sorted(ch,key=lambda t:t[1]):
        f=out[i]; p=1/(1+math.exp(-(DB+DS*z+sum(w*v for w,v in zip(DW,f)))))
        if p>=0.2: res.append((i,round(p,2)))
    return starts,res
groove=(32,34,32,40,-10); calm=(32,12,30,34,-18)
build=(32,(12,16),(30,34),(36,48),(-18,-9)); drop_acc=(4,41,35,47,-5); drop=lambda n:(n,40,35,43,-6)
print("yazarın testi (riser):", run([groove,calm,build,drop(64),groove]))
# Taslak 1: rock girişi — yükseliş yok, drop'ta ziller (tizler artar), crash yok.
intro=(32,14,30,30,-16); band=(64,38,34,44,-7)
print("rock girişi (tiz artar):", run([intro,band,(32,30,31,38,-11),band]))
# Taslak 2: aynı drop, ölçü güveni 0 (aksak/ölçüsü belirsiz şarkı).
print("ölçü güveni 0:", run([groove,calm,build,drop(64),groove], mconf=0.0))
# Taslak 3: riserli ama riser tizi droptan kısık (yumuşak yükseliş).
print("yumuşak yükseliş:", run([groove,calm,(32,(12,16),(30,34),(32,38),(-18,-12)),drop(64),groove]))
