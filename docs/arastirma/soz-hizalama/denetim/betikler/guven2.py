"""Denetimin güven ölçüsü: ileri-geri (forward-backward) ile satır başının sonsal dağılımı.
onset_post[j] = satırın ilk harfine Viterbi anının ±w içinde girilme olasılığı (sıcaklık τ ile yumuşatılmış)."""
import numpy as np, numba, hiza, hiza2

@numba.njit(cache=True)
def _lse(a, b):
    if a < b: a, b = b, a
    if b < -1e29: return a
    return a + np.log1p(np.exp(b - a))

@numba.njit(cache=True)
def entry_post(lp, emit, skip_ok, targets):
    """targets: durum indisleri (satırların ilk harf durumu). Dönen (len(targets), T): o duruma t'de *giriş*
    olasılığı (önceki karede başka durumdaydı)."""
    T = lp.shape[0]; S = emit.shape[0]; NEG = -1e30
    A = np.full((T, S), np.float32(NEG))
    a = np.full(S, NEG); a[0] = lp[0, emit[0]]; a[1] = lp[0, emit[1]]
    for s in range(S): A[0, s] = a[s]
    na = np.empty(S)
    for t in range(1, T):
        for s in range(S):
            v = a[s]
            if s >= 1: v = _lse(v, a[s - 1])
            if s >= 2 and skip_ok[s]: v = _lse(v, a[s - 2])
            na[s] = v + lp[t, emit[s]]
        for s in range(S): a[s] = na[s]; A[t, s] = a[s]
    Z = _lse(a[S - 1], a[S - 2])
    b = np.full(S, NEG); b[S - 1] = 0.0; b[S - 2] = 0.0
    out = np.zeros((targets.shape[0], T))
    nb = np.empty(S)
    for t in range(T - 1, 0, -1):
        # giriş t'de: A[t-1, s-1 veya s-2] + lp[t, emit[s]] + b_t[s]
        for k in range(targets.shape[0]):
            s = targets[k]
            v = NEG
            if s >= 1: v = _lse(v, A[t - 1, s - 1])
            if s >= 2 and skip_ok[s]: v = _lse(v, A[t - 1, s - 2])
            out[k, t] = np.exp(v + lp[t, emit[s]] + b[s] - Z)
        # b_{t-1}[s] = lse(b_t[s] + e_t[s], b_t[s+1]+e_t[s+1], b_t[s+2]+e_t[s+2] (izinliyse))
        for s in range(S):
            v = b[s] + lp[t, emit[s]]
            if s + 1 < S: v = _lse(v, b[s + 1] + lp[t, emit[s + 1]])
            if s + 2 < S and skip_ok[s + 2]: v = _lse(v, b[s + 2] + lp[t, emit[s + 2]])
            nb[s] = v
        for s in range(S): b[s] = nb[s]
    for k in range(targets.shape[0]):
        if targets[k] <= 1: out[k, 0] = np.exp(A[0, targets[k]] + b[targets[k]] - Z)
    return out

def line_features(lp, dt, lines, lang, tau=1.0, w=0.3):
    lab, wf, rng = hiza2.build_lines(lines, lang)
    L = len(lab); S = 2 * L + 1
    emit = np.zeros(S, np.int64); emit[1::2] = lab
    skip_ok = np.zeros(S, np.bool_); skip_ok[3::2] = lab[1:] != lab[:-1]
    first, _, _, _, path, _ = hiza2.align(lp, lines, lang)
    real = [j for j, r in enumerate(rng) if r is not None]
    targets = np.arange(1, S, 2, dtype=np.int64)  # bütün harf durumları
    P = entry_post(np.ascontiguousarray(lp * tau), emit, skip_ok, targets)
    W = int(w / dt)
    T = P.shape[1]
    cs = np.concatenate([np.zeros((P.shape[0], 1)), np.cumsum(P, axis=1)], axis=1)
    fi = np.clip(first, 0, T - 1)
    lab_mass = cs[np.arange(L), np.clip(fi + W + 1, 0, T)] - cs[np.arange(L), np.clip(fi - W, 0, T)]
    feats = {}
    best = lp.max(1)
    for k, j in enumerate(real):
        a, b = rng[j]; t0 = first[a]
        nxt = first[rng[real[k + 1]][0]] if k + 1 < len(real) else len(path)
        mass = np.median(lab_mass[a:b + 1]); mass_first = lab_mass[a]
        # duyulan harf oranı: yoldaki her etiketin karelerinde en yüksek olasılık > 0,3
        heard = []
        for i in range(a, b + 1):
            fr = np.where(path == 2 * i + 1)[0]
            heard.append(np.exp(lp[fr, lab[i]]).max() > 0.3 if len(fr) else False)
        seg = slice(t0, max(nxt, t0 + 1))
        gap = (lp[np.arange(seg.start, seg.stop), emit[path[seg]]] - best[seg]).mean()
        dur = (nxt - t0) * dt
        feats[j] = dict(post=float(mass), post1=float(mass_first), heard=float(np.mean(heard)), gap=float(gap), rate=float((b - a + 1) / max(dur, 0.05)),
                        t=float(t0 * dt))
    return feats
