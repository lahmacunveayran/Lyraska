#!/bin/bash
# Kullanım: mut.sh <id> <gate komutu> <<'P' ... (değişikliği yapan bash) P
K=/tmp/claude-0/-home-user-Lyraska/1cce850b-acae-5ab5-93b5-aa4dd064f1d6/scratchpad/bagimsiz/kapi
R=$K/repo
id="$1"; gate="$2"
cd "$R" || exit 9
git checkout -q -- . ; git clean -fdq -e node_modules -e dist
bash -e /dev/stdin || { echo "[$id] MUTASYON UYGULANAMADI"; exit 8; }
out=$(bash -c "$gate" 2>&1); code=$?
echo "[$id] gate='$gate' exit=$code"
echo "$out" | tail -${TAILN:-6} | sed 's/^/    /'
echo "$id|$gate|$code" >> $K/mut-results.txt
git checkout -q -- . ; git clean -fdq -e node_modules -e dist
