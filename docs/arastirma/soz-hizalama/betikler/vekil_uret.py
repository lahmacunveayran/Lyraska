"""Türkçe vekil set: doğru kelime zamanları bilinen "şarkılar" üretir (gerçek Türkçe şarkı değildir!).

Vokal: Türkçe konuşma sentezi (Piper VITS, sherpa-onnx dönüşümü; tr_TR dfki / fahrettin), her kelime ayrı
üretilir, WORLD vokoderiyle (pyworld) ezgiye oturtulur (perde = nota, süre = hece sayısı × nota süresi, titreşim),
yankı eklenir. Eşlik: FluidSynth + FluidR3_GM (MIT) ile davul, bas, piyano/gitar akorları, yaylılar.
Kelime başı = kelimenin sesinin yerleştirildiği an (sessizliği kırpılmış): doğrusu tam bilinir.
Söz satırları bu betiğin yazarının özgün satırlarıdır (+ Yunus Emre'den iki kamu malı dize).

Kullanım: python vekil_uret.py <bölüm> <ilk_tohum> <adet>   → cache/vekil/<bölüm>/<ad>.wav + .json
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import mido
import numpy as np
import pyworld
import sherpa_onnx
import soundfile as sf

from ortak import CACHE, MODELS, syllables, words_of

SR = 44100

LINES = """Gece yine uzun sürdü sen yoktun yanımda
Bir şarkı söyledim rüzgâra duydun mu acaba
Yollar beni sana getirmez artık
Gözlerinde kayboldum bulamadım kendimi
Kalbimin kapısı açık gel istersen
Sabah olmadan dön bana
Şehrin ışıkları söndü birer birer
Bu aşk bir yangın söndürme beni
Yağmur yağar sokaklar ıslak
Ne zaman gülsen dünya durur
Unutmak kolay değil biliyorum
Ellerin ellerimde kalsın bu gece
Hasret yüreğimde büyüdü
Deniz kenarında bekledim seni
Söz verdin gelmedin ah sevgilim
Her şey geçer dediler geçmedi
Yıldızlar şahit olsun bu sevdaya
İçimde bir şarkı var sana yazdığım
Düşlerimde hep sen varsın
Gitme dur biraz daha kal
Ömrümün baharı sendin
Çiçekler açtı bahçede sen gelmedin
Kim bilir nerdesin şimdi
Bir umut kaldı geride
Yüreğim dağlar kadar ağır
Işığım ol karanlıkta
Dön desem dönmezsin biliyorum
Ağlama gözüm geçer bu günler
Sevdim seni bir kere bıraktım kendimi
Rüzgâr esti saçların dağıldı
Şarkılar senden bahseder
Bütün gece uyumadım
Sensiz geçen günler eksik
Bir ses duydum uzaklardan
Kalbim çarpıyor deli gibi
Hadi gel dans edelim
Gülüşün güneş gibi doğar
Gözyaşlarım sele döndü
Ayrılık zor ölümden beter
Sana koşar adımlarım
Bu şehir bana dar geldi
İstanbul'un ışıkları altında
Mavi bir gökyüzü altında buluştuk
Yarın yeniden doğacak güneş
Özledim seni çok özledim
Ağır ağır çekilir yüküm
Çağır beni geleyim hemen
Ölürüm sana inan bana
Şimdi uzaklarda bir yerde
Görüşürüz belki bir gün
Gel gör beni aşk neyledi
Derdim çoktur hangisine yanayım""".split("\n")

VOICES = ["vits-piper-tr_TR-dfki-medium/tr_TR-dfki-medium", "vits-piper-tr_TR-fahrettin-medium/tr_TR-fahrettin-medium"]
_TTS = {}


def tts(voice):
    if voice not in _TTS:
        base = MODELS / voice
        d = base.parent
        cfg = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                    model=str(base) + ".onnx", tokens=str(d / "tokens.txt"), data_dir=str(d / "espeak-ng-data")
                ),
                num_threads=4,
            )
        )
        _TTS[voice] = sherpa_onnx.OfflineTts(cfg)
    return _TTS[voice]


def say(voice, word, speed):
    a = tts(voice).generate(word, sid=0, speed=speed)
    x = np.asarray(a.samples, dtype=np.float64)
    sr = a.sample_rate
    # sessizliği kırp (tepeye göre −40 dB)
    env = np.abs(x)
    thr = env.max() * 10 ** (-40 / 20)
    nz = np.where(env > thr)[0]
    x = x[nz[0] : nz[-1] + 1]
    return x, sr


def sing(x, sr, dur, f0_note, rng):
    """WORLD ile ezgiye oturt: süreyi `dur`'a uzat, perdeyi notaya çek, titreşim ekle."""
    f0, t = pyworld.harvest(x, sr, frame_period=5.0, f0_floor=60, f0_ceil=500)
    sp = pyworld.cheaptrick(x, f0, t, sr)
    ap = pyworld.d4c(x, f0, t, sr)
    n0 = len(f0)
    factor = np.clip(dur / (len(x) / sr), 0.6, 3.0)
    n1 = max(2, int(n0 * factor))
    # ünsüzler kısa kalsın: uzatmayı sesli karelere yığ
    voiced = f0 > 0
    w = np.where(voiced, factor * 1.6, 1.0)
    pos = np.concatenate([[0], np.cumsum(w)])
    pos = pos / pos[-1] * (n0 - 1)
    src = np.interp(np.arange(n1), np.linspace(0, n1 - 1, n0 + 1), pos)
    idx = np.clip(np.round(src).astype(int), 0, n0 - 1)
    sp2, ap2, v2 = sp[idx], ap[idx], voiced[idx]
    tt = np.arange(n1) * 0.005
    vib = 1 + 0.012 * np.sin(2 * np.pi * rng.uniform(5, 6.5) * tt) * np.clip((tt - 0.25) / 0.3, 0, 1)
    glide = f0_note[0] + (f0_note[1] - f0_note[0]) * np.clip(tt / max(tt[-1], 1e-3) * 1.5 - 0.25, 0, 1)
    f02 = np.where(v2, glide * vib, 0.0)
    y = pyworld.synthesize(f02, np.ascontiguousarray(sp2), np.ascontiguousarray(ap2), sr, 5.0)
    return y


