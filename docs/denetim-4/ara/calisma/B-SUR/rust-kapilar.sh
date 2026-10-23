#!/bin/bash
export CARGO_TARGET_DIR=/home/user/denetim-bagimsiz/target
cd /home/user/denetim-bagimsiz/calisma/B-SUR/kopya/src-tauri
OUT=/home/user/denetim-bagimsiz/calisma/B-SUR/kanit/rust-kapilar.log
: > $OUT
run() { echo "=== $* ===" >> $OUT; s=$(date +%s); "$@" >> $OUT 2>&1; echo "=== rc=$? süre=$(( $(date +%s) - s ))s ===" >> $OUT; }
run cargo fmt --check
run cargo deny check licenses bans sources
run cargo deny check advisories
run cargo clippy --all-targets --locked -- -D warnings
rm -f ../src/lib/bindings/*.ts
run cargo test --locked
echo "=== bindings farkı (kaynakla) ===" >> $OUT
diff -r /home/user/denetim-bagimsiz/kaynak/src/lib/bindings ../src/lib/bindings >> $OUT 2>&1; echo "=== diff rc=$? ===" >> $OUT
echo BITTI >> $OUT
