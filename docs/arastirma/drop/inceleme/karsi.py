"""Bağımsız karşı örnek üreteci (incelemeci; uret2.py'den hiçbir kod/kalıp alınmadı).

Kullanım: python3 karsi.py <klasör> <tohum>
Her tür için <tür>-<tohum>.flac + .json ({"drops","sahte","belirsiz","tur","bpm","dropsuz"}).
Farklar: bölüm uzunlukları 8'in katı değil, ölçü 3/4 olabilir, limiter/canlı dinamik/karanlık miks,
tempo kayması, sessiz giriş, yükselişsiz drop, yalnız vokalden drop, rock/metal, arabesk, kısa şarkı.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import scipy.signal as sg

SR = 44100


class Mix:
    def __init__(self, rng, bpm, meter=4, seconds=200, drift=0.0):
        self.rng, self.bpm, self.meter = rng, bpm, meter
        self.beat = 60.0 / bpm
        self.out = {k: np.zeros(int(seconds * SR)) for k in ("drums", "bass", "music", "vox")}
        self.t = 0.0
        self.drift = drift  # canlı kayıt: zaman eğilmesi (sn genliği)
        self.drops, self.unsure = [], []
        self.root = 55.0 * 2 ** (rng.integers(0, 12) / 12)

    def warp(self, t):
        return t + self.drift * np.sin(2 * np.pi * t / 37.0)

    def put(self, bus, t, sig, g=1.0):
        s = int(round(self.warp(t) * SR))
        buf = self.out[bus]
        e = min(len(buf), s + len(sig))
        if 0 <= s < e:
            buf[s:e] += g * sig[: e - s]

    # Sesler (kendi tasarımım).
    def kick(self, low=48.0):
        n = int(0.35 * SR)
        t = np.arange(n) / SR
        f = low + 120 * np.exp(-t / 0.03)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)

    def snare(self):
        n = int(0.22 * SR)
        t = np.arange(n) / SR
        nz = sg.lfilter(*sg.butter(2, [800 / (SR / 2), 7000 / (SR / 2)], "band"), self.rng.standard_normal(n))
        return (0.7 * nz + 0.5 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t / 0.06)

    def hat(self, open_=False):
        n = int((0.25 if open_ else 0.05) * SR)
        t = np.arange(n) / SR
        nz = sg.lfilter(*sg.butter(2, 7000 / (SR / 2), "high"), self.rng.standard_normal(n))
        return 0.4 * nz * np.exp(-t / (0.08 if open_ else 0.015))

    def tone(self, freq, dur, kind="saw", cut=3000, att=0.01, rel=0.05):
        n = max(1, int(dur * SR))
        t = np.arange(n) / SR
        if kind == "sine":
            x = np.sin(2 * np.pi * freq * t)
        elif kind == "square":
            x = np.sign(np.sin(2 * np.pi * freq * t))
        else:
            x = sum(2 * ((freq * d * t) % 1) - 1 for d in (1.0, 1.006, 0.994)) / 3
        x = sg.lfilter(*sg.butter(2, min(cut, SR / 2 - 100) / (SR / 2)), x)
        env = np.minimum(1, t / att) * np.minimum(1, (dur - t) / rel).clip(0)
        return x * env

    def voice(self, freq, dur, vowel=0):
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = freq * (1 + 0.01 * np.sin(2 * np.pi * 5.5 * t))
        pulse = (np.sin(2 * np.pi * np.cumsum(f) / SR) > 0.95).astype(float)
        forms = [(730, 1090, 2440), (270, 2290, 3010), (570, 840, 2410)][vowel % 3]
        y = sum(sg.lfilter(*sg.butter(2, [fo * 0.9 / (SR / 2), fo * 1.1 / (SR / 2)], "band"), pulse) * g
                for fo, g in zip(forms, (1, 0.5, 0.25)))
        env = np.minimum(1, t / 0.05) * np.minimum(1, (dur - t) / 0.1).clip(0)
        return 6 * y * env

    # Bölümler: el = {"drums": stil, "bass": stil, "pad": g, "gtr": g, "strings": g, "vox": g, "riser": g}
    def section(self, bars, el, drop=False, unsure=False):
        if drop:
            self.drops.append(round(self.warp(self.t), 4))
        if unsure:
            self.unsure.append(round(self.warp(self.t), 4))
        b, m = self.beat, self.meter
        for k in range(bars):
            tb = self.t + k * m * b
            chord = self.root * 2 ** ([0, 5, 7, 3][(k // 2) % 4] / 12)
            d = el.get("drums")
            g = el.get("dg", 1.0)
            if d == "edm":
                for q in range(m):
                    self.put("drums", tb + q * b, self.kick(), g)
                    self.put("drums", tb + (q + 0.5) * b, self.hat(True), 0.5 * g)
                if m == 4:
                    for q in (1, 3):
                        self.put("drums", tb + q * b, self.snare(), 0.6 * g)
            elif d == "rock":
                for pos in ((0, 2.5) if m == 4 else (0,)):
                    self.put("drums", tb + pos * b, self.kick(60), g)
                for q in ((1, 3) if m == 4 else (1, 2)):
                    self.put("drums", tb + q * b, self.snare(), 0.9 * g)
                for q in range(2 * m):
                    self.put("drums", tb + q * b / 2, self.hat(), 0.6 * g)
            elif d == "metal":
                for q in range(4 * m):
                    self.put("drums", tb + q * b / 4, self.kick(65), 0.7 * g)
                for q in ((1, 3) if m == 4 else (1, 2)):
                    self.put("drums", tb + q * b, self.snare(), g)
            elif d == "hiphop":
                for pos in (0, 0.75, 2.25):
                    self.put("drums", tb + pos * b, self.kick(45), g)
                for q in (1, 3):
                    self.put("drums", tb + q * b, self.snare(), g)
                for q in range(8):
                    self.put("drums", tb + q * b / 2, self.hat(), 0.4 * g)
            elif d == "dnb":
                for pos in (0, 2.5):
                    self.put("drums", tb + pos * b, self.kick(), g)
                for q in (1, 3):
                    self.put("drums", tb + q * b, self.snare(), g)
                for q in range(8):
                    self.put("drums", tb + q * b / 2, self.hat(), 0.4 * g)
            elif d == "darbuka":
                for pos, f in ((0, 110), (1, 420), (1.5, 420), (2, 110), (3, 420)):
                    n = int(0.12 * SR)
                    tt = np.arange(n) / SR
                    self.put("drums", tb + pos * b, np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.05), 0.8 * g)
            elif d == "hats":
                for q in range(2 * m):
                    self.put("drums", tb + q * b / 2, self.hat(), 0.5 * g)
            bs = el.get("bass")
            bg = el.get("bg", 1.0)
            if bs == "sub":
                self.put("bass", tb, self.tone(chord, m * b * 0.98, "sine", 400), 0.9 * bg)
            elif bs == "eighth":
                for q in range(2 * m):
                    self.put("bass", tb + q * b / 2, self.tone(chord, b / 2 * 0.9, "saw", 600), 0.8 * bg)
            elif bs == "pump":
                for q in range(m):
                    self.put("bass", tb + (q + 0.25) * b, self.tone(chord, b * 0.7, "saw", 900, att=0.08), bg)
            elif bs == "rock":
                for q in range(2 * m):
                    self.put("bass", tb + q * b / 2, self.tone(chord, b / 2 * 0.95, "square", 700), 0.6 * bg)
            elif bs == "mid":  # future bass: akor, alt bas yok
                for d2 in (2, 2 * 2 ** (4 / 12), 3):
                    self.put("bass", tb, self.tone(chord * d2, m * b * 0.9, "saw", 2500), 0.35 * bg)
            if el.get("pad"):
                for d2 in (2, 2 * 2 ** (3 / 12), 3):
                    self.put("music", tb, self.tone(chord * d2, m * b, "saw", 1500, att=0.3, rel=0.3), 0.25 * el["pad"])
            if el.get("strings"):
                for d2 in (4, 4 * 2 ** (3 / 12), 6):
                    self.put("music", tb, self.tone(chord * d2, m * b, "saw", 4000, att=0.4, rel=0.4), 0.2 * el["strings"])
            if el.get("gtr"):
                for q in range(2 * m):
                    ch = sum(self.tone(chord * 2 * r, b / 2, "saw", 5000) for r in (1, 1.5, 2))
                    self.put("music", tb + q * b / 2, np.tanh(6 * ch) * 0.4, el["gtr"])
            if el.get("clean"):
                for q in range(m):
                    self.put("music", tb + q * b, self.tone(chord * 4 * (1.5 if q % 2 else 1), b, "square", 2500, rel=0.3), 0.15 * el["clean"])
            if el.get("vox"):
                for q in range(0, m, 2):
                    self.put("vox", tb + q * b, self.voice(chord * 4 * 2 ** (self.rng.integers(0, 5) / 12), 1.8 * b, q + k), 0.5 * el["vox"])
            if el.get("riser"):
                n = int(m * b * SR)
                tt = np.arange(n) / SR
                p0 = (k / bars)
                f = 200 * 2 ** (3 * (p0 + tt / (bars * m * b)))
                self.put("music", tb, np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.1 + 0.5 * p0), el["riser"])
        self.t += bars * m * b

    def render(self):
        n = int((self.t + 2) * SR)
        return sum(v[:n] for v in self.out.values())


def master(rng, x, style):
    x = x / (np.sqrt(np.mean(x**2)) + 1e-9) * 0.12
    if style == "limiter":
        # Ağır sıkıştırma + tepe sınırlayıcı: yükseliş ve drop aynı yükseklikte.
        env = np.sqrt(sg.lfilter([1 - 0.9995], [1, -0.9995], x**2)) + 1e-6
        x = x * np.minimum(1.0, 0.08 / env) ** 0.8
        x = x / np.percentile(np.abs(x), 99.0)
        x = np.clip(np.tanh(1.5 * x), -0.95, 0.95)
    elif style == "dark":
        x = sg.lfilter(*sg.butter(2, 3500 / (SR / 2)), x)
    elif style == "bright":
        x = x + 0.6 * sg.lfilter(*sg.butter(1, 3000 / (SR / 2), "high"), x)
    x = 0.89 * x / (np.max(np.abs(x)) + 1e-9)
    return x + rng.standard_normal(len(x)) * 1e-4


def build(kind, rng):
    r = rng.random
    if kind == "limiter_edm":
        s = Mix(rng, float(rng.integers(124, 130)))
        s.section(6, {"drums": "edm", "bass": "pump", "pad": 0.5})
        s.section(5, {"pad": 0.8, "vox": 0.7})
        s.section(6, {"pad": 0.7, "riser": 1.2, "drums": "hats", "dg": 1.4, "strings": 0.8})
        s.section(12, {"drums": "edm", "bass": "pump", "pad": 0.6, "strings": 0.5}, drop=True)
        s.section(6, {"pad": 0.8, "vox": 0.6})
        s.section(4, {"pad": 0.7, "riser": 1.2, "drums": "hats", "dg": 1.4})
        s.section(20, {"drums": "edm", "bass": "pump", "pad": 0.6}, drop=True)
        return s, "limiter"
    if kind == "yukselissiz":  # yükselişsiz, kırılmadan doğrudan drop
        s = Mix(rng, float(rng.integers(120, 132)))
        s.section(10, {"drums": "edm", "bass": "eighth", "bg": 0.5, "pad": 0.4})
        s.section(4, {"pad": 0.8})
        s.section(16, {"drums": "edm", "bass": "sub", "pad": 0.5, "strings": 0.4}, drop=True)
        s.section(6, {"pad": 0.8, "vox": 0.5})
        s.section(16, {"drums": "edm", "bass": "sub", "pad": 0.5}, drop=True)
        return s, ["dark", "none"][int(r() * 2)]
    if kind == "yalniz_vokal":  # drop'tan önce 2 ölçü yalnızca ses
        s = Mix(rng, float(rng.integers(124, 132)))
        s.section(8, {"drums": "edm", "bass": "eighth", "pad": 0.5})
        s.section(6, {"pad": 0.8, "riser": 0.8})
        s.section(2, {"vox": 1.2})
        s.section(16, {"drums": "edm", "bass": "eighth", "pad": 0.6}, drop=True)
        s.section(8, {"pad": 0.6, "vox": 0.8})
        s.section(2, {"vox": 1.2})
        s.section(16, {"drums": "edm", "bass": "eighth", "pad": 0.6}, drop=True)
        return s, "none"
    if kind == "rock_giris":  # distorsiyonlu gitar tek başına, sonra grup girer
        s = Mix(rng, float(rng.integers(95, 150)), drift=0.02)
        s.section(4, {"gtr": 0.8})
        s.section(8, {"drums": "rock", "bass": "rock", "gtr": 0.8}, drop=True)
        s.section(8, {"drums": "rock", "dg": 0.6, "bass": "rock", "bg": 0.6, "clean": 0.8, "vox": 0.8})
        s.section(8, {"drums": "rock", "bass": "rock", "gtr": 0.9, "vox": 1.0}, unsure=True)
        s.section(8, {"drums": "rock", "dg": 0.6, "bass": "rock", "bg": 0.6, "clean": 0.8, "vox": 0.8})
        s.section(8, {"drums": "rock", "bass": "rock", "gtr": 0.9, "vox": 1.0}, unsure=True)
        s.section(4, {"clean": 0.8})
        s.section(8, {"drums": "rock", "bass": "rock", "gtr": 1.0, "vox": 1.0}, drop=True)
        return s, "none"
    if kind == "metal":
        s = Mix(rng, float(rng.integers(150, 185)), drift=0.015)
        s.section(4, {"clean": 1.0})
        s.section(8, {"drums": "metal", "bass": "rock", "gtr": 1.0}, drop=True)
        s.section(8, {"drums": "rock", "bass": "rock", "gtr": 0.7, "vox": 0.9})
        s.section(8, {"drums": "metal", "bass": "rock", "gtr": 1.0, "vox": 1.0}, unsure=True)
        s.section(4, {"clean": 0.9, "pad": 0.4})
        s.section(8, {"drums": "metal", "bass": "rock", "gtr": 1.0}, drop=True)
        return s, "limiter"
    if kind == "arabesk":  # dropsuz: darbuka, yaylılar; nakaratta yaylılar ve bas büyür
        s = Mix(rng, float(rng.integers(84, 104)))
        s.section(4, {"strings": 0.8})
        for _ in range(2):
            s.section(8, {"drums": "darbuka", "bass": "sub", "bg": 0.5, "vox": 1.0, "strings": 0.3})
            s.section(8, {"drums": "darbuka", "dg": 1.2, "bass": "eighth", "strings": 1.2, "vox": 1.2})
        s.section(4, {"strings": 1.0})
        s.section(8, {"drums": "darbuka", "dg": 1.2, "bass": "eighth", "strings": 1.2, "vox": 1.2})
        return s, ["none", "limiter"][int(r() * 2)]
    if kind == "turk_pop_nakarat":  # dropsuz: kıtada bas yok, nakaratta tam bas + davul (pop "drop" gibi)
        s = Mix(rng, float(rng.integers(100, 126)))
        s.section(4, {"pad": 0.6, "clean": 0.6})
        for _ in range(2):
            s.section(8, {"drums": "hats", "clean": 0.7, "vox": 1.0})
            s.section(8, {"drums": "edm", "bass": "eighth", "strings": 0.8, "vox": 1.2}, unsure=True)
        s.section(4, {"pad": 0.6})
        s.section(8, {"drums": "edm", "bass": "eighth", "strings": 0.8, "vox": 1.2}, unsure=True)
        return s, "limiter"
    if kind == "canli":  # dropsuz canlı kayıt: kademeli kreşendo, tempo kayması
        s = Mix(rng, float(rng.integers(88, 120)), drift=0.06)
        for k, g in enumerate((0.3, 0.45, 0.6, 0.75, 0.9, 1.0, 0.8, 1.0)):
            s.section(6, {"drums": "rock", "dg": g, "bass": "rock", "bg": g, "clean": 0.6, "vox": 0.8 * g, "strings": g * 0.5})
        return s, "none"
    if kind == "vals_drop":  # 3/4 ölçü
        s = Mix(rng, float(rng.integers(126, 140)), meter=3)
        s.section(8, {"drums": "edm", "bass": "eighth", "bg": 0.5, "pad": 0.5})
        s.section(8, {"pad": 0.8, "riser": 1.0})
        s.section(16, {"drums": "edm", "bass": "sub", "pad": 0.6, "strings": 0.6}, drop=True)
        s.section(8, {"pad": 0.8, "riser": 1.0})
        s.section(16, {"drums": "edm", "bass": "sub", "pad": 0.6}, drop=True)
        return s, "none"
    if kind == "hiphop_drop":
        s = Mix(rng, float(rng.integers(84, 96)))
        s.section(4, {"pad": 0.7, "vox": 0.6})
        s.section(8, {"drums": "hiphop", "bass": "sub", "vox": 0.9}, drop=True)
        s.section(8, {"drums": "hiphop", "bass": "sub", "vox": 0.9, "strings": 0.5})
        s.section(2, {"pad": 0.6, "vox": 1.0})
        s.section(8, {"drums": "hiphop", "bass": "sub", "vox": 0.9, "strings": 0.6}, drop=True)
        return s, "bright"
    if kind == "sessiz_giris":  # 6 sn sessizlik + uzun ambiyans, sonra yükselişsiz drop
        s = Mix(rng, float(rng.integers(122, 128)))
        s.t = 6.0
        s.section(10, {"pad": 0.5})
        s.section(14, {"drums": "edm", "bass": "eighth", "pad": 0.6}, drop=True)
        s.section(6, {"pad": 0.7, "riser": 1.0})
        s.section(14, {"drums": "edm", "bass": "eighth", "pad": 0.6}, drop=True)
        return s, "none"
    if kind == "kisa":  # 40 sn'lik kısa şarkı, tek drop
        s = Mix(rng, 128.0)
        s.section(2, {"pad": 0.6})
        s.section(6, {"pad": 0.6, "riser": 1.0})
        s.section(12, {"drums": "edm", "bass": "eighth", "pad": 0.6}, drop=True)
        return s, "none"
    if kind == "tempo_degisen":  # drop'ta tempo 124 → 140
        s = Mix(rng, 124.0)
        s.section(8, {"drums": "edm", "bass": "eighth", "pad": 0.5})
        s.section(8, {"pad": 0.8, "riser": 1.0})
        s.bpm, s.beat = 140.0, 60 / 140.0
        s.section(24, {"drums": "edm", "bass": "pump", "pad": 0.6}, drop=True)
        s.bpm = 132.0  # json'da ortalama
        return s, "none"
    if kind == "dnb_tam":  # davul her yerde, iki drop
        s = Mix(rng, float(rng.integers(170, 176)))
        s.section(8, {"drums": "dnb", "dg": 0.6, "pad": 0.6})
        s.section(8, {"drums": "dnb", "dg": 0.7, "pad": 0.7, "riser": 1.0})
        s.section(16, {"drums": "dnb", "bass": "pump", "pad": 0.4}, drop=True)
        s.section(8, {"drums": "dnb", "dg": 0.6, "pad": 0.6, "vox": 0.6})
        s.section(8, {"drums": "dnb", "dg": 0.7, "pad": 0.7, "riser": 1.0})
        s.section(16, {"drums": "dnb", "bass": "pump", "pad": 0.4}, drop=True)
        return s, "limiter"
    if kind == "future_bass":  # drop'ta alt bas yok: akor bası
        s = Mix(rng, float(rng.integers(140, 160)))
        s.section(8, {"drums": "hats", "pad": 0.5, "vox": 0.7})
        s.section(8, {"pad": 0.6, "riser": 1.0})
        s.section(16, {"drums": "edm", "bass": "mid", "strings": 0.5}, drop=True)
        s.section(8, {"drums": "hats", "pad": 0.5, "vox": 0.7})
        s.section(8, {"pad": 0.6, "riser": 1.0})
        s.section(16, {"drums": "edm", "bass": "mid", "strings": 0.5}, drop=True)
        return s, "bright"
    raise ValueError(kind)


KINDS = ["limiter_edm", "yukselissiz", "yalniz_vokal", "rock_giris", "metal", "arabesk", "turk_pop_nakarat",
         "canli", "vals_drop", "hiphop_drop", "sessiz_giris", "kisa", "tempo_degisen", "dnb_tam", "future_bass"]
DROPLESS = {"arabesk", "turk_pop_nakarat", "canli"}


def main():
    out = Path(sys.argv[1])
    seed = int(sys.argv[2])
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else KINDS
    out.mkdir(parents=True, exist_ok=True)
    for kind in only:
        rng = np.random.default_rng(seed * 7919 + KINDS.index(kind))
        s, style = build(kind, rng)
        audio = master(rng, s.render(), style)
        name = f"{kind}-{seed}"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-sample_fmt", "s16", str(out / f"{name}.flac")], input=audio.astype("<f4").tobytes(), check=True)
        truth = {"drops": s.drops, "sahte": [], "belirsiz": s.unsure, "tur": kind, "bpm": s.bpm,
                 "dropsuz": kind in DROPLESS}
        (out / f"{name}.json").write_text(json.dumps(truth))
        print(name, f"{len(audio) / SR:.0f} sn", style, s.drops, flush=True)


if __name__ == "__main__":
    main()