def resample(x, a, b):
    from math import gcd

    from scipy.signal import resample_poly

    g = gcd(a, b)
    return resample_poly(x, b // g, a // g)


def reverb(x, rng, wet):
    n = int(SR * 1.2)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * rng.uniform(0.25, 0.5)))
    ir[: int(SR * 0.02)] = 0
    from scipy.signal import fftconvolve

    r = fftconvolve(x, ir)[: len(x)]
    r *= np.std(x) / (np.std(r) + 1e-9)
    return x + wet * r


SCALES = {"minor": [0, 2, 3, 5, 7, 8, 10], "hicaz": [0, 1, 4, 5, 7, 8, 10], "major": [0, 2, 4, 5, 7, 9, 11]}


def make_song(seed, out_dir):
    rng = np.random.default_rng(seed)
    bpm = float(rng.uniform(72, 132))
    beat = 60 / bpm
    voice = VOICES[seed % 2]
    speed = float(rng.uniform(0.9, 1.15))
    root_midi = int(rng.integers(55, 62)) if seed % 2 == 0 else int(rng.integers(45, 52))  # kadın / erkek
    scale = SCALES[rng.choice(list(SCALES))]
    pool = list(rng.permutation(len(LINES)))
    chorus = [LINES[i] for i in pool[:4]]
    verse1 = [LINES[i] for i in pool[4:8]]
    verse2 = [LINES[i] for i in pool[8:12]]
    bridge = [LINES[i] for i in pool[12:14]]
    plan = [("intro", None), ("v", verse1), ("c", chorus), ("inst", None), ("v", verse2), ("c", chorus),
            ("b", bridge), ("c", chorus)]
    if rng.random() < 0.4:  # bazı şarkılarda tek nakarat (kısa)
        plan = plan[:6]
    bar = 4 * beat
    t = 0.0
    events = []  # (zaman, kelime, hece, satır no)
    lines, wstarts = [], []
    sections = []
    for kind, content in plan:
        if content is None:
            nb = int(rng.integers(2, 5)) * (2 if kind == "intro" else 1)
            sections.append((t, t + nb * bar, kind))
            t += nb * bar
            continue
        s0 = t
        for line in content:
            ws = words_of(line)
            syl = [syllables(w) for w in ws]
            nsyl = sum(syl)
            slots = 16 if nsyl <= 14 else 24  # sekizlik: 2 ya da 3 ölçü
            unit = bar * (slots / 8) / slots  # sekizlik süresi
            if nsyl > slots - 2:
                unit = unit * (slots - 2) / nsyl
            # satır içinde küçük kayma: ilk hece 0..1 sekizlik geç başlar
            pos = t + unit * int(rng.integers(0, 2))
            row = []
            for w, s in zip(ws, syl):
                long = 2 if (w is ws[-1] or rng.random() < 0.15) else 1
                d = unit * (s - 1 + long)
                events.append((pos, w, d))
                row.append(pos)
                pos += d
            lines.append(ws)
            wstarts.append(row)
            t += bar * (slots / 8)
        sections.append((s0, t, kind))
    total = t + 2 * bar
    # ---- vokal
    voc = np.zeros(int(total * SR) + SR)
    true_starts = []
    deg = 0
    for (pos, w, d) in events:
        x, sr = say(voice, w, speed)
        step = scale[deg % len(scale)] + 12 * (deg // len(scale))
        f_a = 440 * 2 ** ((root_midi + step - 69) / 12)
        deg = int(np.clip(deg + rng.integers(-2, 3), 0, 9))
        step_b = scale[deg % len(scale)] + 12 * (deg // len(scale))
        f_b = 440 * 2 ** ((root_midi + step_b - 69) / 12)
        y = sing(x, sr, d * rng.uniform(0.8, 1.0), (f_a, f_b), rng)
        y = resample(y, sr, SR)
        y *= 10 ** (rng.uniform(-3, 1) / 20) / (np.max(np.abs(y)) + 1e-9)
        a = int(pos * SR)
        voc[a : a + len(y)] += y[: len(voc) - a]
        true_starts.append(pos)
    voc = reverb(voc, rng, wet=rng.uniform(0.15, 0.45))
    # ---- eşlik (MIDI → FluidSynth)
    mid = mido.MidiFile(ticks_per_beat=480)
    tr = mido.MidiTrack()
    mid.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=int(beat * 1e6)))
    prog = {0: int(rng.choice([0, 4, 25, 27])), 1: int(rng.choice([33, 34, 38])), 2: int(rng.choice([48, 49, 89])), 3: int(rng.choice([24, 26, 81]))}
    for ch, p in prog.items():
        tr.append(mido.Message("program_change", channel=ch, program=p, time=0))
    msgs = []  # (tick, msg)

    def note(ch, n, t0, dur, vel):
        a = int(t0 / beat * 480)
        b = int((t0 + dur) / beat * 480)
        msgs.append((a, mido.Message("note_on", channel=ch, note=int(n), velocity=int(vel))))
        msgs.append((b, mido.Message("note_off", channel=ch, note=int(n), velocity=0)))

    prog_deg = [0, 5, 3, 4] if scale is SCALES["major"] else [0, 5, 6, 4]
    nbars = int(total / bar)
    for b in range(nbars):
        tb = b * bar
        kind = next((k for s, e, k in sections if s <= tb < e), "outro")
        inten = {"intro": 0.6, "v": 0.75, "c": 1.0, "inst": 0.9, "b": 0.7, "outro": 0.5}[kind]
        d = prog_deg[b % 4]
        r = root_midi - 12 + scale[d % 7]
        chord = [r, r + scale[(d + 2) % 7] - scale[d % 7] + (12 if (d + 2) % 7 < d % 7 else 0),
                 r + scale[(d + 4) % 7] - scale[d % 7] + (12 if (d + 4) % 7 < d % 7 else 0)]
        # davul
        for k in range(4):
            note(9, 36, tb + k * beat, 0.1, 100 * inten if k % 2 == 0 else 60)
            if k % 2 == 1:
                note(9, 38, tb + k * beat, 0.1, 95 * inten)
            for h in range(2):
                note(9, 42, tb + k * beat + h * beat / 2, 0.05, 55 + 20 * inten)
        # bas
        for k in range(4):
            note(1, r - 12, tb + k * beat, beat * 0.9, 90 * inten)
        # akor (sekizlik)
        for k in range(8):
            for n in chord:
                note(0, n + 12, tb + k * beat / 2, beat * 0.45, (50 + 30 * inten) * (1.1 if k % 2 == 0 else 0.8))
        # yaylı / pad
        if kind in ("c", "b", "inst"):
            for n in chord:
                note(2, n + 12, tb, bar * 0.98, 60 * inten)
        # orta bantta solo ara bölümde
        if kind in ("inst", "intro"):
            for k in range(4):
                note(3, root_midi + scale[int(rng.integers(0, 7))], tb + k * beat, beat * 0.9, 85)
    msgs.sort(key=lambda m: m[0])
    last = 0
    for tick, m in msgs:
        tr.append(m.copy(time=tick - last))
        last = tick
    with tempfile.TemporaryDirectory() as td:
        mp = Path(td) / "a.mid"
        wp = Path(td) / "a.wav"
        mid.save(mp)
        subprocess.run(
            ["fluidsynth", "-ni", "-g", "0.6", "-r", str(SR), "-F", str(wp), "/usr/share/sounds/sf2/FluidR3_GM.sf2", str(mp)],
            check=True, capture_output=True,
        )
        acc, asr = sf.read(wp, always_2d=True)
    acc = acc.T
    n = max(acc.shape[1], len(voc))
    accp = np.zeros((2, n))
    accp[:, : acc.shape[1]] = acc
    vocp = np.zeros(n)
    vocp[: len(voc)] = voc
    # vokal / eşlik oranı: sözlü kısımlarda RMS farkı −6 … +4 dB
    vr = np.sqrt(np.mean(vocp[vocp != 0] ** 2))
    ar = np.sqrt(np.mean(accp**2))
    snr = float(rng.uniform(-6, 4))
    vocp *= ar / vr * 10 ** (snr / 20)
    mix = accp + vocp[None]
    mix /= np.max(np.abs(mix)) * 1.05
    name = f"vekil_{seed:04d}"
    sf.write(out_dir / f"{name}.wav", mix.T.astype(np.float32), SR, subtype="PCM_16")
    meta = {"bpm": bpm, "ses": voice.split("/")[0], "vokal_db": snr, "olcek": [k for k, v in SCALES.items() if v is scale][0]}
    (out_dir / f"{name}.json").write_text(
        json.dumps({"lines": lines, "word_starts": wstarts, "meta": meta}, ensure_ascii=False), encoding="utf-8"
    )
    return name, meta


def main():
    split, first, count = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    out = CACHE / "vekil" / split
    out.mkdir(parents=True, exist_ok=True)
    for s in range(first, first + count):
        print(make_song(s, out), flush=True)


if __name__ == "__main__":
    main()
