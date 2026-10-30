"""JamendoLyrics'i resmî satır/kelime dosyalarından bağımsız okur."""
import csv, json, numpy as np
from hiza import KOK1
J = KOK1 / "dl/jamendolyrics"
LANG = {"English": "en", "French": "fr", "German": "de", "Spanish": "es"}

def meta():
    with open(J / "JamendoLyrics.csv", encoding="utf-8") as f:
        return {r["Filepath"][:-4]: r for r in csv.DictReader(f)}

def song(name):
    lines = []
    with open(J / "annotations/lines" / f"{name}.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            lines.append((float(r["start_time"]), r["lyrics_line"].split()))
    ws = []
    with open(J / "annotations/words" / f"{name}.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ws.append(float(r["word_start"]))
    n = sum(len(l) for _, l in lines)
    assert n == len(ws), (name, n, len(ws))
    wl, k = [], 0
    for _, l in lines:
        wl.append(ws[k:k + len(l)]); k += len(l)
    return [l for _, l in lines], [s for s, _ in lines], wl

def split_ids(split):
    r = json.load(open(KOK1 / f"cache/sonuc/jamendo_{split}_ctc-karisim.json"))
    return [s["sid"] for s in r["sarkilar"]], {s["sid"]: s for s in r["sarkilar"]}
