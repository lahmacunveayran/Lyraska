#!/bin/sh
# wasi-sdk 30.0'ı (Linux x86_64) indirir, SHA-256'sını denetler ve verilen klasöre açar.
#   sh src-tauri/hlsl/fetch-wasi-sdk.sh ~/wasi-sdk
#   WASI_SDK_PATH=~/wasi-sdk/wasi-sdk-30.0-x86_64-linux sh src-tauri/hlsl/build.sh
# İndirilen arşiv klasörde kalır (CI yalnızca arşivi önbellekler). Arşiv HER çalıştırmada,
# açılmadan önce SHA-256 ile denetlenir ve araç takımı her seferinde arşivden baştan açılır:
# önbellekten gelen (ya da klasörde önceden açılmış) dosyalara güvenilmez. Denetimden geçmeyen
# arşiv silinir ve bir kez yeniden indirilir; yine geçmezse betik durur.
# Lisans: Apache-2.0 WITH LLVM-exception (LLVM, wasi-libc, libc++); yalnızca derleme aracıdır,
# programa giren kısım wasi-libc ve libc++'tır (docs/LISANSLAR.md).
set -eu

VERSION=30.0
NAME="wasi-sdk-$VERSION-x86_64-linux"
URL="https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-30/$NAME.tar.gz"
SHA256=0507679dff16814b74516cd969a9b16d2ced1347388024bc7966264648c78bfb

DIR=${1:?"hedef klasör gerekli"}
mkdir -p "$DIR"
ARCHIVE="$DIR/$NAME.tar.gz"
# Önceden açılmış araç takımı kullanılmaz: denetlenen arşivden baştan açılır.
rm -rf "${DIR:?}/$NAME"

verified() {
  echo "$SHA256  $ARCHIVE" | sha256sum -c --status -
}

if [ -f "$ARCHIVE" ] && ! verified; then
  echo "$ARCHIVE SHA-256 denetiminden geçmedi; silinip yeniden indiriliyor"
  rm -f "$ARCHIVE"
fi
if [ ! -f "$ARCHIVE" ]; then
  curl -sSLf --retry 3 -o "$ARCHIVE" "$URL"
fi
if ! verified; then
  echo "$ARCHIVE SHA-256 denetiminden geçmedi (beklenen $SHA256)" >&2
  rm -f "$ARCHIVE"
  exit 1
fi
tar -xzf "$ARCHIVE" -C "$DIR"
echo "$DIR/$NAME hazır (arşiv SHA-256 doğrulandı)"
