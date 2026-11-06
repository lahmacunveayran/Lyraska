#!/bin/bash
# MUSDB18-HQ test setinde HTDemucs: şarkı şarkı çıkar → ayır → museval → JSON → sesleri sil. Kaldığı yerden sürer.
S="${CALISMA:-$PWD}"  # çalışma klasörü: musdb-liste.txt, venv-sep/, olcum/sarki_olc.py, musdb-tools/uzak_zip.py
M=$S/musdb; URL="https://zenodo.org/api/records/3338373/files/musdb18hq.zip/content"
MODEL=${1:-htdemucs}
mkdir -p $M/sonuc/$MODEL
grep " test/.*/mixture.wav$" $S/musdb-liste.txt | sed 's#^[0-9]* test/##; s#/mixture.wav$##' | while read -r T; do
  out="$M/sonuc/$MODEL/$T.json"
  [ -s "$out" ] && continue
  if [ ! -s "$M/test/$T/vocals.wav" ]; then
    python3 -I $S/musdb-tools/uzak_zip.py cikar "$URL" "test/$T/" "$M/test/$T" > /dev/null || { echo "indirme hatası: $T"; continue; }
  fi
  t0=$(date +%s)
  $S/venv-sep/bin/python -I -m demucs -n $MODEL -j 1 --out $M/est "$M/test/$T/mixture.wav" > /dev/null 2>&1 || { echo "ayırma hatası: $T"; continue; }
  t1=$(date +%s)
  r=$($S/venv-sep/bin/python -I $S/olcum/sarki_olc.py "$M/test/$T" "$M/est/$MODEL/mixture" 2>/dev/null | tail -1)
  dur=$($S/venv-sep/bin/python -I -c "import soundfile as sf,sys;print(sf.info(sys.argv[1]).duration)" "$M/test/$T/mixture.wav")
  echo "{\"sarki\": \"$T\", \"model\": \"$MODEL\", \"ayirma_sn\": $((t1-t0)), \"sure_sn\": $dur, \"olcum\": $r}" > "$out"
  echo "bitti: $T ($((t1-t0)) sn)"
  rm -rf "$M/est/$MODEL/mixture" "$M/test/$T"
done
