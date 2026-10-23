#!/bin/sh
# MilkDrop gölgelendirici çeviricisini (projectM hlslparser, MIT) WebAssembly'ye derler:
# src-tauri/hlsl/hlslparser.wasm. Çıktı depoya konur; CI aynı araç takımıyla yeniden derleyip
# baytı baytına aynı olduğunu denetler (.github/workflows/ci.yml, "HLSL çevirici").
#
# Araç takımı: wasi-sdk 30.0 (clang 21, wasi-libc, libc++). Başka sürüm farklı bayt üretir.
#   WASI_SDK_PATH=/yol/wasi-sdk-30.0-x86_64-linux sh src-tauri/hlsl/build.sh
# İndirme ve SHA-256: src-tauri/hlsl/wasi-sdk.sha256 (CI aynı dosyayı kullanır).
#
# Seçimler:
# - wasm32-wasip1 + "reactor": main yok; `_initialize` C++ genel nesnelerini kurar. İçe aktarılan
#   WASI işlevleri Rust tarafında hepsi "desteklenmiyor" döndüren saplamalardır (dosya, saat yok).
# - İstisna ve RTTI kapalı (kaynak kullanmıyor), boyut için -Oz, ad bölümü atılır.
# - Yığın belleğin başında (--stack-first): taşan yığın veriyi ezmez, tuzağa düşer.
# - Bellek en çok 64 MB (Rust ayrıca sınırlar).
set -eu

if [ -z "${WASI_SDK_PATH:-}" ]; then
  echo "WASI_SDK_PATH tanımlı değil (wasi-sdk 30.0 klasörü)" >&2
  exit 1
fi

HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-"$HERE/hlslparser.wasm"}
cd "$HERE/.."

# Dosya yolları göreli verilir ve yol öneki atılır: çıktı klasörün yerine bağlı olmasın.
"$WASI_SDK_PATH/bin/clang++" \
  --target=wasm32-wasip1 \
  --sysroot="$WASI_SDK_PATH/share/wasi-sysroot" \
  -std=c++14 -Oz -fno-rtti -w \
  -ffile-prefix-map="$PWD"=. \
  -mexec-model=reactor \
  -DLYRASKA_FAST_NUMBERS \
  -Ivendor/hlslparser/src \
  vendor/hlslparser/src/CodeWriter.cpp \
  vendor/hlslparser/src/Engine.cpp \
  vendor/hlslparser/src/GLSLGenerator.cpp \
  vendor/hlslparser/src/HLSLParser.cpp \
  vendor/hlslparser/src/HLSLTokenizer.cpp \
  vendor/hlslparser/src/HLSLTree.cpp \
  hlsl/shim.cpp \
  -Wl,--strip-all \
  -Wl,--stack-first \
  -Wl,-z,stack-size=1048576 \
  -Wl,--max-memory=67108864 \
  -o "$OUT"

echo "$OUT: $(wc -c < "$OUT") bayt"
