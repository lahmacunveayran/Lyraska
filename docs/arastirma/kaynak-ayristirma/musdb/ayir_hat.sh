#!/bin/bash
# MUSDB18-HQ test seti, boru hattıyla: şarkı N ayrılırken N−1 ölçülür (museval) ve N+1 indirilir. Komutlar
# htdemucs_set.sh ile aynı (aynı çıkarma, aynı Demucs çağrısı, aynı sarki_olc.py): SDR değerleri aynı kalır; yalnızca
# aşamalar üst üste biner. Sıralı akışta şarkı başına ~350 sn'nin ~230'unda makine neredeyse boştaydı: museval tek
# çekirdek (~140 sn), indirme ağ bekler (~90 sn); Demucs 4 çekirdeğin ~3'ünü kullanır.
# "ayirma_sn" burada eşzamanlı ölçümün yükü altında ölçülür (sıralı akıştakiyle karşılaştırılmaz).
# Kullanım: CALISMA=<klasör> ayir_hat.sh [model]   (kaldığı yerden sürer; klasör düzeni htdemucs_set.sh ile aynı)
S="${CALISMA:-$PWD}"
M=$S/musdb; URL="https://zenodo.org/api/records/3338373/files/musdb18hq.zip/content"
MODEL=${1:-htdemucs}
mkdir -p "$M/sonuc/$MODEL" "$M/est/$MODEL"
mapfile -t SONGS < <(grep " test/.*/mixture.wav$" "$S/musdb-liste.txt" | sed 's#^[0-9]* test/##; s#/mixture.wav$##')

fetch() {
  local T=$1
  [ -s "$M/test/$T/vocals.wav" ] && return 0
  python3 -I "$S/musdb-tools/uzak_zip.py" cikar "$URL" "test/$T/" "$M/test/$T" > /dev/null || echo "indirme hatası: $T"
}

score() {
  local T=$1 secs=$2
  local r dur
  r=$("$S/venv-sep/bin/python" -I "$S/olcum/sarki_olc.py" "$M/test/$T" "$M/est/$MODEL/$T" 2>/dev/null | tail -1)
  dur=$("$S/venv-sep/bin/python" -I -c "import soundfile as sf,sys;print(sf.info(sys.argv[1]).duration)" "$M/test/$T/mixture.wav")
  if [ -n "$r" ]; then
    python3 -I -c 'import json,sys; print(json.dumps({"sarki": sys.argv[1], "model": sys.argv[2], "ayirma_sn": int(sys.argv[3]), "sure_sn": float(sys.argv[4]), "olcum": json.loads(sys.argv[5]), "es_zamanli": True}, ensure_ascii=False))' \
      "$T" "$MODEL" "$secs" "$dur" "$r" > "$M/sonuc/$MODEL/$T.json"
    echo "bitti: $T (ayırma $secs sn)"
  else
    echo "ölçüm hatası: $T"
  fi
  rm -rf "$M/est/$MODEL/$T" "$M/test/$T"
}

todo=()
for T in "${SONGS[@]}"; do [ -s "$M/sonuc/$MODEL/$T.json" ] || todo+=("$T"); done
[ ${#todo[@]} -eq 0 ] && exit 0
fetch "${todo[0]}"
scoring=""
for i in "${!todo[@]}"; do
  T=${todo[$i]}
  next=${todo[$((i + 1))]:-}
  fetching=""
  if [ -n "$next" ]; then fetch "$next" & fetching=$!; fi
  if [ -s "$M/test/$T/vocals.wav" ]; then
    t0=$(date +%s)
    if "$S/venv-sep/bin/python" -I -m demucs -n "$MODEL" -j 1 --out "$M/est" "$M/test/$T/mixture.wav" > /dev/null 2>&1; then
      secs=$(( $(date +%s) - t0 ))
      rm -rf "$M/est/$MODEL/$T"
      mv "$M/est/$MODEL/mixture" "$M/est/$MODEL/$T"
      # Önceki şarkının ölçümü bitmeden yenisi başlamaz (en çok bir museval: ~6 GB bellek).
      [ -n "$scoring" ] && wait "$scoring"
      score "$T" "$secs" & scoring=$!
    else
      echo "ayırma hatası: $T"
    fi
  fi
  [ -n "$fetching" ] && wait "$fetching"
done
[ -n "$scoring" ] && wait "$scoring"
