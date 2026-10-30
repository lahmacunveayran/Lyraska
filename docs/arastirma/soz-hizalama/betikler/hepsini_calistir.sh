#!/bin/sh
# Söz hizalama denemesini baştan kurar ve çalıştırır (ikinci denetçi için).
# KOK: bu betiğin bir üst klasörü. Ses dosyaları yalnızca KOK/dl ve KOK/cache altında kalır; depoya girmez.
# Ağ: yalnızca GitHub (git clone + sürüm dosyaları) ve PyPI. Disk: ~6 GB.
set -e
KOK="$(cd "$(dirname "$0")/.." && pwd)"
cd "$KOK"
B=https://github.com/k2-fsa/sherpa-onnx/releases/download

# 1. Veri setleri
mkdir -p dl models cache
[ -d dl/jamendolyrics ] || git clone --depth 1 https://github.com/f90/jamendolyrics dl/jamendolyrics
[ -d dl/turkish-makam-lyrics-2-audio-test-data ] || \
  git clone --depth 1 https://github.com/georgid/turkish-makam-lyrics-2-audio-test-data dl/turkish-makam-lyrics-2-audio-test-data

# 2. Modeller (sherpa-onnx sürüm dosyaları; karmalar KOK/model-sha256.txt)
cd models
for a in asr-models/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05.tar.bz2 \
         asr-models/sherpa-onnx-whisper-base.tar.bz2 \
         source-separation-models/sherpa-onnx-spleeter-2stems-fp16.tar.bz2 \
         tts-models/vits-piper-tr_TR-dfki-medium.tar.bz2 tts-models/vits-piper-tr_TR-fahrettin-medium.tar.bz2; do
  d=$(basename "$a" .tar.bz2)
  [ -d "$d" ] || { curl -sSL -O "$B/$a"; tar xjf "$(basename "$a")"; rm "$(basename "$a")"; }
done
[ -f UVR-MDX-NET-Voc_FT.onnx ] || curl -sSL -O "$B/source-separation-models/UVR-MDX-NET-Voc_FT.onnx"
cd "$KOK"
sha256sum -c model-sha256.txt --quiet --ignore-missing || echo "UYARI: model karması farklı"

# 3. Python ortamları (ölçüm: sherpa-onnx 2.0.1; konuşma sentezi: 1.12.40, çünkü 2.x Piper'ın espeak önişlemesini içermiyor)
[ -d venv ] || { python3 -m venv venv; ./venv/bin/pip install -q onnxruntime==1.31.1 onnx==1.23.2 numpy==2.5.4 scipy soundfile sherpa-onnx==2.0.1 tiktoken numba; }
[ -d venv-tts ] || { python3 -m venv venv-tts; ./venv-tts/bin/pip install -q sherpa-onnx==1.12.40 numpy scipy soundfile pyworld mido "setuptools<81"; }
mkdir -p whl && [ -d whl/openai_whisper-20250625 ] || { ./venv/bin/pip download -q --no-deps openai-whisper==20250625 -d whl; tar xzf whl/openai_whisper-20250625.tar.gz -C whl; }
command -v fluidsynth >/dev/null || apt-get install -y -q fluidsynth fluid-soundfont-gm

# 4. Türkçe vekil set (tohumlar: gelistirme 0–5, dogrulama 100–105, son_sinama 200–211)
cd betikler
[ -f ../cache/vekil/gelistirme/vekil_0005.wav ] || ../venv-tts/bin/python -W ignore vekil_uret.py gelistirme 0 6
[ -f ../cache/vekil/dogrulama/vekil_0105.wav ] || ../venv-tts/bin/python -W ignore vekil_uret.py dogrulama 100 6
[ -f ../cache/vekil/son_sinama/vekil_0211.wav ] || ../venv-tts/bin/python -W ignore vekil_uret.py son_sinama 200 12

# 5. Ölçümler
Y="ctc:karisim ctc:spleeter ctc:karisim+spleeter whisper:base:spleeter esit vad"
for b in gelistirme dogrulama son_sinama; do
  for v in jamendo makam vekil; do ../venv/bin/python olc.py $v $b $Y; done
done
../venv/bin/python bozuk.py jamendo gelistirme karisim yok,0.5,1,2,4
../venv/bin/python tablo.py gelistirme dogrulama son_sinama
