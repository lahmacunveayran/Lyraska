#!/bin/bash
export CARGO_TARGET_DIR=/home/user/denetim-bagimsiz/target
cd /home/user/denetim-bagimsiz/calisma/B-SUR/kopya/src-tauri
OUT=/home/user/denetim-bagimsiz/calisma/B-SUR/mutants-gapless
mkdir -p $OUT
s=$(date +%s)
cargo mutants --in-place -f src/audio/gapless.rs --timeout 600 --build-timeout 1200 -o $OUT -- --lib --test formats -- gapless decode bosluksuz her_bicim > $OUT/calisma.log 2>&1
echo "rc=$? süre=$(( $(date +%s) - s ))s" >> $OUT/calisma.log
