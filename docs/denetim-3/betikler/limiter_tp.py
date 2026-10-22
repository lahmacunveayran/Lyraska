import numpy as np, sys
sys.path.insert(0,'.')
from limiter_sim import limit, CEIL
from scipy.signal import resample_poly
from math import pi
def tpm(sig,os=16,margin=2000):
    u=resample_poly(sig,os,1,window=('kaiser',12.0))
    return np.max(np.abs(u[margin*os:-margin*os]))
for rate in (44100,48000,96000,192000):
    t=np.arange(rate*2)/rate
    cases={
     'fs/4 45°, 1.4':1.4*np.sin(2*pi*(rate/4)*t+pi/4),
     'kırpılmış 9 kHz':np.clip(3*np.sin(2*pi*9000*t),-1,1),
     'kırpılmış 15 kHz':np.clip(3*np.sin(2*pi*15000*t+0.3),-1,1),
     '19 kHz 1.2':1.2*np.sin(2*pi*19000*t+0.7),
     'gürültü (20 kHz bant) x3 kırpılmış':None,
    }
    rng=np.random.default_rng(2)
    n=rng.standard_normal(len(t)); 
    # 20 kHz'e bant sınırlı gürültü, sonra kırpma (gerçek masterlara benzer)
    N=np.fft.rfft(n); f=np.fft.rfftfreq(len(n),1/rate); N[f>20000]=0; n=np.fft.irfft(N,len(n)); n/=np.std(n)
    cases['gürültü (20 kHz bant) x3 kırpılmış']=np.clip(3*n,-1,1)
    for k,x in cases.items():
        y,g,d=limit(x,rate)
        print(rate,k,f"giriş TP {20*np.log10(tpm(x[rate//4:])):+.2f} çıkış TP {20*np.log10(tpm(y[rate//4:])):+.3f} dBTP, çıkış örnek tepe {20*np.log10(np.max(np.abs(y))):+.3f} (tavan -1)")
