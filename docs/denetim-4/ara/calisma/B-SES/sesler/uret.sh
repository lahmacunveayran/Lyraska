#!/bin/bash
# Sentetik test sesleri: farklı biçim, hız, kanal, bit derinliği. Kaynak: 440 Hz + 3 kHz karışık sinüs,
# genlik 0.5, uzunluk ms'ye hizalanmayan örnek sayısı (ör. 44100 Hz'te 123457 örnek = 2799.47 ms).
set -e
gen() { # rate ch frames
  local rate=$1 ch=$2 frames=$3
  local dur=$(python3 -c "print($frames/$rate)")
  ffmpeg -loglevel error -y -f lavfi -i "aevalsrc=0.4*sin(2*PI*(200*t+150*t*t))+0.1*sin(2*PI*3100*t)|0.4*sin(2*PI*(230*t+140*t*t)+1)+0.1*sin(2*PI*2900*t):s=$rate:c=stereo" -ac $ch -t $dur -frames:a $frames -c:a pcm_s24le "kaynak-${rate}-${ch}.wav"
}
for spec in "44100 2 123457" "48000 2 134371" "22050 1 61741" "44100 1 123457" "48000 1 134371"; do
  set -- $spec; gen $1 $2 $3
  base="kaynak-$1-$2.wav"; r=$1; c=$2
  ffmpeg -loglevel error -y -i $base -c:a pcm_s16le "s16-$r-$c.wav"
  ffmpeg -loglevel error -y -i $base -c:a pcm_s24le "s24-$r-$c.wav"
  ffmpeg -loglevel error -y -i $base -c:a flac "flac-$r-$c.flac"
  ffmpeg -loglevel error -y -i $base -c:a flac -sample_fmt s16 "flac16-$r-$c.flac"
  ffmpeg -loglevel error -y -i $base -c:a libmp3lame -b:a 192k "mp3cbr-$r-$c.mp3"
  ffmpeg -loglevel error -y -i $base -c:a libmp3lame -q:a 2 "mp3vbr-$r-$c.mp3"
  ffmpeg -loglevel error -y -i $base -c:a libmp3lame -b:a 128k -write_xing 0 "mp3noxing-$r-$c.mp3"
  ffmpeg -loglevel error -y -i $base -c:a aac -b:a 160k "aac-$r-$c.m4a"
  ffmpeg -loglevel error -y -i $base -c:a aac -b:a 160k "aac-$r-$c.mp4"
  ffmpeg -loglevel error -y -i $base -c:a aac -b:a 160k -f adts "aac-$r-$c.aac"
  ffmpeg -loglevel error -y -i $base -c:a libvorbis -q:a 4 "vorbis-$r-$c.ogg"
  ffmpeg -loglevel error -y -i $base -c:a alac "alac-$r-$c.m4a"
  ffmpeg -loglevel error -y -i $base -c:a pcm_s16be "aiff-$r-$c.aiff"
done
# Opus (sadece 48k çıkış; Lyraska listesinde yok ama ogg uzantısıyla denenir)
ffmpeg -loglevel error -y -i kaynak-48000-2.wav -c:a libopus -b:a 128k "opus-48000-2.ogg" || true
ls -la
