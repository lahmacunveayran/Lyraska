"""Düşünce deneyi: K-ağırlıklı süzgeç her hızda 48 kHz katsayılarıyla (hıza uyarlanmadan) kullanılsaydı,
loudness.rs `her_ornekleme_hizinda_ayni_sonuc` testi (1 kHz, −23 dBFS, ±0,1 LU) bunu yakalar mıydı?
Bağımsız: K süzgecinin kararlı durum kazancı frekans yanıtından; LUFS = −0,691 + 10·log10(2 · A²/2 · |K|²)."""
import numpy as np
SB=[1.53512485958697,-2.69169618940638,1.19839281085285]; SA=[1,-1.69065929318241,0.73248077421585]
HB=[1,-2,1]; HA=[1,-1.99004745483398,0.99007225036621]
def H(b,a,f,fs):
    z=np.exp(-1j*2*np.pi*f/fs); return (b[0]+b[1]*z+b[2]*z*z)/(a[0]+a[1]*z+a[2]*z*z)
def lufs(f,fs,db=-23):
    g=abs(H(SB,SA,f,fs)*H(HB,HA,f,fs))**2
    return -0.691+10*np.log10(2*(10**(db/20))**2/2*g)
for f in (1000.0, 3000.0, 6000.0):
    row=[f"{fs/1000:g} kHz: {lufs(f,fs):+.3f}" for fs in (22050.0,44100.0,48000.0,96000.0)]
    print(f"{f/1000:g} kHz sinüs −23 dBFS, 48 kHz katsayılarıyla:", ", ".join(row))
