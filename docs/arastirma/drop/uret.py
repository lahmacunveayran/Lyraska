"""Drop ölçümü için yeri bilinen deneme şarkıları üretir (sentetik; ses depoya girmez).

Kullanım: python3 docs/arastirma/drop/uret.py <çıkış klasörü> [tohum]
Her şarkı için `ad.wav` (44,1 kHz, mono, 16 bit) ve `ad.json` ({"drops": [...], "tur": ...}).
Türler bilinen zor durumları kapsar: bassız yükseliş, bas hiç kesilmeyen yükseliş, droptan
önce kısa sessizlik, yükselişin droptan yüksek olduğu sıkıştırılmış kayıt, dubstep yarım tempo,
rock'ta grubun girişi, sahte drop, uzun sakin giriş, melodik (bası hep süren) drop, dropsuz şarkı.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100


def one_pole_lp(x, cutoff):
    """Tek kutuplu alçak geçiren; `cutoff` sabit ya da örnek başına dizi (Hz)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # kısa parçalarda çağrılır
        acc = a[i] * acc + (1 - a[i]) * x[i]
        y[i] = acc
    return y


def lp_blocks(x, cutoff, block=256):
    """Bloklar hâlinde değişen kesimli alçak geçiren (hızlı yaklaşık)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    y = np.empty_like(x)
    acc = 0.0
    for s in range(0, len(x), block):
        a = np.exp(-2 * np.pi * c[s] / SR)
        seg = x[s : s + block]
        # y[n] = a*y[n-1] + (1-a)*x[n], kapalı biçim
        n = np.arange(1, len(seg) + 1)
        pw = a**n
        conv = np.convolve(seg * (1 - a), a ** np.arange(len(seg)))[: len(seg)]
        out = conv + acc * pw
        y[s : s + block] = out
        acc = out[-1]
    return y


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


class Song:
    def __init__(self, rng, bpm, root):
        self.rng = rng
        self.bpm = bpm
        self.beat = 60 / bpm
        self.root = root  # Hz
        self.parts = []  # (başlangıç sn, örnekler)

    def add(self, t, sig, gain=1.0):
        self.parts.append((t, sig * gain))

    def kick(self, t, g=1.0):
        n = int(0.35 * SR)
        tt = np.arange(n) / SR
        f = 45 + 110 * np.exp(-tt / 0.03)
        ph = 2 * np.pi * np.cumsum(f) / SR
        self.add(t, np.sin(ph) * np.exp(-tt / 0.18), g)

    def snare(self, t, g=1.0):
        n = int(0.2 * SR)
        noise = self.rng.standard_normal(n)
        noise = noise - one_pole_lp(noise, 1500)
        tone = np.sin(2 * np.pi * 190 * np.arange(n) / SR)
        self.add(t, (0.6 * noise + 0.5 * tone) * env(n, 0.001, 0.06), g)

    def hat(self, t, g=1.0):
        n = int(0.06 * SR)
        noise = np.diff(self.rng.standard_normal(n + 1))
        self.add(t, noise * env(n, 0.0005, 0.015), 0.35 * g)

    def tone(self, t, dur, freq, kind="saw", g=1.0, cutoff=None, attack=0.01, release=0.05):
        n = int(dur * SR)
        tt = np.arange(n) / SR
        ph = (freq * tt) % 1.0
        if kind == "saw":
            s = 2 * ph - 1
        elif kind == "square":
            s = np.sign(ph - 0.5)
        else:
            s = np.sin(2 * np.pi * ph)
        if cutoff is not None:
            s = lp_blocks(s, cutoff)
        e = np.minimum(1, tt / attack) * np.minimum(1, (dur - tt) / release).clip(0, 1)
        self.add(t, s * e, g)

    def noise_riser(self, t, dur, g=1.0):
        n = int(dur * SR)
        x = self.rng.standard_normal(n)
        cut = np.geomspace(300, 9000, n)
        lo = lp_blocks(x, cut)
        hi = x - lp_blocks(x, cut * 0.3)
        amp = np.linspace(0.05, 1, n) ** 2
        self.add(t, (0.5 * lo + 0.5 * hi) * amp, 0.5 * g)

    def render(self, total):
        out = np.zeros(int(total * SR) + SR)
        for t, sig in self.parts:
            s = int(t * SR)
            e = min(len(out), s + len(sig))
            if e > s:
                out[s:e] += sig[: e - s]
        return out[: int(total * SR)]


CHORDS = [0, -4, 3, -2]  # yarım ses: i–VI–III–VII benzeri


def semis(f, k):
    return f * 2 ** (k / 12)


def section(song, t0, bars, el, bar_index=0):
    """`el`: öğe → kazanç ya da ayar. Bir bölümü `t0`'dan başlayarak yazar; bitiş zamanını döndürür."""
    b = song.beat
    bar = 4 * b
    rng = song.rng
    for k in range(bars):
        tb = t0 + k * bar
        chord = CHORDS[(bar_index + k) % 4]
        root = semis(song.root, chord)
        prog = (k + 1) / bars  # bölüm içinde ilerleme
        if "kick" in el:
            if el.get("halftime"):
                song.kick(tb, el["kick"])
            else:
                for q in range(4):
                    song.kick(tb + q * b, el["kick"])
        if "snare" in el:
            beats = [2] if el.get("halftime") else [1, 3]
            for q in beats:
                song.snare(tb + q * b, el["snare"])
        if "roll" in el:
            # Yükseliş: dörtlükten on altılığa sıklaşan trampet, gittikçe yüksek.
            div = 1 if prog <= 0.5 else (2 if prog <= 0.75 else 4)
            for q in range(4 * div):
                song.snare(tb + q * b / div, el["roll"] * (0.3 + 0.7 * prog))
        if "hat" in el:
            for q in range(8):
                song.hat(tb + q * b / 2, el["hat"] * (1.0 if q % 2 else 0.5))
        if "bass" in el:
            g = el["bass"]
            cut = el.get("bass_cut", 900)
            if callable(cut):
                cut = cut(prog)
            if el.get("wobble"):
                for q in range(4):
                    n = int(b * SR)
                    tt = np.arange(n) / SR
                    lfo = 200 + 1800 * (0.5 + 0.5 * np.sin(2 * np.pi * (2 if q % 2 else 4) / b * tt))
                    s = 2 * ((semis(root, -24) * tt) % 1.0) - 1
                    s = lp_blocks(s, lfo) + 0.6 * np.sin(2 * np.pi * semis(root, -24) * tt)
                    song.add(tb + q * b, s * env(n, 0.005, 10), g)
            elif el.get("sustain"):
                # Yükselişte uzun bas notası (ölçü boyu); alt bas istenirse gittikçe kısılır
                # (yükselişte yüksek geçiren süzgeç gibi).
                sub = el.get("sub", 1.0)
                if callable(sub):
                    sub = sub(prog)
                song.tone(tb, bar, semis(root, -24), "saw", g * 0.8, cutoff=cut, attack=0.05, release=0.1)
                song.tone(tb, bar, semis(root, -24), "sine", g * 0.9 * sub, attack=0.05, release=0.1)
            else:
                for q in range(8):
                    # Sidechain: vuruştan hemen sonra kısık.
                    t = tb + q * b / 2
                    song.tone(t, b / 2 * 0.95, semis(root, -24), "saw", g * 0.8, cutoff=cut)
                    song.tone(t, b / 2 * 0.95, semis(root, -24), "sine", g * 0.9)
        if "pad" in el:
            for iv in (0, 3, 7):
                song.tone(tb, bar, semis(root, iv), "saw", el["pad"] * 0.25, cutoff=1500, attack=0.3, release=0.3)
        if "lead" in el:
            notes = [7, 10, 12, 10, 7, 5, 3, 5]
            for q in range(8):
                song.tone(tb + q * b / 2, b / 2 * 0.9, semis(root, 12 + notes[(q + k) % 8]), "square", el["lead"] * 0.25, cutoff=4000)
        if "guitar" in el:
            # Distorsiyonlu gitar: kırpılmış testere akorlar, sekizlikler.
            for q in range(8):
                n = int(b / 2 * 0.95 * SR)
                tt = np.arange(n) / SR
                s = sum(2 * ((semis(root, iv - 12) * tt) % 1.0) - 1 for iv in (0, 7, 12))
                s = np.tanh(3 * s) * env(n, 0.003, 0.5)
                song.add(tb + q * b / 2, s, el["guitar"] * 0.3)
        if "riser" in el and k == 0:
            song.noise_riser(tb, bars * bar, el["riser"])
    return t0 + bars * bar


