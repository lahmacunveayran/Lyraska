#!/bin/bash
# Kalite kapılarını sırayla çalıştırır; her biri için süre, çıkış kodu ve özet satırı kapilar.tsv'ye yazılır.
# Kullanım: bash kapilar.sh <depo_kökü> [kapı adları...]
ROOT="$1"; shift
H=docs/denetim-3/hesap/TST
mkdir -p "$H/kapilar"
TSV=$H/kapilar.tsv
[ -f "$TSV" ] || printf 'kapi\tkomut\tsure_sn\tcikis_kodu\tozet\n' > "$TSV"
declare -A CMD=(
 [fmt]="cd src-tauri && cargo fmt --check"
 [clippy]="cd src-tauri && cargo clippy --all-targets -- -D warnings"
 [cargo_test]="cd src-tauri && cargo test"
 [clippy_win]="cd src-tauri && cargo clippy --target x86_64-pc-windows-gnu --all-targets -- -D warnings"
 [npm_test]="npm test"
 [lint]="npm run lint"
 [typecheck]="npm run typecheck"
 [format_check]="npm run format:check"
 [check_commands]="npm run check:commands"
 [check_licenses]="npm run check:licenses"
 [check_audio]="npm run check:audio"
 [check_notices]="npm run check:notices"
 [build]="npm run build"
 [check_scenes]="npm run check:scenes"
 [deny]="cd src-tauri && cargo deny check licenses bans sources"
 [deny_adv]="cd src-tauri && cargo deny check advisories"
)
for g in "$@"; do
  c="${CMD[$g]}"
  log=$H/kapilar/$g.log
  s=$(date +%s.%N)
  (cd "$ROOT" && bash -c "$c") > "$log" 2>&1
  ec=$?
  e=$(date +%s.%N)
  d=$(python3 -c "print(round($e - $s, 1))")
  sum=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -aE 'test result:|Tests +[0-9]|Test Files|^error|^warning:|FAIL|built in|ok$|problems|tamam|uyuşuyor|güncel|bulunmadı|ses dosyası' | tail -2 | tr '\t\n' '  ')
  printf '%s\t%s\t%s\t%s\t%s\n' "$g" "$c" "$d" "$ec" "$sum" >> "$TSV"
done
