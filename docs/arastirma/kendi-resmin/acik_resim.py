# Telifsiz açık test resmi (1920×1080): üçüncü örnek videonun paletine benzer renkler (açık gök,
# ten rengi, beyaz, lacivert, kahverengi), rastgele biçimler. Hiçbir video karesi kullanılmaz.
# Kullanım: python3 acik_resim.py <çıktı.png>
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W,H=1920,1080
rng=np.random.default_rng(7)
im=Image.new('RGB',(W,H))
d=ImageDraw.Draw(im)
for y in range(H):  # gökyüzü
    t=y/H; d.line([(0,y),(W,y)],fill=(int(205+30*t),int(225+15*t),int(236+10*t)))
pal=[(39,31,44),(152,158,158),(213,227,229),(208,189,162),(101,103,111),(225,200,170),(245,245,248),(120,80,50),(30,25,60)]
wts=[0.22,0.12,0.08,0.18,0.08,0.12,0.1,0.06,0.04]
for i in range(60):
    c=pal[rng.choice(len(pal),p=wts)]
    x,y=rng.uniform(-200,W),rng.uniform(-200,H); w,h=rng.uniform(80,700),rng.uniform(60,500)
    if rng.random()<0.5: d.ellipse([x,y,x+w,y+h],fill=c)
    else:
        pts=[(x+rng.uniform(0,w),y+rng.uniform(0,h)) for _ in range(5)]; d.polygon(pts,fill=c)
for i in range(30):  # ince çizgiler (pencere çerçeveleri gibi)
    c=pal[rng.choice([0,7,4])]; x=rng.uniform(0,W); d.line([(x,0),(x+rng.uniform(-300,300),H)],fill=c,width=int(rng.uniform(3,14)))
im=im.filter(ImageFilter.GaussianBlur(1.2))
import sys; im.save(sys.argv[1])
