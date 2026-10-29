import subprocess, sys, numpy as np
def frames(path, crop, w, h):
    cmd=['ffmpeg','-v','error','-i',path,'-vf',f'crop={crop},scale={w}:{h},format=gray','-f','rawvideo','-']
    raw=subprocess.run(cmd,capture_output=True).stdout
    return np.frombuffer(raw,np.uint8).reshape(-1,h,w).astype(np.int16)
def prof(path,crop,line_frac,name):
    W,H=400,300
    f=frames(path,crop,W,H)
    med=np.median(f,axis=0)
    moving=np.abs(f-med)>35
    line=int(line_frac*H)
    band=moving[:,line-int(0.45*H):min(H,line+int(0.45*H)),:]
    ext=band.sum(axis=1)/H   # per frame per column
    mean=ext.mean(axis=0); act=(ext>0.01).mean(axis=0)
    bins=10
    print(name, 'frames',len(f))
    print(' ortalama boy %  :',' '.join(f'{100*mean[i*W//bins:(i+1)*W//bins].mean():5.1f}' for i in range(bins)))
    print(' hareketli kare %:',' '.join(f'{100*act[i*W//bins:(i+1)*W//bins].mean():5.0f}' for i in range(bins)))
U='/root/.claude/uploads/9835f28f-d1ce-5ff7-89cd-1c5dc1aa8e06/'
import glob
prof(glob.glob(U+'b0fdf588*')[0],'1920:1040:0:10',(534-10)/1040,'bizim')
for k in ['ade1f17f','cfbbbc1b','3d4c7fea']:
    prof(glob.glob(U+k+'*')[0],'2170:1220:271:0',622/1220,'ornek '+k)
