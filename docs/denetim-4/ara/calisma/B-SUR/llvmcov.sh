#!/bin/bash
export CARGO_TARGET_DIR=/home/user/denetim-bagimsiz/target
cd /home/user/denetim-bagimsiz/calisma/B-SUR/kopya2/src-tauri
OUT=/home/user/denetim-bagimsiz/calisma/B-SUR/kanit/llvm-cov.log
s=$(date +%s)
cargo llvm-cov --locked --lib --test formats --ignore-filename-regex '(tests?/|test_util)' > $OUT 2>&1
echo "rc=$? süre=$(( $(date +%s) - s ))s" >> $OUT
