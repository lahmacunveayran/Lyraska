#!/bin/bash
export CARGO_TARGET_DIR=/home/user/denetim-bagimsiz/target
cd /home/user/denetim-bagimsiz/calisma/B-SUR/kopya/src-tauri
B=/home/user/denetim-bagimsiz/calisma/B-SUR
rm -rf $B/mutants-gapless $B/mutants-scan
s=$(date +%s)
cargo mutants --in-place -f src/audio/gapless.rs --shard 0/2 --timeout 300 --build-timeout 900 -o $B/mutants-gapless -- --lib --test formats -- gapless decode bosluksuz her_bicim > $B/mutants-gapless.log 2>&1
echo "gapless rc=$? süre=$(( $(date +%s) - s ))s" >> $B/mutants-gapless.log
s=$(date +%s)
cargo mutants --in-place -f src/library/scan.rs --shard 0/2 --timeout 300 --build-timeout 900 -o $B/mutants-scan -- --lib -- library::scan library::service > $B/mutants-scan.log 2>&1
echo "scan rc=$? süre=$(( $(date +%s) - s ))s" >> $B/mutants-scan.log
