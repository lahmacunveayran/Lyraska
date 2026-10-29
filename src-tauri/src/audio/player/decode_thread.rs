//! Çözme iş parçacığı: şarkıyı çözer, aygıtın biçimine çevirir ve halka tamponu dolu tutar.
//! Şarkı bitince sıradaki şarkıya boşluksuz geçer ([`super::next_track`]); görseller için
//! dalga biçimi dokunuşunu da yazar.

use std::sync::atomic::Ordering;
use std::sync::Arc;

use rtrb::Producer;

use super::session::{SharedState, DECODE_IDLE, PREFILL_SECONDS};
use super::{attach_next, open_next};
use crate::analysis::spectrogram::Spectrogram;
use crate::audio::decode::Decoder;
use crate::audio::output::OutputSpec;
use crate::audio::resample::Converter;
use crate::audio::waveform::Decimator;
use crate::audio::Sample;

/// Çözme iş parçacığı: dosyayı çözer ve halka tamponu dolu tutar.
///
/// Tampon doluysa kısa aralıklarla bekler. Halka tampona her zaman tam kareler
/// yazılır; böylece çıkış tarafı kanalları hiçbir zaman karıştırmaz.
pub(super) fn decode_loop(
    decoder: Decoder,
    converter: Converter,
    spec: OutputSpec,
    mut producer: Producer<Sample>,
    shared: &SharedState,
    analysis: Option<Arc<Spectrogram>>,
) {
    let channels = spec.channels;
    let levels = &shared.controls.levels;
    let prefill_target = ((f64::from(spec.sample_rate) * PREFILL_SECONDS) as usize * channels)
        .min(producer.buffer().capacity() / 2);
    let mut pending: Vec<Sample> = Vec::new();
    let mut pos = 0;
    let mut pushed = 0usize;
    let mut finished = false;
    let mut decoder = decoder;
    let mut converter = converter;
    // Dönüştürücünün ilk çıkış karesinin akıştaki yeri: aynı dönüştürücüden geçen sıradaki
    // şarkının başladığı kare buradan hesaplanır.
    let mut converter_origin = 0u64;
    // Hızı ya da kanal sayısı farklı sıradaki şarkı: önceki şarkının kuyruğu yazılınca
    // kendi dönüştürücüsüyle başlar.
    let mut waiting: Option<Decoder> = None;
    // Görseller için dalga biçimi dokunuşu: halka tampona giden akışın 44,1 kHz kopyası.
    // Akış aygıt hızında ve tek parça olduğu için her örneğin yeri, ses çıkışının "duyulan"
    // sayacıyla aynı karedir (boşluksuz geçiş dahil).
    shared.waveform.start(spec.sample_rate);
    let mut decimator = Decimator::new(spec.sample_rate);
    let mut tap: Vec<[f32; 2]> = Vec::new();

    loop {
        if shared.stop.load(Ordering::Acquire) {
            return;
        }
        // İlk şarkının ölçümü gelince hemen ses yoluna yazılır: ses çıkışı ilk sesi bunu
        // bekleyerek başlatır (sonraki şarkılarınkini oynatıcı yazar).
        if !levels.is_final(0) {
            if let Some(a) = analysis.as_ref() {
                if let Some(measured) = a.measured_loudness() {
                    levels.set_loudness(0, measured);
                } else if !levels.is_known(0) {
                    // Hızlı ölçümün ilk saniyelerden tahmini: −10 LUFS varsayımından iyidir;
                    // kesin ölçüm gelince kazanç yumuşakça düzelir (SES-04).
                    if let Some(early) = a.early_loudness() {
                        levels.set_loudness_estimate(0, early);
                    }
                }
            }
        }
        if pos == pending.len() {
            if finished {
                // Önceki şarkının son örneği tampona yazıldı. Hızı ya da kanalı farklı
                // sıradaki şarkı kendi dönüştürücüsüyle hemen ardından gelir.
                let Some(next) = waiting.take() else { break };
                let first = (pushed / channels) as u64;
                let info = next.info().clone();
                let Ok(next_converter) = Converter::new(
                    info.sample_rate,
                    info.channels,
                    spec.sample_rate,
                    spec.channels,
                ) else {
                    break;
                };
                attach_next(shared, spec, info, first);
                decoder = next;
                converter = next_converter;
                converter_origin = first;
                finished = false;
                continue;
            }
            // Çözülen dilim aygıt biçimine çevrilir; şarkı bitince dönüştürücünün
            // içinde kalanlar da alınır.
            let converted = match decoder.next_chunk() {
                Ok(Some(chunk)) => converter.process(chunk),
                Ok(None) => match open_next(shared, spec) {
                    // Boşluksuz geçiş, aynı hız ve kanal sayısı: sıradaki şarkı aynı
                    // dönüştürücüden geçer, iki şarkı tek bir akış gibi dönüştürülür ve
                    // sınırda dalga kopmaz (#54). Önceki şarkının kuyruğu dönüştürücüde
                    // bekler; yenisi tam onun bittiği karede başlar.
                    Some(next)
                        if converter.continues(next.info().sample_rate, next.info().channels) =>
                    {
                        let first = converter_origin + converter.input_end_frame();
                        attach_next(shared, spec, next.info().clone(), first);
                        decoder = next;
                        continue;
                    }
                    next => {
                        waiting = next;
                        finished = true;
                        converter.finish()
                    }
                },
                Err(error) => {
                    shared.fail(error.to_string());
                    break;
                }
            };
            match converted {
                Ok(samples) => {
                    pending.clear();
                    pending.extend_from_slice(samples);
                    pos = 0;
                }
                Err(error) => {
                    shared.fail(error.to_string());
                    break;
                }
            }
            continue;
        }

        let free = producer.slots() / channels * channels;
        let n = free.min(pending.len() - pos);
        if n == 0 {
            // Tampon dolu: çalmaya başlamak için kesinlikle yeterli.
            shared.prefilled.store(true, Ordering::Release);
            std::thread::sleep(DECODE_IDLE);
            continue;
        }
        // Önce dokunuşa: dokunuş halka tampondan hiçbir zaman geride kalmaz.
        decimator.process(&pending[pos..pos + n], channels, &mut tap);
        shared.waveform.write(&tap);
        if let Ok(chunk) = producer.write_chunk_uninit(n) {
            chunk.fill_from_iter(pending[pos..pos + n].iter().copied());
        }
        pos += n;
        pushed += n;
        if pushed >= prefill_target {
            shared.prefilled.store(true, Ordering::Release);
        }
    }
    // Süzgeçlerde bekleyen son örnekler (sonrası sessizlik).
    decimator.finish(&mut tap);
    shared.waveform.write(&tap);
    shared.prefilled.store(true, Ordering::Release);
    shared.decode_done.store(true, Ordering::Release);
}
