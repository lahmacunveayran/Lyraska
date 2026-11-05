T=${CALISMA:-./calisma}/tools
$T/run_mut.sh m2 audio/limiter.rs 9 audio::limiter audio::normalize audio::render
$T/run_mut.sh m2 audio/crossfeed.rs 10 audio::crossfeed audio::render settings
$T/run_mut.sh m2 analysis/beats.rs 30 analysis:: director visual_bridge
$T/run_mut.sh m2 audio/loudness.rs 13 audio::loudness audio::normalize audio::render analysis::spectrogram audio::abx
$T/run_mut.sh m2 analysis/key.rs 18 analysis::
$T/run_mut.sh m2 audio/normalize.rs 12 audio::normalize audio::render audio::eq audio::bass audio::peq
$T/run_mut.sh m2 analysis/structure.rs 38 analysis:: director
$T/run_mut.sh m2 audio/eq.rs 40 audio::eq audio::bass audio::render settings
$T/run_mut.sh m2 audio/render.rs 3 audio::
$T/run_mut.sh m2 audio/biquad.rs 80 audio::biquad audio::eq audio::peq audio::bass audio::punch
