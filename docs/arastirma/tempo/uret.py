"""Tempo ölçümü için temposu bilinen deneme şarkıları üretir (sentetik; ses depoya girmez).

Kullanım: python3 docs/arastirma/tempo/uret.py <çıkış klasörü> <tohum> [tür,tür,...]
Her şarkı için `ad.wav` (44,1 kHz, mono, 16 bit) ve `ad.json` ({"bpm": doğru tempo, "tur": ...,
"vuruslar": davulun çaldığı ölçülerdeki doğru vuruş anları}).

Türler, tempo oktav hatasının bilinen tuzaklarını taklit eder (bkz. README):
- dubstep (138–142): kick 1'de, snare 3'te (yarım tempo hissi), wobble bas, hi-hat sekizlik ve
  bazen on altılık üçleme;
- trap (135–150): 808 kick ve uzun bas, clap 3'te, hi-hat sekizlik ve roll'lar (on altılık, üçleme);
- dnb (170–176): iki adımlı breakbeat (kick 1 ve 3'ün arkası, snare 2 ve 4), hızlı hi-hat, sub bas;
- house (120–128): four-on-the-floor kick, clap 2 ve 4'te, açık hi-hat vuruş aralarında;
- hiphop (84–96): kick/snare boom-bap, swing'li hi-hat (on altılık ya da sekizlik);
- pop (100–118): kick 1 ve 3, snare 2 ve 4, sekizlik hi-hat (karşılaştırma için düz örnek);
- balad (60–72): yumuşak davul, piyano akorları sekizliklerde;
- aksak9 (9/8 = 2+2+2+3) ve aksak7 (7/8 = 2+2+3): darbuka düm/tek; doğru tempo grup başlarının
  temposudur (programın aksak ölçüde verdiği vuruşlar, `analysis/meter.rs`).

Tohum: tempo, tını (kick perdesi ve sönümü, snare tonu, hi-hat parlaklığı), kalıp çeşitlemeleri,
gürültü düzeyi ve swing tohumla değişir. Geliştirme ve doğrulama setleri ayrı tohumlarla üretilir.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
SECONDS = 48.0


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def highpass(x, amount=1):
    for _ in range(amount):
        x = np.diff(np.concatenate([[0.0], x]))
    return x


def lowpass(x, cutoff):
    """Kayan ortalamayla kaba alçak geçiren (hızlı)."""
    k = max(1, int(SR / cutoff / 2))
    return np.convolve(x, np.ones(k) / k, mode="same")


class Kit:
    """Tohuma göre tınısı değişen davul seti."""

    def __init__(self, rng):
        self.rng = rng
        self.kick_hi = rng.uniform(90, 160)
        self.kick_lo = rng.uniform(40, 58)
        self.kick_decay = rng.uniform(0.12, 0.3)
        self.snare_tone = rng.uniform(160, 240)
        self.snare_noise = rng.uniform(0.4, 0.8)
        self.snare_cut = rng.uniform(1000, 3000)
        self.hat_bright = int(rng.integers(1, 3))
        self.hat_decay = rng.uniform(0.01, 0.03)

    def kick(self, g=1.0, long=None):
        dur = long or 0.4
        n = int(dur * SR)
        tt = np.arange(n) / SR
        f = self.kick_lo + (self.kick_hi - self.kick_lo) * np.exp(-tt / 0.03)
        ph = 2 * np.pi * np.cumsum(f) / SR
        decay = long / 2.5 if long else self.kick_decay
        return g * np.sin(ph) * env(n, 0.001, decay)

    def snare(self, g=1.0, clap=False):
        n = int(0.25 * SR)
        noise = self.rng.standard_normal(n)
        noise = noise - lowpass(noise, self.snare_cut)
        tone = np.sin(2 * np.pi * self.snare_tone * np.arange(n) / SR)
        if clap:
            e = sum(env(n, 0.001, 0.01) * (np.arange(n) >= int(d * SR)) for d in (0, 0.01, 0.02))
            return g * (0.9 * noise * (e + env(n, 0.001, 0.08)))
        return g * (self.snare_noise * noise + 0.5 * tone) * env(n, 0.001, 0.07)

    def hat(self, g=1.0, open_=False):
        n = int((0.25 if open_ else 0.06) * SR)
        noise = highpass(self.rng.standard_normal(n), self.hat_bright)
        return 0.3 * g * noise * env(n, 0.0005, 0.09 if open_ else self.hat_decay)

    def dum(self, g=1.0):
        n = int(0.35 * SR)
        tt = np.arange(n) / SR
        f = 70 + 60 * np.exp(-tt / 0.02)
        return g * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.15)

    def tek(self, g=1.0):
        n = int(0.08 * SR)
        noise = highpass(self.rng.standard_normal(n))
        tone = np.sin(2 * np.pi * self.rng.uniform(600, 900) * np.arange(n) / SR)
        return g * (0.3 * noise + 0.5 * tone) * env(n, 0.0005, 0.02)


class Song:
    def __init__(self, rng, total):
        self.rng = rng
        self.out = np.zeros(int(total * SR) + 2 * SR)
        self.total = total

    def add(self, t, sig, g=1.0):
        s = int(t * SR)
        if s < 0 or s >= len(self.out):
            return
        e = min(len(self.out), s + len(sig))
        self.out[s:e] += g * sig[: e - s]

    def tone(self, t, dur, freq, kind="saw", g=1.0, cutoff=None, attack=0.01, release=0.05):
        n = int(dur * SR)
        if n <= 0:
            return
        tt = np.arange(n) / SR
        ph = (freq * tt) % 1.0
        if kind == "saw":
            s = 2 * ph - 1
        elif kind == "square":
            s = np.sign(ph - 0.5)
        else:
            s = np.sin(2 * np.pi * ph)
        if cutoff is not None:
            s = lowpass(s, cutoff)
        e = np.minimum(1, tt / attack) * np.clip((dur - tt) / release, 0, 1)
        self.add(t, s * e, g)

    def render(self):
        audio = self.out[: int(self.total * SR)]
        audio = audio + self.rng.uniform(0.002, 0.02) * self.rng.standard_normal(len(audio))
        audio = audio / (np.percentile(np.abs(audio), 99.5) + 1e-9)
        return np.tanh(1.2 * audio) * 0.89


def semis(f, k):
    return f * 2 ** (k / 12)


CHORDS = [0, -4, 3, -2]


def vel(rng, base=1.0):
    return base * rng.uniform(0.8, 1.0)


def four_four(kind, rng):
    """4/4 türleri: (bpm, ses)."""
    ranges = {
        "dubstep": (138, 142),
        "trap": (135, 150),
        "dnb": (170, 176),
        "house": (120, 128),
        "hiphop": (84, 96),
        "pop": (100, 118),
        "balad": (60, 72),
    }
    lo, hi = ranges[kind]
    bpm = float(rng.integers(lo, hi + 1))
    b = 60 / bpm
    bar = 4 * b
    song = Song(rng, SECONDS)
    kit = Kit(rng)
    root = semis(55, int(rng.integers(0, 12)))
    swing = rng.uniform(0.55, 0.66) if kind == "hiphop" else 0.5
    t0 = 0.2 + rng.random() * 0.5
    bars = int((SECONDS - t0 - 1) / bar)
    intro = 2 if bars > 12 else 0  # baştaki yalnız akor/hi-hat
    # Kalıp çeşitlemesi (tohuma göre).
    variant = int(rng.integers(0, 3))
    hat16 = rng.random() < 0.5
    hat_level = rng.uniform(0.1, 0.8)
    wobble_gain = rng.uniform(0.25, 0.6)
    # Snare ile kick'in dengesi: drum and bass'ta snare çoğu zaman kick'ten güçlüdür.
    kick_gain = rng.uniform(0.6, 1.0)
    snare_gain = rng.uniform(0.8, 1.6)
    # Akor vuruşları (klavye/gitar): yok, her vuruşta, sekizliklerde ya da senkoplu. Orta
    # bantta düzenli tonal başlangıçlar snare'le karışmasın diye ölçümde gerekir.
    comp_mode = int(rng.integers(0, 4))
    comp_gain = rng.uniform(0.04, 0.12)
    comp_pos = [[], [0, 1, 2, 3], [e / 2 for e in range(8)], [0, 0.75, 1.5, 2.5, 3.25]][comp_mode]
    beats = []
    for k in range(bars):
        tb = t0 + k * bar
        chord = semis(root, CHORDS[(k // 2) % 4])
        full = k >= intro
        if full:
            beats.extend(round(tb + q * b, 4) for q in range(4))
        # Ses zemini: pad ya da piyano.
        if kind == "balad":
            for e in range(8):
                for iv in (12, 16, 19) if e % 2 == 0 else (24,):
                    song.tone(tb + e * b / 2, b * 0.9, semis(chord, iv), "sine", 0.12, attack=0.004, release=0.3)
        else:
            for iv in (12, 15, 19):
                song.tone(tb, bar, semis(chord, iv), "saw", 0.04, cutoff=1500, attack=0.2, release=0.2)
        if kind != "balad":
            for q in comp_pos:
                for iv in (12, 16, 19, 24):
                    song.tone(tb + q * b, b * 0.45, semis(chord, iv), "saw", comp_gain, cutoff=3500, attack=0.003, release=0.15)
        if not full:
            for e in range(8):
                song.add(tb + e * b / 2, kit.hat(vel(rng, 0.5)))
            continue
        if kind == "dubstep":
            song.add(tb, kit.kick(vel(rng)))
            if variant == 1:
                song.add(tb + 2.5 * b, kit.kick(vel(rng, 0.7)))
            elif variant == 2 and k % 2:
                song.add(tb + 3.5 * b, kit.kick(vel(rng, 0.7)))
            song.add(tb + 2 * b, kit.snare(vel(rng)))
            # Hi-hat: kimi şarkıda sekizlik, kimide yalnızca dörtlük ve kısık (bas baskın).
            hat_steps = 8 if hat_level > 0.3 else 4
            for e in range(hat_steps):
                song.add(tb + e * bar / hat_steps, kit.hat(vel(rng, hat_level * (0.7 if e % 2 else 1.0))))
            if hat16 and k % 4 == 3:
                for e in range(6):  # on altılık üçleme son vuruşta
                    song.add(tb + 3 * b + e * b / 6, kit.hat(vel(rng, 0.5)))
            # Wobble: LFO 1/8, 1/4, sekizlik üçleme ya da on altılık.
            rate = [2, 1, 3, 4][(k + variant) % 4] / b
            n = int(bar * SR)
            tt = np.arange(n) / SR
            lfo = 0.5 + 0.5 * np.sin(2 * np.pi * rate * tt)
            f = semis(chord, -12)
            saw = 2 * ((f * tt) % 1.0) - 1
            s = lfo * saw + 0.6 * np.sin(2 * np.pi * f * tt)
            song.add(tb, s * wobble_gain)
        elif kind == "trap":
            kicks = [[0, 1.75, 2.5], [0, 0.75, 2.75], [0, 1.5, 3.25]][variant]
            for q in kicks:
                song.add(tb + q * b, kit.kick(vel(rng), long=min(1.0, 1.4 * b)))
            song.add(tb + 2 * b, kit.snare(vel(rng), clap=True))
            for e in range(8):
                if k % 2 == 1 and e in (5, 6, 7):
                    div = 4 if e != 6 else 3  # roll: on altılık ya da üçleme
                    for r in range(div):
                        song.add(tb + e * b / 2 + r * b / 2 / div, kit.hat(vel(rng, 0.5)))
                else:
                    song.add(tb + e * b / 2, kit.hat(vel(rng, 0.7)))
            for q in kicks:
                song.tone(tb + q * b, b * 0.9, semis(chord, -12), "sine", 0.3, attack=0.005, release=0.2)
        elif kind == "dnb":
            kicks = [[0, 2.5], [0, 2.5, 2.75], [0, 1.75, 2.5]][variant]
            for q in kicks:
                song.add(tb + q * b, kit.kick(vel(rng, kick_gain)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng, snare_gain)))
            if variant == 2:
                song.add(tb + 3.75 * b, kit.snare(vel(rng, 0.3)))  # hayalet snare
            steps = 16 if hat16 else 8
            for e in range(steps):
                song.add(tb + e * bar / steps, kit.hat(vel(rng, 0.5 if e % 2 else 0.7)))
            song.tone(tb, 2 * b, semis(chord, -12), "sine", 0.4, attack=0.01, release=0.1)
            song.tone(tb + 2.5 * b, 1.5 * b, semis(chord, -12), "sine", 0.4, attack=0.01, release=0.1)
        elif kind == "house":
            for q in range(4):
                song.add(tb + q * b, kit.kick(vel(rng)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng, 0.7), clap=True))
            for q in range(4):
                song.add(tb + (q + 0.5) * b, kit.hat(vel(rng, 0.8), open_=True))
                if hat16:
                    for s in (0.25, 0.75):
                        song.add(tb + (q + s) * b, kit.hat(vel(rng, 0.3)))
            for q in range(4):
                song.tone(tb + (q + 0.5) * b, b * 0.45, semis(chord, -12), "saw", 0.12, cutoff=600)
        elif kind == "hiphop":
            kicks = [[0, 2.5], [0, 0.75, 2.5], [0, 1.75, 2.25]][variant]
            for q in kicks:
                song.add(tb + q * b, kit.kick(vel(rng)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng)))
            if hat16:
                # Swing'li on altılık: tek sıradaki on altılıklar sekizliğin içinde geç gelir.
                for e in range(16):
                    pos = (e // 2) * b / 2 + (swing * b / 2 if e % 2 else 0)
                    song.add(tb + pos, kit.hat(vel(rng, 0.4 if e % 2 else 0.7)))
            else:
                for e in range(8):
                    pos = (e // 2) * b + (swing * b if e % 2 else 0)
                    song.add(tb + pos, kit.hat(vel(rng, 0.5 if e % 2 else 0.8)))
            for q in kicks:
                song.tone(tb + q * b, b * 0.7, semis(chord, -12), "sine", 0.25, attack=0.01, release=0.1)
        elif kind == "pop":
            kicks = [[0, 2], [0, 2, 2.5], [0, 1.5, 2]][variant]
            for q in kicks:
                song.add(tb + q * b, kit.kick(vel(rng)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng)))
            for e in range(8):
                song.add(tb + e * b / 2, kit.hat(vel(rng, 0.5 if e % 2 else 0.8)))
            for e in range(8):
                song.tone(tb + e * b / 2, b * 0.45, semis(chord, -12), "saw", 0.1, cutoff=500)
        elif kind == "balad":
            song.add(tb, kit.kick(vel(rng, 0.7)))
            if variant:
                song.add(tb + 2.5 * b, kit.kick(vel(rng, 0.5)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng, 0.5)))
            if hat16:
                for e in range(8):
                    song.add(tb + e * b / 2, kit.hat(vel(rng, 0.3)))
            song.tone(tb, bar, semis(chord, -12), "sine", 0.2, attack=0.02, release=0.3)
    return bpm, song.render(), beats


def aksak(kind, rng):
    groups = [2, 2, 2, 3] if kind == "aksak9" else [2, 2, 3]
    eighth_bpm = float(rng.integers(260, 380))
    e = 60 / eighth_bpm
    song = Song(rng, SECONDS)
    kit = Kit(rng)
    root = semis(110, int(rng.integers(0, 12)))
    t = 0.3 + rng.random() * 0.4
    tatums = sum(groups)
    bar_len = tatums * e
    k = 0
    beats = []
    while t + bar_len < SECONDS - 1:
        pos = 0
        for gi, g in enumerate(groups):
            beats.append(round(t + pos * e, 4))
            if gi == 0:
                song.add(t + pos * e, kit.dum(vel(rng)))
            elif gi == len(groups) - 1 or rng.random() < 0.5:
                song.add(t + pos * e, kit.dum(vel(rng, 0.6)))
            else:
                song.add(t + pos * e, kit.tek(vel(rng, 0.9)))
            for s in range(1, g):
                song.add(t + (pos + s) * e, kit.tek(vel(rng, 0.45)))
            # Melodi grup başlarında (saz benzeri).
            song.tone(t + pos * e, g * e * 0.9, semis(root, [0, 3, 5, 7, 10][(k + gi) % 5]), "saw", 0.08, cutoff=2500)
            pos += g
        t += bar_len
        k += 1
    # Doğru tempo: grup başları (ölçüde len(groups) vuruş).
    bpm = round(60 * len(groups) / bar_len, 1)
    return bpm, song.render(), beats


KINDS = ["dubstep", "trap", "dnb", "house", "hiphop", "pop", "balad", "aksak9", "aksak7"]


def main():
    out = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else KINDS
    out.mkdir(parents=True, exist_ok=True)
    for kind in only:
        rng = np.random.default_rng(seed * 1000 + KINDS.index(kind))
        if kind.startswith("aksak"):
            bpm, audio, beats = aksak(kind, rng)
        else:
            bpm, audio, beats = four_four(kind, rng)
        name = f"{kind}-{seed}"
        pcm = (audio * 32767).astype("<i2")
        with wave.open(str(out / f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        (out / f"{name}.json").write_text(json.dumps({"bpm": bpm, "tur": kind, "vuruslar": beats}))
        print(name, bpm, flush=True)


if __name__ == "__main__":
    main()
