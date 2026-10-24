# Çekirdeğin (Rust, spectrum.rs) seviyelerini örnek videoda ölçülen boylarla karşılaştırır.
# Seviyeler README'deki geçici testle üretilir (<ad>.f32.levels.json, 60 kare/sn, −14 LUFS kazancıyla).
# Kullanım: python3 dogrula.py <ad> <gecikme sn>
import numpy as np, json, sys
from model import frames, T0
v=sys.argv[1]; lag=float(sys.argv[2])
lv=np.array(json.load(open(v+'.f32.levels.json')))
E=np.load(v+'-E.npy'); N=E.shape[1]; pts=frames(v)
# 220 çubuklu videoda çubuk k'nın frekansı 20+9·k: 200 çubuklu modelden ara değerle
fk=20+1980/N*np.arange(N); kk=(fk-20)/9.9
idx=np.clip(np.round((pts+lag-T0)*60).astype(int),0,len(lv)-1)
L=np.stack([np.interp(kk,np.arange(200),lv[i]) for i in idx])
H=1220; P=(0.0033+L*(0.45-0.0033))*H
m=np.isfinite(E)&(L<0.999)
r=np.corrcoef(P[m],E[m])[0,1]
sl=np.polyfit(P[m],E[m],1)
rs=[np.corrcoef(P[np.isfinite(E[:,k]),k],E[np.isfinite(E[:,k]),k])[0,1] for k in range(N) if np.isfinite(E[:,k]).sum()>0.5*len(E) and np.nanstd(E[:,k])>0.5]
print(v,'pooled r=%.3f  slope measured/model=%.2f  intercept=%.1f px  per-bar mean r=%.3f'%(r,sl[0],sl[1],np.mean(rs)))
for a,b,name in [(0,20,'bas 20-218 Hz'),(20,60,'218-614'),(60,120,'614-1208'),(120,N,'1208-2000')]:
    sub=m.copy(); sub[:,:a]=False; sub[:,b:]=False
    print('  %-14s r=%.3f n=%d'%(name,np.corrcoef(P[sub],E[sub])[0,1],sub.sum()))
