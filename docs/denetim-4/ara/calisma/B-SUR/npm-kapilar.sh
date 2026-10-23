#!/bin/bash
cd /home/user/denetim-bagimsiz/calisma/B-SUR/kopya
OUT=/home/user/denetim-bagimsiz/calisma/B-SUR/kanit/npm-kapilar.log
: > $OUT
for s in "run build" "run lint" "run typecheck" "run format:check" "test" "run check:commands" "run check:licenses" "run check:audio" "run check:notices"; do
  echo "=== npm $s ===" >> $OUT
  start=$(date +%s)
  npm $s >> $OUT 2>&1
  rc=$?
  echo "=== rc=$rc süre=$(( $(date +%s) - start ))s ===" >> $OUT
done
echo "=== npm audit --omit=dev ===" >> $OUT
npm audit --omit=dev >> $OUT 2>&1; echo "=== rc=$? ===" >> $OUT
echo "=== npm audit (tüm) ===" >> $OUT
npm audit >> $OUT 2>&1; echo "=== rc=$? ===" >> $OUT
echo BITTI >> $OUT
