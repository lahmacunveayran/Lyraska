#!/bin/sh
# wasi-sdk 30.0'ı (Linux x86_64) indirir, SHA-256'sını denetler ve verilen klasöre açar.
# Klasörde zaten açılmışsa bir şey yapmaz (CI önbelleği). build.sh bu sürümle derler.
#   sh src-tauri/hlsl/fetch-wasi-sdk.sh ~/wasi-sdk
#   WASI_SDK_PATH=~/wasi-sdk/wasi-sdk-30.0-x86_64-linux sh src-tauri/hlsl/build.sh
# Lisans: Apache-2.0 WITH LLVM-exception (LLVM, wasi-libc, libc++); yalnızca derleme aracıdır,
# programa giren kısım wasi-libc ve libc++'tır (docs/LISANSLAR.md).
set -eu

VERSION=30.0
NAME="wasi-sdk-$VERSION-x86_64-linux"
URL="https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-30/$NAME.tar.gz"
SHA256=0507679dff16814b74516cd969a9b16d2ced1347388024bc7966264648c78bfb

DIR=${1:?"hedef klasör gerekli"}
if [ -x "$DIR/$NAME/bin/clang++" ]; then
  echo "$DIR/$NAME zaten var"
  exit 0
fi
mkdir -p "$DIR"
ARCHIVE="$DIR/$NAME.tar.gz"
curl -sSLf --retry 3 -o "$ARCHIVE" "$URL"
echo "$SHA256  $ARCHIVE" | sha256sum -c -
tar -xzf "$ARCHIVE" -C "$DIR"
rm -f "$ARCHIVE"
echo "$DIR/$NAME hazır"
