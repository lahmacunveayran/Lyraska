"""CTC tabanlı zorlanmış hizalama: Omnilingual ASR CTC 300M v2 (int8 ONNX, Apache-2.0) + Viterbi.

1. Ses 30 sn'lik pencerelerle (20 sn adım) modele verilir; her pencerenin ortası alınır (kenarlar zayıf).
2. Log-olasılıklar yalnızca sözlerde geçebilecek harf sütunları için saklanır (önbellek küçük kalsın).
3. Sözler harflere çevrilir (Türkçe küçük harf: I→ı, İ→i), kelimeler arasında boşluk simgesi.
4. CTC Viterbi (boşluk durumlu) en olası yolu bulur; kelimenin ilk harfinin ilk karesi = kelime başı.
İsteğe bağlı: satır aralarında "joker" durum (söylenmeyen/fazladan ses; MMS hizalayıcısındaki <star> gibi).
"""

import time

import numpy as np
import numba
import onnxruntime as ort

from ortak import CACHE, MODELS, lower

OMNI = MODELS / "sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05"
SR = 16000
CHARSET = " abcdefghijklmnopqrstuvwxyzàâäæçéèêëîïôœùûüÿáíñóúßöğışœ'"

_S = {}


def _session(threads=4):
    if "omni" not in _S:
        o = ort.SessionOptions()
        o.intra_op_num_threads = threads
        o.inter_op_num_threads = 1
        _S["omni"] = ort.InferenceSession(str(OMNI / "model.int8.onnx"), o)
        tok = {}
        for line in open(OMNI / "tokens.txt", encoding="utf-8"):
            f = line.rstrip("\n").split(" ")
            t = " " if (len(f) > 2 or f[0] == "") else f[0]
            tok[t] = int(f[-1])
        _S["tok"] = tok
    return _S["omni"], _S["tok"]


def columns():
    _, tok = _session()
    chars = [c for c in dict.fromkeys(CHARSET) if c in tok]
    return chars, [0] + [tok[c] for c in chars]  # 0 = boşluk (blank)


def emissions(x, key=None, win=30.0, hop=20.0):
    """(T, 1+len(chars)) log-olasılık, kare süresi (sn)."""
    if key is not None:
        f = CACHE / "em" / f"{key}.npz"
        if f.exists():
            z = np.load(f)
            return z["lp"].astype(np.float32), float(z["dt"]), float(z["sure"])
    sess, _ = _session()
    chars, cols = columns()
    n = len(x)
    W, H = int(win * SR), int(hop * SR)
    dt = 320 / SR
    T = int(np.ceil(n / 320))
    out = np.full((T, len(cols)), -1e4, dtype=np.float32)
    filled = np.zeros(T, dtype=bool)
    t0 = time.time()
    starts = list(range(0, max(1, n - W) + 1, H))
    if starts[-1] + W < n:
        starts.append(max(0, n - W))
    for k, s in enumerate(starts):
        seg = x[s : s + W].astype(np.float32)
        if len(seg) < 1600:
            continue
        seg = (seg - seg.mean()) / np.sqrt(seg.var() + 1e-5)
        lg = sess.run(None, {"x": seg[None]})[0][0]
        lg = lg - lg.max(axis=1, keepdims=True)
        lp = lg - np.log(np.exp(lg).sum(axis=1, keepdims=True))
        lp = lp[:, cols]
        fr = len(seg) / lg.shape[0]  # örnek / kare
        # pencerenin güvenilir kısmı: kenarlardan (win-hop)/2 içeride (ilk/son pencere hariç)
        margin = (win - hop) / 2
        lo = 0 if k == 0 else margin
        hi = len(seg) / SR if s + W >= n else win - margin
        for j in range(lg.shape[0]):
            tj = (j + 0.5) * fr / SR
            if tj < lo or tj > hi:
                continue
            g = int((s + (j + 0.5) * fr) / 320)
            if 0 <= g < T and not filled[g]:
                out[g] = lp[j]
                filled[g] = True
    # doldurulamayan kareler (yuvarlama) en yakın dolu kareden
    if not filled.all():
        idx = np.where(filled)[0]
        for g in np.where(~filled)[0]:
            out[g] = out[idx[np.argmin(np.abs(idx - g))]]
    el = time.time() - t0
    if key is not None:
        f.parent.mkdir(parents=True, exist_ok=True)
        np.savez(f, lp=out.astype(np.float16), dt=dt, sure=el)
    return out, dt, el


def encode(lines, lang):
    """Satırlar → (etiket dizisi, kelime başı etiket sırası listesi, satır sınırları)."""
    chars, _ = columns()
    idx = {c: i + 1 for i, c in enumerate(chars)}
    space = idx[" "]
    labels, word_first, line_first_word = [], [], []
    wi = 0
    for line in lines:
        line_first_word.append(wi)
        for w in line:
            cs = [idx[c] for c in lower(w, lang) if c in idx and c != " "]
            if labels and labels[-1] != space:
                labels.append(space)
            if not cs:  # yalnızca noktalama: bir önceki harfe yapıştır
                word_first.append(max(0, len(labels) - 1))
            else:
                word_first.append(len(labels))
                labels.extend(cs)
            wi += 1
    return np.array(labels, dtype=np.int32), word_first, line_first_word


