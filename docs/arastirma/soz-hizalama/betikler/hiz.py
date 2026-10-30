"""Hız ve bellek ölçümü: her aşama ayrı süreçte, önbellek kullanılmadan.

Kullanım: python hiz.py <aşama> <ses dosyası> [iş parçacığı] [pencere_sn]
  aşama: spleeter | omni | whisper-base | viterbi
Çıktı: tek satır JSON (süre, ses süresi, gerçek zaman oranı). Tepe bellek için `/usr/bin/time -v` ile çağrılır.
"""

import json
import sys
import time

import numpy as np

from ortak import load_audio


def main():
    stage, path = sys.argv[1], sys.argv[2]
    threads = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    win = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0
    x16 = load_audio(path, 16000)
    dur = len(x16) / 16000
    t = time.time()
    if stage == "spleeter":
        import ayrim

        sep = ayrim._make("spleeter", threads)
        x = load_audio(path, 44100, mono=False)
        t = time.time()
        sep.process(sample_rate=44100, samples=np.ascontiguousarray(x))
    elif stage == "omni":
        import ctc

        ctc._session(threads)
        t = time.time()
        ctc.emissions(x16, key=None, win=win, hop=win * 2 / 3)
    elif stage == "whisper-base":
        import whisper_hiza

        whisper_hiza.model("base", threads)
        words = [["la"] * 8 for _ in range(int(dur / 4))]
        t = time.time()
        whisper_hiza.align(x16, words, "en", "base")
    elif stage == "viterbi":
        import ctc

        T = int(dur / 0.02)
        rng = np.random.default_rng(0)
        lp = np.log(rng.dirichlet(np.ones(60), size=T)).astype(np.float32)
        lines = [["kelime", "sözler", "şarkı", "gece"] for _ in range(int(dur / 3))]
        ctc.align(lp[:100], 0.02, lines[:2], "tr")  # derleme
        t = time.time()
        ctc.align(lp, 0.02, lines, "tr")
    el = time.time() - t
    print(json.dumps({"asama": stage, "is_parcacigi": threads, "pencere": win, "sure_sn": el,
                      "ses_sn": dur, "rtf": el / dur}))


if __name__ == "__main__":
    main()
