"""Satır atlamalı CTC Viterbi (denetimin önerdiği iyileştirme): metindeki bir ya da birkaç satır
hiç söylenmemiş olabilir (başlık, çeviri, yanlış satır). Satır atlamanın cezası P (nat) / satır.
Ayrıca ileri-geri ile sonsal (güven için)."""
import numpy as np, numba
import hiza

def build_lines(lines, lang, sep=True):
    """Satır satır etiket aralıkları: [(ilk_etiket, son_etiket)], kelime ilk etiketleri."""
    lab, wf, rng = [], [], []
    for line in lines:
        a = None
        for w in line:
            cs = hiza.norm_word(w, lang)
            if not cs: wf.append(-1); continue
            if lab and sep: lab.append(hiza.COL[" "])
            if a is None: a = len(lab)
            wf.append(len(lab)); lab.extend(cs)
        rng.append((a, len(lab) - 1) if a is not None else None)
    return np.array(lab, np.int64), wf, rng

@numba.njit(cache=True)
def _vit(lp, lab, emit, skip_ok, arc_from, arc_to, arc_pen, start_pen, end_pen):
    T = lp.shape[0]; S = emit.shape[0]; NEG = -1e30
    d = np.full(S, NEG)
    # başlangıç: ilk blank / ilk etiket; ayrıca start_pen[s] < 1e29 olan durumlardan (satır atlayarak) başlanabilir
    for s in range(S):
        if start_pen[s] < 1e29:
            d[s] = lp[0, emit[s]] - start_pen[s]
    bp = np.zeros((T, S), np.int32)  # kaynak durum farkı yerine kaynak durumun kendisi
    nd = np.empty(S)
    for t in range(1, T):
        for s in range(S):
            best = d[s]; arg = s
            if s >= 1 and d[s - 1] > best: best = d[s - 1]; arg = s - 1
            if s >= 2 and skip_ok[s] and d[s - 2] > best: best = d[s - 2]; arg = s - 2
            nd[s] = best; bp[t, s] = arg
        for k in range(arc_from.shape[0]):
            v = d[arc_from[k]] - arc_pen[k]
            if v > nd[arc_to[k]]: nd[arc_to[k]] = v; bp[t, arc_to[k]] = arc_from[k]
        for s in range(S):
            d[s] = nd[s] + lp[t, emit[s]]
    best = NEG; s_end = S - 1
    for s in range(S):
        v = d[s] - end_pen[s]
        if v > best: best = v; s_end = s
    path = np.empty(T, np.int64); s = s_end
    for t in range(T - 1, -1, -1):
        path[t] = s; s = bp[t, s]
    return path, best

def align_pen(lp, lines, lang, a, b, maxskip=3, sep=True):
    return align(lp, lines, lang, P=(a, b), maxskip=maxskip, sep=sep)

def align(lp, lines, lang, P=None, maxskip=3, sep=True):
    """P None: düz CTC (birinci ekip). Dönen: kelime başları (sn olmadan, kare), atlanan satırlar, yol."""
    lab, wf, rng = build_lines(lines, lang, sep)
    L = len(lab); S = 2 * L + 1
    emit = np.zeros(S, np.int64); emit[1::2] = lab
    skip_ok = np.zeros(S, np.bool_); skip_ok[3::2] = lab[1:] != lab[:-1]
    INF = 1e30
    start_pen = np.full(S, INF); start_pen[0] = 0; start_pen[1] = 0
    end_pen = np.full(S, INF); end_pen[S - 1] = 0; end_pen[S - 2] = 0
    af, at, ap = [], [], []
    if P is not None:
        real = [i for i, r in enumerate(rng) if r is not None]
        if isinstance(P, tuple):
            pa_, pb_ = P
            lpen = [pa_ * (rng[j][1] - rng[j][0] + 1) + pb_ for j in real]
        else:
            lpen = [float(P)] * len(real)
        def pen(i0, i1):  # real[i0..i1) atlanır
            return float(sum(lpen[i0:i1]))
        for jj, j in enumerate(real):
            a, b = rng[j]
            # j satırının başına: önceki k satır atlanarak
            for k in range(1, maxskip + 1):
                if jj - k - 1 >= 0:
                    pa, pb = rng[real[jj - k - 1]]
                    for src in (2 * pb + 1, 2 * pb + 2):
                        # ayırıcı boşluk etiketi satır başından hemen önce: blank'ten etiket a'ya
                        af.append(src); at.append(2 * a + 1); ap.append(pen(jj - k, jj))
                elif jj - k == 0 or jj - k - 1 == -1:
                    if jj - k == 0 and jj >= 1:
                        start_pen[2 * a + 1] = min(start_pen[2 * a + 1], pen(0, jj)); start_pen[2 * a] = min(start_pen[2 * a], pen(0, jj))
            # sondan atlama
            k = len(real) - 1 - jj
            if 1 <= k <= maxskip:
                end_pen[2 * b + 1] = min(end_pen[2 * b + 1], pen(jj + 1, len(real))); end_pen[2 * b + 2] = min(end_pen[2 * b + 2], pen(jj + 1, len(real)))
    af = np.array(af, np.int64); at = np.array(at, np.int64); ap = np.array(ap, np.float64)
    path, score = _vit(np.ascontiguousarray(lp), lab, emit, skip_ok, af, at, ap, start_pen, end_pen)
    first = np.full(L, -1)
    for t in range(len(path)):
        s = path[t]
        if s % 2 == 1 and first[s // 2] < 0: first[s // 2] = t
    # atlanan satır: hiçbir etiketi yolda yok
    skipped = [r is not None and first[r[0]] < 0 for r in rng]
    # atlanan etiketlerin "ilk karesi": bir sonraki yerleşmiş etiketin karesi
    nxt = len(path) - 1
    for i in range(L - 1, -1, -1):
        if first[i] < 0: first[i] = nxt
        else: nxt = first[i]
    return first, wf, rng, skipped, path, score
