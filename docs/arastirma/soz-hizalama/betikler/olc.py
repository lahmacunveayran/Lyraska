"""Yöntemleri bir veri setinin bir bölümünde çalıştırır, ölçer, sonucu JSON'a yazar.

Kullanım: python olc.py <veri: jamendo|makam|vekil> <bölüm: gelistirme|dogrulama|son_sinama> <yöntem> [...]
Yöntemler:
  esit            satırlar hece sayısıyla şarkının sesli kısmına (ilk–son vokal) eşit dağıtılır (ayrım: spleeter)
  vad             vokal etkinliği (Spleeter vokal enerjisi) + hece sayısı (model yok, yalnızca ayrım)
  ctc:<kaynak>    Omnilingual CTC + Viterbi; kaynak = karisim | spleeter | uvr; ":joker" eklenirse satır arası joker
  whisper:<boy>:<kaynak>  Whisper çapraz dikkat + DTW (bkz. whisper_hiza.py)
Sonuç: cache/sonuc/<veri>_<bölüm>_<yöntem>.json (şarkı başına hatalar, süreler).
"""

import json
import resource
import sys
import time

import numpy as np

import ayrim
import ortak
from ortak import CACHE, errors, song_mean, summarize, syllables

# geliştirme setinde ölçülen sabit gecikme düzeltmesi (sn); yalnızca gelistirme'den belirlenir
BIAS = {"ctc": 0.0}


def vocal_activity(v, hop=0.02, sr=16000):
    n = int(hop * sr)
    frames = len(v) // n
    e = np.array([np.sqrt(np.mean(v[i * n : (i + 1) * n] ** 2) + 1e-12) for i in range(frames)])
    db = 20 * np.log10(e + 1e-9)
    ref = np.percentile(db, 95)
    act = db > ref - 25
    # kısa delikleri kapat (0,3 sn), kısa parçaları at (0,2 sn)
    k = int(0.3 / hop)
    a = act.copy()
    for i in range(len(a)):
        if not a[i]:
            j = i
            while j < len(a) and not a[j]:
                j += 1
            if 0 < i and j < len(a) and j - i <= k:
                a[i:j] = True
    return a, hop


def distribute(lines, active, hop):
    """Heceleri etkin karelere sırayla yayar (her hece eşit sayıda etkin kare)."""
    syl = [[syllables(w) for w in line] for line in lines]
    total = sum(sum(s) for s in syl)
    idx = np.where(active)[0]
    if len(idx) == 0:
        idx = np.arange(len(active))
    per = len(idx) / max(total, 1)
    starts, c = [], 0
    for line in syl:
        row = []
        for s in line:
            k = min(int(c * per), len(idx) - 1)
            row.append(idx[k] * hop)
            c += s
        starts.append(row)
    return starts


def run_method(song, method):
    t0 = time.time()
    info = {}
    if method in ("esit", "vad"):
        v = ayrim.vocals(song, "spleeter")
        act, hop = vocal_activity(v)
        if method == "esit":
            w = np.where(act)[0]
            a = np.zeros_like(act)
            if len(w):
                a[w[0] : w[-1] + 1] = True
            act = a
        pred = distribute(song.lines, act, hop)
    elif method.startswith("ctc"):
        import ctc

        parts = method.split(":")
        src = parts[1]
        star = "joker" in parts
        el = 0.0
        lps = []
        for one in src.split("+"):  # "karisim+spleeter": iki kaynağın sonsal olasılıklarının ortalaması
            x = ayrim.vocals(song, one)
            if "p15" in parts:  # 15 sn'lik pencere (daha az bellek), yalnızca karşılaştırma için
                lp1, dt, e1 = ctc.emissions(x, key=f"omni300v2p15_{one}_{song.sid}", win=15.0, hop=10.0)
            else:
                lp1, dt, e1 = ctc.emissions(x, key=f"omni300v2_{one}_{song.sid}")
            lps.append(lp1)
            el += e1
        if len(lps) == 1:
            lp = lps[0]
        else:
            n = min(len(a) for a in lps)
            lp = np.logaddexp.reduce([a[:n] for a in lps], axis=0) - np.log(len(lps))
        info["model_sn"] = el
        t1 = time.time()
        pred, conf, score = ctc.align(lp, dt, song.lines, song.lang, star=star, bias=BIAS["ctc"])
        info["hiza_sn"] = time.time() - t1
        info["guven"] = conf
        info["satir_llr"] = ctc.align.last_llr
    elif method.startswith("whisper"):
        import whisper_hiza

        _, size, src = method.split(":")[:3]
        x = ayrim.vocals(song, src)
        pred, info2 = whisper_hiza.align(x, song.lines, song.lang, size, key=f"{size}_{src}_{song.sid}")
        info.update(info2)
    else:
        raise ValueError(method)
    info["toplam_sn"] = time.time() - t0
    return pred, info


def main():
    data, split = sys.argv[1], sys.argv[2]
    methods = sys.argv[3:]
    songs = ortak.dataset(data, split)
    for m in methods:
        res = {"veri": data, "bolum": split, "yontem": m, "sarkilar": []}
        all_l, all_w, per_l, per_w = [], [], [], []
        for s in songs:
            pred, info = run_method(s, m)
            le, we = errors(s, pred)
            all_l += le
            all_w += we
            per_l.append(le)
            per_w.append(we)
            sure = len(s.load(16000)) / 16000 if "ses_sn" not in info else info["ses_sn"]
            res["sarkilar"].append(
                {
                    "sid": s.sid,
                    "dil": s.lang,
                    "ses_sn": sure,
                    "satir_ort": float(np.mean(le)),
                    "kelime_ort": float(np.mean(we)) if we else None,
                    "satir_hata": le,
                    "kelime_hata": we,
                    "tahmin": pred,
                    **{k: v for k, v in info.items()},
                }
            )
            print(
                f"{m:22s} {s.sid[:40]:40s} satır {np.mean(le):6.2f}  kelime "
                f"{(np.mean(we) if we else float('nan')):6.2f}  {info.get('toplam_sn', 0):5.1f} sn",
                flush=True,
            )
        res["satir"] = summarize(all_l)
        res["kelime"] = summarize(all_w)
        res["satir_sarki_ort"] = song_mean(per_l)
        res["kelime_sarki_ort"] = song_mean(per_w)
        res["tepe_bellek_mb"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        out = CACHE / "sonuc"
        out.mkdir(exist_ok=True)
        (out / f"{data}_{split}_{m.replace(':', '-')}.json").write_text(
            json.dumps(res, ensure_ascii=False), encoding="utf-8"
        )
        print("ÖZET", m, "satır", res["satir"], "kelime", res["kelime"], flush=True)


if __name__ == "__main__":
    main()
