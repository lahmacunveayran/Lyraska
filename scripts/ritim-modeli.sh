#!/usr/bin/env bash
# Ritim modelini (Beat This small0; Foscarin, Schlüter, Widmer, ISMIR 2024; kod ve ağırlıklar MIT) kurulum
# dosyası için hazırlar: ağırlıkları yazarların sunucusundan indirir, SHA-256'sını denetler, sürümleri ve
# karmaları sabit Python paketleriyle ONNX'e çevirir ve çıkan dosyanın programın beklediği dosya olduğunu
# (src-tauri/src/analysis/rhythm_net.rs MODEL_SHA256) denetler. Model depoya girmez.
#
# Kullanım (depo kökünden, Linux, Python 3.12; başka yorumlayıcı PYTHON ile): scripts/ritim-modeli.sh <çıktı.onnx>
set -euo pipefail

out=${1:?çıktı dosyası gerekli}
ckpt_url="https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/small0.ckpt"
ckpt_sha256="6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b"
onnx_sha256=$(sed -n 's/^pub const MODEL_SHA256: &str = "\([0-9a-f]\{64\}\)";$/\1/p' \
  src-tauri/src/analysis/rhythm_net.rs)
[ -n "$onnx_sha256" ] || { echo "rhythm_net.rs'te MODEL_SHA256 bulunamadı" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl -sSfL --retry 4 --retry-all-errors -o "$work/small0.ckpt" "$ckpt_url"
echo "$ckpt_sha256  $work/small0.ckpt" | sha256sum -c -

"${PYTHON:-python3.12}" -m venv "$work/venv"
"$work/venv/bin/pip" install -q --require-hashes --no-deps \
  --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple \
  -r src-tauri/ritim-modeli/gereksinim.txt
"$work/venv/bin/python" -I src-tauri/ritim-modeli/onnx_cevir.py "$work/small0.ckpt" "$work/model.onnx"

echo "$onnx_sha256  $work/model.onnx" | sha256sum -c -
mkdir -p "$(dirname "$out")"
cp "$work/model.onnx" "$out"
echo "Ritim modeli hazır: $out ($onnx_sha256)"
