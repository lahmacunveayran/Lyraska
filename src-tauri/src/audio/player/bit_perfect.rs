//! Bit-perfect: aygıtı özel modda, şarkının kendi hızında açma kararı (aygıtın biçimi şarkıdan
//! dar olamaz), açılamazsa nedeni, ekrandaki sinyal yolu ve çalma seçeneklerinin
//! (eşitleme, bit-perfect) uygulanması.

use super::{PlaybackState, Player, SignalPath};
use crate::audio::decode::{Decoder, TrackInfo};
use crate::audio::output::{self, DeviceInfo, OutputMode, OutputSpec};
use crate::audio::{AudioError, PlaybackOptions};

/// Oturumun çıkış modu: `bit_perfect` istenmişse aygıtı özel modda, şarkının kendi hızında
/// açmayı dener. Aygıt bu biçimi desteklemiyorsa ya da şarkıdan dar bit derinliğindeyse
/// paylaşımlı mod ve nedeni döner.
pub(super) fn output_mode(
    bit_perfect: bool,
    decoder: &Decoder,
    info: &TrackInfo,
    channels: usize,
) -> (OutputMode, Option<String>) {
    if bit_perfect {
        match output::exclusive_format(info.sample_rate, channels) {
            // Aygıtın biçimi şarkıdan dar olamaz: 24 bit şarkı 16 bit aygıtta bit bit aynı
            // çıkmaz (yuvarlanır); o zaman "bit-perfect" denmez, paylaşımlı yol kullanılır (#79).
            Ok(format) => match decoder.source_bits() {
                Some(bits) if u32::from(format.valid_bits) < bits => (
                    OutputMode::Shared,
                    Some(format!(
                        "şarkı {bits} bit, aygıt özel modda en çok {} bit kabul ediyor; \
                         bit-perfect yerine paylaşımlı yol kullanıldı",
                        format.valid_bits
                    )),
                ),
                _ => (OutputMode::Exclusive(format), None),
            },
            Err(reason) => (OutputMode::Shared, Some(reason)),
        }
    } else {
        (OutputMode::Shared, None)
    }
}

/// Ekranda gösterilecek sinyal yolu.
pub(super) fn signal_path(
    device: Option<DeviceInfo>,
    info: &TrackInfo,
    spec: OutputSpec,
) -> SignalPath {
    SignalPath {
        device_name: device.map(|d| d.name).unwrap_or_default(),
        sample_rate: spec.sample_rate,
        channels: spec.channels,
        resampled: spec.sample_rate != info.sample_rate,
        normalization_db: None,
        bit_perfect: matches!(spec.mode, OutputMode::Exclusive(_)),
        bit_depth: match spec.mode {
            OutputMode::Exclusive(format) => Some(format.valid_bits),
            OutputMode::Shared => None,
        },
        notice: None,
    }
}

impl Player {
    /// Çalma seçenekleri.
    pub fn playback_options(&self) -> PlaybackOptions {
        PlaybackOptions {
            normalize: self.loudness.enabled(),
            bit_perfect: self.bit_perfect,
        }
    }

    /// Çalma seçeneklerini uygular. Eşitleme değişince çalan şarkıda kazanç yumuşakça
    /// değişir. Bit-perfect değişince aygıt yeniden açılır: çalan şarkı kaldığı yerden
    /// (duraklatılmışsa duraklatılmış olarak) sürer.
    pub fn set_playback_options(&mut self, options: PlaybackOptions) -> Result<(), AudioError> {
        self.loudness.set(options.normalize);
        if options.bit_perfect == self.bit_perfect {
            return Ok(());
        }
        self.bit_perfect = options.bit_perfect;
        let Some(session) = &self.session else {
            return Ok(());
        };
        match session.state() {
            PlaybackState::Playing | PlaybackState::Paused => {
                let (track, position) = session.now_playing();
                let resume = session.state() == PlaybackState::Playing;
                self.restart(&track.path, resume, Some(position))
                    .map(|_| ())
            }
            // Bitmiş ya da hatalı oturum: bir sonraki açılışta uygulanır.
            PlaybackState::Ended | PlaybackState::Error | PlaybackState::Idle => Ok(()),
        }
    }
}
