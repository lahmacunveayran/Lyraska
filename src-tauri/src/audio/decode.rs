//! Ses dosyası çözme (symphonia).
//!
//! Desteklenen biçimler: MP3, FLAC, WAV, AIFF, OGG Vorbis, AAC ve ALAC (M4A/MP4), CAF, MKV/WebM.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use serde::Serialize;
use symphonia::core::codecs::audio::well_known::CODEC_ID_OPUS;
use symphonia::core::codecs::audio::{AudioCodecParameters, AudioDecoder, AudioDecoderOptions};
use symphonia::core::codecs::registry::CodecRegistry;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::well_known::METADATA_ID_ID3V1;
use symphonia::core::meta::{MetadataOptions, StandardTag, StandardVisualKey, Visual};
use symphonia::core::units::{Time, TimeBase};

use super::gapless::{self, Trim};
use super::{AudioError, Sample};

/// Matroska tabanlı uzantılar (WebM dahil). Symphonia'nın Matroska okuyucusu paket süresini bilmediği
/// için sarmada hedeften sonraki ilk pakete gidiyor (Cues'lu dosyada saniyelerce ileri): bu dosyalarda
/// sarma, dosyayı baştan okuyup hedefin biraz öncesinden çözmeye başlayarak yapılır.
const MATROSKA_EXTENSIONS: &[&str] = &["mka", "mkv", "webm"];

/// Sarmada hedeften bu kadar önce başlayan paketler de çözülür. Opus'ta çözücü durumunun oturması
/// için 80 ms ön yuvarlama (RFC 7845 §4.6) + en uzun Opus paketi (120 ms); öteki kodeklerde paket
/// süresi bilinmediği için bir saniye (FLAC'ın en uzun bloğu ~0,37 sn).
const OPUS_SEEK_MARGIN_SECS: f64 = 0.2;
const SEEK_MARGIN_SECS: f64 = 1.0;

/// Kodlayıcı dolgusu çözücü tarafından atılmayan, MP4 tabanlı uzantılar.
const MP4_EXTENSIONS: &[&str] = &["m4a", "m4b", "mp4"];

/// "Dosya aç" penceresinde gösterilen uzantılar.
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "wave", "aif", "aiff", "aifc", "ogg", "oga", "m4a", "m4b", "mp4", "aac",
    "caf", "mka", "webm", "opus",
];

/// Programın çözebildiği kodekler: Symphonia'nın hepsi ve Opus (libopus; `.opus` ve çoğu `.webm`).
static CODECS: LazyLock<CodecRegistry> = LazyLock::new(|| {
    let mut registry = CodecRegistry::new();
    symphonia::default::register_enabled_codecs(&mut registry);
    registry.register_audio_decoder::<symphonia_adapter_libopus::OpusDecoder>();
    registry
});

/// Kabul edilen örnekleme hızları: telefon kaydından DXD'ye (768 kHz) kadar.
const MIN_SAMPLE_RATE: u32 = 1_000;
const MAX_SAMPLE_RATE: u32 = 768_000;
/// Kabul edilen en çok kanal (çok kanallı kayıtlar 7.1.4 vb.; üstü bozuk başlık sayılır).
const MAX_CHANNELS: usize = 32;

/// Açılan şarkının bilgileri.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export))]
pub struct TrackInfo {
    pub path: PathBuf,
    /// Dosya adı (uzantısız); etiket yoksa başlık olarak kullanılır.
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    /// Kodek adı (ör. "flac", "mp3").
    pub codec: String,
    pub sample_rate: u32,
    pub channels: usize,
    /// Süre (saniye); dosya bildirmiyorsa `None`.
    pub duration_secs: Option<f64>,
}

/// Bir ses dosyasını parça parça 64-bit örneklere çözer.
pub struct Decoder {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    time_base: Option<TimeBase>,
    info: TrackInfo,
    /// Son çözülen paketin örnekleri (kanallar iç içe: L, R, L, R...).
    buffer: Vec<Sample>,
    /// Sarmadan sonra bu saniyeden önceki örnekler atılır (örnek hassasiyetinde sarma).
    /// Çözülen akışın zamanıdır (kodlayıcı dolgusu dahil).
    skip_until: Option<f64>,
    /// Boşluksuz çalma: baştaki ve sondaki kodlayıcı dolgusu (MP4/AAC).
    trim: Option<Trim>,
    /// Kaynağın örnek çözünürlüğü (bit): bit-perfect modda aygıt biçimi bundan dar olamaz.
    /// Kayan noktalı kaynak 32 sayılır; kodek bildirmiyorsa (MP3, Vorbis, AAC) `None`.
    source_bits: Option<u32>,
    /// Sarmanın yedek yolu için: dosya baştan açılır, hedefe kadar paketler çözülmeden geçilir.
    path: PathBuf,
    /// Çözücünün parametreleri (yedek yolda çözücü yeniden kurulur).
    params: AudioCodecParameters,
    /// Bu saniyeden önce başlayan paketler çözülmeden atlanır (yedek yolla sarmada).
    demux_until: Option<f64>,
    is_matroska: bool,
    /// Opus'ta sarma payı daha kısa; Matroska'da baştaki ön boşluğu çözücü atar (aşağıya bkz.).
    opus: bool,
    /// Matroska Opus: sıradaki paketin akıştaki yeri (48 kHz örnek). Matroska'daki paket zamanları
    /// milisaniyeye yuvarlanmış ve okuyucunun verdiği değer gerçeğinden 1,5 ms'ye kadar sapıyor;
    /// Opus paketinin süresi ise ilk baytından kesin bilinir. Dosyanın başından sayılır
    /// (ilk paket ön boşluk kadar eksiden başlar).
    opus_clock: Option<i64>,
}

impl Decoder {
    /// Dosyayı açar, biçimini tanır ve çözücüyü hazırlar.
    pub fn open(path: &Path) -> Result<Self, AudioError> {
        let mut format = probe(path)?;

        let track = format
            .default_track(TrackType::Audio)
            .ok_or(AudioError::NoAudioTrack)?;
        let track_id = track.id;
        let num_frames = track.num_frames;
        let start_ts = track.start_ts.get().max(0) as u64;
        let time_base = track.time_base;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|p| p.audio())
            .ok_or(AudioError::NoAudioTrack)?
            .clone();

        let is_matroska = is_matroska_file(path);
        let opus = params.codec == CODEC_ID_OPUS;
        // Opus'un baştaki ön boşluğu (pre-skip): Ogg'da onu çözücü değil biz atarız (boşluksuz
        // çalma dolgusu gibi, aşağıda `trim`); çözücü yalnızca ilk çözdüğü pakette attığı için
        // sarmadan sonra hesap kayardı. Matroska'da paket zamanları zaten ön boşluk kadar geriden
        // başlar; orada baştan çözerken ön boşluğu çözücü atar, sarmada ön boşluksuz çözücü kurulur.
        let decoder = if opus && !is_matroska {
            make_decoder(&params, false)?
        } else {
            make_decoder(&params, true)?
        };

