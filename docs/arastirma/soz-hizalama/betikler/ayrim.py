"""Vokal ayrıştırma (ölçüm için): Spleeter 2 kanal (sherpa-onnx ONNX dönüşümü) ve UVR MDX-Net Voc_FT.

Çıktı: 16 kHz mono vokal, cache/ayrim/<yontem>/<sid>.npy. Süre ölçümü cache/ayrim/<yontem>/<sid>.json.
"""

import json
import time

import numpy as np
import sherpa_onnx

from ortak import CACHE, MODELS, load_audio

_SEP = {}


def _make(method, threads=4):
    if method == "spleeter":
        d = MODELS / "sherpa-onnx-spleeter-2stems-fp16"
        cfg = sherpa_onnx.OfflineSourceSeparationConfig(
            model=sherpa_onnx.OfflineSourceSeparationModelConfig(
                spleeter=sherpa_onnx.OfflineSourceSeparationSpleeterModelConfig(
                    vocals=str(d / "vocals.fp16.onnx"),
                    accompaniment=str(d / "accompaniment.fp16.onnx"),
                ),
                num_threads=threads,
                provider="cpu",
            )
        )
    elif method == "uvr":
        cfg = sherpa_onnx.OfflineSourceSeparationConfig(
            model=sherpa_onnx.OfflineSourceSeparationModelConfig(
                uvr=sherpa_onnx.OfflineSourceSeparationUvrModelConfig(
                    model=str(MODELS / "UVR-MDX-NET-Voc_FT.onnx")
                ),
                num_threads=threads,
                provider="cpu",
            )
        )
    else:
        raise ValueError(method)
    assert cfg.validate()
    return sherpa_onnx.OfflineSourceSeparation(cfg)


def resample(x, sr_in, sr_out):
    from scipy.signal import resample_poly
    from math import gcd

    g = gcd(sr_in, sr_out)
    return resample_poly(x, sr_out // g, sr_in // g).astype(np.float32)


def vocals(song, method):
    """16 kHz mono vokal (önbellekli)."""
    if method == "karisim":
        return song.load(16000)
    d = CACHE / "ayrim" / method
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"{song.sid}.npy"
    if f.exists():
        return np.load(f)
    if method not in _SEP:
        _SEP[method] = _make(method)
    x = song.load(44100, mono=False)
    t = time.time()
    out = _SEP[method].process(sample_rate=44100, samples=np.ascontiguousarray(x))
    el = time.time() - t
    v = out.stems[0].data  # (kanal, örnek)
    v = v.mean(axis=0) if v.ndim == 2 else v
    v16 = resample(v, out.sample_rate, 16000)
    np.save(f, v16)
    (d / f"{song.sid}.json").write_text(
        json.dumps({"sure_sn": el, "ses_sn": x.shape[1] / 44100}), encoding="utf-8"
    )
    return v16
