# Parametrik model ve uydurma araçları: çubuk k → frekans, pencere, genlik; kare zamanlarında spektrum.
# LAG: kayıtta görüntü sesten önde (ekran kaydedicinin ses gecikmesi); uydur.py ile bulunur.
# Parametrik model: çubuk k → frekans f_k (doğrusal ya da logaritmik), pencere L, genlik ölçeği.
import numpy as np, json
SR=44100; T0=0.046395
NB={'a':200,'b':220,'c':220}
LAG={'a':0.185,'b':0.17,'c':0.25}
_cache={}
def audio(v):
    if v not in _cache: _cache[v]=np.fromfile(v+'.f32','<f4').astype(float)
    return _cache[v]
def frames(v): return np.array(json.load(open(v+'-pts.json')))
def spec(v,L,lag=None,pad=8,win='hann',times=None):
    """Kare zamanlarında genlik spektrumu (tam ölçekli sinüs = 1), frekans çözünürlüğü SR/(L·pad)."""
    lag=LAG[v] if lag is None else lag
    key=(v,L,round(lag,4),pad,win,None if times is None else len(times))
    if key in _cache: return _cache[key]
    x=audio(v); t=(frames(v) if times is None else times)+lag
    w=np.hanning(L) if win=='hann' else (np.blackman(L) if win=='blackman' else np.ones(L))
    out=np.zeros((len(t),L*pad//2+1))
    for i,tt in enumerate(t):
        c=int(round((tt-T0)*SR)); lo=c-L//2
        seg=np.zeros(L)
        a0=max(0,lo); a1=min(len(x),lo+L)
        if a1>a0: seg[a0-lo:a1-lo]=x[a0:a1]
        out[i]=np.abs(np.fft.rfft(seg*w,L*pad))*2/w.sum()
    _cache[key]=(out,SR/(L*pad))
    return _cache[key]
def bar_freqs(N,f0,f1,kind):
    k=np.arange(N)/(N-1)
    return f0+(f1-f0)*k if kind=='lin' else f0*(f1/f0)**k
def predict(S,binhz,fk,agg='point',width=None):
    if agg=='point':
        return np.stack([np.interp(fk,np.arange(S.shape[1])*binhz,s) for s in S])
    # aralığın en büyüğü / ortalaması: komşu çubuk ortalarına kadar
    edges=np.concatenate([[fk[0]-(fk[1]-fk[0])/2],(fk[1:]+fk[:-1])/2,[fk[-1]+(fk[-1]-fk[-2])/2]])
    out=np.zeros((S.shape[0],len(fk)))
    for k in range(len(fk)):
        a=int(np.floor(max(0,edges[k])/binhz)); b=int(np.ceil(edges[k+1]/binhz))+1
        seg=S[:,a:b]
        out[:,k]=seg.max(1) if agg=='max' else (np.sqrt((seg**2).mean(1)) if agg=='rms' else seg.mean(1))
    return out
def score(E,P,minfrac=0.5,mode='bar'):
    F,N=E.shape; rs=[]
    for k in range(N):
        m=np.isfinite(E[:,k])
        if m.sum()<F*minfrac or E[m,k].std()<0.5 or P[m,k].std()==0: continue
        rs.append(np.corrcoef(E[m,k],P[m,k])[0,1])
    return np.mean(rs) if rs else np.nan, len(rs)
def pooled(E,P):
    m=np.isfinite(E)
    return np.corrcoef(E[m],P[m])[0,1]