        let sample_rate = params
            .sample_rate
            .ok_or_else(|| AudioError::Unsupported("örnekleme hızı bilinmiyor".to_owned()))?;
        // Bozuk başlık (ör. WAV'da 0xFFFFFFFF Hz) sınırsız bellek ayırmaya ve programın kapanmasına
        // yol açardı; kütüphanede kalan böyle bir dosya her açılışta yeniden çökertirdi
        // (DENETIM-FAZ0 ISK-02). Gerçek kayıtlar bu aralıkta.
        if !(MIN_SAMPLE_RATE..=MAX_SAMPLE_RATE).contains(&sample_rate) {
            return Err(AudioError::Unsupported(format!(
                "örnekleme hızı geçersiz ({sample_rate} Hz)"
            )));
        }
        let channels = params
            .channels
            .as_ref()
            .map(|c| c.count())
            .filter(|&c| c > 0)
            .ok_or_else(|| AudioError::Unsupported("kanal sayısı bilinmiyor".to_owned()))?;
        if channels > MAX_CHANNELS {
            return Err(AudioError::Unsupported(format!(
                "kanal sayısı desteklenmiyor ({channels})"
            )));
        }

        let source_bits = match params.sample_format {
            Some(symphonia::core::audio::sample::SampleFormat::F32)
            | Some(symphonia::core::audio::sample::SampleFormat::F64) => Some(32),
            _ => params.bits_per_sample,
        };

        // MP3 ve Vorbis'te dolguyu çözücü atar; MP4'te bilgiyi dosyadan biz okuruz.
        let trim = if has_extension(path, MP4_EXTENSIONS) {
            gapless::mp4_trim(path, sample_rate)
        } else if opus && !is_matroska {
            // Ogg Opus: şarkı akışın `başlangıç + ön boşluk` örneğinde başlar (yt-dlp'nin
            // WebM'den kopyaladığı dosyalarda akış sıfırdan değil, ör. 360'tan başlar).
            let pre_skip = opus_pre_skip(&params);
            Some(Trim {
                delay: start_ts + pre_skip,
                frames: num_frames.map(|n| n.saturating_sub(pre_skip)),
            })
        } else {
            None
        };
        let playable_frames = trim
            .and_then(|t| t.frames)
            .or(num_frames)
            .or_else(|| media_duration(format.as_ref()))
            .or_else(|| {
                is_matroska
                    .then(|| matroska_duration(path, track_id))
                    .flatten()
                    .map(|secs| (secs * f64::from(sample_rate)).round() as u64)
            });

        let tags = read_tags(format.as_mut(), is_matroska);
        let file_name = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();

        let info = TrackInfo {
            path: path.to_path_buf(),
            file_name,
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            album_artist: tags.album_artist,
            track_number: tags.track_number,
            disc_number: tags.disc_number,
            codec: decoder.codec_info().short_name.to_owned(),
            sample_rate,
            channels,
            duration_secs: playable_frames.map(|n| n as f64 / f64::from(sample_rate)),
        };

        Ok(Self {
            format,
            decoder,
            track_id,
            time_base,
            info,
            buffer: Vec::new(),
            skip_until: None,
            trim,
            source_bits,
            path: path.to_path_buf(),
            opus_clock: (opus && is_matroska).then(|| -(opus_pre_skip(&params) as i64)),
            params,
            demux_until: None,
            is_matroska,
            opus,
        })
    }

    /// Şarkı bilgileri.
    pub fn info(&self) -> &TrackInfo {
        &self.info
    }

    /// Kaynağın örnek çözünürlüğü (bit); kodek bildirmiyorsa `None`.
    pub fn source_bits(&self) -> Option<u32> {
        self.source_bits
    }

    /// Şarkıda verilen saniyeye atlar ve gerçekten atlanan kareyi döndürür.
    ///
    /// Biçimler genellikle hedefin biraz öncesine atlayabilir; aradaki fazla
    /// örnekler sonraki [`Decoder::next_chunk`] çağrılarında atılır.
    pub fn seek(&mut self, seconds: f64) -> Result<u64, AudioError> {
        let rate = f64::from(self.info.sample_rate);
        let last = self
            .info
            .duration_secs
            .map_or(f64::MAX, |d| (d - 1.0 / rate).max(0.0));
        let target = if seconds.is_finite() {
            seconds.clamp(0.0, last)
        } else {
            0.0
        };
        // Akış zamanı = şarkı zamanı + baştaki kodlayıcı dolgusu.
        let stream_target = target + self.trim.map_or(0.0, |t| t.delay as f64 / rate);
        let margin = if self.opus {
            OPUS_SEEK_MARGIN_SECS
        } else {
            SEEK_MARGIN_SECS
        };
        // Opus'ta hedefin biraz öncesine gidilir: çözücü ön yuvarlamayla oturur.
        let seek_to = if self.opus {
            (stream_target - margin).max(0.0)
        } else {
            stream_target
        };
        let seeked = if self.is_matroska {
            None
        } else {
            let time = Time::try_from_secs_f64(seek_to)
                .ok_or_else(|| AudioError::Seek("geçersiz konum".to_owned()))?;
            self.format
                .seek(
                    SeekMode::Accurate,
                    SeekTo::Time {
                        time,
                        track_id: Some(self.track_id),
                    },
                )
                .ok()
        };
        match seeked {
            Some(_) => self.decoder.reset(),
            // Matroska ya da okuyucunun beceremediği sarma (ör. akış sıfırdan başlamıyor):
            // dosya baştan açılır; hedeften paydan daha önce başlayan paketler çözülmeden geçilir.
            None => {
                self.format = probe(&self.path)?;
                let from_start = stream_target <= margin;
                // Matroska'da baştan çözerken ön boşluğu çözücü atar; ortadan başlarken atmamalı.
                let with_pre_skip = !self.opus || (self.is_matroska && from_start);
                self.decoder = make_decoder(&self.params, with_pre_skip)?;
                self.demux_until = (!from_start).then_some(stream_target - margin);
                if self.opus_clock.is_some() {
                    self.opus_clock = Some(-(opus_pre_skip(&self.params) as i64));
                }
            }
        }
        self.skip_until = self.time_base.map(|_| stream_target);
        Ok((target * rate).round() as u64)
    }

    /// Sonraki örnek dilimini döndürür; şarkı bittiyse `None`.
    ///
    /// Bozuk tek bir paket şarkıyı durdurmaz: atlanır ve sonrakine geçilir.
    pub fn next_chunk(&mut self) -> Result<Option<&[Sample]>, AudioError> {
        loop {
            let packet = match self.format.next_packet() {
                Ok(Some(packet)) => packet,
                Ok(None) => return Ok(None),
                // Bazı biçimlerde dosya sonu G/Ç hatası olarak bildirilir.
                Err(SymphoniaError::IoError(e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    return Ok(None)
                }
                Err(e) => return Err(e.into()),
            };
            if packet.track_id != self.track_id {
                continue;
            }
            // Çözücünün verdiği tampon paketin `pts` anından değil, kodlayıcı gecikmesi
            // kırpıldıktan sonraki (`pts + trim_start`) andan başlar: symphonia MP3'te ilk
            // paketlere eksi pts verip gecikmeyi kendisi kırpar. `pts`'ten saymak o kırpmayı
            // bir kez daha yapıyor ve her MP3'ün ilk 47 örneğini atıyordu (#73).
            let clock = self.opus_clock.map(|at| {
                self.opus_clock = Some(at + opus_packet_frames(&packet.data));
                at as f64 / 48_000.0
            });
            let packet_start = clock
                .or_else(|| {
                    self.time_base
                        .and_then(|tb| tb.calc_time(packet.pts.checked_add(packet.trim_start)?))
                        .map(|t| t.as_secs_f64())
                })
                // Matroska Opus: ilk paket ön boşluk kadar eksi zamanda başlar ve ön boşluğu
                // çözücü atar; kalan ses sıfırdan başlar (ikinci kez kırpılmasın).
                .map(|t| {
                    if self.opus && self.is_matroska {
                        t.max(0.0)
                    } else {
                        t
                    }
                });
            if let (Some(until), Some(start)) = (self.demux_until, packet_start) {
                if start < until {
                    continue;
                }
                self.demux_until = None;
            }
            match self.decoder.decode(&packet) {
                Ok(audio) => {
                    let frames = audio.frames();
                    if frames == 0 {
                        continue;
                    }
                    self.buffer.resize(audio.samples_interleaved(), 0.0);
                    audio.copy_to_slice_interleaved(&mut self.buffer);
                    // Bozuk kayan noktalı kayıtlarda NaN ya da sonsuz değer olabilir:
                    // filtrelerin belleğine girerse şarkının geri kalanı bozulur. Sessizlik say.
                    for sample in &mut self.buffer {
                        if !sample.is_finite() {
                            *sample = 0.0;
                        }
                    }

                    // Paketin çalınacak kısmı [from, to): sarma hedefinden ve baştaki
                    // dolgudan önceki örnekler, sondaki dolgu da atılır.
                    let (mut from, mut to) = (0usize, frames);
                    if let Some(start) = packet_start {
                        let rate = f64::from(self.info.sample_rate);
                        let start = (start * rate).round() as i64;
                        let delay = self.trim.map_or(0, |t| t.delay as i64);
                        let skip_to = self
                            .skip_until
                            .map_or(0, |t| (t * rate).round() as i64)
                            .max(delay);
                        from = (skip_to - start).clamp(0, frames as i64) as usize;
                        if let Some(length) = self.trim.and_then(|t| t.frames) {
                            let end = delay + length as i64;
                            if start >= end {
                                return Ok(None);
                            }
                            to = (end - start).clamp(0, frames as i64) as usize;
                        }
                        if from >= to {
                            continue;
                        }
                        self.skip_until = None;
                    }
                    let channels = self.info.channels;
                    return Ok(Some(&self.buffer[from * channels..to * channels]));
                }
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(e) => return Err(e.into()),
            }
        }
    }
}

