"""Whisper ile bilinen sözü zorlanmış hizalama (çapraz dikkat + DTW; openai-whisper `timing.py`'nin yöntemi).

Model: sherpa-onnx'in OpenAI Whisper ONNX dönüşümü (MIT). Kod çözücünün grafiğine çapraz dikkat
logitleri (softmax girişi) çıkış olarak eklenir (bir kez, models/whisper-<boy>-attn/). Hizalama başları
openai-whisper paketindeki `_ALIGNMENT_HEADS`'ten.

Uzun şarkı: 30 sn'lik pencereler sırayla. Her pencerede kalan sözlerden ≤ 220 belirteç verilir; kod
çözücü bir kez çalışır. Pencerede kaç kelime olduğu, "metin + bitiş (EOT)" olasılığının en yüksek olduğu
kelime sayısıyla seçilir (k*). DTW ilk k* kelimenin zamanını verir; son kelime pencere kenarında kesilmiş
olabileceği için kabul edilmez, sonraki pencere onun başından başlar.
"""

import base64
import gzip
import importlib.util
import time
from pathlib import Path

import numba
import numpy as np
import onnx
import onnxruntime as ort

from ortak import CACHE, KOK, MODELS

WH = KOK / "whl" / "openai_whisper-20250625" / "whisper"
SR = 16000
N_FFT, HOP = 400, 160
HEADS = {
    "tiny": b"ABzY8bu8Lr0{>%RKn9Fp%m@SkK7Kt=7ytkO",
    "base": b"ABzY8KQ!870{>%RzyTQH3`Q^yNP!>##QT-<FaQ7m",
    "small": b"ABzY8DmU6=0{>%Rpa?J`kvJ6qF(V^F86#Xh7JUGMK}P<N0000",
}

_M = {}


