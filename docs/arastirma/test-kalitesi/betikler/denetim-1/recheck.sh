S="${CALISMA:-./calisma}"
export CARGO_BUILD_JOBS=4 RUST_TEST_THREADS=2
cd $S/m2/src-tauri
RE=$(cat $S/tools/recheck.re)
cargo mutants --in-place --no-shuffle -f src/audio/render.rs -f src/audio/normalize.rs -f src/analysis/beats.rs -f src/analysis/key.rs -f src/analysis/structure.rs -f src/audio/loudness.rs -f src/audio/limiter.rs -f src/audio/crossfeed.rs -f src/audio/player/controls.rs \
  -F "$RE" --timeout 900 --build-timeout 900 \
  --cargo-arg=--config=profile.test.package.lyraska.debug=0 '--cargo-arg=--config=profile.test.package.lyraska.strip="debuginfo"' \
  --cargo-arg=--lib -o $S/mut/recheck > $S/mut/recheck.log 2>&1
echo "bitti $?"; tail -25 $S/mut/recheck.log
