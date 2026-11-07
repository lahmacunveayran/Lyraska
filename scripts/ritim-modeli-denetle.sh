#!/usr/bin/env bash
# Ritim modeli dosyası programın beklediği dosya mı (src-tauri/src/analysis/rhythm_net.rs MODEL_SHA256)?
# Kurulum dosyası derlenmeden önce (indirilen) ve sonra (kaynak olarak kopyalanan) denetlenir.
# Kullanım (depo kökünden): scripts/ritim-modeli-denetle.sh <model.onnx>
set -euo pipefail
file=${1:?model dosyası gerekli}
expected=$(sed -n 's/^pub const MODEL_SHA256: &str = "\([0-9a-f]\{64\}\)";$/\1/p' \
  src-tauri/src/analysis/rhythm_net.rs)
[ -n "$expected" ] || { echo "rhythm_net.rs'te MODEL_SHA256 bulunamadı" >&2; exit 1; }
[ -f "$file" ] || { echo "Ritim modeli yok: $file" >&2; exit 1; }
actual=$(sha256sum "$file" | cut -d' ' -f1)
if [ "$actual" != "$expected" ]; then
  echo "Ritim modelinin özeti beklenen değil: $actual (beklenen $expected)" >&2
  exit 1
fi
echo "Ritim modeli doğru: $file"
