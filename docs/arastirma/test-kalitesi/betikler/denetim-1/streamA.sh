T=${CALISMA:-./calisma}/tools
$T/run_mut.sh m1 audio/limiter.rs 7 audio::limiter audio::normalize audio::render
$T/run_mut.sh m1 audio/loudness.rs 9 audio::loudness audio::normalize audio::render analysis::spectrogram audio::abx
$T/run_mut.sh m1 audio/normalize.rs 8 audio::normalize audio::render audio::eq audio::bass audio::peq
$T/run_mut.sh m1 audio/eq.rs 30 audio::eq audio::bass audio::render settings
$T/run_mut.sh m1 audio/biquad.rs 57 audio::biquad audio::eq audio::peq audio::bass audio::punch
