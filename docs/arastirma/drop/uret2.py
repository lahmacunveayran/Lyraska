"""Drop ölçümü için kapsamlı deneme seti (2. sürüm; sentetik, ses depoya girmez).

Kullanım: python3 docs/arastirma/drop/uret2.py <çıkış klasörü> <tohum> [tür,tür,...]

Her şarkı için `ad.flac` (44,1 kHz, mono) ve `ad.json`:
  {"drops": [sn, ...], "sahte": [sn, ...], "belirsiz": [sn, ...], "tur": ..., "bpm": ..., "dropsuz": bool}
- drops: drop anları (drop bölümünün ilk örneği; milisaniyesine kesin),
- sahte: sahte droplar (kısa patlayıp yükselişe dönen); drop sayılması hatadır,
- belirsiz: drop sayılıp sayılmaması tartışmalı geçişler (rock'ta kıta → nakarat); ne isabet ne yanlış.

Türler (README'deki tablo): yukselis, sessizlik, bas_donusu, filtre, vokal_cagri, sahte_drop,
ikinci_drop, dubstep, trap, dnb, house, turk_remix, rock, melodik, yuksek_yukselis, uzun_giris;
dropsuz: pop, balad, akustik, turk_pop.

Tohumlar: geliştirme 1–3, doğrulama 11–13, son sınama 21–23 (yalnızca kod bittikten sonra üretilir).
`--vurgusuz`: karşı örnek seti (tohum 31–32): crash ve impact hiç yok; model drop'un vurgusuna
fazla mı dayanıyor, ölçmek için.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import scipy.signal as sg

SR = 44100
# Drop'ta crash (ve ayrıca impact) olasılığı; davullu başka bölümün crash ile başlama olasılığı.
CRASH_ON_DROP = 0.6
CRASH_ON_SECTION = 0.35
# Karşı örnek seti: droplarda (ve bölüm başlarında) crash ve impact yok (`--vurgusuz`).
NO_ACCENT = "--vurgusuz" in sys.argv
BUSES = ("drums", "bass", "music", "vox", "fx")


def butter(kind, f, order=2):
    nyq = SR / 2 * 0.98
    if isinstance(f, (tuple, list)):
        f = [min(max(x, 10.0), nyq) for x in f]
    else:
        f = min(max(f, 10.0), nyq)
    return sg.butter(order, f, kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return sg.sosfilt(butter(kind, f, order), x)


def sweep(x, kind, f0, f1, block=512):
    """Zamanla değişen süzgeç (kesim f0'dan f1'e geometrik)."""
    n = len(x)
    if n == 0:
        return x
    cuts = np.geomspace(f0, f1, max(1, (n + block - 1) // block))
    out = np.empty_like(x)
    zi = np.zeros((1, 2))
    for i, s in enumerate(range(0, n, block)):
        sos = butter(kind, cuts[i])
        out[s : s + block], zi = sg.sosfilt(sos, x[s : s + block], zi=zi)
    return out


def saw(phase):
    return 2 * (phase % 1.0) - 1


def adsr(n, attack, release, decay=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(attack, 1e-4))
    if decay is not None:
        e = e * np.exp(-t / decay)
    rel = int(release * SR)
    if rel > 0 and n > 0:
        e[-min(rel, n) :] *= np.linspace(1, 0, min(rel, n))
    return e


def semis(f, k):
    return f * 2 ** (k / 12)


FORMANTS = {
    "a": [(800, 80, 1.0), (1150, 90, 0.5), (2900, 120, 0.25)],
    "e": [(400, 60, 1.0), (1600, 80, 0.4), (2700, 120, 0.25)],
    "i": [(270, 60, 1.0), (2300, 100, 0.3), (3000, 120, 0.2)],
    "o": [(450, 70, 1.0), (800, 80, 0.6), (2830, 100, 0.15)],
    "u": [(325, 50, 1.0), (700, 60, 0.4), (2530, 170, 0.1)],
}
FORMANT_SOS = {v: [(butter("bandpass", (f - bw, f + bw)), a) for f, bw, a in fs] for v, fs in FORMANTS.items()}

PROGRESSIONS = [[0, -4, 3, -2], [0, 5, -3, -5], [0, -2, -4, -5], [0, 3, 5, -2]]


class Song:
    def __init__(self, rng, bpm, root):
        self.rng = rng
        self.bpm = bpm
        self.beat = 60 / bpm
        self.bar = 4 * self.beat
        self.root = root
        self.prog = PROGRESSIONS[int(rng.integers(0, len(PROGRESSIONS)))]
        self.parts = {b: [] for b in BUSES}
        self.ops = []  # (işlem, otobüsler, t0, t1, ayar)
        self.drops, self.fakes, self.unsure = [], [], []
        self.drop_bpm = None
        self.t = 0.3 + rng.random() * 0.6
        self.bar_index = 0
        # Şarkıya özgü tınılar (örnekler bir kez üretilir, gerçek prodüksiyon gibi).
        self.kick_s = self._kick(45 + 15 * rng.random(), 90 + 60 * rng.random(), 0.12 + 0.15 * rng.random())
        self.snare_s = self._snare(170 + 60 * rng.random(), 1200 + 1500 * rng.random())
        self.clap_s = self._clap()
        self.hat_s = self._hat(0.012 + 0.02 * rng.random())
        self.ohat_s = self._hat(0.12)
        self.crash_s = self._crash()
        self.dum_s = self._kick(85 + 20 * rng.random(), 40, 0.18)
        self.tek_s = self._tek()
        self.tom_s = [self._kick(f, 60, 0.2) for f in (180, 140, 110, 90)]
        self.gains = {k: 10 ** (rng.normal(0, 2.0) / 20) for k in ("drums", "bass", "music", "vox", "fx")}

    def set_tempo(self, bpm):
        """Tempoyu bundan sonraki bölümler için değiştirir (tempo değişen şarkı)."""
        self.bpm = bpm
        self.beat = 60 / bpm
        self.bar = 4 * self.beat

    # --- örnekler ---
    def _kick(self, base, sweep_hz, decay):
        n = int(0.4 * SR)
        t = np.arange(n) / SR
        f = base + sweep_hz * np.exp(-t / 0.03)
        click = self.rng.standard_normal(n) * np.exp(-t / 0.002) * 0.3
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay) + click) * 0.9

    def _snare(self, tone, noise_cut):
        n = int(0.25 * SR)
        t = np.arange(n) / SR
        noise = filt(self.rng.standard_normal(n), "highpass", noise_cut)
        body = np.sin(2 * np.pi * tone * t)
        return (0.7 * noise * np.exp(-t / 0.07) + 0.5 * body * np.exp(-t / 0.05)) * 0.8

    def _clap(self):
        n = int(0.3 * SR)
        t = np.arange(n) / SR
        noise = filt(self.rng.standard_normal(n), "bandpass", (900, 4000))
        e = sum(np.where(t >= d, np.exp(-(t - d) / 0.012), 0) for d in (0, 0.01, 0.02)) + 0.4 * np.exp(-t / 0.12)
        return noise * e * 0.7

    def _hat(self, decay):
        n = int((decay * 6 + 0.01) * SR)
        t = np.arange(n) / SR
        return filt(self.rng.standard_normal(n), "highpass", 7000) * np.exp(-t / decay) * 0.4

    def _crash(self):
        n = int(2.5 * SR)
        t = np.arange(n) / SR
        return filt(self.rng.standard_normal(n), "highpass", 4000) * np.exp(-t / 0.9) * 0.5

    def _tek(self):
        n = int(0.15 * SR)
        t = np.arange(n) / SR
        noise = filt(self.rng.standard_normal(n), "bandpass", (2000, 6000))
        return (0.6 * noise * np.exp(-t / 0.02) + 0.5 * np.sin(2 * np.pi * 620 * t) * np.exp(-t / 0.04)) * 0.7

    # --- yerleştirme ---
    def add(self, bus, t, sig, g=1.0):
        if g != 0:
            self.parts[bus].append((t, sig * g))

    def chord_root(self, k):
        return semis(self.root, self.prog[k % 4])

    def tone(self, bus, t, dur, freq, kind="saw", g=1.0, cut=None, attack=0.01, release=0.05, decay=None, vib=0.0):
        n = int(dur * SR)
        if n <= 0:
            return
        tt = np.arange(n) / SR
        f = freq * (1 + vib * np.sin(2 * np.pi * 5.5 * tt)) if vib else freq
        ph = np.cumsum(np.broadcast_to(f, tt.shape)) / SR
        if kind == "saw":
            s = saw(ph)
        elif kind == "square":
            s = np.sign(saw(ph))
        elif kind == "sine":
            s = np.sin(2 * np.pi * ph)
        else:  # tri
            s = 2 * np.abs(saw(ph)) - 1
        if cut is not None:
            s = filt(s, "lowpass", cut)
        self.add(bus, t, s * adsr(n, attack, release, decay), g)

    def vocal(self, t, dur, freq, vowel, g=1.0, shout=False):
        n = int(dur * SR)
        if n <= 0:
            return
        tt = np.arange(n) / SR
        f = freq * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * tt))
        src = saw(np.cumsum(f) / SR) + 0.08 * self.rng.standard_normal(n)
        if shout:
            src = np.tanh(2 * src)
        y = sum(a * sg.sosfilt(sos, src) for sos, a in FORMANT_SOS[vowel])
        self.add("vox", t, y * adsr(n, 0.03, 0.08) * 1.5, g)

    def op(self, kind, buses, t0, t1, **kw):
        self.ops.append((kind, buses, t0, t1, kw))

    # --- bölümler ---
    def section(self, bars, el, fx=()):
        t0 = self.t
        for k in range(bars):
            self.write_bar(self.t + k * self.bar, el, k, bars)
        t1 = t0 + bars * self.bar
        for f in fx:
            self.op(f[0], f[1], t0, t1, **(f[2] if len(f) > 2 else {}))
        self.t = t1
        self.bar_index += bars
        return t0

    def write_bar(self, tb, el, k, bars):
        b, rng = self.beat, self.rng
        idx = self.bar_index + k
        root = self.chord_root(idx)
        prog = (k + 1) / bars
        last = k == bars - 1
        G = self.gains

        def gd(name, default=1.0):
            return el.get(name, default)

        # Davul.
        if "drums" in el:
            style, g = el["drums"]
            g *= G["drums"]
            if el.get("drums_last_off") and k >= bars - el["drums_last_off"]:
                g = 0
            if style == "four":
                for q in range(4):
                    self.add("drums", tb + q * b, self.kick_s, g)
                for q in (1, 3):
                    self.add("drums", tb + q * b, self.clap_s, 0.7 * g)
                for q in range(4):
                    self.add("drums", tb + (q + 0.5) * b, self.ohat_s if el.get("open_hat") else self.hat_s, 0.6 * g)
            elif style == "kickonly":
                for q in range(4):
                    self.add("drums", tb + q * b, self.kick_s, g)
            elif style == "hats":
                for q in range(8):
                    self.add("drums", tb + q * b / 2, self.hat_s, (0.6 if q % 2 else 0.35) * g)
            elif style == "halftime":
                self.add("drums", tb, self.kick_s, g)
                if rng.random() < 0.5:
                    self.add("drums", tb + 2.5 * b, self.kick_s, 0.8 * g)
                self.add("drums", tb + 2 * b, self.snare_s, g)
                for q in range(8):
                    self.add("drums", tb + q * b / 2, self.hat_s, 0.5 * g)
            elif style == "trap":
                for pos in (0, 1.75, 2.5) if idx % 2 == 0 else (0, 0.75, 2.75):
                    self.add("drums", tb + pos * b, self.kick_s, g)
                self.add("drums", tb + 2 * b, self.clap_s, g)
                for q in range(16):
                    if q in (6, 14) and rng.random() < 0.5:
                        for r in range(3):
                            self.add("drums", tb + (q + r / 3) * b / 4, self.hat_s, 0.4 * g)
                    else:
                        self.add("drums", tb + q * b / 4, self.hat_s, (0.5 if q % 2 == 0 else 0.3) * g)
            elif style == "dnb":
                self.add("drums", tb, self.kick_s, g)
                self.add("drums", tb + 2.5 * b, self.kick_s, 0.9 * g)
                for q in (1, 3):
                    self.add("drums", tb + q * b, self.snare_s, 1.1 * g)
                for q in range(8):
                    self.add("drums", tb + q * b / 2, self.hat_s, 0.5 * g)
            elif style in ("rock", "pop"):
                soft = 0.7 if style == "pop" else 1.0
                for pos in (0, 2, 2.5):
                    self.add("drums", tb + pos * b, self.kick_s, g * soft)
                for q in (1, 3):
                    self.add("drums", tb + q * b, self.snare_s, g * soft)
                for q in range(8):
                    self.add("drums", tb + q * b / 2, self.hat_s, 0.5 * g)
            elif style == "ballad":
                self.add("drums", tb, self.kick_s, 0.5 * g)
                self.add("drums", tb + 2 * b, self.snare_s, 0.25 * g)
            elif style == "shaker":
                for q in range(16):
                    self.add("drums", tb + q * b / 4, self.hat_s, (0.25 if q % 2 else 0.12) * g)
                self.add("drums", tb, self.dum_s, 0.35 * g)
            elif style == "boombap":
                for pos in (0, 1.75, 2.5):
                    self.add("drums", tb + pos * b, self.kick_s, g)
                for q in (1, 3):
                    self.add("drums", tb + q * b, self.snare_s, g)
                for q in range(8):
                    self.add("drums", tb + (q + (0.16 if q % 2 else 0)) * b / 2, self.hat_s, 0.45 * g)
            elif style == "darbuka":
                for pos, s in ((0, self.dum_s), (1.5, self.tek_s), (2, self.dum_s), (3, self.tek_s), (3.5, self.tek_s)):
                    self.add("drums", tb + pos * b, s, g)
        if el.get("crash") and k == 0 and not NO_ACCENT:
            self.add("drums", tb, self.crash_s, el["crash"] * G["drums"])
        if "kickroll" in el and last:
            for q in range(16):
                self.add("drums", tb + q * b / 4, self.kick_s, el["kickroll"] * G["drums"] * (0.4 + 0.6 * q / 15))
        if "roll" in el:
            # Sıklaşan trampet: dörtlük → sekizlik → on altılık → otuz ikilik.
            div = 1 if prog <= 0.5 else (2 if prog <= 0.75 else (4 if not last else 8))
            for q in range(4 * div):
                self.add("drums", tb + q * b / div, self.snare_s, el["roll"] * G["drums"] * (0.3 + 0.7 * prog))
        if "darbuka_roll" in el:
            div = 2 if prog <= 0.5 else (4 if not last else 8)
            for q in range(4 * div):
                s = self.dum_s if q % div == 0 else self.tek_s
                self.add("drums", tb + q * b / div, s, el["darbuka_roll"] * G["drums"] * (0.4 + 0.6 * prog))
        if "fill" in el and last:
            for q in range(8):
                self.add("drums", tb + q * b / 2, self.tom_s[min(3, q // 2)], el["fill"] * G["drums"])
        # Bas.
        if "bass" in el:
            style, g = el["bass"]
            g *= G["bass"]
            low = semis(root, -24)
            if style == "offbeat":
                for q in range(4):
                    self.tone("bass", tb + (q + 0.5) * b, b * 0.45, low, "saw", 0.6 * g, cut=700)
                    self.tone("bass", tb + (q + 0.5) * b, b * 0.45, low, "sine", 0.7 * g)
            elif style == "eighth":
                for q in range(8):
                    t = tb + q * b / 2
                    self.tone("bass", t, b / 2 * 0.95, low, "saw", 0.6 * g, cut=900)
                    self.tone("bass", t, b / 2 * 0.95, low, "sine", 0.8 * g)
            elif style == "mid":  # alt bassız orta bas ("lite" drop)
                for q in range(8):
                    self.tone("bass", tb + q * b / 2, b / 2 * 0.95, semis(root, -12), "saw", 0.5 * g, cut=1500)
            elif style == "wobble":
                n = int(4 * b * SR)
                tt = np.arange(n) / SR
                rate = [2, 4, 3, 8][idx % 4] / (4 * b) * (2 if rng.random() < 0.5 else 1)
                s = saw(low * tt) + 0.5 * saw(low * 1.005 * tt)
                cut0, cut1 = 150, 2500
                lfo = 0.5 + 0.5 * np.sin(2 * np.pi * rate * tt)
                block = 512
                out = np.empty(n)
                zi = np.zeros((1, 2))
                for s0 in range(0, n, block):
                    sos = butter("lowpass", cut0 * (cut1 / cut0) ** lfo[s0])
                    out[s0 : s0 + block], zi = sg.sosfilt(sos, s[s0 : s0 + block], zi=zi)
                y = 0.7 * out + 0.7 * np.sin(2 * np.pi * low * tt)
                self.add("bass", tb, np.tanh(1.5 * y) * adsr(n, 0.005, 0.02), 0.8 * g)
            elif style == "808":
                for pos, dur in ((0, 1.6), (1.75, 0.7), (2.5, 1.4)):
                    n = int(dur * b * SR)
                    tt = np.arange(n) / SR
                    f = low * (1 + 0.6 * np.exp(-tt / 0.02))
                    y = np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR))
                    self.add("bass", tb + pos * b, y * adsr(n, 0.003, 0.05, decay=1.5), g)
            elif style == "reese":
                n = int(4 * b * SR)
                tt = np.arange(n) / SR
                s = saw(low * tt) + saw(low * 1.01 * tt) + saw(low * 0.993 * tt)
                y = filt(s, "lowpass", 500) * 0.4 + 0.6 * np.sin(2 * np.pi * low * tt)
                self.add("bass", tb, y * adsr(n, 0.01, 0.03), g)
            elif style == "sustain":
                sub = el.get("sub", 1.0)
                sub = sub(prog) if callable(sub) else sub
                self.tone("bass", tb, self.bar, low, "saw", 0.6 * g, cut=600, attack=0.05, release=0.1)
                self.tone("bass", tb, self.bar, low, "sine", 0.8 * g * sub, attack=0.05, release=0.1)
            elif style == "rock":
                for q in range(8):
                    self.tone("bass", tb + q * b / 2, b / 2 * 0.9, low, "saw", 0.7 * g, cut=500)
            elif style == "root":  # balad / pop: kök notası dörtlük
                for q in range(4 if el.get("busy") else 2):
                    d = b if el.get("busy") else 2 * b
                    self.tone("bass", tb + q * d, d * 0.9, low, "tri", g, cut=400, release=0.1)
        # Müzik.
        if "saw_chords" in el:
            # Future bass: sidechain ile pompalanan geniş testere akorları (alt bas yok).
            for q in range(8):
                for iv in (0, 3, 7, 12):
                    for det in (0.997, 1.003):
                        self.tone("music", tb + q * b / 2, b / 2 * 0.9, semis(root, iv) * det, "saw",
                                  el["saw_chords"] * 0.1 * G["music"], cut=7000, attack=0.06, release=0.05)
        if "sub_drone" in el:
            # Sürekli alt bas (dnb girişinde de süren sub).
            self.tone("bass", tb, self.bar, semis(root, -24), "sine", el["sub_drone"] * G["bass"], attack=0.05,
                      release=0.05)
        if "pad" in el:
            for iv in (0, 3, 7):
                self.tone("music", tb, self.bar, semis(root, iv), "saw", el["pad"] * 0.2 * G["music"], cut=1500, attack=0.3, release=0.3)
        if "pluck" in el:
            notes = [0, 7, 12, 3, 7, 12, 15, 7]
            for q in range(8):
                self.tone("music", tb + q * b / 2, b / 2, semis(root, 12 + notes[q]), "saw", el["pluck"] * 0.25 * G["music"], cut=3000, decay=0.12)
        if "lead" in el:
            notes = [7, 10, 12, 10, 7, 5, 3, 5]
            for q in range(8):
                self.tone("music", tb + q * b / 2, b / 2 * 0.9, semis(root, 12 + notes[(q + k) % 8]), "square", el["lead"] * 0.2 * G["music"], cut=4000)
        if "piano" in el:
            pat, g = el["piano"]
            hits = {"whole": [0], "beats": [0, 1, 2, 3], "eighths": [q / 2 for q in range(8)]}[pat]
            for i, pos in enumerate(hits):
                ivs = (-12, 0, 3, 7) if i == 0 else (0, 3, 7)
                for iv in ivs:
                    for h, a in ((1, 1.0), (2, 0.4), (3, 0.2)):
                        self.tone("music", tb + pos * b, 1.2, semis(root, iv) * h, "sine", g * 0.18 * a * G["music"], attack=0.003, release=0.05, decay=0.5)
        if "guitar" in el:
            for q in range(8):
                n = int(b / 2 * 0.95 * SR)
                tt = np.arange(n) / SR
                s = sum(saw(semis(root, iv - 12) * tt) for iv in (0, 7, 12))
                s = np.tanh(3 * s) * adsr(n, 0.003, 0.02, decay=0.5)
                self.add("music", tb + q * b / 2, filt(s, "lowpass", 5000), el["guitar"] * 0.3 * G["music"])
        if "cleangtr" in el:
            notes = [0, 7, 12, 15, 12, 7, 3, 7]
            for q in range(8):
                self.tone("music", tb + q * b / 2, b, semis(root, notes[q]), "tri", el["cleangtr"] * 0.25 * G["music"], decay=0.3, attack=0.002)
        if "strum" in el:
            for pos in (0, 1, 1.5, 2.5, 3):
                for j, iv in enumerate((-12, -5, 0, 4 if self.prog[idx % 4] in (0, 5) else 3, 7, 12)):
                    self.tone("music", tb + pos * b + j * 0.008, 0.8, semis(root, iv), "saw", el["strum"] * 0.08 * G["music"], cut=3500, decay=0.35, attack=0.002)
        if "saz" in el:
            notes = [0, 2, 3, 2, 0, -2, 0, 3, 5, 3, 2, 0, -2, 0, 2, 0]
            for q in range(16):
                self.tone("music", tb + q * b / 4, b / 4, semis(root, 12 + notes[(q + 4 * k) % 16]), "saw", el["saz"] * 0.18 * G["music"], cut=4500, decay=0.08, attack=0.002)
        if "strings" in el:
            for iv in (0, 7, 12, 15):
                self.tone("music", tb, self.bar, semis(root, iv), "saw", el["strings"] * 0.12 * G["music"], cut=2500, attack=0.4, release=0.4, vib=0.004)
        if "vox" in el:
            vowels = "aeoiau"
            melody = [7, 5, 3, 5, 7, 10, 7, 3]
            for q in range(0, 8, 2 if el.get("vox_sparse") else 1):
                if rng.random() < 0.2:
                    continue
                self.vocal(tb + q * b / 2, b / 2 * 1.8 if el.get("vox_sparse") else b / 2 * 0.9, semis(root, 12 + melody[(q + k) % 8]), vowels[(q + idx) % 6], el["vox"] * 0.25 * G["vox"])
        if "call" in el and last:
            # "Drop" çağrısı: son ölçünün ikinci yarısında bağıran ses.
            start = tb + (2 if el.get("call_half") else 0) * b
            syl = [(0, "a"), (0.5, "e"), (1, "o")]
            for pos, v in syl:
                self.vocal(start + pos * b, 0.45 * b, semis(root, 12), v, el["call"] * 0.4 * G["vox"], shout=True)
        # Efekt.
        if "riser" in el and k == 0:
            n = int(bars * self.bar * SR)
            x = self.rng.standard_normal(n)
            y = sweep(x, "lowpass", 300, 12000) - 0.5 * sweep(x, "lowpass", 100, 3000)
            amp = np.linspace(0.05, 1, n) ** 2
            self.add("fx", tb, y * amp, 0.35 * el["riser"] * G["fx"])
            tt = np.arange(n) / SR
            f = np.geomspace(200, 1600, n)
            self.add("fx", tb, saw(np.cumsum(f) / SR) * amp * 0.15, el["riser"] * G["fx"])
        if "revcym" in el and last:
            rev = self.crash_s[: int(b * SR)][::-1]
            self.add("fx", tb + 4 * b - len(rev) / SR, rev, el["revcym"] * G["fx"])
        if "impact" in el and k == 0 and not NO_ACCENT:
            n = int(1.5 * SR)
            tt = np.arange(n) / SR
            self.add("fx", tb, np.sin(2 * np.pi * (40 + 40 * np.exp(-tt / 0.05)) * tt) * np.exp(-tt / 0.5), el["impact"] * G["fx"])

    # --- akış ---
    def sec(self, bars, el, fx=()):
        # Davullu bölümlerin bir kısmı da crash ile başlar (crash yalnızca drop'un işareti değil).
        if "drums" in el and "crash" not in el and self.rng.random() < CRASH_ON_SECTION:
            el = dict(el, crash=0.5)
        return self.section(bars, el, fx)

    def drop(self, bars, el, fx=()):
        self.drops.append(round(self.t, 4))
        self.drop_bpm = self.bpm
        # Dropların bir kısmında crash ya da impact yok.
        if self.rng.random() > CRASH_ON_DROP:
            el = dict(el, crash=0)
        if self.rng.random() > CRASH_ON_DROP:
            el = dict(el, impact=0)
        return self.section(bars, el, fx)

    def fake(self, beats, el):
        """Sahte drop: `beats` vuruş drop, ardından yükseliş sürer."""
        t0 = self.t
        self.fakes.append(round(t0, 4))
        full_bars = int(beats // 4)
        if full_bars:
            self.section(full_bars, el)
        rest = beats - 4 * full_bars
        if rest:
            # Ölçünün kalanı sessiz (yarım ölçülük sahte drop, ardından boşluk).
            self.write_bar(self.t, el, 0, 1)
            self.op("mute", BUSES, self.t + rest * self.beat, self.t + self.bar)
            self.t += self.bar
            self.bar_index += 1
        return t0

    def gap(self, beats, keep=()):
        """Droptan hemen önceki `beats` vuruşu sustur (yalnızca `keep` otobüsleri kalır)."""
        self.op("mute", [b for b in BUSES if b not in keep], self.t - beats * self.beat, self.t)

    def render(self):
        total = self.t + 3.0
        n = int(total * SR)
        buses = {}
        for name in BUSES:
            out = np.zeros(n + 3 * SR)
            for t, sig in self.parts[name]:
                s = int(round(t * SR))
                e = min(len(out), s + len(sig))
                if e > s >= 0:
                    out[s:e] += sig[: e - s]
            buses[name] = out[:n]
        # Yankı (müzik ve ses): üstel sönen gürültü.
        ir_n = int(1.2 * SR)
        ir = self.rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.35)
        ir /= np.sqrt(np.sum(ir**2))
        for name, wet in (("vox", 0.35), ("music", 0.2)):
            buses[name] = buses[name] + wet * sg.fftconvolve(buses[name], ir)[:n]
        for kind, names, t0, t1, kw in self.ops:
            a, b = int(round(t0 * SR)), min(n, int(round(t1 * SR)))
            if b <= a:
                continue
            for name in names:
                x = buses[name][a:b]
                if kind == "lp":
                    buses[name][a:b] = sweep(x, "lowpass", kw["f0"], kw["f1"])
                elif kind == "hp":
                    buses[name][a:b] = sweep(x, "highpass", kw["f0"], kw["f1"])
                elif kind == "mute":
                    fade = min(int(0.004 * SR), (b - a) // 2)
                    m = np.zeros(b - a)
                    m[:fade] = np.linspace(1, 0, fade)
                    # Sonda yumuşak açılış yok: susturmadan sonraki ilk örnek tam ses (drop anı kaymaz).
                    buses[name][a:b] = x * m
                elif kind == "gain":
                    buses[name][a:b] = x * np.linspace(kw["g0"], kw["g1"], b - a)
        mix = sum(buses.values())
        return mix


def master(song, mix, drive):
    mix = mix / (np.percentile(np.abs(mix), 99.5) + 1e-9)
    mix = np.tanh(drive * mix) / np.tanh(drive)
    mix = 0.89 * mix / (np.max(np.abs(mix)) + 1e-9)
    mix += song.rng.standard_normal(len(mix)) * 10 ** (-72 / 20)
    return mix


def build(kind, rng):
    bpm = {
        "dubstep": 140.0,
        "trap": float(rng.integers(136, 151)),
        "dnb": float(rng.integers(170, 177)),
        "house": float(rng.integers(120, 127)),
        "rock": float(rng.integers(100, 141)),
        "pop": float(rng.integers(96, 121)),
        "balad": float(rng.integers(64, 77)),
        "akustik": float(rng.integers(88, 111)),
        "turk_pop": float(rng.integers(92, 121)),
        "turk_remix": float(rng.integers(120, 131)),
    }.get(kind, float(rng.integers(122, 131)))
    s = Song(rng, bpm, semis(55 * 2, int(rng.integers(0, 12))))
    r = rng.random

    groove = {"drums": ("four", 0.9), "bass": ("offbeat", 0.6), "pluck": 0.6}
    calm = {"pad": 0.8, "vox": 0.7, "pluck": 0.3}
    bld = {"pad": 0.6, "roll": 0.8, "riser": 1.0, "vox": 0.5}
    if r() < 0.5:
        bld["kickroll"] = 0.9
    if r() < 0.5:
        bld["revcym"] = 0.6
    full = {"drums": ("four", 1.0), "bass": ("eighth", 1.0), "lead": 0.9, "pad": 0.5, "crash": 0.8}
    if r() < 0.6:
        full["impact"] = 0.8
    drive = 1.0 + 1.5 * r()
    lp_music = ("lp", ["music", "vox"], {"f0": 400, "f1": 9000})

    if kind == "yukselis":
        s.sec(8, groove); s.sec(8, calm); s.sec(8, bld, [lp_music])
        s.drop(16, full); s.sec(8, calm); s.sec(8, bld, [lp_music]); s.drop(16, dict(full, lead=1.1)); s.sec(8, groove)
    elif kind == "sessizlik":
        s.sec(8, groove); s.sec(8, calm); s.sec(8, bld)
        s.gap([1, 2, 4][int(rng.integers(0, 3))], keep=("vox",) if r() < 0.5 else ())
        s.drop(16, full); s.sec(8, calm); s.sec(8, bld); s.gap([1, 2, 4][int(rng.integers(0, 3))]); s.drop(16, full)
        s.sec(4, groove)
    elif kind == "bas_donusu":
        # Davul sürer; bas yüksek geçiren süzgeçle incelir (alt bas yok), drop'ta tam bas döner.
        thin = dict(full, crash=0, impact=0, lead=0.5)
        thin.pop("crash"); thin.pop("impact", None)
        hp = ("hp", ["bass"], {"f0": 250, "f1": 500})
        s.sec(8, groove); s.sec(8, thin, [hp]); s.drop(16, full); s.sec(8, calm)
        s.sec(8, dict(thin, roll=0.5), [hp]); s.drop(16, full); s.sec(4, groove)
    elif kind == "filtre":
        # Bütün karışım alçak geçirenle boğuk; yükselişte süzgeç açılır, son ölçüde davul durur.
        muffled = dict(full, crash=0, impact=0)
        lp = ("lp", ["drums", "bass", "music"], {"f0": 250, "f1": 5000})
        off = 1 if r() < 0.5 else 2
        s.sec(8, groove); s.sec(8, dict(muffled, drums_last_off=off, riser=0.6), [lp]); s.drop(16, full)
        s.sec(8, calm); s.sec(8, dict(muffled, drums_last_off=off, riser=0.6), [lp]); s.drop(16, full); s.sec(4, groove)
    elif kind == "vokal_cagri":
        s.sec(8, groove); s.sec(8, calm); s.sec(8, dict(bld, call=1.0, call_half=r() < 0.5))
        s.gap(4 if r() < 0.5 else 2, keep=("vox",))
        s.drop(16, full); s.sec(8, calm); s.sec(8, dict(bld, call=1.0)); s.gap(2, keep=("vox",)); s.drop(16, full)
    elif kind == "sahte_drop":
        s.sec(8, groove); s.sec(8, calm); s.sec(8, bld)
        s.fake([2, 4, 8][int(rng.integers(0, 3))], full)
        s.sec(4, dict(bld, kickroll=0.9)); s.drop(16, full); s.sec(8, calm); s.sec(8, bld); s.drop(16, full)
    elif kind == "ikinci_drop":
        lite = {"drums": ("four", 0.8), "bass": ("mid", 0.8), "lead": 0.7, "crash": 0.5}
        first, second = (lite, full) if r() < 0.6 else (full, lite)
        s.sec(8, groove); s.sec(8, calm); s.sec(8, bld); s.drop(16, first); s.sec(8, calm); s.sec(8, bld)
        s.drop(16, second); s.sec(4, groove)
    elif kind == "dubstep":
        wob = {"drums": ("halftime", 1.0), "bass": ("wobble", 1.0), "crash": 0.8, "impact": 0.8}
        b2 = dict(bld, call=0.9) if r() < 0.5 else bld
        s.sec(8, {"pad": 0.8, "vox": 0.6}); s.sec(8, b2)
        if r() < 0.5:
            s.gap(1)
        s.drop(16, wob); s.sec(8, {"pad": 0.8, "vox": 0.6}); s.sec(8, bld); s.drop(16, wob); s.sec(4, {"pad": 0.6})
    elif kind == "trap":
        drop_el = {"drums": ("trap", 1.0), "bass": ("808", 1.0), "pad": 0.4, "crash": 0.6}
        intro = {"piano": ("beats", 0.7), "drums": ("hats", 0.6)}
        tb = {"piano": ("beats", 0.5), "roll": 0.7, "riser": 0.8, "call": 0.8 if r() < 0.5 else 0}
        s.sec(8, intro); s.sec(8, tb)
        if r() < 0.5:
            s.gap(2, keep=("vox",))
        s.drop(16, drop_el); s.sec(8, dict(intro, vox=0.6)); s.sec(4, tb); s.drop(16, drop_el); s.sec(4, intro)
    elif kind == "dnb":
        dnb = {"drums": ("dnb", 1.0), "bass": ("reese", 1.0), "lead": 0.4, "crash": 0.8, "impact": 0.5}
        s.sec(16, {"pad": 0.8, "drums": ("hats", 0.4)}); s.sec(8, bld); s.drop(32, dnb)
        s.sec(16, {"pad": 0.8, "vox": 0.5}); s.sec(8, bld); s.drop(32, dnb)
    elif kind == "house":
        hd = {"drums": ("four", 1.0), "bass": ("offbeat", 0.9), "pluck": 0.7, "open_hat": True}
        s.sec(8, {"drums": ("kickonly", 0.9)}); s.sec(16, hd); s.sec(8, {"pad": 0.8, "vox": 0.7})
        s.sec(4, {"pad": 0.8, "vox": 0.6, "riser": 0.5}, [("lp", ["music"], {"f0": 300, "f1": 6000})])
        s.drop(16, dict(hd, crash=0.5)); s.sec(8, {"drums": ("kickonly", 0.9), "pluck": 0.4})
    elif kind == "turk_remix":
        verse = {"drums": ("darbuka", 0.8), "saz": 0.7, "vox": 0.8, "bass": ("root", 0.5)}
        drop_el = {"drums": ("four", 1.0), "bass": ("eighth", 1.0), "saz": 0.9, "crash": 0.8, "impact": 0.6}
        tb = {"darbuka_roll": 0.8, "riser": 0.8, "saz": 0.5, "vox": 0.5}
        s.sec(8, {"saz": 0.8, "drums": ("darbuka", 0.6)}); s.sec(8, verse); s.sec(8, tb); s.drop(16, drop_el)
        s.sec(8, verse); s.sec(4, tb); s.drop(16, drop_el); s.sec(4, {"saz": 0.6})
    elif kind == "rock":
        band = {"drums": ("rock", 1.0), "bass": ("rock", 0.8), "guitar": 1.0, "crash": 0.8}
        verse = {"drums": ("rock", 0.7), "bass": ("rock", 0.6), "guitar": 0.35, "vox": 0.7}
        chorus = dict(band, vox=0.8, crash=0.6)
        s.sec(4 if r() < 0.5 else 8, {"cleangtr": 0.9}); s.drop(8, band); s.sec(8, verse)
        s.unsure.append(round(s.t, 4)); s.sec(8, chorus); s.sec(8, verse)
        s.unsure.append(round(s.t, 4)); s.sec(8, chorus)
        s.sec(4, {"cleangtr": 0.7, "pad": 0.5, "fill": 0.9}); s.drop(8, chorus); s.sec(4, {"cleangtr": 0.5})
    elif kind == "melodik":
        mel_b = dict(bld, bass=("sustain", 0.7))
        mel_d = dict(full, lead=1.2, pad=1.0)
        s.sec(8, dict(groove, lead=0.6)); s.sec(8, mel_b); s.drop(16, mel_d); s.sec(8, calm); s.sec(8, mel_b)
        s.drop(16, mel_d); s.sec(4, groove)
    elif kind == "yuksek_yukselis":
        loud = dict(bld, roll=1.6, riser=2.5, pad=1.0, lead=1.0, drums=("hats", 1.0))
        drive = 3.0
        quiet = dict(full, pad=0.3, lead=0.5)
        s.sec(8, groove); s.sec(8, loud); s.drop(16, quiet); s.sec(8, calm); s.sec(8, loud); s.drop(16, quiet)
    elif kind == "uzun_giris":
        s.sec(24, {"pad": 0.5, "vox": 0.4, "vox_sparse": True}); s.drop(16, full); s.sec(8, calm); s.sec(8, bld)
        s.drop(16, full)
    elif kind == "pop":
        verse = {"drums": ("pop", 0.7), "bass": ("root", 0.7, ), "piano": ("beats", 0.6), "vox": 0.8, "busy": True}
        pre = dict(verse, pad=0.6)
        chorus = dict(verse, drums=("pop", 0.9), guitar=0.4, pad=0.7, vox=1.0, crash=0.5)
        bridge = {"drums": ("ballad", 0.8), "pad": 0.8, "vox": 0.8, "piano": ("whole", 0.6), "bass": ("root", 0.5)}
        s.sec(4, dict(verse, vox=0)); s.sec(8, verse); s.sec(4, pre); s.sec(8, chorus); s.sec(8, verse); s.sec(4, pre)
        s.sec(8, chorus); s.sec(8, bridge); s.sec(8, chorus); s.sec(4, dict(verse, vox=0))
    elif kind == "balad":
        v1 = {"piano": ("eighths", 0.8), "vox": 0.8, "vox_sparse": True}
        v2 = dict(v1, drums=("ballad", 0.7), bass=("root", 0.5))
        ch = dict(v2, strings=0.8, vox=1.0)
        s.sec(4, dict(v1, vox=0)); s.sec(8, v1); s.sec(8, dict(v1, strings=0.6)); s.sec(8, v2); s.sec(8, ch)
        s.sec(4, dict(v1, vox=0)); s.sec(8, dict(ch, drums=("ballad", 0.9))); s.sec(4, dict(v1, vox=0))
    elif kind == "akustik":
        v = {"strum": 0.8, "vox": 0.8, "drums": ("shaker", 0.6)}
        s.sec(4, {"strum": 0.8}); s.sec(8, v); s.sec(8, dict(v, bass=("root", 0.4), vox=1.0)); s.sec(8, v)
        s.sec(8, dict(v, bass=("root", 0.4), vox=1.0, pad=0.4)); s.sec(4, {"strum": 0.6})
    elif kind == "turk_pop":
        v = {"drums": ("darbuka", 0.8), "saz": 0.6, "vox": 0.8, "bass": ("root", 0.6), "busy": True}
        ch = dict(v, strings=0.7, vox=1.0, drums=("darbuka", 1.0))
        s.sec(4, dict(v, vox=0)); s.sec(8, v); s.sec(8, ch); s.sec(8, v); s.sec(8, ch); s.sec(4, dict(v, vox=0))
    elif kind == "tiz_artan":
        # Yükseliş karanlık (alçak geçiren, riser yok); drop tizleri açar (açık hi-hat, lead).
        dark = {"pad": 0.8, "drums": ("kickonly", 0.6), "bass": ("offbeat", 0.5)}
        lpd = ("lp", ["drums", "bass", "music", "vox"], {"f0": 300, "f1": 700})
        bright = dict(full, open_hat=True, lead=1.2)
        s.sec(8, dark, [lpd]); s.sec(8, dict(dark, roll=0.3), [lpd]); s.drop(16, bright); s.sec(8, dark, [lpd])
        s.sec(8, dict(dark, roll=0.3), [lpd]); s.drop(16, bright); s.sec(4, groove)
    elif kind == "riserisiz":
        # Riser'sız, kısık yükseliş: yalnızca pad ve hafif trampet.
        soft = {"pad": 0.7, "roll": 0.3, "vox": 0.4}
        s.sec(8, groove); s.sec(8, calm); s.sec(8, soft); s.drop(16, full); s.sec(8, calm); s.sec(8, soft)
        s.drop(16, full); s.sec(4, groove)
    elif kind == "dnb_sub":
        s.set_tempo(float(rng.integers(170, 177)))
        dnb = {"drums": ("dnb", 1.0), "bass": ("reese", 1.0), "lead": 0.4, "crash": 0.8, "sub_drone": 0.5}
        intro = {"pad": 0.8, "drums": ("hats", 0.4), "sub_drone": 0.7}
        s.sec(16, intro); s.sec(8, dict(bld, sub_drone=0.7)); s.drop(32, dnb); s.sec(16, intro)
        s.sec(8, dict(bld, sub_drone=0.7)); s.drop(32, dnb)
    elif kind == "ritimsiz_giris":
        # Ritimsiz kısa giriş (pad, ses), sonra hemen drop: drop şarkının başında.
        s.sec(int(rng.integers(3, 6)), {"pad": 0.8, "vox": 0.5, "vox_sparse": True}); s.drop(16, full)
        s.sec(8, calm); s.sec(8, bld); s.drop(16, full); s.sec(4, groove)
    elif kind == "future_bass":
        s.set_tempo(float(rng.integers(140, 161)))
        fb = {"drums": ("halftime", 1.0), "saw_chords": 1.0, "crash": 0.6}
        s.sec(8, calm); s.sec(8, bld); s.drop(16, fb); s.sec(8, calm); s.sec(8, bld); s.drop(16, fb); s.sec(4, calm)
    elif kind == "hiphop_drop":
        s.set_tempo(float(rng.integers(84, 97)))
        beat = {"drums": ("boombap", 1.0), "bass": ("808", 0.9), "piano": ("beats", 0.5), "vox": 0.7}
        s.sec(4, {"piano": ("beats", 0.7)}); s.drop(16, beat); s.sec(4, {"piano": ("beats", 0.6), "vox": 0.6})
        s.drop(16, beat); s.sec(4, {"piano": ("whole", 0.6)})
    elif kind == "tempo_degisen":
        s.set_tempo(float(rng.integers(100, 112)))
        s.sec(8, groove); s.sec(8, calm)
        s.set_tempo(float(rng.integers(124, 132)))
        s.sec(8, bld); s.drop(16, full); s.sec(4, groove)
    elif kind == "kisa":
        s.sec(4, groove); s.sec(4, bld); s.drop(8, full); s.sec(2, calm)
    else:
        raise ValueError(kind)
    mix = s.render()
    return master(s, mix, drive), s


KINDS = ["yukselis", "sessizlik", "bas_donusu", "filtre", "vokal_cagri", "sahte_drop", "ikinci_drop", "dubstep",
         "trap", "dnb", "house", "turk_remix", "rock", "melodik", "yuksek_yukselis", "uzun_giris",
         "pop", "balad", "akustik", "turk_pop",
         # 2. genişleme (bağımsız incelemeden sonra): tizi artan drop, riser'sız yükseliş, sürekli sub baslı dnb,
         # ritimsiz giriş (drop şarkının başında), alt bassız future bass, hip-hop, tempo değişen, kısa şarkı.
         "tiz_artan", "riserisiz", "dnb_sub", "ritimsiz_giris", "future_bass", "hiphop_drop", "tempo_degisen", "kisa"]
DROPLESS = {"pop", "balad", "akustik", "turk_pop"}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = Path(args[0])
    seed = int(args[1]) if len(args) > 1 else 1
    only = args[2].split(",") if len(args) > 2 else KINDS
    out.mkdir(parents=True, exist_ok=True)
    for kind in only:
        rng = np.random.default_rng(seed * 1000 + KINDS.index(kind) + 500)
        audio, song = build(kind, rng)
        name = f"{kind}-{seed}"
        pcm = audio.astype("<f4").tobytes()
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
             "-sample_fmt", "s16", str(out / f"{name}.flac")],
            input=pcm, check=True)
        truth = {"drops": song.drops, "sahte": song.fakes, "belirsiz": song.unsure, "tur": kind,
                 "bpm": song.drop_bpm or song.bpm, "dropsuz": kind in DROPLESS}
        (out / f"{name}.json").write_text(json.dumps(truth))
        print(name, f"{len(audio) / SR:.0f} sn", song.drops, song.fakes, flush=True)


if __name__ == "__main__":
    main()