def build_song(kind, rng):
    bpm = {"dubstep": 140, "rock": float(rng.integers(100, 140))}.get(kind, float(rng.integers(118, 132)))
    if kind == "dnb":
        bpm = float(rng.integers(170, 176))
    song = Song(rng, bpm, semis(110, int(rng.integers(0, 12))))
    bar = 4 * song.beat
    t = 0.3 + rng.random() * 0.5  # baştaki kısa sessizlik
    drops = []
    full = {"kick": 1.0, "snare": 0.7, "hat": 0.8, "bass": 1.0, "pad": 0.6, "lead": 0.8}
    groove = {"kick": 0.9, "hat": 0.7, "pad": 0.6, "bass": 0.7}
    calm = {"pad": 0.8, "lead": 0.5}
    build = {"pad": 0.6, "roll": 0.8, "riser": 1.0, "lead": 0.4}
    bi = 0

    def sec(bars, el):
        nonlocal t, bi
        t = section(song, t, bars, el, bi)
        bi += bars

    def drop(bars, el=None):
        drops.append(round(t, 3))
        sec(bars, el or full)

    if kind == "klasik":
        sec(8, groove); sec(8, calm); sec(8, build); drop(16); sec(8, calm); sec(8, build); drop(16); sec(8, groove)
    elif kind == "bas_suren_yukselis":
        # Bas yükselişte de sürer ama alt bası gittikçe süzülür; davul da sürer.
        b2 = dict(build, bass=0.8, sustain=True, sub=lambda p: 1 - 0.85 * p, kick=0.8)
        sec(8, groove); sec(8, b2); drop(16); sec(8, calm); sec(8, b2); drop(16)
    elif kind == "sessizlikli":
        sec(8, groove); sec(8, calm)
        sec(8, build); t += song.beat  # bir vuruşluk sessizlik
        drop(16); sec(8, calm); sec(7, build); t += 2 * song.beat; drop(16)
    elif kind == "yuksek_yukselis":
        loud = dict(build, roll=1.6, riser=2.5, pad=1.0, lead=1.0, hat=1.0)
        sec(8, groove); sec(8, loud); drop(16, dict(full, pad=0.3, lead=0.5)); sec(8, calm); sec(8, loud); drop(16, dict(full, pad=0.3, lead=0.5))
    elif kind == "dubstep":
        wob = {"kick": 1.0, "snare": 0.9, "hat": 0.6, "bass": 1.0, "wobble": True, "halftime": True}
        sec(8, calm); sec(8, build); drop(16, wob); sec(8, calm); sec(8, build); drop(16, wob)
    elif kind == "dnb":
        dnb = dict(full, lead=0.3)
        sec(16, calm); sec(8, build); drop(32, dnb); sec(16, calm); sec(8, build); drop(32, dnb)
    elif kind == "rock":
        verse = {"kick": 0.7, "snare": 0.5, "hat": 0.6, "bass": 0.6, "bass_cut": 500, "guitar": 0.3}
        sec(4, {"guitar": 0.5})  # yalnız gitar girişi
        drop(8, {"kick": 1.0, "snare": 0.9, "hat": 0.8, "bass": 0.8, "bass_cut": 500, "guitar": 1.0})
        sec(8, verse); sec(8, dict(verse, guitar=1.0, snare=0.8, kick=0.9)); sec(8, verse)
        sec(8, dict(verse, guitar=1.0, snare=0.8, kick=0.9)); sec(4, {"guitar": 0.4, "pad": 0.5})
        drop(8, {"kick": 1.0, "snare": 1.0, "hat": 0.8, "bass": 0.8, "bass_cut": 500, "guitar": 1.2})
    elif kind == "sahte_drop":
        sec(8, groove); sec(8, build)
        t += 2 * song.beat  # sahte: sessizlikten sonra yine sakin
        sec(4, calm); sec(4, build); drop(16); sec(8, groove)
    elif kind == "uzun_giris":
        sec(24, {"pad": 0.5}); drop(16); sec(8, calm); sec(8, build); drop(16)
    elif kind == "melodik":
        # Yükselişte bas uzun notalarla tam sürer, davul yok; drop davulu ve ritmik bası getirir.
        mel_build = dict(build, bass=0.7, sustain=True)
        sec(8, dict(groove, lead=0.6)); sec(8, mel_build); drop(16, dict(full, lead=1.2, pad=1.0)); sec(8, calm); sec(8, mel_build); drop(16, dict(full, lead=1.2, pad=1.0))
    elif kind == "dropsuz":
        sec(8, groove); sec(16, dict(groove, lead=0.6)); sec(8, calm); sec(16, dict(groove, lead=0.6)); sec(8, groove)
    else:
        raise ValueError(kind)
    total = t + 2.0
    audio = song.render(total)
    # Sıkıştırılmış kayıt gibi: yumuşak sınırlama ve normalleştirme.
    audio = audio / (np.percentile(np.abs(audio), 99.5) + 1e-9)
    audio = np.tanh(1.2 * audio) * 0.89
    return audio, drops, bpm


KINDS = ["klasik", "bas_suren_yukselis", "sessizlikli", "yuksek_yukselis", "dubstep", "dnb", "rock",
         "sahte_drop", "uzun_giris", "melodik", "dropsuz"]


def main():
    out = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    only = sys.argv[3].split(",") if len(sys.argv) > 3 else KINDS
    out.mkdir(parents=True, exist_ok=True)
    for kind in only:
        rng = np.random.default_rng(seed * 1000 + KINDS.index(kind))
        audio, drops, bpm = build_song(kind, rng)
        name = f"{kind}-{seed}"
        pcm = (audio * 32767).astype("<i2")
        with wave.open(str(out / f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        (out / f"{name}.json").write_text(json.dumps({"drops": drops, "tur": kind, "bpm": bpm}))
        print(name, f"{len(audio) / SR:.0f} sn", drops, flush=True)


if __name__ == "__main__":
    main()
