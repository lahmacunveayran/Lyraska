#!/bin/bash
# kullanım: run_mut.sh <mirror> <dosya> <n> <filtreler...>
S="${CALISMA:-./calisma}"
m=$1; f=$2; n=$3; shift 3
name=$(echo $f | tr '/' '_' | sed 's/\.rs$//')
export CARGO_BUILD_JOBS=4 RUST_TEST_THREADS=2
cd $S/$m/src-tauri
echo "=== $f n=$n başla $(date +%T)"
cargo mutants --in-place --no-shuffle -f src/$f --shard 0/$n --sharding round-robin \
  --timeout 300 --build-timeout 900 \
  --cargo-arg=--config=profile.test.package.lyraska.debug=0 '--cargo-arg=--config=profile.test.package.lyraska.strip="debuginfo"' \
  --cargo-arg=--lib -o $S/mut/$name -- -- "$@" > $S/mut/$name.log 2>&1
echo "=== $f bitti $(date +%T) çıkış $?"
tail -3 $S/mut/$name.log
