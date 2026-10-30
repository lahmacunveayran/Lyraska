import numpy as np, subprocess, onnxruntime as ort, time, hiza
from hiza import KOK1, OMNI
def load(path, sr=16000):
    raw = subprocess.run(["ffmpeg","-nostdin","-loglevel","error","-i",str(path),"-f","f32le","-ac","1","-ar",str(sr),"-"],check=True,capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
x = load(KOK1/"dl/jamendolyrics/mp3/HILA_-_Give_Me_the_Same.mp3")
o = ort.SessionOptions(); o.intra_op_num_threads = 4
s = ort.InferenceSession(str(OMNI/"model.int8.onnx"), o)
print([ (i.name,i.shape) for i in s.get_inputs()], [(i.name,i.shape) for i in s.get_outputs()])
seg = x[:480000]; seg = (seg-seg.mean())/np.sqrt(seg.var()+1e-5)
t=time.time(); lg = s.run(None, {"x": seg[None]})[0][0]; print("pencere", time.time()-t, lg.shape)
lp = lg - np.logaddexp.reduce(lg, axis=1, keepdims=True)
cols = [0]+[hiza._TOK[c] for c in hiza.COLS_CHARS]
mine = lp[:, cols]
c, dt = hiza.load_em("omni300v2_karisim_HILA_-_Give_Me_the_Same")
n = int(25/0.02)
print("ortak kare", n, "en büyük fark", np.abs(mine[:n]-c[:n]).max(), "argmax aynı %", (mine[:n].argmax(1)==c[:n].argmax(1)).mean()*100)
# blank oranı
print("blank en olası kare %", (lp.argmax(1)==0).mean()*100, "seçilen sütunlar dışı en olası %", (~np.isin(lp.argmax(1), cols)).mean()*100)
fr = 480000/lg.shape[0]
g = ((np.arange(n)+0.5)*fr/320).astype(int)
ok = g < len(c)
d = np.abs(mine[:n][ok]-c[g[ok]])
print("eşlemeyle en büyük fark", d.max(), "ortalama", d.mean(), "argmax aynı %", (mine[:n][ok].argmax(1)==c[g[ok]].argmax(1)).mean()*100)