/// Kütüphane ve ekran için okunan etiketler.
#[derive(Default)]
struct Tags {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    track_number: Option<u32>,
    disc_number: Option<u32>,
}

/// Etiketleri okur (ID3, Vorbis yorumları, MP4 vb.). Aynı etiket birden çok
/// kez varsa ilki alınır.
///
/// Eski tip ID3v1 etiketi yalnızca yeni tip etiketlerde olmayan alanlar için kullanılır
/// (30 karakterle sınırlıdır, kod sayfası belirtmez). Metni Türkçe harflerle okunur:
/// bkz. [`id3v1_text`].
fn read_tags(format: &mut dyn FormatReader, matroska: bool) -> Tags {
    let mut tags = Tags::default();
    let mut metadata = format.metadata();
    // Bütün revizyonlar: dosyanın başındaki (ID3v2) ve sonundaki (ID3v1, APE) etiketler.
    let mut revisions = Vec::new();
    revisions.extend(metadata.current().cloned());
    while metadata.pop().is_some() {
        revisions.extend(metadata.current().cloned());
    }
    // En yeni revizyon önce (eskiden yalnızca o okunuyordu); ID3v1 en sonda.
    revisions.reverse();
    revisions.sort_by_key(|r| r.info.metadata == METADATA_ID_ID3V1);
    for revision in &revisions {
        let legacy = revision.info.metadata == METADATA_ID_ID3V1;
        let text = |value: &str| {
            if legacy {
                non_empty(&id3v1_text(value))
            } else {
                non_empty(value)
            }
        };
        if matroska {
            matroska_tags(&revision.media.tags, &mut tags);
        }
        let track_tags = revision
            .per_track
            .iter()
            .flat_map(|t| t.metadata.tags.iter());
        for tag in revision.media.tags.iter().chain(track_tags) {
            match &tag.std {
                Some(StandardTag::TrackTitle(v)) if tags.title.is_none() => {
                    tags.title = text(v);
                }
                Some(StandardTag::Artist(v)) if tags.artist.is_none() => {
                    tags.artist = text(v);
                }
                Some(StandardTag::Album(v)) if tags.album.is_none() => {
                    tags.album = text(v);
                }
                Some(StandardTag::AlbumArtist(v)) if tags.album_artist.is_none() => {
                    tags.album_artist = text(v);
                }
                Some(StandardTag::TrackNumber(n)) if tags.track_number.is_none() => {
                    tags.track_number = u32::try_from(*n).ok().filter(|&n| n > 0);
                }
                Some(StandardTag::DiscNumber(n)) if tags.disc_number.is_none() => {
                    tags.disc_number = u32::try_from(*n).ok().filter(|&n| n > 0);
                }
                _ => {}
            }
        }
    }
    tags
}

/// Matroska/WebM etiketleri. Etiketin düzeyi (hedefi) symphonia'nın ham adında önek olarak durur:
/// `TRACK@TITLE` şarkının, `ALBUM@TITLE` albümün adı, `PART@PART_NUMBER` disk numarasıdır. Hedefi
/// yazılmamış etiket kuralda albüm düzeyidir; ffmpeg ve yt-dlp ise şarkının etiketlerini hedefsiz yazar.
/// Bu yüzden şarkı düzeyinde sanatçı yoksa albüm düzeyindeki `ARTIST` şarkının sanatçısı sayılır.
fn matroska_tags(raw: &[symphonia::core::meta::Tag], tags: &mut Tags) {
    let number = |v: &str| {
        v.split('/')
            .next()
            .and_then(|n| n.trim().parse::<u32>().ok())
            .filter(|&n| n > 0)
    };
    let mut values: Vec<(String, String, &str)> = Vec::new();
    for tag in raw {
        if let symphonia::core::meta::RawValue::String(value) = &tag.raw.value {
            let (level, key) = tag
                .raw
                .key
                .rsplit_once('@')
                .unwrap_or(("TRACK", &tag.raw.key));
            values.push((level.to_ascii_uppercase(), key.to_ascii_uppercase(), value));
        }
    }
    let get = |levels: &[&str], keys: &[&str]| {
        values
            .iter()
            .find(|(l, k, _)| levels.contains(&l.as_str()) && keys.contains(&k.as_str()))
            .and_then(|(_, _, v)| non_empty(v))
    };
    const TRACK: &[&str] = &["TRACK", "SONG", "SUBTRACK", "PART_TRACK"];
    let track_artist = get(TRACK, &["ARTIST"]);
    let album_artist = get(&["ALBUM"], &["ALBUM_ARTIST", "ALBUMARTIST"])
        .or_else(|| get(TRACK, &["ALBUM_ARTIST", "ALBUMARTIST"]))
        .or_else(|| {
            track_artist
                .is_some()
                .then(|| get(&["ALBUM"], &["ARTIST"]))
                .flatten()
        });
    let found = Tags {
        title: get(TRACK, &["TITLE"]),
        artist: track_artist.or_else(|| get(&["ALBUM"], &["ARTIST"])),
        album: get(&["ALBUM"], &["ALBUM", "TITLE"]).or_else(|| get(TRACK, &["ALBUM"])),
        album_artist,
        track_number: get(TRACK, &["PART_NUMBER", "TRACK", "TRACKNUMBER"])
            .or_else(|| get(&["ALBUM"], &["PART_NUMBER", "TRACK", "TRACKNUMBER"]))
            .and_then(|v| number(&v)),
        disc_number: get(&["PART"], &["PART_NUMBER"])
            .or_else(|| get(&["ALBUM", "PART", "TRACK"], &["DISC", "DISCNUMBER"]))
            .and_then(|v| number(&v)),
    };
    tags.title = tags.title.take().or(found.title);
    tags.artist = tags.artist.take().or(found.artist);
    tags.album = tags.album.take().or(found.album);
    tags.album_artist = tags.album_artist.take().or(found.album_artist);
    tags.track_number = tags.track_number.or(found.track_number);
    tags.disc_number = tags.disc_number.or(found.disc_number);
}

