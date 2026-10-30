# spectrum.rs + spectrumBars.ts + photoScene.ts targetExtents'in birebir Python taklidi ve ortak araçlar.
import json
import numpy as np
SR = 44100
WINDOW, PAD, BARS = 4096, 4, 200
START_HZ, END_HZ, FULL = 20.0, 2000.0, 0.285
REST, CAP = 0.0033, 0.45          # ekran yüksekliğinin oranı (photoScene.ts)
RELEASE_TAU = 0.02                # spectrumBars.ts
HGT = {'biz': 991, 'a': 1220, 'tam': 480, 'lyr': 720, 'lyr2': 720, 'lyr3': 720}     # çubukların çizildiği alanın yüksekliği (px)
_c = {}

def audio(v, stereo=False):
    k = (v, stereo)
    if k not in _c:
        x = np.fromfile(f'veri/{v}.st.f32' if stereo else f'veri/{v}.f32', '<f4').astype(float)
        _c[k] = x.reshape(-1, 2) if stereo else x
    return _c[k]

def meta(v): return json.load(open(f'veri/{v}-meta.json'))
def frames(v): return np.array(json.load(open(f'veri/{v}-pts.json')))
def E(v): return np.load(f'veri/{v}-E.npy') / HGT[v]   # ekran yüksekliğinin oranı

_win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(WINDOW) / (WINDOW - 1))
_scale = 2 / _win.sum()
def bar_hz(n=BARS): return START_HZ + (END_HZ - START_HZ) * np.arange(n) / BARS

def spectra(x, centres, L=WINDOW, pad=PAD, win=None):
    """Her merkez örneğin üstüne ortalanmış L örneklik Hann pencerenin genlik spektrumu (tam sinüs = 1)."""
    w = _win if (win is None and L == WINDOW) else (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(L) / (L - 1)) if win is None else win)
    sc = 2 / w.sum()
    out = np.zeros((len(centres), L * pad // 2 + 1))
    for i, c in enumerate(centres):
        lo = int(round(c)) - L // 2
        seg = np.zeros(L)
        a0, a1 = max(0, lo), min(len(x), lo + L)
        if a1 > a0: seg[a0 - lo:a1 - lo] = x[a0:a1]
        out[i] = np.abs(np.fft.rfft(seg * w, L * pad)) * sc
    return out, SR / (L * pad)

def amps(v, times, lag, L=WINDOW, hz=None):
    """Kayıt zamanlarında (video saati + lag) çubuk frekanslarındaki genlik (spectrum.rs: kesirli kutu, doğrusal ara)."""
    t0 = meta(v)['audio_start']
    S, bh = spectra(audio(v), (np.asarray(times) + lag - t0) * SR, L)
    hz = bar_hz() if hz is None else hz
    return np.stack([np.interp(hz / bh, np.arange(S.shape[1]), s) for s in S])

def levels(A, gain): return np.clip(A * gain / FULL, 0, 1)

def step_bars(L, times):
    out = np.zeros_like(L); prev = np.zeros(L.shape[1])
    for i in range(len(L)):
        dt = times[i] - times[i - 1] if i else 1 / 60
        keep = np.exp(-max(0, min(dt, 0.25)) / RELEASE_TAU)
        prev = np.where(L[i] >= prev, L[i], L[i] + (prev - L[i]) * keep)
        out[i] = prev
    return out

def extents(lv): return REST + lv * (CAP - REST)

def resample_bars(X, n):
    """Ölçülen çubuk sayısı farklıysa (aynı 20–2000 doğrusal eksen) ara değerle n çubuğa."""
    if X.shape[1] == n: return X
    src = np.arange(X.shape[1]) / X.shape[1]; dst = np.arange(n) / n
    return np.stack([np.interp(dst, src, r) for r in X])

def per_bar_r(Em, P, minfrac=0.5):
    F, N = Em.shape; rs = np.full(N, np.nan)
    for k in range(N):
        m = np.isfinite(Em[:, k])
        if m.sum() < max(8, F * minfrac) or np.std(Em[m, k]) < 1e-4 or np.std(P[m, k]) == 0: continue
        rs[k] = np.corrcoef(Em[m, k], P[m, k])[0, 1]
    return rs

def pooled(Em, P):
    m = np.isfinite(Em); return np.corrcoef(Em[m], P[m])[0, 1]
