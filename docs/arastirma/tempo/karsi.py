"""Bağımsız inceleme: tempo oktavı kuralının karşı örnekleri (uret.py'nin araçlarıyla).

Kullanım: python3 karsi.py <uret.py klasörü> <çıkış> <tohum>
"""

import json
import sys
import wave
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import numpy as np  # noqa: E402
from uret import CHORDS, SR, Kit, Song, semis, vel  # noqa: E402

SECONDS = 48.0


def base(rng, lo, hi, total=SECONDS):
    bpm = float(rng.integers(lo, hi + 1))
    return bpm, 60 / bpm, Song(rng, total), Kit(rng), semis(55, int(rng.integers(0, 12)))


def pad(song, tb, bar, chord):
    for iv in (12, 15, 19):
        song.tone(tb, bar, semis(chord, iv), "saw", 0.04, cutoff=1500, attack=0.2, release=0.2)


def gen(kind, rng):
    total = 14.0 if kind == "kisa" else SECONDS
    ranges = {
        "lofi": (72, 79), "hiphop_kick": (86, 98), "maqsum": (88, 100), "turkpop": (88, 100),
        "motown": (96, 112), "reggae": (70, 79), "rock_yavas": (70, 79), "caz": (120, 180),
        "piyano16": (66, 78), "sessiz_giris": (100, 118), "kisa": (100, 118), "rnb16": (66, 79),
    }
    bpm, b, song, kit, root = base(rng, *ranges[kind], total)
    bar = 4 * b
    t0 = 0.3 + rng.random() * 0.3
    bars = int((total - t0 - 1) / bar)
    swing = rng.uniform(0.55, 0.66)
    beats = []
    for k in range(bars):
        tb = t0 + k * bar
        chord = semis(root, CHORDS[(k // 2) % 4])
        if kind != "piyano16":
            pad(song, tb, bar, chord)
        if kind == "sessiz_giris" and tb < 16:
            continue  # yalnız pad
        beats.extend(round(tb + q * b, 4) for q in range(4))
        if kind in ("lofi", "rnb16"):
            # Yavaş boom-bap / R&B: kick 1 ve 3'ün arkası, snare 2 ve 4, swing'li on altılık hi-hat.
            for q in (0, 2.5):
                song.add(tb + q * b, kit.kick(vel(rng)))
                song.tone(tb + q * b, b * 0.7, semis(chord, -12), "sine", 0.25, attack=0.01, release=0.1)
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng)))
            sw = swing if kind == "lofi" else 0.5
            for e in range(16):
                pos = (e // 2) * b / 2 + (sw * b / 2 if e % 2 else 0)
                song.add(tb + pos, kit.hat(vel(rng, 0.4 if e % 2 else 0.7)))
        elif kind == "hiphop_kick":
            # Kick'i öne çıkan boom-bap: kick 1'de, 1'in ve 3'ün arkasında; snare kick'ten kısık.
            for q in (0, 0.5, 2.5):
                song.add(tb + q * b, kit.kick(vel(rng)))
                song.tone(tb + q * b, b * 0.45, semis(chord, -12), "sine", 0.3, attack=0.01, release=0.1)
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng, 0.6)))
            for e in range(8):
                pos = (e // 2) * b + (swing * b if e % 2 else 0)
                song.add(tb + pos, kit.hat(vel(rng, 0.5 if e % 2 else 0.8)))
        elif kind in ("maqsum", "turkpop"):
            # Maksum: düm 1, tek 1'in arkası, tek 2'nin arkası, düm 3, tek 4.
            for q in (0, 2):
                song.add(tb + q * b, kit.dum(vel(rng)))
            for q in (0.5, 1.5, 3):
                song.add(tb + q * b, kit.tek(vel(rng, 0.9)))
            if kind == "turkpop":
                for q in (0, 2):
                    song.add(tb + q * b, kit.kick(vel(rng, 0.8)))
                for q in (1, 3):
                    song.add(tb + q * b, kit.snare(vel(rng, 0.8)))
                for e in range(8):
                    song.add(tb + e * b / 2, kit.hat(vel(rng, 0.5)))
            for e in range(8):  # yaylı/saz sekizlikleri
                song.tone(tb + e * b / 2, b * 0.45, semis(chord, 12 + [0, 3, 5, 7][e % 4]), "saw", 0.06, cutoff=2500)
        elif kind == "motown":
            for q in (0, 1.5, 2):
                song.add(tb + q * b, kit.kick(vel(rng, 0.8)))
            for q in range(4):
                song.add(tb + q * b, kit.snare(vel(rng, 1.0 if q % 2 else 0.7)))
            for e in range(8):
                song.add(tb + e * b / 2, kit.hat(vel(rng, 0.6)))
        elif kind == "reggae":
            # One drop: kick + snare yalnızca 3'te; gitar skank vuruş aralarında.
            song.add(tb + 2 * b, kit.kick(vel(rng)))
            song.add(tb + 2 * b, kit.snare(vel(rng, 0.6)))
            for e in range(8):
                song.add(tb + e * b / 2, kit.hat(vel(rng, 0.4)))
            for q in range(4):
                for iv in (12, 16, 19, 24):
                    song.tone(tb + (q + 0.5) * b, b * 0.2, semis(chord, iv), "saw", 0.08, cutoff=3500, attack=0.003, release=0.05)
        elif kind == "rock_yavas":
            for q in (0, 2):
                song.add(tb + q * b, kit.kick(vel(rng)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng)))
            for e in range(8):
                song.add(tb + e * b / 2, kit.hat(vel(rng, 0.7)))
            for e in range(8):  # gitar sekizlikleri
                song.tone(tb + e * b / 2, b * 0.45, semis(chord, 0), "saw", 0.08, cutoff=2000)
        elif kind == "caz":
            # Ride: ding, ding-a-ding (swing sekizliği 2/3'te); hi-hat ayakla 2 ve 4; yürüyen bas.
            for q in (0, 1, 1 + 2 / 3, 2, 3, 3 + 2 / 3):
                song.add(tb + q * b, kit.hat(vel(rng, 0.8), open_=True))
            for q in (1, 3):
                song.add(tb + q * b, kit.hat(vel(rng, 0.5)))
            for q in range(4):
                song.tone(tb + q * b, b * 0.9, semis(chord, -12 + [0, 4, 7, 9][q]), "sine", 0.3, attack=0.01, release=0.1)
            for _ in range(2):  # snare comping, rastgele swing sekizliklerde
                q = int(rng.integers(0, 4)) + (2 / 3 if rng.random() < 0.6 else 0)
                song.add(tb + q * b, kit.snare(vel(rng, 0.4)))
        elif kind == "piyano16":
            # Tek enstrüman: sol el vuruşta, sağ el on altılık arpej (Alberti).
            for q in range(4):
                song.tone(tb + q * b, b * 0.9, semis(chord, -12), "sine", 0.3, attack=0.004, release=0.2)
            for s in range(16):
                song.tone(tb + s * b / 4, b * 0.24, semis(chord, [12, 19, 16, 19][s % 4]), "sine", 0.1, attack=0.004, release=0.05)
        elif kind in ("sessiz_giris", "kisa"):
            for q in (0, 2):
                song.add(tb + q * b, kit.kick(vel(rng)))
            for q in (1, 3):
                song.add(tb + q * b, kit.snare(vel(rng)))
            for e in range(8):
                song.add(tb + e * b / 2, kit.hat(vel(rng, 0.6)))
    return bpm, song.render(), beats


KINDS = ["lofi", "rnb16", "hiphop_kick", "maqsum", "turkpop", "motown", "reggae", "rock_yavas", "caz",
         "piyano16", "sessiz_giris", "kisa"]


def main():
    out = Path(sys.argv[2])
    seed = int(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    for i, kind in enumerate(KINDS):
        rng = np.random.default_rng(seed * 7919 + i)
        bpm, audio, beats = gen(kind, rng)
        name = f"{kind}-{seed}"
        with wave.open(str(out / f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((audio * 32767).astype("<i2").tobytes())
        (out / f"{name}.json").write_text(json.dumps({"bpm": bpm, "tur": kind, "vuruslar": beats}))


if __name__ == "__main__":
    main()