def _tokenizer_module():
    spec = importlib.util.spec_from_file_location("wtok", WH / "tokenizer.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _patched_decoder(size):
    src = MODELS / f"sherpa-onnx-whisper-{size}" / f"{size}-decoder.onnx"
    dst_dir = MODELS / f"whisper-{size}-attn"
    dst = dst_dir / "decoder-attn.onnx"
    if dst.exists():
        return dst
    dst_dir.mkdir(exist_ok=True)
    m = onnx.load(str(src))
    g = m.graph
    soft = [n for n in g.node if n.op_type == "Softmax"]
    cross = soft[1::2]  # her blokta önce öz dikkat, sonra çapraz dikkat (bkz. RAPOR: grafik incelemesi)
    for li, n in enumerate(cross):
        vi = onnx.helper.make_tensor_value_info(n.input[0], onnx.TensorProto.FLOAT, None)
        vi.name = n.input[0]
        g.output.append(vi)
    onnx.save(m, str(dst), save_as_external_data=False)
    return dst


def model(size, threads=4):
    if size in _M:
        return _M[size]
    d = MODELS / f"sherpa-onnx-whisper-{size}"
    o = ort.SessionOptions()
    o.intra_op_num_threads = threads
    enc = ort.InferenceSession(str(d / f"{size}-encoder.onnx"), o)
    dec = ort.InferenceSession(str(_patched_decoder(size)), o)
    meta = enc.get_modelmeta().custom_metadata_map
    n_layer, n_head = int(meta["n_text_layer"]), int(meta["n_text_head"])
    heads = np.frombuffer(gzip.decompress(base64.b85decode(HEADS[size])), dtype=bool).reshape(n_layer, n_head)
    tokmod = _tokenizer_module()
    enc_ = tokmod.get_encoding("multilingual")  # assets/multilingual.tiktoken
    filters = np.load(WH / "assets" / "mel_filters.npz")["mel_80"]
    codes = meta["all_language_codes"].split(",")
    ltoks = [int(x) for x in meta["all_language_tokens"].split(",")]
    _M[size] = dict(enc=enc, dec=dec, meta=meta, heads=heads, tok=enc_, filters=filters,
                    lang={c: t for c, t in zip(codes, ltoks)}, tokmod=tokmod)
    return _M[size]


def log_mel(x, filters):
    """openai-whisper audio.log_mel_spectrogram'ın numpy karşılığı (80 bant)."""
    w = np.hanning(N_FFT + 1)[:-1]
    xp = np.pad(x, (N_FFT // 2, N_FFT // 2), mode="reflect")
    n = 1 + (len(xp) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n)[:, None]
    spec = np.fft.rfft(xp[idx] * w, axis=1)
    mag = np.abs(spec[:-1]) ** 2  # whisper son kareyi atar
    mel = filters @ mag.T
    lg = np.log10(np.maximum(mel, 1e-10))
    lg = np.maximum(lg, lg.max() - 8.0)
    return ((lg + 4.0) / 4.0).astype(np.float32)


@numba.njit(cache=True)
def _dtw(x):
    N, M = x.shape
    cost = np.full((N + 1, M + 1), np.inf)
    trace = -np.ones((N + 1, M + 1), dtype=np.int8)
    cost[0, 0] = 0
    for j in range(1, M + 1):
        for i in range(1, N + 1):
            c0, c1, c2 = cost[i - 1, j - 1], cost[i - 1, j], cost[i, j - 1]
            if c0 < c1 and c0 < c2:
                c, t = c0, 0
            elif c1 < c0 and c1 < c2:
                c, t = c1, 1
            else:
                c, t = c2, 2
            cost[i, j] = x[i - 1, j - 1] + c
            trace[i, j] = t
    i, j = N, M
    trace[0, :] = 2
    trace[:, 0] = 1
    ri, rj = [], []
    while i > 0 or j > 0:
        ri.append(i - 1)
        rj.append(j - 1)
        t = trace[i, j]
        if t == 0:
            i -= 1
            j -= 1
        elif t == 1:
            i -= 1
        else:
            j -= 1
    return np.array(ri[::-1]), np.array(rj[::-1])


def _medfilt(x, w=7):
    p = w // 2
    xp = np.pad(x, [(0, 0)] * (x.ndim - 1) + [(p, p)], mode="reflect")
    win = np.lib.stride_tricks.sliding_window_view(xp, w, axis=-1)
    return np.median(win, axis=-1)


def _softmax(x, axis=-1):
    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)


def align(x, lines, lang, size="base", key=None, max_tokens=220):
    M = model(size)
    meta = M["meta"]
    tok = M["tok"]
    sot = int(meta["sot"])
    sot_seq = [sot, M["lang"][lang], int(meta["transcribe"])]
    no_ts, eot = int(meta["no_timestamps"]), int(meta["eot"])
    n_layer = int(meta["n_text_layer"])
    d_model = int(meta["n_text_state"])
    words = [w for line in lines for w in line]
    wtoks = [tok.encode(" " + w) for w in words]
    line_first, p0 = set(), 0
    for line in lines:
        line_first.add(p0)
        p0 += len(line)
    dur = len(x) / SR
    starts = [None] * len(words)
    t0, i = 0.0, 0
    t_enc = t_dec = t_dtw = 0.0
    nwin = 0
    while i < len(words) and t0 < dur:
        a0 = int(t0 * SR)
        seg = x[a0 : a0 + 30 * SR]
        last = t0 + 30 >= dur
        nfr = len(seg) // HOP
        seg = np.pad(seg, (0, 30 * SR - len(seg)))
        mel = log_mel(seg, M["filters"])[:, :3000][None]
        a = time.time()
        ck, cv = M["enc"].run(None, {"mel": mel})
        t_enc += time.time() - a
        # aday kelimeler
        cand, ntok = [], 0
        for k in range(i, len(words)):
            if ntok + len(wtoks[k]) > max_tokens:
                break
            cand.append(k)
            ntok += len(wtoks[k])
        text = [t for k in cand for t in wtoks[k]]
        tokens = np.array([sot_seq + [no_ts] + text + [eot]], dtype=np.int64)
        zeros = np.zeros((n_layer, 1, 448, d_model), dtype=np.float32)
        a = time.time()
        outs = M["dec"].run(None, {"tokens": tokens, "in_n_layer_self_k_cache": zeros,
                                   "in_n_layer_self_v_cache": zeros, "n_layer_cross_k": ck,
                                   "n_layer_cross_v": cv, "offset": np.array([0], dtype=np.int64)})
        t_dec += time.time() - a
        logits = outs[0][0]
        qks = outs[3:]
        lp = logits - logits.max(-1, keepdims=True)
        lp = lp - np.log(np.exp(lp).sum(-1, keepdims=True))
        base = len(sot_seq)  # konum base: no_ts; text[j] konum base+1+j
        # text[j]'yi tahmin eden satır: base + j
        tok_lp = np.array([lp[base + j, text[j]] for j in range(len(text))])
        cum = np.concatenate([[0], np.cumsum(tok_lp)])
        bounds = np.concatenate([[0], np.cumsum([len(wtoks[k]) for k in cand])])
        if last:
            kstar = len(cand)
        else:
            # pencerenin dışındaki ilk kelimede bitiş olasılığı sıçrar (gelistirme'de görüldü:
            # içeride log p(EOT) ≈ −5…−13, ilk dışarıdaki kelimede ≈ −0,1). En yükseğe 1 nat yakın ilk sınır.
            eo = np.array([lp[base + bounds[k], eot] for k in range(len(cand) + 1)])
            if len(cand) == 0:
                kstar = 0
            else:
                top = eo[1:].max()
                kstar = 1 + int(np.argmax(eo[1:] >= top - 1.0))
                if eo[0] > top + 1.0:  # pencerede hiç söz yok
                    kstar = 0
        if kstar == 0:
            t0 += 15.0
            nwin += 1
            continue
        a = time.time()
        nt = bounds[kstar]
        w = np.stack([qks[l][0, h] for l in range(n_layer) for h in range(qks[l].shape[1]) if M["heads"][l, h]])
        w = w[:, base : base + nt + 1, : max(nfr // 2, 1)]
        w = _softmax(w, -1)
        mu = w.mean(axis=-2, keepdims=True)
        sd = w.std(axis=-2, keepdims=True) + 1e-9
        w = _medfilt((w - mu) / sd, 7)
        mat = w.mean(0)
        ti, fi = _dtw(-mat.astype(np.float64))
        jumps = np.concatenate([[True], np.diff(ti) > 0])
        jt = fi[jumps] * 0.02  # 1500 kare / 30 sn
        ws = [t0 + jt[bounds[k]] for k in range(kstar)]
        we = [t0 + jt[min(bounds[k + 1], len(jt) - 1)] for k in range(kstar)]
        # openai-whisper transcribe.py'deki düzeltme: duraklamadan sonraki kelimenin başı DTW'de
        # duraklamanın başına yapışır; satır başı kelimelerin süresi 2 × ortanca süreyle sınırlanır.
        durs = np.array(we) - np.array(ws)
        med = min(0.7, float(np.median(durs[durs > 0]))) if (durs > 0).any() else 0.7
        maxd = 2 * med
        for k in range(kstar):
            if cand[k] in line_first and we[k] - ws[k] > maxd:
                ws[k] = we[k] - maxd
        t_dtw += time.time() - a
        accept = kstar if last else max(1, kstar - 1)
        for k in range(accept):
            starts[cand[k]] = ws[k]
        i = cand[accept - 1] + 1
        nxt = ws[accept] if accept < kstar else ws[-1] + 1.0
        t0 = max(t0 + 1.0, nxt - 0.2)
        nwin += 1
    # kalanlar (ses bitti): son bilinene eşit aralık
    lastv = max([s for s in starts if s is not None], default=0.0)
    for k in range(len(words)):
        if starts[k] is None:
            starts[k] = min(dur, lastv + 0.3 * (k + 1))
    # sıra koru
    for k in range(1, len(words)):
        starts[k] = max(starts[k], starts[k - 1])
    out, p = [], 0
    for line in lines:
        out.append(starts[p : p + len(line)])
        p += len(line)
    return out, {"enc_sn": t_enc, "dec_sn": t_dec, "dtw_sn": t_dtw, "pencere": nwin}
