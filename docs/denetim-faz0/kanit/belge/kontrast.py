# WCAG 2.2 kontrast hesabı: :root değişkenlerinden (src/styles/global.css)
def lin(c):
    c/=255
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def L(rgb): r,g,b=rgb; return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def hx(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def blend(fg,a,bg): return tuple(fg[i]*a+bg[i]*(1-a) for i in range(3))
def cr(a,b):
    la,lb=L(a),L(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
ink=hx('#f4f7fb')
bgs={'--bg #02040b':hx('#02040b'),'--sky-horizon #0b1b2c':hx('#0b1b2c'),
     'aurora #46f0a6 %40 + shade %82':blend(hx('#02040b'),0.82,blend(hx('#46f0a6'),0.4,hx('#0b1b2c'))),
     'aurora #46f0a6 tam (gölgesiz, en kötü)':hx('#46f0a6')}
glass=lambda bg: blend(hx('#0c101a'),0.46,bg)
for name,a in [('--ink',1.0),('--ink-2 (0.72)',0.72),('--ink-3 (0.48)',0.48),('--text-muted (0.5)',0.5)]:
    for bn,bg in bgs.items():
        print(f"{name:20s} | {bn:40s} | {cr(blend(ink,a,bg),bg):5.2f}")
# vfd ghost vs lit
print('vfd lit on bg', round(cr(hx('#6cf6df'),hx('#02040b')),2))
print('accent on error bg', round(cr(hx('#ffb54c'),blend(hx('#281806'),0.6,hx('#02040b'))),2))