/// ID3v1 metni. Etiket kod sayfası belirtmez; symphonia baytları ISO-8859-1 sayar (her
/// bayt bir karakter, geri çevrilebilir). Baytlar geçerli UTF-8 ise (bazı programlar öyle
/// yazar) UTF-8, değilse Türkçe Windows'un kod sayfası Windows-1254 olarak okunur. Bu, Batı
/// Avrupa harflerini de doğru verir; yalnızca Ð, Ý, Þ, ð, ý, þ yerine Ğ, İ, Ş, ğ, ı, ş gelir.
fn id3v1_text(latin1: &str) -> String {
    let bytes: Option<Vec<u8>> = latin1.chars().map(|c| u8::try_from(c).ok()).collect();
    let Some(bytes) = bytes else {
        return latin1.to_owned(); // zaten çözülmüş metin
    };
    match std::str::from_utf8(&bytes) {
        Ok(text) => return text.to_owned(),
        // 30 baytta kesilmiş UTF-8: son harf yarım kalmış, öncesi geçerli.
        Err(e) if e.error_len().is_none() && !bytes[..e.valid_up_to()].is_ascii() => {
            return String::from_utf8_lossy(&bytes[..e.valid_up_to()]).into_owned();
        }
        Err(_) => {}
    }
    bytes.iter().map(|&b| windows_1254(b)).collect()
}

/// Windows-1254 (Türkçe) kod sayfasındaki karakter.
pub(crate) fn windows_1254(byte: u8) -> char {
    const HIGH: [char; 32] = [
        '€', '\u{FFFD}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{FFFD}',
        '\u{FFFD}', '\u{FFFD}', '\u{FFFD}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›',
        'œ', '\u{FFFD}', '\u{FFFD}', 'Ÿ',
    ];
    match byte {
        0x80..=0x9F => HIGH[usize::from(byte - 0x80)],
        0xD0 => 'Ğ',
        0xDD => 'İ',
        0xDE => 'Ş',
        0xF0 => 'ğ',
        0xFD => 'ı',
        0xFE => 'ş',
        _ => char::from(byte),
    }
}

/// Çözücüyü kurar. Opus'ta `with_pre_skip` yanlışsa baştaki ön boşluk çözücüye bildirilmez
/// (ön boşluğu çağıran atar ya da akışın ortasından başlanıyordur).
fn make_decoder(
    params: &AudioCodecParameters,
    with_pre_skip: bool,
) -> Result<Box<dyn AudioDecoder>, AudioError> {
    let options = AudioDecoderOptions::default();
    if with_pre_skip || params.codec != CODEC_ID_OPUS {
        return Ok(CODECS.make_audio_decoder(params, &options)?);
    }
    let mut params = params.clone();
    if let Some(head) = params.extra_data.as_mut() {
        // OpusHead: "OpusHead", sürüm, kanal sayısı, ön boşluk (2 bayt, küçük uçlu) ...
        if head.len() >= 12 && head.starts_with(b"OpusHead") {
            let mut bytes = head.to_vec();
            bytes[10] = 0;
            bytes[11] = 0;
            *head = bytes.into_boxed_slice();
        }
    }
    Ok(CODECS.make_audio_decoder(&params, &options)?)
}

/// Opus paketinin süresi (48 kHz örnek), paketin ilk baytından (TOC, RFC 6716 §3.1).
fn opus_packet_frames(packet: &[u8]) -> i64 {
    let Some(&toc) = packet.first() else {
        return 0;
    };
    let config = toc >> 3;
    // Çerçeve süresi: SILK 10/20/40/60 ms, karma 10/20 ms, CELT 2,5/5/10/20 ms.
    let frame = match config {
        0..=11 => [480, 960, 1920, 2880][usize::from(config % 4)],
        12..=15 => [480, 960][usize::from(config % 2)],
        _ => [120, 240, 480, 960][usize::from(config % 4)],
    };
    let count = match toc & 0b11 {
        0 => 1,
        1 | 2 => 2,
        _ => packet.get(1).map_or(0, |b| i64::from(b & 0x3F)),
    };
    frame * count
}

/// Opus başlığındaki ön boşluk (48 kHz örnek); başlık yoksa 0.
fn opus_pre_skip(params: &AudioCodecParameters) -> u64 {
    params
        .extra_data
        .as_deref()
        .filter(|head| head.len() >= 12 && head.starts_with(b"OpusHead"))
        .map_or(0, |head| {
            u64::from(u16::from_le_bytes([head[10], head[11]]))
        })
}

/// Kabın bildirdiği süre (kare); bildirmiyorsa `None`.
fn media_duration(format: &dyn FormatReader) -> Option<u64> {
    let info = format.media_info();
    let seconds = info.time_base?.calc_duration(info.duration?)?.as_secs_f64();
    let rate = format
        .default_track(TrackType::Audio)
        .and_then(|t| t.codec_params.as_ref())
        .and_then(|p| p.audio())
        .and_then(|p| p.sample_rate)?;
    (seconds > 0.0).then(|| (seconds * f64::from(rate)).round() as u64)
}

/// Uzantı listede mi? (Büyük/küçük harf fark etmez.)
/// Matroska/WebM mı? Önce dosyanın ilk baytlarına (EBML imzası) bakılır: uzantısı elle
/// değiştirilmiş dosya (ör. yt-dlp'nin `.webm`'i `.opus` diye yeniden adlandırılmış) da doğru
/// tanınır. Okunamazsa uzantıya bakılır.
fn is_matroska_file(path: &Path) -> bool {
    use std::io::Read;
    let mut magic = [0u8; 4];
    match std::fs::File::open(path).and_then(|mut f| f.read_exact(&mut magic)) {
        Ok(()) => magic == EBML_MAGIC,
        Err(_) => has_extension(path, MATROSKA_EXTENSIONS),
    }
}

/// EBML başlığının kimliği: her Matroska/WebM dosyası bununla başlar.
const EBML_MAGIC: [u8; 4] = [0x1A, 0x45, 0xDF, 0xA3];

fn has_extension(path: &Path, list: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| list.iter().any(|m| e.eq_ignore_ascii_case(m)))
}

/// Matroska dosyasının süresi (saniye): okuyucu bildirmediği için paketler çözülmeden baştan
/// sona okunur ve son paketin başına bir Opus çerçevesi (20 ms) eklenir. Okunamazsa `None`.
fn matroska_duration(path: &Path, track_id: u32) -> Option<f64> {
    let mut format = probe(path).ok()?;
    let time_base = format
        .tracks()
        .iter()
        .find(|t| t.id == track_id)?
        .time_base?;
    let mut last = None;
    while let Ok(Some(packet)) = format.next_packet() {
        if packet.track_id == track_id {
            last = Some(packet.pts);
        }
    }
    let end = time_base.calc_time(last?)?.as_secs_f64() + 0.02;
    (end > 0.0).then_some(end)
}

