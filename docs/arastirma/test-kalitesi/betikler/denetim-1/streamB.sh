T=${CALISMA:-./calisma}/tools
$T/run_mut.sh m2 audio/crossfeed.rs 7 audio::crossfeed audio::render settings
$T/run_mut.sh m2 audio/render.rs 2 audio::
$T/run_mut.sh m2 analysis/beats.rs 21 analysis:: director visual_bridge
$T/run_mut.sh m2 analysis/structure.rs 27 analysis:: director
$T/run_mut.sh m2 analysis/key.rs 13 analysis::
