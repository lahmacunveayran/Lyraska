#!/bin/bash
set -e
# 44,1 kHz stereo, 440 Hz sinüs (sağda 660 Hz), 6 sn; üç parça: 90001, 70003, 104711 kare (ms'ye hizalanmaz).
ffmpeg -loglevel error -y -f lavfi -i "aevalsrc=0.5*sin(2*PI*440*t)|0.5*sin(2*PI*660*t):s=44100:c=stereo" -frames:a 264715 -c:a pcm_s16le butun.wav
python3 - <<'PY'
import numpy as np, subprocess, wave
w = wave.open("butun.wav"); n = w.getnframes(); data = w.readframes(n); w.close()
a = np.frombuffer(data, dtype="<i2").reshape(-1, 2)
bounds = [0, 90001, 90001+70003, 264715]
for i in range(3):
    seg = a[bounds[i]:bounds[i+1]]
    out = wave.open(f"parca{i+1}.wav", "wb"); out.setnchannels(2); out.setsampwidth(2); out.setframerate(44100)
    out.writeframes(seg.tobytes()); out.close()
PY
for i in 1 2 3; do
  ffmpeg -loglevel error -y -i parca$i.wav -c:a flac parca$i.flac
  ffmpeg -loglevel error -y -i parca$i.wav -c:a libmp3lame -b:a 192k parca$i.mp3
  ffmpeg -loglevel error -y -i parca$i.wav -c:a aac -b:a 160k parca$i.m4a
  ffmpeg -loglevel error -y -i parca$i.wav -c:a libvorbis -q:a 4 parca$i.ogg
  ffmpeg -loglevel error -y -i parca$i.wav -c:a alac parca$i-alac.m4a
done
ls -la