/// Dosyayı açar ve biçimini tanır (ses çözülmez).
fn probe(path: &Path) -> Result<Box<dyn FormatReader>, AudioError> {
    let file = File::open(path)?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| match e {
            SymphoniaError::IoError(io) => AudioError::Unsupported(io.to_string()),
            other => AudioError::from(other),
        })
}

/// Şarkıya gömülü sözler (ID3 USLT, Vorbis `LYRICS`, MP4 `©lyr`); yoksa `None`. Ses çözülmez.
/// Metin olduğu gibi döner (zamanlı sözler çoğunlukla LRC biçimindedir: [`super::lyrics`]).
pub fn read_lyrics(path: &Path) -> Result<Option<String>, AudioError> {
    let mut format = probe(path)?;
    let mut metadata = format.metadata();
    let mut revisions = Vec::new();
    revisions.extend(metadata.current().cloned());
    while metadata.pop().is_some() {
        revisions.extend(metadata.current().cloned());
    }
    revisions.reverse();
    Ok(revisions.iter().find_map(|revision| {
        let track_tags = revision
            .per_track
            .iter()
            .flat_map(|t| t.metadata.tags.iter());
        revision
            .media
            .tags
            .iter()
            .chain(track_tags)
            .find_map(|tag| match &tag.std {
                Some(StandardTag::Lyrics(text)) => non_empty(text),
                _ => None,
            })
    }))
}

/// Şarkının içindeki kapak resmi.
#[derive(Debug, Clone, PartialEq)]
pub struct Cover {
    /// Resmin türü, verinin kendisinden tanınır (ör. "image/jpeg").
    pub media_type: &'static str,
    pub data: Vec<u8>,
}

/// Bu boyuttan büyük kapak gösterilmez: arayüze taşınması pahalı, ekranda farkı yok.
const MAX_COVER_BYTES: usize = 8 * 1024 * 1024;

impl Cover {
    /// Arayüzde doğrudan gösterilebilen `data:` adresi.
    pub fn data_url(&self) -> String {
        format!("data:{};base64,{}", self.media_type, base64(&self.data))
    }
}

/// Şarkının kapağı: önce dosyanın içindeki resim ([`embedded_cover`]), yoksa yanındaki resim
/// dosyası ([`sidecar_cover`]). İçine kapak gömülemeyen biçimler (ör. `.webm`) ve kapağı ayrı
/// indirilen şarkılar da böylece kapak alır.
pub fn read_cover(path: &Path) -> Result<Option<Cover>, AudioError> {
    match embedded_cover(path)? {
        Some(cover) => Ok(Some(cover)),
        None => Ok(sidecar_cover(path)),
    }
}

/// Şarkıyla aynı adı taşıyan resimler ("Şarkı.opus" → "Şarkı.jpg"), sonra klasörün kapağı.
const SIDECAR_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "webp", "gif"];
const FOLDER_COVERS: [&str; 4] = ["cover", "folder", "front", "album"];

/// Şarkının yanındaki kapak resmi: önce aynı adlı resim ("Şarkı.jpg" ya da yt-dlp'nin
/// "Şarkı.opus.webp" adı), sonra klasördeki `cover`, `folder`, `front` ya da `album` resmi. Yalnızca gerçekten resim olan ve çok büyük olmayan dosya.
pub fn sidecar_cover(path: &Path) -> Option<Cover> {
    let dir = path.parent()?;
    let stem = path.file_stem()?;
    let file_name = path.file_name()?;
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut add = |name: &std::ffi::OsStr| {
        for ext in SIDECAR_EXTENSIONS {
            // Adın kendisinde nokta olabilir ("Şarkı (ft. X)"): uzantı değiştirilmez, eklenir.
            // Windows'ta büyük/küçük harf fark etmez; öteki sistemlerde iki yazılış denenir.
            for ext in [ext.to_owned(), ext.to_ascii_uppercase()] {
                let mut file = name.to_os_string();
                file.push(".");
                file.push(ext);
                candidates.push(dir.join(file));
            }
        }
    };
    add(stem);
    // yt-dlp kapağı dosyanın tam adına uzantı ekleyerek yazar ("Şarkı.opus.webp").
    add(file_name);
    for name in FOLDER_COVERS {
        add(std::ffi::OsStr::new(name));
    }
    candidates.into_iter().find_map(|candidate| {
        let size = std::fs::metadata(&candidate).ok()?.len();
        if !candidate.is_file() || size > MAX_COVER_BYTES as u64 {
            return None;
        }
        let data = std::fs::read(&candidate).ok()?;
        let media_type = image_type(&data)?;
        Some(Cover { media_type, data })
    })
}

/// Dosyanın içindeki kapak resmini okur (ID3, FLAC, MP4, Vorbis, Opus…): ön kapak öncelikli,
/// yoksa ilk resim. Ses çözülmez. Resim olmayan ya da çok büyük veri atlanır.
pub fn embedded_cover(path: &Path) -> Result<Option<Cover>, AudioError> {
    let mut format = probe(path)?;
    let mut metadata = format.metadata();
    let Some(revision) = metadata.skip_to_latest() else {
        return Ok(None);
    };
    let rank = |visual: &Visual| match visual.usage {
        Some(StandardVisualKey::FrontCover) => 0,
        None | Some(StandardVisualKey::OtherIcon) => 1,
        Some(_) => 2,
    };
    let best = revision
        .media
        .visuals
        .iter()
        .chain(
            revision
                .per_track
                .iter()
                .flat_map(|t| t.metadata.visuals.iter()),
        )
        .filter_map(|v| {
            let media_type = image_type(&v.data).filter(|_| v.data.len() <= MAX_COVER_BYTES)?;
            Some((rank(v), media_type, v))
        })
        .min_by_key(|(rank, _, _)| *rank);
    Ok(best.map(|(_, media_type, visual)| Cover {
        media_type,
        data: visual.data.to_vec(),
    }))
}

