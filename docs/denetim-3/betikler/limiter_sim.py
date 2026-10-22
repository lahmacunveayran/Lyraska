# limiter.rs (0.0.56) birebir python kopyası: tek kanal. Amaç: nötr çalmada (EQ düz, eşitleme kapalı)
# tepesi -1..0 dBTP arasındaki sinyallerde sınırlayıcının ne yaptığını ölçmek.
import numpy as np
from math import pi
TAPS=16
def interpolator(rate):
    factor = 8 if rate<96000 else (4 if rate<192000 else 2)
    L=factor*TAPS; c=(L-1)/2
    ph=np.zeros((factor,TAPS))
    for n in range(L):
        x=(n-c)/factor
        s=1.0 if abs(x)<1e-12 else np.sin(pi*x)/(pi*x)
        w=0.42-0.5*np.cos(2*pi*n/(L-1))+0.08*np.cos(4*pi*n/(L-1))
        ph[n%factor][n//factor]=s*w
    for p in range(factor): ph[p]/=ph[p].sum()
    return ph,factor
CEIL=10**(-1/20)
def limit(x, rate=48000):
    delay=max(round(0.0015*rate),TAPS//2+1); look=delay-TAPS//2
    rel=1-np.exp(-1/(0.08*rate))
    ph,f=interpolator(rate)
    N=len(x)
    # peak[n]: max(|x[n-8]|, |sum_t c_p[t] x[n-t]|)
    xp=np.concatenate([np.zeros(TAPS),x])
    peak=np.abs(np.concatenate([np.zeros(8),x])[:N])
    for p in range(f):
        y=np.convolve(xp,ph[p])[TAPS:TAPS+N]
        peak=np.maximum(peak,np.abs(y))
    wanted=np.where(peak>CEIL,CEIL/np.maximum(peak,1e-30),1.0)
    # kayan en küçük (look+1)
    from collections import deque
    win=np.ones(look+1); wp=0
    held=1.0; sm=np.ones(look); sp=0; ssum=float(look)
    g=np.empty(N)
    for n in range(N):
        win[wp]=wanted[n]; wp=(wp+1)%(look+1)
        m=win.min()
        held = m if m<held else held+(m-held)*rel
        ssum += held-sm[sp]; sm[sp]=held; sp=(sp+1)%look
        gg=ssum/look
        g[n]=1.0 if gg>1-1e-12 else gg
    out=np.concatenate([np.zeros(delay),x])[:N]*g
    return out,g,delay
def tp(sig,os=16):
    from scipy.signal import resample_poly
    return np.max(np.abs(resample_poly(sig,os,1)))
def thd(sig,rate,f0):
    # pencereli FFT ile temel dışı enerji / temel (THD+N, dB)
    n=len(sig); w=np.blackman(n); S=np.abs(np.fft.rfft(sig*w))**2
    fr=np.fft.rfftfreq(n,1/rate); k=np.argmin(abs(fr-f0))
    fund=S[max(k-6,0):k+7].sum(); rest=S.sum()-fund-S[:3].sum()
    return 10*np.log10(rest/fund)
rate=48000
t=np.arange(rate*3)/rate
print("CEIL dBTP", 20*np.log10(CEIL))
for f0,amp in [(50,1.0),(50,0.98),(100,1.0),(1000,0.99),(40,1.0)]:
    x=amp*np.sin(2*pi*f0*t)
    y,g,d=limit(x,rate)
    seg=slice(rate,3*rate)  # oturmuş kısım
    print(f"{f0:5d} Hz genlik {amp:.2f} ({20*np.log10(tp(x[seg])):+.2f} dBTP): giriş THD+N {thd(x[seg],rate,f0):7.1f} dB, "
          f"çıkış THD+N {thd(y[seg],rate,f0):7.1f} dB, kazanç min {20*np.log10(g[seg].min()):+.2f} dB maks {20*np.log10(g[seg].max()):+.2f} dB, çıkış TP {20*np.log10(tp(y[seg])):+.2f} dBTP")
# Gerçekçi: bas (55 Hz) + davul benzeri darbe + 2 kHz ton, örnek tepesi -0.1 dBFS'e normalize
rng=np.random.default_rng(1)
x=0.6*np.sin(2*pi*55*t)+0.25*np.sin(2*pi*2000*t)
for k in range(0,len(t),rate//2):
    L=min(2400,len(t)-k); x[k:k+L]+=0.5*np.exp(-np.arange(L)/300)*rng.standard_normal(L)
x*=10**(-0.1/20)/np.max(np.abs(x))
y,g,d=limit(x,rate)
print(f"müzik benzeri, örnek tepe -0.10 dBFS, TP {20*np.log10(tp(x)):+.2f} dBTP: kazanç <1 olan örnek oranı %{100*np.mean(g<1):.1f}, en düşük {20*np.log10(g.min()):+.2f} dB; "
      f"çıkışın girişten farkı (gecikme hizalı) en büyük {np.max(np.abs(y[d:]-x[:-d])):.3f}")
