"""Söz hizalama denemesi: ortak parçalar (ses okuma, metin, veri setleri, bölme, ölçütler).

Ses dosyaları yalnızca geçici klasörde durur; depoya hiçbir ses girmez.
Kök klasör: KOK (bu dosyanın bir üstü). Veri setleri KOK/dl altında, ara sonuçlar KOK/cache altında.
"""

import csv
import hashlib
import json
import math
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

KOK = Path(__file__).resolve().parent.parent
DL = KOK / "dl"
CACHE = KOK / "cache"
CACHE.mkdir(exist_ok=True)
MODELS = KOK / "models"


def load_audio(path, sr=16000, mono=True, start=None, duration=None):
    """ffmpeg ile float32 ses; mono ise (n,), değilse (2, n)."""
    cmd = ["ffmpeg", "-nostdin", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.6f}"]
    cmd += ["-i", str(path)]
    if duration is not None:
        cmd += ["-t", f"{duration:.6f}"]
    ch = 1 if mono else 2
    cmd += ["-f", "f32le", "-ac", str(ch), "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    if not mono:
        x = x.reshape(-1, 2).T.copy()
    return x


# ---------------------------------------------------------------- metin

TR_CHARS = set("çğıöşüÇĞİÖŞÜ")


def lower(text, lang):
    if lang == "tr":
        text = text.replace("I", "ı").replace("İ", "i")
    return text.lower()


def words_of(line):
    return [w for w in re.split(r"\s+", line.strip()) if w]


VOWELS = set("aeıioöuüâêîôûàèéìíòóùúäëïœæyåø")


def syllables(word):
    """Kaba hece sayısı: ünlü öbekleri (Türkçede tam doğru; diğer dillerde yaklaşık)."""
    w = word.lower()
    n, prev = 0, False
    for ch in w:
        v = ch in VOWELS
        if v and not prev:
            n += 1
        prev = v
    return max(1, n)


@dataclass
class Song:
    """Bir deneme şarkısı: ses ve doğru zamanlar.

    lines: [[kelime, ...], ...]; word_starts: satır satır doğru kelime başları (yoksa None).
    line_starts: satır başlarının doğrusu. audio: ses dosyası ya da (dosya, [(baş, son), ...]) parçaları.
    """

    sid: str
    lang: str
    lines: list
    line_starts: list
    word_starts: list = None
    audio: object = None
    segments: list = None  # [(kaynak_baş, süre)] sırayla birleştirilir
    kind: str = ""
    meta: dict = field(default_factory=dict)

    def load(self, sr=16000, mono=True):
        if not self.segments:
            return load_audio(self.audio, sr, mono)
        parts = [load_audio(self.audio, sr, mono, s, d) for s, d in self.segments]
        return np.concatenate(parts, axis=-1)


# ---------------------------------------------------------------- JamendoLyrics MultiLang

LANG = {"English": "en", "French": "fr", "German": "de", "Spanish": "es"}


def jamendo_songs():
    root = DL / "jamendolyrics"
    out = []
    with open(root / "JamendoLyrics.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = row["Filepath"][:-4]
            words = []
            with open(root / "annotations" / "words" / f"{name}.csv", encoding="utf-8") as g:
                for r in csv.DictReader(g):
                    words.append((float(r["word_start"]), r["line_end"] not in ("nan", "")))
            text = (root / "lyrics" / f"{name}.words.txt").read_text(encoding="utf-8").split("\n")
            text = [t.strip() for t in text if t.strip()]
            assert len(text) == len(words), name
            lines, ls, ws, cur, curs = [], [], [], [], []
            for t, (s, end) in zip(text, words):
                cur.append(t)
                curs.append(s)
                if end:
                    lines.append(cur)
                    ws.append(curs)
                    ls.append(curs[0])
                    cur, curs = [], []
            if cur:
                lines.append(cur)
                ws.append(curs)
                ls.append(curs[0])
            out.append(
                Song(
                    sid=name,
                    lang=LANG[row["Language"]],
                    lines=lines,
                    line_starts=ls,
                    word_starts=ws,
                    audio=root / "mp3" / row["Filepath"],
                    kind="jamendo",
                    meta={"genre": row["Genre"]},
                )
            )
    return out


# ---------------------------------------------------------------- Türk makam müziği (Dzhambazov)

METU = {"C": "ç", "G": "ğ", "I": "ı", "O": "ö", "S": "ş", "U": "ü"}


def metu_to_utf8(s):
    return "".join(METU.get(ch, ch) for ch in s)


def read_textgrid_phrases(path):
    raw = Path(path).read_bytes()
    try:
        txt = raw.decode("utf-8")
        metu = txt.isascii()
    except UnicodeDecodeError:
        txt, metu = raw.decode("latin-1"), True
    tiers = re.split(r"item \[\d+\]:", txt)[1:]
    best = None
    for t in tiers:
        name = re.search(r'name = "([^"]*)"', t).group(1)
        ivs = re.findall(
            r'xmin = ([\d.eE+-]+)\s*\n\s*xmax = ([\d.eE+-]+)\s*\n\s*text = "([^"]*)"', t
        )
        ivs = [(float(a), float(b), c.strip()) for a, b, c in ivs]
        if "phrase" in name or best is None:
            best = ivs
            if "phrase" in name:
                break
    conv = metu_to_utf8 if metu else (lambda t: t)
    return [(a, b, conv(c)) for a, b, c in best if c]


SEC_RE = re.compile(r"_from_(\d+)[_.](\d+)_to_(\d+)[_.]?(\d*)")


def makam_songs():
    root = DL / "turkish-makam-lyrics-2-audio-test-data"
    out = []
    for rec in sorted(root.glob("*/*/")):
        if rec.name == "GEORGI" or rec.parent.name.endswith("_long"):
            continue
        tgs = list(rec.glob("*.TextGrid"))
        mp3 = rec / f"{rec.name}.mp3"
        if not tgs or not mp3.exists():
            continue
        secs = []
        for tg in tgs:
            m = SEC_RE.search(tg.stem)
            if not m:
                continue
            a = float(f"{m.group(1)}.{m.group(2)}")
            b = float(f"{m.group(3)}.{m.group(4) or 0}")
            secs.append((a, b, tg))
        secs.sort()
        chosen, last = [], -1.0
        for a, b, tg in secs:
            if a >= last - 0.05:
                chosen.append((a, b, tg))
                last = b
        segments, units, starts, off = [], [], [], 0.0
        for a, b, tg in chosen:
            for s, e, text in read_textgrid_phrases(tg):
                if s > b - a + 0.01:
                    continue
                units.append(words_of(lower(text, "tr")))
                starts.append(off + s)
            segments.append((a, b - a))
            off += b - a
        if len(units) < 8:
            continue
        out.append(
            Song(
                sid=rec.name,
                lang="tr",
                lines=units,
                line_starts=starts,
                word_starts=None,
                audio=mp3,
                segments=segments,
                kind="makam",
                meta={"sections": len(chosen)},
            )
        )
    return out


# ---------------------------------------------------------------- Türkçe vekil set (üretilen)


def proxy_songs(split):
    d = CACHE / "vekil" / split
    out = []
    for js in sorted(d.glob("*.json")):
        j = json.loads(js.read_text(encoding="utf-8"))
        out.append(
            Song(
                sid=js.stem,
                lang="tr",
                lines=j["lines"],
                line_starts=[w[0] for w in j["word_starts"]],
                word_starts=j["word_starts"],
                audio=js.with_suffix(".wav"),
                kind="vekil",
                meta=j.get("meta", {}),
            )
        )
    return out


# ---------------------------------------------------------------- bölme (geliştirme / doğrulama / son sınama)


def _h(s):
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16)


def split_of(song):
    """Sabit, içerikten bağımsız bölme: ad özetine göre sıralanır, dil başına ilk 5 gelistirme,
    sonraki 5 dogrulama, kalanı son_sinama (Jamendo); makamda 3/3/kalan."""
    return SPLITS.get(song.sid)


def _make_splits():
    sp = {}
    js = jamendo_songs()
    for lang in sorted({s.lang for s in js}):
        group = sorted([s for s in js if s.lang == lang], key=lambda s: _h(s.sid))
        for i, s in enumerate(group):
            sp[s.sid] = "gelistirme" if i < 5 else "dogrulama" if i < 10 else "son_sinama"
    ms = sorted(makam_songs(), key=lambda s: _h(s.sid))
    for i, s in enumerate(ms):
        sp[s.sid] = "gelistirme" if i < 3 else "dogrulama" if i < 6 else "son_sinama"
    return sp


SPLITS = _make_splits()


def dataset(name, split):
    if name == "jamendo":
        return [s for s in jamendo_songs() if SPLITS[s.sid] == split]
    if name == "makam":
        return [s for s in makam_songs() if SPLITS[s.sid] == split]
    if name == "vekil":
        return proxy_songs(split)
    raise ValueError(name)


# ---------------------------------------------------------------- ölçütler


def errors(song, pred_word_starts):
    """pred_word_starts: satır satır tahmini kelime başları. (satır hataları, kelime hataları)."""
    line_err = [abs(p[0] - t) for p, t in zip(pred_word_starts, song.line_starts)]
    word_err = []
    if song.word_starts is not None:
        for p, t in zip(pred_word_starts, song.word_starts):
            word_err += [abs(a - b) for a, b in zip(p, t)]
    return line_err, word_err


def summarize(errs):
    e = np.asarray(errs, dtype=float)
    if len(e) == 0:
        return {}
    return {
        "n": int(len(e)),
        "ort": float(e.mean()),
        "ortanca": float(np.median(e)),
        "%0.3": float((e <= 0.3).mean() * 100),
        "%1": float((e <= 1.0).mean() * 100),
    }


def song_mean(per_song):
    """Şarkı başına ortalama hatanın ortalaması (literatürdeki AAE gibi)."""
    vals = [float(np.mean(e)) for e in per_song if len(e)]
    return float(np.mean(vals)) if vals else math.nan