/// Verinin resim türü (ilk baytlarından; etiketteki tür bilgisine güvenilmez).
fn image_type(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if data.len() > 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// Base64 (RFC 4648, dolgulu).
fn base64(data: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let bytes = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (u32::from(bytes[0]) << 16) | (u32::from(bytes[1]) << 8) | u32::from(bytes[2]);
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            out.push(if i <= chunk.len() {
                char::from(ALPHABET[((n >> shift) & 63) as usize])
            } else {
                '='
            });
        }
    }
    out
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::test_util::{sine, temp_path, write_wav};

    fn mkv_tags(pairs: &[(&str, &str)]) -> Tags {
        let raw: Vec<symphonia::core::meta::Tag> = pairs
            .iter()
            .map(|(k, v)| symphonia::core::meta::Tag::new_from_parts(*k, *v, None))
            .collect();
        let mut tags = Tags::default();
        matroska_tags(&raw, &mut tags);
        tags
    }

    #[test]
    fn matroska_etiket_duzeyleri_dogru_eslenir() {
        // ffmpeg / yt-dlp: hedefsiz yazar, okuyucu albüm düzeyi sayar.
        let ffmpeg = mkv_tags(&[
            ("ALBUM@ARTIST", "Sanatçı"),
            ("ALBUM@ALBUM", "Albüm"),
            ("ALBUM@ALBUM_ARTIST", "Albüm Sanatçısı"),
            ("ALBUM@PART_NUMBER", "3/9"),
            ("ALBUM@DISC", "1/2"),
        ]);
        assert_eq!(ffmpeg.artist.as_deref(), Some("Sanatçı"));
        assert_eq!(ffmpeg.album.as_deref(), Some("Albüm"));
        assert_eq!(ffmpeg.album_artist.as_deref(), Some("Albüm Sanatçısı"));
        assert_eq!(
            (ffmpeg.track_number, ffmpeg.disc_number),
            (Some(3), Some(1))
        );
        assert_eq!(ffmpeg.title, None);
        // Düzeyleri doğru yazılmış dosya (mkvmerge, Picard): albümün adı şarkının adı olmaz,
        // albüm sanatçısı şarkının sanatçısı olmaz, disk numarası parça numarası olmaz.
        let proper = mkv_tags(&[
            ("ALBUM@TITLE", "Albüm"),
            ("ALBUM@ARTIST", "Albüm Sanatçısı"),
            ("PART@PART_NUMBER", "2"),
            ("TRACK@TITLE", "Şarkı"),
            ("TRACK@ARTIST", "Sanatçı"),
            ("TRACK@PART_NUMBER", "7"),
        ]);
        assert_eq!(proper.title.as_deref(), Some("Şarkı"));
        assert_eq!(proper.artist.as_deref(), Some("Sanatçı"));
        assert_eq!(proper.album.as_deref(), Some("Albüm"));
        assert_eq!(proper.album_artist.as_deref(), Some("Albüm Sanatçısı"));
        assert_eq!(
            (proper.track_number, proper.disc_number),
            (Some(7), Some(2))
        );
    }

    /// 32 bit kayan noktalı mono WAV (biçim 3) yazar: bozuk dosyaları taklit etmek için.
    fn write_float_wav(path: &std::path::Path, samples: &[f32]) {
        let data_len = (samples.len() * 4) as u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&3u16.to_le_bytes()); // IEEE float
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&8_000u32.to_le_bytes());
        bytes.extend_from_slice(&32_000u32.to_le_bytes());
        bytes.extend_from_slice(&4u16.to_le_bytes());
        bytes.extend_from_slice(&32u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            bytes.extend_from_slice(&s.to_le_bytes());
        }
        std::fs::write(path, bytes).unwrap();
    }

    #[test]
    fn gecersiz_ornekleme_hizi_reddedilir_cokmez() {
        // Hata (ISK-02, doğrulama turu): örnekleme hızı alanı 0xFFFFFFFF olan bir WAV, analizde
        // gigabaytlarca bellek ayırmaya ve programın kapanmasına yol açıyordu.
        for rate in [u32::MAX, 0, 500] {
            let path = temp_path("bozuk-hiz.wav");
            let mut bytes = Vec::new();
            bytes.extend_from_slice(b"RIFF");
            bytes.extend_from_slice(&(36u32 + 8).to_le_bytes());
            bytes.extend_from_slice(b"WAVEfmt ");
            bytes.extend_from_slice(&16u32.to_le_bytes());
            bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
            bytes.extend_from_slice(&1u16.to_le_bytes());
            bytes.extend_from_slice(&rate.to_le_bytes());
            bytes.extend_from_slice(&rate.wrapping_mul(2).to_le_bytes());
            bytes.extend_from_slice(&2u16.to_le_bytes());
            bytes.extend_from_slice(&16u16.to_le_bytes());
            bytes.extend_from_slice(b"data");
            bytes.extend_from_slice(&8u32.to_le_bytes());
            bytes.extend_from_slice(&[0; 8]);
            std::fs::write(&path, bytes).unwrap();
            let result = Decoder::open(&path);
            assert!(result.is_err(), "{rate} Hz kabul edilmemeli");
        }
    }

    #[test]
    fn bozuk_sayilar_sessizlige_cevrilir() {
        // Bozuk bir kayıt: araya NaN ve sonsuz değerler karışmış.
        let path = temp_path("bozuk-float.wav");
        let mut samples = vec![0.25f32; 4_000];
        samples[100] = f32::NAN;
        samples[200] = f32::INFINITY;
        samples[300] = f32::NEG_INFINITY;
        write_float_wav(&path, &samples);
        let mut decoder = Decoder::open(&path).unwrap();
        let mut decoded = Vec::new();
        while let Some(chunk) = decoder.next_chunk().unwrap() {
            decoded.extend_from_slice(chunk);
        }
        assert_eq!(decoded.len(), samples.len());
        assert!(
            decoded.iter().all(|s| s.is_finite()),
            "geçersiz sayı kalmamalı"
        );
        assert_eq!(decoded[100], 0.0);
        assert_eq!(decoded[200], 0.0);
        assert_eq!(decoded[300], 0.0);
        assert!((decoded[101] - 0.25).abs() < 1e-6);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn wav_dosyasini_dogru_cozer() {
        let path = temp_path("cozme.wav");
        let frames = 22_050; // 0,5 saniye
        write_wav(&path, 44_100, 2, frames, |frame, channel| {
            sine(440.0, 44_100, frame) * if channel == 0 { 0.5 } else { -0.5 }
        });

        let mut decoder = Decoder::open(&path).unwrap();
        let info = decoder.info().clone();
        assert_eq!(info.sample_rate, 44_100);
        assert_eq!(info.channels, 2);
        assert_eq!(info.file_name, "cozme");
        assert!((info.duration_secs.unwrap() - 0.5).abs() < 1e-6);

        let mut samples = Vec::new();
        while let Some(chunk) = decoder.next_chunk().unwrap() {
            samples.extend_from_slice(chunk);
        }
        assert_eq!(samples.len(), frames * 2);

        // 16 bit'lik nicemleme hatası payıyla karşılaştır.
        for frame in [0, 1, 100, 12_345, frames - 1] {
            let expected = sine(440.0, 44_100, frame) * 0.5;
            assert!((samples[frame * 2] - expected).abs() < 1e-4, "kare {frame}");
            assert!(
                (samples[frame * 2 + 1] + expected).abs() < 1e-4,
                "kare {frame}"
            );
        }
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn sarma_ornek_hassasiyetinde_calisir() {
        let path = temp_path("sarma.wav");
        let rate = 8_000;
        let frames = 24_000; // 3 saniye
                             // Her kare kendi sırasını taşır: kaç saniyeye atlandığı örnekten okunabilir.
        write_wav(&path, rate, 1, frames, |frame, _| {
            frame as f64 / frames as f64
        });

        let mut decoder = Decoder::open(&path).unwrap();
        let landed = decoder.seek(1.25).unwrap();
        assert_eq!(landed, 10_000);

        let mut samples = Vec::new();
        while let Some(chunk) = decoder.next_chunk().unwrap() {
            samples.extend_from_slice(chunk);
        }
        // Atlanan noktadan sona kadar tam olarak kalan örnekler gelir.
        assert_eq!(samples.len(), frames - 10_000);
        assert!(
            (samples[0] - 10_000.0 / frames as f64).abs() < 1e-4,
            "ilk örnek {}",
            samples[0]
        );

        // Sona taşan ve negatif konumlar sınırlanır.
        assert!(decoder.seek(99.0).unwrap() < frames as u64);
        assert_eq!(decoder.seek(-5.0).unwrap(), 0);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn olmayan_dosya_acma_hatasi_verir() {
        let error = Decoder::open(Path::new("/olmayan/klasor/sarki.mp3"))
            .err()
            .unwrap();
        assert!(matches!(error, AudioError::Open(_)));
    }

    #[test]
    fn ses_olmayan_dosya_desteklenmiyor_hatasi_verir() {
        let path = temp_path("metin.mp3");
        std::fs::write(&path, b"bu bir ses dosyasi degil".repeat(100)).unwrap();
        let error = Decoder::open(&path).err().unwrap();
        assert!(matches!(error, AudioError::Unsupported(_)), "{error:?}");
        std::fs::remove_file(path).ok();
    }

    /// Kapak testleri için küçük "resimler" (yalnızca ilk baytları gerçek; tür bunlardan tanınır).
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR-kapak";
    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F'];
    const WEBP: &[u8] = b"RIFF\x10\x00\x00\x00WEBPVP8 kapak";

    fn fixture_named(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/data")
            .join(name)
    }

    fn fixture(ext: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/data")
            .join(format!("uc-uc-ton.{ext}"))
    }

    /// Resimli ID3v2.3 etiketi (APIC çerçeveleri: tür, MIME, veri).
    fn id3_with_pictures(pictures: &[(u8, &str, &[u8])]) -> Vec<u8> {
        let mut frames = Vec::new();
        for (kind, mime, data) in pictures {
            let mut body = vec![0u8]; // metin kodlaması: ISO-8859-1
            body.extend_from_slice(mime.as_bytes());
            body.push(0);
            body.push(*kind);
            body.push(0); // açıklama yok
            body.extend_from_slice(data);
            frames.extend_from_slice(b"APIC");
            frames.extend_from_slice(&(body.len() as u32).to_be_bytes());
            frames.extend_from_slice(&[0, 0]);
            frames.extend_from_slice(&body);
        }
        let size = frames.len() as u32;
        let mut tag = b"ID3\x03\x00\x00".to_vec();
        tag.extend([21, 14, 7, 0].map(|shift| ((size >> shift) & 0x7f) as u8));
        tag.extend(frames);
        tag
    }

    /// Test MP3'ünün kendi etiketini resimli etiketle değiştirir (ses aynen kalır).
    fn mp3_with_pictures(pictures: &[(u8, &str, &[u8])]) -> PathBuf {
        let original = std::fs::read(fixture("mp3")).unwrap();
        assert_eq!(&original[..3], b"ID3");
        let old = original[6..10]
            .iter()
            .fold(0usize, |size, &b| (size << 7) | usize::from(b & 0x7f));
        let mut bytes = id3_with_pictures(pictures);
        bytes.extend_from_slice(&original[10 + old..]);
        let path = temp_path("kapakli.mp3");
        std::fs::write(&path, bytes).unwrap();
        path
    }

    /// Test FLAC'ına ön kapaklı bir PICTURE bloğu ekler (STREAMINFO'nun ardına).
    fn flac_with_cover(data: &[u8]) -> PathBuf {
        let original = std::fs::read(fixture("flac")).unwrap();
        assert_eq!(&original[..4], b"fLaC");
        let header = original[4];
        let end = 8 + u32::from_be_bytes([0, original[5], original[6], original[7]]) as usize;
        let mut body = Vec::new();
        body.extend_from_slice(&3u32.to_be_bytes()); // ön kapak
        body.extend_from_slice(&9u32.to_be_bytes());
        body.extend_from_slice(b"image/png");
        body.extend_from_slice(&0u32.to_be_bytes()); // açıklama yok
        for value in [1u32, 1, 32, 0] {
            body.extend_from_slice(&value.to_be_bytes());
        }
        body.extend_from_slice(&(data.len() as u32).to_be_bytes());
        body.extend_from_slice(data);
        let mut bytes = b"fLaC".to_vec();
        bytes.push(header & 0x7f); // STREAMINFO artık son blok değil
        bytes.extend_from_slice(&original[5..end]);
        bytes.push(6 | (header & 0x80)); // PICTURE; STREAMINFO sondaysa artık o son
        bytes.extend_from_slice(&(body.len() as u32).to_be_bytes()[1..]);
        bytes.extend(body);
        bytes.extend_from_slice(&original[end..]);
        let path = temp_path("kapakli.flac");
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn kapak_okunur_on_kapak_oncelikli() {
        // Önce "diğer" (JPEG), sonra ön kapak (PNG): ön kapak seçilir.
        let path = mp3_with_pictures(&[(0, "image/jpeg", JPEG), (3, "image/png", PNG)]);
        let cover = read_cover(&path).unwrap().unwrap();
        assert_eq!(cover.media_type, "image/png");
        assert_eq!(cover.data, PNG);
        // Ses yine çözülür (etiket değişti, ses aynı).
        assert!(Decoder::open(&path).is_ok());
        std::fs::remove_file(path).ok();

        // Etiketteki tür yanlış olsa da veriden tanınır.
        let path = mp3_with_pictures(&[(3, "image/jpg", JPEG)]);
        assert_eq!(read_cover(&path).unwrap().unwrap().media_type, "image/jpeg");
        std::fs::remove_file(path).ok();

        let path = flac_with_cover(PNG);
        let cover = read_cover(&path).unwrap().unwrap();
        assert_eq!(
            (cover.media_type, cover.data.as_slice()),
            ("image/png", PNG)
        );
        assert!(Decoder::open(&path).is_ok());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn uzantisi_opus_yapilmis_webm_webm_gibi_cozulur() {
        // yt-dlp'nin .webm dosyası elle .opus diye yeniden adlandırılınca içi hâlâ Matroska'dır;
        // uzantıya bakılsaydı ön boşluk iki kez atılır, sarma yanlış yere düşerdi.
        let renamed = temp_path("yeniden-adli.opus");
        std::fs::copy(fixture("webm"), &renamed).unwrap();
        let decode_all = |path: &Path| {
            let mut decoder = Decoder::open(path).unwrap();
            let mut out = Vec::new();
            while let Some(chunk) = decoder.next_chunk().unwrap() {
                out.extend_from_slice(chunk);
            }
            (decoder.info().duration_secs, out)
        };
        let (dur_webm, webm) = decode_all(&fixture("webm"));
        let (dur_renamed, renamed_samples) = decode_all(&renamed);
        assert_eq!(dur_renamed, dur_webm);
        assert_eq!(renamed_samples.len(), webm.len());
        assert!(renamed_samples == webm, "örnekler aynı olmalı");
        assert!(is_matroska_file(&renamed));
        assert!(!is_matroska_file(&fixture("opus")));
        std::fs::remove_file(renamed).ok();
    }

    #[test]
    fn opus_icine_gomulu_kapak_okunur() {
        // yt-dlp --embed-thumbnail'in yaptığı gibi: OpusTags içinde METADATA_BLOCK_PICTURE.
        let cover = read_cover(&fixture_named("kapakli.opus")).unwrap().unwrap();
        assert_eq!(cover.media_type, "image/png");
    }

    #[test]
    fn kapak_yoksa_yanindaki_resim_okunur() {
        let dir = temp_path("yan-kapak");
        std::fs::create_dir_all(&dir).unwrap();
        // Adında nokta olan şarkı: "Şarkı (ft. X).opus" → "Şarkı (ft. X).jpg".
        let song = dir.join("Şarkı (ft. X).opus");
        std::fs::copy(fixture("ogg"), &song).unwrap();
        assert_eq!(read_cover(&song).unwrap(), None);

        // Klasörün kapağı...
        std::fs::write(dir.join("cover.png"), PNG).unwrap();
        assert_eq!(read_cover(&song).unwrap().unwrap().data, PNG);
        // ...ama şarkıyla aynı adlı resim önce gelir.
        std::fs::write(dir.join("Şarkı (ft. X).jpg"), JPEG).unwrap();
        let cover = read_cover(&song).unwrap().unwrap();
        assert_eq!(
            (cover.media_type, cover.data.as_slice()),
            ("image/jpeg", JPEG)
        );
        // yt-dlp'nin adlandırması da tanınır ("Şarkı (ft. X).opus.webp").
        std::fs::remove_file(dir.join("Şarkı (ft. X).jpg")).unwrap();
        std::fs::write(dir.join("Şarkı (ft. X).opus.webp"), WEBP).unwrap();
        assert_eq!(read_cover(&song).unwrap().unwrap().media_type, "image/webp");
        std::fs::remove_file(dir.join("Şarkı (ft. X).opus.webp")).unwrap();
        std::fs::write(dir.join("Şarkı (ft. X).jpg"), JPEG).unwrap();
        // Resim olmayan dosya atlanır.
        std::fs::write(dir.join("Şarkı (ft. X).jpg"), b"resim degil").unwrap();
        assert_eq!(read_cover(&song).unwrap().unwrap().data, PNG);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn kapak_yoksa_ya_da_resim_degilse_bos() {
        for ext in ["mp3", "flac", "ogg", "m4a"] {
            assert_eq!(read_cover(&fixture(ext)).unwrap(), None, "{ext}");
        }
        let path = mp3_with_pictures(&[(3, "image/png", b"resim degil")]);
        assert_eq!(read_cover(&path).unwrap(), None);
        std::fs::remove_file(path).ok();
    }

    /// Test MP3'ünün ID3v2 etiketini atar, sonuna verilen 30 baytlık alanlarla eski tip
    /// (ID3v1) etiket ekler: başlık, sanatçı, albüm.
    fn mp3_with_id3v1(title: &[u8], artist: &[u8], album: &[u8]) -> PathBuf {
        let original = std::fs::read(fixture("mp3")).unwrap();
        let old = original[6..10]
            .iter()
            .fold(0usize, |size, &b| (size << 7) | usize::from(b & 0x7f));
        append_id3v1(original[10 + old..].to_vec(), title, artist, album)
    }

    fn append_id3v1(mut bytes: Vec<u8>, title: &[u8], artist: &[u8], album: &[u8]) -> PathBuf {
        let field = |text: &[u8]| {
            let mut out = [0u8; 30];
            out[..text.len()].copy_from_slice(text);
            out
        };
        bytes.extend_from_slice(b"TAG");
        bytes.extend_from_slice(&field(title));
        bytes.extend_from_slice(&field(artist));
        bytes.extend_from_slice(&field(album));
        bytes.extend_from_slice(b"2026");
        bytes.extend_from_slice(&[0u8; 30]); // yorum
        bytes.push(255); // tür yok
        let path = temp_path("id3v1.mp3");
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn yalnizca_eski_tip_etiketli_mp3_adi_okunur() {
        // #27: yalnızca ID3v1 taşıyan MP3'lerde listede dosya adı görünüyordu.
        let path = mp3_with_id3v1(b"Gece Yolu", b"Lyraska Test", b"Deneme");
        let info = Decoder::open(&path).unwrap().info().clone();
        assert_eq!(info.title.as_deref(), Some("Gece Yolu"));
        assert_eq!(info.artist.as_deref(), Some("Lyraska Test"));
        assert_eq!(info.album.as_deref(), Some("Deneme"));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn eski_tip_etiketteki_turkce_harfler_dogru_okunur() {
        // ID3v1 kod sayfası belirtmez; Türkçe Windows'ta yazılanlar Windows-1254'tür.
        // "Şarkı Ğİ" → Ş 0xDE, ı 0xFD, Ğ 0xD0, İ 0xDD (Latin-1 okunsa "Þarký ÐÝ" olurdu).
        let path = mp3_with_id3v1(
            b"\xDEark\xFD \xD0\xDD",
            b"\xC7a\xF0r\xFD \xD6z\xFC\xFE",
            "Deneme".as_bytes(),
        );
        let info = Decoder::open(&path).unwrap().info().clone();
        assert_eq!(info.title.as_deref(), Some("Şarkı Ğİ"));
        assert_eq!(info.artist.as_deref(), Some("Çağrı Özüş"));
        std::fs::remove_file(path).ok();

        // Bazı programlar ID3v1'e UTF-8 yazar: o da doğru okunur; 30 baytta yarım kalan
        // son harf atılır.
        let path = mp3_with_id3v1("Gökyüzü".as_bytes(), b"Lyraska", b"");
        let info = Decoder::open(&path).unwrap().info().clone();
        assert_eq!(info.title.as_deref(), Some("Gökyüzü"));
        std::fs::remove_file(path).ok();
        let long = "Çok uzun bir şarkı adı ğğğğ".as_bytes();
        let path = mp3_with_id3v1(&long[..30], b"Lyraska", b"");
        let info = Decoder::open(&path).unwrap().info().clone();
        assert_eq!(info.title.as_deref(), Some("Çok uzun bir şarkı adı ğ"));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn yeni_tip_etiket_eski_tipten_onceliklidir() {
        // Hem ID3v2 ("Üç Ton") hem ID3v1 ("Kisa") olan dosyada ID3v2 okunur; ID3v1 yalnızca
        // ID3v2'de olmayan alanı (burada yok) tamamlar.
        let original = std::fs::read(fixture("mp3")).unwrap();
        let path = append_id3v1(original, b"Kisa", b"Baska", b"Eski");
        let info = Decoder::open(&path).unwrap().info().clone();
        assert_eq!(info.title.as_deref(), Some("Üç Ton"));
        assert_eq!(info.artist.as_deref(), Some("Lyraska Test"));
        assert_eq!(info.album.as_deref(), Some("Deneme Albümü"));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn windows_1254_turkce_ve_bati_harfleri() {
        assert_eq!(id3v1_text("\u{DE}\u{FD}\u{D0}\u{DD}\u{F0}\u{FE}"), "ŞıĞİğş");
        // Diğer Batı Avrupa harfleri ve noktalama Windows-1252 ile aynı.
        assert_eq!(id3v1_text("Caf\u{E9} \u{80}5 \u{93}a\u{94}"), "Café €5 “a”");
        // Zaten Unicode olan metin (ID3v1 değilse) olduğu gibi kalır.
        assert_eq!(id3v1_text("Şarkı"), "Şarkı");
    }

    #[test]
    fn kapak_data_adresi_olur() {
        let cover = Cover {
            media_type: "image/png",
            data: b"foobar".to_vec(),
        };
        assert_eq!(cover.data_url(), "data:image/png;base64,Zm9vYmFy");
        for (input, expected) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
        ] {
            assert_eq!(base64(input.as_bytes()), expected);
        }
        assert_eq!(base64(&[0xFB, 0xFF, 0xBF]), "+/+/");
    }
}
