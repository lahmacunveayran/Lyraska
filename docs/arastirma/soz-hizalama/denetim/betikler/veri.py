"""Denetimin şarkı nesneleri: (ad, dil, satırlar, satır başları, kelime başları|None, ses yükleyici)."""
import sys, json, numpy as np
from hiza import KOK1
import jam, emisyon
sys.path.append(str(KOK1 / "betikler"))  # yalnızca makam TextGrid ayrıştırıcısı için (okuma)
_M = None
def makam(split):
    import ortak
    return ortak.dataset("makam", split)
def makam_full(song):
    """Bölümleri art arda eklemeden: tam kayıt, öbek başları kayıttaki mutlak zaman."""
    offs, o = [], 0.0
    for a, d in song.segments: offs.append(o); o += d
    abs_starts = []
    for t in song.line_starts:
        i = max(k for k in range(len(offs)) if offs[k] <= t + 1e-6)
        abs_starts.append(song.segments[i][0] + (t - offs[i]))
    return abs_starts
def jamendo(name):
    lines, ls, wl = jam.song(name)
    lang = jam.LANG[jam.meta()[name]["Language"]]
    return lines, ls, wl, lang
def vekil(split, name):
    j = json.loads((KOK1 / "cache/vekil" / split / f"{name}.json").read_text(encoding="utf-8"))
    return j["lines"], [w[0] for w in j["word_starts"]], j["word_starts"], KOK1 / "cache/vekil" / split / f"{name}.wav"
