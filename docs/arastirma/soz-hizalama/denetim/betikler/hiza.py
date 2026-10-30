"""Bağımsız denetim: CTC zorlanmış hizalama (birinci ekibin ctc.py'sinden ayrı yazıldı).

Farklar: numpy ile durum vektörü üzerinde ileri Viterbi; kelime arası boşluk simgesi isteğe bağlı
(sep=True: birinci ekip gibi en az bir kare " ", sep=False: yalnızca blank); ileri-geri ile sonsal.
"""
import numpy as np
from pathlib import Path

KOK1 = Path("/tmp/claude-0/-home-user-Lyraska/4262c203-a61e-5ac0-b0bb-3cada8e7b304/scratchpad/soz-hizalama")
OMNI = KOK1 / "models/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05"
CHARSET = " abcdefghijklmnopqrstuvwxyzàâäæçéèêëîïôœùûüÿáíñóúßöğışœ'"  # önbellek sütun sırası için

def vocab():
    tok = {}
    for line in open(OMNI / "tokens.txt", encoding="utf-8"):
        f = line.rstrip("\n").split(" ")
        t = " " if (len(f) > 2 or f[0] == "") else f[0]
        tok[t] = int(f[-1])
    return tok

_TOK = vocab()
COLS_CHARS = [c for c in dict.fromkeys(CHARSET) if c in _TOK]
COL = {c: i + 1 for i, c in enumerate(COLS_CHARS)}   # 0 = blank

def norm_word(w, lang):
    if lang == "tr":
        w = w.replace("I", "ı").replace("İ", "i")
    w = w.lower()
    return [COL[c] for c in w if c in COL and c != " "]

def build(lines, lang, sep=True):
    """lines: [[kelime,...],...] -> etiketler, her kelimenin ilk etiket indisi (boş kelime: -1)."""
    lab, wfirst = [], []
    for line in lines:
        for w in line:
            cs = norm_word(w, lang)
            if not cs:
                wfirst.append(-1); continue
            if lab and sep:
                lab.append(COL[" "])
            wfirst.append(len(lab)); lab.extend(cs)
    return np.array(lab, dtype=np.int64), wfirst

def viterbi(lp, lab):
    """lp: (T,C) log-olasılık. Durum s: çift=blank, tek=etiket (s-1)//2. Dönen: her etiketin ilk karesi."""
    T = lp.shape[0]; L = len(lab); S = 2 * L + 1
    emit_idx = np.zeros(S, dtype=np.int64); emit_idx[1::2] = lab
    skip_ok = np.zeros(S, dtype=bool)
    skip_ok[3::2] = lab[1:] != lab[:-1]
    NEG = -1e30
    d = np.full(S, NEG); d[0] = lp[0, 0]; d[1] = lp[0, lab[0]]
    bp = np.zeros((T, S), dtype=np.int8)
    for t in range(1, T):
        c0 = d
        c1 = np.concatenate(([NEG], d[:-1]))
        c2 = np.concatenate(([NEG, NEG], d[:-2])); c2 = np.where(skip_ok, c2, NEG)
        st = np.stack([c0, c1, c2]); a = st.argmax(0)
        d = st[a, np.arange(S)] + lp[t, emit_idx]
        bp[t] = a
    s = int(S - 1 if d[S - 1] >= d[S - 2] else S - 2)
    score = d[s]
    path = np.empty(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s; s = int(s) - int(bp[t, s])
    first = np.full(L, -1)
    for t in range(T):
        s = path[t]
        if s % 2 == 1:
            i = s // 2
            if first[i] < 0: first[i] = t
    return first, path, score

def word_times(first, wfirst, dt):
    out, last = [], 0.0
    for f in wfirst:
        if f < 0: out.append(last)   # boş kelime (rakam, noktalama): öncekine yapışır
        else: last = first[f] * dt; out.append(last)
    return out

def load_em(key):
    z = np.load(KOK1 / "cache/em" / f"{key}.npz")
    return z["lp"].astype(np.float64), float(z["dt"])
