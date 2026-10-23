#!/usr/bin/env python3
"""B-SES farklılık testi: Lyraska çözücüsü (denetim_coz) ↔ ffmpeg ↔ kaynak WAV.

Her dosya için: örnek sayısı, başlangıç hizası (kaynağa göre gecikme, örnek), hizalandıktan sonra
en büyük/ortalama fark. Çıktı Markdown tablosu (stdout) ve JSON (fark_sonuclari.json).
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SESLER = os.path.join(HERE, "sesler")
BIN = os.environ.get("DENETIM_COZ", "/home/user/denetim-bagimsiz/target/debug/examples/denetim_coz")
TMP = os.path.join(HERE, "tmp")
os.makedirs(TMP, exist_ok=True)


def ffmpeg_decode(path, rate, ch):
    out = os.path.join(TMP, "ff.f64")
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-f", "f64le", "-acodec", "pcm_f64le",
         "-ar", str(rate), "-ac", str(ch), out],
        check=True,
    )
    return np.fromfile(out, dtype="<f8").reshape(-1, ch)


def lyraska_decode(path, seek=None):
    out = os.path.join(TMP, "ly.f64")
    args = [BIN, path, out] + ([str(seek)] if seek is not None else [])
    res = subprocess.run(args, capture_output=True, text=True, check=True)
    info = json.loads(res.stdout.strip().splitlines()[-1])
    if "error" in info:
        return info, None
    data = np.fromfile(out, dtype="<f8").reshape(-1, info["channels"])
    return info, data


def best_lag(ref, sig, max_lag, length=20000):
    """`sig` içindeki başlangıcın `ref`'e göre gecikmesi: sig[lag + i] ≈ ref[i]. Negatif lag: sig
    kaynağın başından örnek kaybetmiş. En küçük RMS farkı veren lag ve o lag'daki fark."""
    n = min(length, len(ref) - max_lag - 1, len(sig) - max_lag - 1)
    if n <= 0:
        return None, None
    seg = ref[:n]
    best = (None, float("inf"))
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            cand = sig[lag:lag + n]
        else:
            cand = np.concatenate([np.zeros(-lag), sig[:n + lag]])
        if len(cand) < n:
            continue
        err = np.sqrt(np.mean((cand - seg) ** 2))
        if err < best[1]:
            best = (lag, err)
    return best


def compare(name, source, rate, ch, max_lag=3000):
    path = os.path.join(SESLER, name)
    src = np.fromfile(source, dtype="<f8").reshape(-1, ch) if source.endswith(".f64") else None
    info, ly = lyraska_decode(path)
    row = {"dosya": name, "hız": rate, "kanal": ch}
    if ly is None:
        row["hata"] = info["error"]
        return row
    ff = ffmpeg_decode(path, rate, ch)
    row.update(kodek=info["codec"], bits=info["sourceBits"], süre=info["duration"],
               ly_kare=len(ly), ff_kare=len(ff), kaynak_kare=len(src))
    # Lyraska ↔ kaynak hizası
    lag, err = best_lag(src[:, 0], ly[:, 0], max_lag)
    row["ly_kaynak_gecikme"] = lag
    row["ly_kaynak_rms"] = None if err is None else float(err)
    lag2, err2 = best_lag(src[:, 0], ff[:, 0], max_lag)
    row["ff_kaynak_gecikme"] = lag2
    row["ff_kaynak_rms"] = None if err2 is None else float(err2)
    # Lyraska ↔ ffmpeg örnek örnek (ortak uzunlukta, hizalayarak)
    lag3, err3 = best_lag(ff[:, 0], ly[:, 0], max_lag)
    row["ly_ff_gecikme"] = lag3
    if lag3 is not None:
        n = min(len(ff), len(ly) - max(lag3, 0)) - 1
        a = ff[: n - max(-lag3, 0)] if lag3 < 0 else ff[:n]
        b = ly[max(lag3, 0): max(lag3, 0) + len(a)]
        if lag3 < 0:
            a = ff[-lag3:-lag3 + len(b)]
        m = min(len(a), len(b))
        d = np.abs(a[:m] - b[:m])
        row["ly_ff_maks_fark"] = float(d.max())
        row["ly_ff_ort_fark"] = float(d.mean())
    # Son örnekler: kaynağın sonuna göre fazla/eksik (hizalı başlangıç varsayımıyla)
    if lag is not None:
        row["ly_son_fazla"] = int(len(ly) - lag - len(src))
    if lag2 is not None:
        row["ff_son_fazla"] = int(len(ff) - lag2 - len(src))
    return row


def main():
    specs = [("44100", "2"), ("48000", "2"), ("22050", "1"), ("44100", "1"), ("48000", "1")]
    kinds = ["s16-{r}-{c}.wav", "s24-{r}-{c}.wav", "aiff-{r}-{c}.aiff", "flac-{r}-{c}.flac",
             "flac16-{r}-{c}.flac", "alac-{r}-{c}.m4a", "mp3cbr-{r}-{c}.mp3", "mp3vbr-{r}-{c}.mp3",
             "mp3noxing-{r}-{c}.mp3", "aac-{r}-{c}.m4a", "aac-{r}-{c}.mp4", "aac-{r}-{c}.aac",
             "vorbis-{r}-{c}.ogg"]
    only = sys.argv[1:]
    rows = []
    for r, c in specs:
        src_wav = os.path.join(SESLER, f"kaynak-{r}-{c}.wav")
        src = os.path.join(TMP, f"kaynak-{r}-{c}.f64")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src_wav, "-f", "f64le",
                        "-acodec", "pcm_f64le", src], check=True)
        for k in kinds:
            name = k.format(r=r, c=c)
            if only and not any(o in name for o in only):
                continue
            try:
                row = compare(name, src, int(r), int(c))
            except Exception as e:  # noqa: BLE001
                row = {"dosya": name, "hata": repr(e)}
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
    with open(os.path.join(HERE, "fark_sonuclari.json"), "w") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    # Markdown
    print("\n| dosya | kodek | kaynak | Lyraska | ffmpeg | Ly başlangıç (örnek) | Ly sonda fazla | ff başlangıç | ff sonda fazla | Ly↔ff maks fark |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for row in rows:
        if "hata" in row:
            print(f"| {row['dosya']} | HATA: {row['hata']} | | | | | | | | |")
            continue
        print(f"| {row['dosya']} | {row['kodek']} | {row['kaynak_kare']} | {row['ly_kare']} | {row['ff_kare']} | "
              f"{row['ly_kaynak_gecikme']} | {row.get('ly_son_fazla')} | {row['ff_kaynak_gecikme']} | {row.get('ff_son_fazla')} | "
              f"{row.get('ly_ff_maks_fark', float('nan')):.2e} |")


if __name__ == "__main__":
    main()