@numba.njit(cache=True)
def _viterbi(lp, labels, star_after, star_pen):
    """CTC Viterbi. Durumlar: 0..2L (çift = boşluk). star_after[i]: etiket i'den sonra joker var mı.
    Joker durumları ayrı bir dizi: J[i] (etiket i ile i+1 arasında, i+1 bir kelime başıysa)."""
    T = lp.shape[0]
    L = labels.shape[0]
    S = 2 * L + 1
    NEG = -1e30
    prev = np.full(S, NEG)
    prevj = np.full(L, NEG)
    bp = np.zeros((T, S), dtype=np.int8)  # 0 kal, 1 s-1, 2 s-2, 3 jokerden
    bpj = np.zeros((T, L), dtype=np.int8)  # 0 kal, 1 durum 2i+1'den, 2 durum 2i+2'den
    star_lp = np.empty(T)
    for t in range(T):
        m = NEG
        for k in range(lp.shape[1]):
            if lp[t, k] > m:
                m = lp[t, k]
        star_lp[t] = m - star_pen  # joker: en iyi sınıfın puanı eksi ceza
    prev[0] = lp[0, 0]
    if L > 0:
        prev[1] = lp[0, labels[0]]
    for t in range(1, T):
        cur = np.full(S, NEG)
        curj = np.full(L, NEG)
        for i in range(L):
            if star_after[i]:
                a = prevj[i]
                b = prev[2 * i + 1]
                c = prev[2 * i + 2]
                best, arg = a, 0
                if b > best:
                    best, arg = b, 1
                if c > best:
                    best, arg = c, 2
                curj[i] = best + star_lp[t]
                bpj[t, i] = arg
        for s in range(S):
            e = lp[t, 0] if s % 2 == 0 else lp[t, labels[s // 2]]
            best = prev[s]
            arg = 0
            if s >= 1 and prev[s - 1] > best:
                best = prev[s - 1]
                arg = 1
            if s >= 2 and s % 2 == 1:
                li = s // 2
                if labels[li] != labels[li - 1] and prev[s - 2] > best:
                    best = prev[s - 2]
                    arg = 2
                if star_after[li - 1] and prevj[li - 1] > best:
                    best = prevj[li - 1]
                    arg = 3
            cur[s] = best + e
            bp[t, s] = arg
        prev = cur
        prevj = curj
    # son: son harf ya da son boşluk
    s = S - 1
    if S >= 2 and prev[S - 2] > prev[S - 1]:
        s = S - 2
    score = prev[s]
    path = np.empty(T, dtype=np.int32)  # durum; joker için -(i+1)
    inj = -1
    for t in range(T - 1, -1, -1):
        if inj >= 0:
            path[t] = -(inj + 1)
            a = bpj[t, inj]
            if a == 1:
                s = 2 * inj + 1
                inj = -1
            elif a == 2:
                s = 2 * inj + 2
                inj = -1
        else:
            path[t] = s
            a = bp[t, s]
            if a == 1:
                s -= 1
            elif a == 2:
                s -= 2
            elif a == 3:
                inj = s // 2 - 1
                s = -1
    return path, score


def align(lp, dt, lines, lang, star=False, star_pen=2.0, bias=0.0):
    labels, word_first, line_first_word = encode(lines, lang)
    L = len(labels)
    star_after = np.zeros(max(L, 1), dtype=np.bool_)
    if star:
        # her satırın ilk kelimesinden önce (ilk satır hariç) joker
        line_starts_lab = set(word_first[w] for w in line_first_word[1:])
        for li in line_starts_lab:
            if li > 0:
                star_after[li - 1] = True
        # ayrıca kelime aralarında da (daha küçük ceza yerine aynı ceza)
    path, score = _viterbi(lp.astype(np.float64), labels, star_after, star_pen)
    # her etiketin ilk karesi
    first = np.full(L, -1, dtype=np.int64)
    post = np.zeros(L)
    for t in range(len(path)):
        s = path[t]
        if s >= 0 and s % 2 == 1:
            li = s // 2
            if first[li] < 0:
                first[li] = t
            post[li] = max(post[li], np.exp(lp[t, labels[li]]))
    # eksik (olmamalı) → önceki
    for i in range(L):
        if first[i] < 0:
            first[i] = first[i - 1] if i > 0 else 0
    # kare kare: yolun etiketinin log-olasılığı − karenin en iyi log-olasılığı (0 = model aynı fikirde)
    lab_t = np.where(path >= 0, np.where(path % 2 == 1, labels[np.clip(path // 2, 0, L - 1)], 0), -1)
    best = lp.max(axis=1)
    gap = np.where(lab_t >= 0, lp[np.arange(len(path)), np.clip(lab_t, 0, None)] - best, -3.0)
    wf = [first[min(word_first[k], L - 1)] for k in range(len(word_first))] + [len(path)]
    starts, conf = [], []
    llr = []
    wi = 0
    nwords = [len(l) for l in lines]
    for li, n in enumerate(nwords):
        row, crow = [], []
        for k in range(n):
            lab = word_first[wi]
            row.append(first[min(lab, L - 1)] * dt + bias)
            # güven: kelimenin harflerinin en yüksek sonsal olasılıklarının ortalaması
            end = word_first[wi + 1] if wi + 1 < len(word_first) else L
            seg = post[lab:end]
            crow.append(float(seg.mean()) if len(seg) else 0.0)
            wi += 1
        starts.append(row)
        conf.append(crow)
        a, b = wf[wi - n], max(wf[wi], wf[wi - n] + 1)
        llr.append(float(gap[a:b].mean()))
    align.last_llr = llr
    return starts, conf, score
