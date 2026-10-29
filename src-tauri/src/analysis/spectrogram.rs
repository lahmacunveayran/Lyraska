//! Spektrogram: şarkının her anı için frekans bantlarının seviyesi.
//!
//! Şarkı açılınca ayrı bir iş parçacığında baştan sona taranır (çalmadan çok
//! daha hızlı). Görseller çalma konumuna karşılık gelen kareyi okur; böylece ses
//! ve görüntü tam eş zamanlıdır ve gerçek zamanlı ses yoluna hiç yük binmez.
//! Bu, "görseller şarkıyı önceden bilir" fikrinin ilk adımıdır.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

use super::beats::{self, BeatGrid, OnsetDetector};
use super::cache::CachedAnalysis;
use super::key::{ChromaAnalyzer, KeyAnalysis, MusicalKey};
use super::levels::{self, ChannelLevels, LevelAccumulator, VALUES_PER_FRAME};
use super::meter;
use super::structure::{self, SongMap};
use super::tempo;
use crate::audio::bass::{BassPeakMeter, BassPeaks};
use crate::audio::decode::{Decoder, TrackInfo};
use crate::audio::loudness::{Loudness, LoudnessMeter};
use crate::audio::{AudioError, Sample};
use crate::director::Choreography;

/// Saniyedeki analiz karesi sayısı (ekran tazeleme hızıyla aynı).
pub const FRAMES_PER_SECOND: f64 = 60.0;
/// Saklanan frekans bandı sayısı. Sahneler kendi bant sayılarına indirger.
pub const BANDS: usize = 32;
/// FFT pencere uzunluğu 48 kHz'e kadar (44,1 kHz'te ~46 ms; bas frekanslar için yeterli
/// çözünürlük). Daha yüksek hızlarda [`fft_size`] bunu katlar.
const BASE_FFT_SIZE: usize = 2048;

/// Örnekleme hızına göre FFT pencere uzunluğu: 48 kHz'e kadar 2048 örnek; 88,2/96 kHz'te 4096,
/// 176,4/192 kHz'te 8192. Pencere **süresi** (~43–46 ms) ve kutu genişliği (~21–23 Hz) böylece
/// hızdan bağımsız kalır: yüksek çözünürlüklü dosyada kare adımı (192 kHz'te 3 200 örnek) pencereden
/// uzun olup sesin üçte biri analiz dışı kalmaz; bas bantları aynı kutulara düşmez (ANL-01).
pub fn fft_size(sample_rate: u32) -> usize {
    let mut size = BASE_FFT_SIZE;
    while sample_rate as usize > 48_000 * (size / BASE_FFT_SIZE) {
        size *= 2;
    }
    size
}
/// Bantların kapsadığı aralık.
const MIN_FREQ: f64 = 30.0;
const MAX_FREQ: f64 = 16_000.0;
/// Seviye ölçeği: bu aralıktaki desibel değerleri 0..1'e eşlenir.
const FLOOR_DB: f64 = -66.0;
const CEIL_DB: f64 = -6.0;
/// Müzikte yüksek frekansların enerjisi doğal olarak düşüktür; görsel denge için
/// 1 kHz üstünde oktav başına bu kadar desibel eklenir (altında çıkarılır).
const TILT_DB_PER_OCTAVE: f64 = 3.0;

/// Bir şarkının spektrogramı ve kanal seviyeleri. Analiz sürerken de okunabilir.
pub struct Spectrogram {
    /// Her kare için `BANDS` adet 0..255 seviye (art arda).
    levels: RwLock<Vec<u8>>,
    /// Her kare için kanal seviyeleri ([`levels`] modülünün saklama biçimi).
    meters: RwLock<Vec<u8>>,
    /// Her karenin başlangıç gücü (beat takibi için).
    onset: RwLock<Vec<f32>>,
    /// Analiz bitince hesaplanan VU referansı (dBFS).
    vu_reference: RwLock<Option<f32>>,
    /// Analiz bitince bulunan vuruş ızgarası (ritim yoksa `None`).
    beats: RwLock<Option<Arc<BeatGrid>>>,
    /// Analiz bitince çıkarılan şarkı yapısı (ölçü, bölüm, drop, enerji).
    song_map: RwLock<Option<Arc<SongMap>>>,
    /// Analiz bitince kurulan koreografi (Görsel Yönetmen).
    choreography: RwLock<Option<Arc<Choreography>>>,
    /// Ölçülen ses yüksekliği ve gerçek tepe (sessiz şarkıda `None`). Hızlı ölçüm
    /// geçişiyle analiz bitmeden de gelebilir ([`Spectrogram::set_measured_loudness`]).
    loudness: RwLock<Option<Loudness>>,
    loudness_ready: AtomicBool,
    /// Hızlı ölçümün ilk saniyelerden erken tahmini (kesin ölçüm gelene kadar).
    early_loudness: RwLock<Option<Loudness>>,
    /// Bas tepeleri (yalnızca tam analizde ölçülür).
    bass_peaks: RwLock<Option<BassPeaks>>,
    /// Ton analizi: kroma zaman çizgisi ve şarkının tonu (analiz bitince).
    key: RwLock<Option<Arc<KeyAnalysis>>>,
    /// İçe aktarılan şarkı haritası ([`super::map_file`]): analizin vuruşlarının, yapısının ve
    /// tonunun önüne geçer; önbelleğe yazılmaz.
    imported: RwLock<Option<Imported>>,
    /// Şarkının örnekleme hızı (ritim karelerden yeniden hesaplanırken gerekir).
    sample_rate: RwLock<Option<u32>>,
    /// Hazır kare sayısı.
    ready: AtomicUsize,
    done: AtomicBool,
    cancelled: AtomicBool,
    /// Çözme yarıda kesildi (EOF dışı hata): kareler çalma için kullanılır ama analiz
    /// "tamamlanmış" diye önbelleğe yazılmaz; şarkı bir dahaki açılışta baştan analiz edilir.
    truncated: AtomicBool,
}

impl Spectrogram {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            levels: RwLock::new(Vec::new()),
            meters: RwLock::new(Vec::new()),
            onset: RwLock::new(Vec::new()),
            vu_reference: RwLock::new(None),
            beats: RwLock::new(None),
            song_map: RwLock::new(None),
            choreography: RwLock::new(None),
            loudness: RwLock::new(None),
            loudness_ready: AtomicBool::new(false),
            early_loudness: RwLock::new(None),
            bass_peaks: RwLock::new(None),
            key: RwLock::new(None),
            imported: RwLock::new(None),
            sample_rate: RwLock::new(None),
            ready: AtomicUsize::new(0),
            done: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
            truncated: AtomicBool::new(false),
        })
    }

    /// Analizi durdurur (başka şarkı açıldığında).
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub fn is_done(&self) -> bool {
        self.done.load(Ordering::Acquire)
    }

    /// Analiz iptal edildi mi (bitmeden başka şarkı açıldı)?
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    /// Çözme yarıda kesildi mi (dosya sonu değil, hata)? Böyle bir analiz saklanmaz.
    pub fn is_truncated(&self) -> bool {
        self.truncated.load(Ordering::Acquire)
    }

    fn mark_truncated(&self, error: &AudioError) {
        if !self.truncated.swap(true, Ordering::AcqRel) {
            crate::diagnostics::error(&format!(
                "Analiz yarıda kesildi, sonuç saklanmayacak: {error}"
            ));
        }
    }

    /// Önbellekteki sonuçtan hazır (bitmiş) bir spektrogram kurar: şarkı yeniden
    /// çözülmez. Koreografi ve VU referansı saklanan veriden hesaplanır.
    pub fn from_saved(saved: SavedAnalysis) -> Arc<Self> {
        let spectrogram = Self::new();
        spectrogram.set_sample_rate(saved.sample_rate);
        spectrogram.push(&saved.levels, &saved.meters, &saved.onset);
        spectrogram.complete(
            saved.beats,
            saved.song_map,
            saved.loudness,
            saved.bass_peaks,
            saved.key,
        );
        spectrogram
    }

    /// Bitmiş analizin saklanacak hâli; analiz bitmediyse ya da çözme yarıda kesildiyse `None`.
    pub fn saved(&self) -> Option<SavedAnalysis> {
        if !self.is_done() || self.is_truncated() {
            return None;
        }
        Some(SavedAnalysis {
            levels: self.levels.read().ok()?.clone(),
            meters: self.meters.read().ok()?.clone(),
            onset: self.onset.read().ok()?.clone(),
            // Programın kendi analizi (içe aktarılan harita önbelleğe yazılmaz).
            beats: self.analysis_beat_grid().map(|b| (*b).clone()),
            song_map: self.analysis_song_map().map(|m| (*m).clone()),
            loudness: self.loudness(),
            bass_peaks: self.bass_peaks(),
            key: self.key().map(|k| (*k).clone()),
            sample_rate: self.sample_rate.read().ok().and_then(|r| *r),
        })
    }

    fn set_sample_rate(&self, rate: Option<u32>) {
        if let Ok(mut stored) = self.sample_rate.write() {
            *stored = rate;
        }
    }

    pub fn ready_frames(&self) -> usize {
        self.ready.load(Ordering::Acquire)
    }

    /// Verilen saniyedeki bant seviyeleri (0..1). O an henüz analiz edilmediyse `None`.
    ///
    /// `k`. karenin penceresi `(k+1)/60` saniyede biter; içeriği pencerenin **ortasını**
    /// (`(k+1)/60 − N/2r`) temsil eder. Kare, `seconds`'a en yakın orta noktaya göre seçilir;
    /// yoksa görsel 44,1 kHz'te ortalama 15 ms, 8 kHz'te 120 ms geç kalırdı (ANL-03).
    pub fn frame_at(&self, seconds: f64) -> Option<[f32; BANDS]> {
        if !seconds.is_finite() || seconds < 0.0 {
            return None;
        }
        let rate = self
            .sample_rate
            .read()
            .ok()
            .and_then(|r| *r)
            .unwrap_or(44_100);
        let half_window = fft_size(rate) as f64 / (2.0 * f64::from(rate.max(1)));
        let index = ((seconds + half_window) * FRAMES_PER_SECOND - 1.0)
            .round()
            .max(0.0) as usize;
        if index >= self.ready_frames() {
            return None;
        }
        let levels = self.levels.read().ok()?;
        let frame = levels.get(index * BANDS..(index + 1) * BANDS)?;
        let mut out = [0.0f32; BANDS];
        for (dst, &src) in out.iter_mut().zip(frame) {
            *dst = f32::from(src) / 255.0;
        }
        Some(out)
    }

    /// Verilen saniyedeki kanal seviyeleri. O an henüz analiz edilmediyse `None`.
    pub fn meters_at(&self, seconds: f64) -> Option<ChannelLevels> {
        if !seconds.is_finite() || seconds < 0.0 {
            return None;
        }
        let index = (seconds * FRAMES_PER_SECOND).floor() as usize;
        if index >= self.ready_frames() {
            return None;
        }
        let meters = self.meters.read().ok()?;
        levels::decode_frame(meters.get(index * VALUES_PER_FRAME..(index + 1) * VALUES_PER_FRAME)?)
    }

    /// 0 VU'ya denk gelen seviye (dBFS); analiz bitene kadar `None`.
    pub fn vu_reference_db(&self) -> Option<f32> {
        self.vu_reference.read().ok().and_then(|r| *r)
    }

    /// Şarkının koreografisi (içe aktarılan harita varsa ondan); analiz bitene kadar ya da
    /// ritim yoksa `None`.
    pub fn choreography(&self) -> Option<Arc<Choreography>> {
        self.imported
            .read()
            .ok()
            .and_then(|i| i.as_ref().and_then(|i| i.choreography.clone()))
            .or_else(|| self.choreography.read().ok().and_then(|c| c.clone()))
    }

    /// Şarkının yapısı (içe aktarılan harita varsa o); analiz bitene kadar ya da ritim yoksa
    /// `None`.
    pub fn song_map(&self) -> Option<Arc<SongMap>> {
        self.imported_part(|i| Arc::clone(&i.map))
            .or_else(|| self.analysis_song_map())
    }

    /// Programın kendi analizinin yapısı.
    pub fn analysis_song_map(&self) -> Option<Arc<SongMap>> {
        self.song_map.read().ok().and_then(|m| m.clone())
    }

    /// İçe aktarılan şarkı haritasını uygular: vuruşlar, yapı, koreografi ve (varsa) ton onun
    /// olur. Analiz bitmediyse koreografi analiz bitince kurulur.
    pub fn set_imported(&self, grid: BeatGrid, map: SongMap, key: Option<MusicalKey>) {
        let Ok(mut imported) = self.imported.write() else {
            return;
        };
        let choreography = if self.is_done() {
            self.build_choreography(&grid, &map).map(Arc::new)
        } else {
            None
        };
        *imported = Some(Imported {
            beats: Arc::new(grid),
            map: Arc::new(map),
            key,
            choreography,
        });
    }

    /// İçe aktarılan haritayı kaldırır: programın analizi geri gelir.
    pub fn clear_imported(&self) {
        if let Ok(mut imported) = self.imported.write() {
            *imported = None;
        }
    }

    /// İçe aktarılan harita uygulanmış mı?
    pub fn has_imported(&self) -> bool {
        self.imported.read().is_ok_and(|i| i.is_some())
    }

    /// İçe aktarılan haritanın tonu.
    pub fn imported_key(&self) -> Option<MusicalKey> {
        self.imported.read().ok().and_then(|i| i.as_ref()?.key)
    }

    fn imported_part<T>(&self, part: impl FnOnce(&Imported) -> T) -> Option<T> {
        self.imported.read().ok().and_then(|i| i.as_ref().map(part))
    }

    /// Koreografi (bütün kareler hazırken).
    fn build_choreography(&self, grid: &BeatGrid, map: &SongMap) -> Option<Choreography> {
        let levels = self.levels.read().ok()?;
        let onset = self.onset.read().ok()?;
        Some(Choreography::build(
            grid,
            map,
            &levels,
            BANDS,
            &onset,
            FRAMES_PER_SECOND,
        ))
    }

    /// Şarkının ses yüksekliği ve gerçek tepesi; ölçülmediyse ya da sessizse `None`.
    /// Bas tepeleri (tam analiz bitince; sessiz şarkıda `None`).
    pub fn bass_peaks(&self) -> Option<BassPeaks> {
        self.bass_peaks.read().ok().and_then(|b| *b)
    }

    /// Ton analizi (analiz bitince; eski kayıtta yeniden hesaplanana kadar `None`).
    pub fn key(&self) -> Option<Arc<KeyAnalysis>> {
        self.key.read().ok().and_then(|k| k.clone())
    }

    pub fn loudness(&self) -> Option<Loudness> {
        self.loudness.read().ok().and_then(|l| *l)
    }

    /// Ölçüm bittiyse sonucu (`Some(None)`: sessiz şarkı); bitmediyse `None`.
    pub fn measured_loudness(&self) -> Option<Option<Loudness>> {
        self.loudness_ready
            .load(Ordering::Acquire)
            .then(|| self.loudness())
    }

    /// Hızlı ölçümün ilk saniyelerden tahmini; kesin ölçüm hazırsa ya da tahmin henüz yoksa
    /// `None`. Eşitleme ilk sesi 0,6 s yerine 0,15 s bekler ve bununla başlar (SES-04).
    pub fn early_loudness(&self) -> Option<Loudness> {
        if self.loudness_ready.load(Ordering::Acquire) {
            return None;
        }
        self.early_loudness.read().ok().and_then(|l| *l)
    }

    pub fn set_early_loudness(&self, loudness: Loudness) {
        if let Ok(mut stored) = self.early_loudness.write() {
            *stored = Some(loudness);
        }
    }

    /// Ses yüksekliği ölçümünü yayımlar (hızlı ölçüm geçişi ya da analizin sonu).
    pub fn set_measured_loudness(&self, loudness: Option<Loudness>) {
        if let Ok(mut stored) = self.loudness.write() {
            *stored = loudness;
        }
        self.loudness_ready.store(true, Ordering::Release);
    }

    /// Şarkının vuruş ızgarası (içe aktarılan harita varsa onunki); analiz bitene kadar ya da
    /// ritim yoksa `None`.
    pub fn beat_grid(&self) -> Option<Arc<BeatGrid>> {
        self.imported_part(|i| Arc::clone(&i.beats))
            .or_else(|| self.analysis_beat_grid())
    }

    /// Programın kendi analizinin vuruş ızgarası.
    pub fn analysis_beat_grid(&self) -> Option<Arc<BeatGrid>> {
        self.beats.read().ok().and_then(|b| b.clone())
    }

    fn push(&self, frames: &[u8], meters: &[u8], onset: &[f32]) {
        // Önce seviyeler: hazır kare sayısı arttığında hepsi okunabilir olsun.
        if let Ok(mut stored) = self.meters.write() {
            stored.extend_from_slice(meters);
        }
        if let Ok(mut stored) = self.onset.write() {
            stored.extend_from_slice(onset);
        }
        if let Ok(mut levels) = self.levels.write() {
            levels.extend_from_slice(frames);
            self.ready.store(levels.len() / BANDS, Ordering::Release);
        }
    }

    /// Analiz bitince: vuruşlar, şarkı yapısı ve koreografi.
    fn finish(
        &self,
        sample_rate: u32,
        loudness: Option<Loudness>,
        bass_peaks: Option<BassPeaks>,
        key: Option<KeyAnalysis>,
    ) {
        let rhythm = match (self.levels.read(), self.meters.read(), self.onset.read()) {
            (Ok(levels), Ok(meters), Ok(onset)) => {
                rhythm_from_frames(&levels, &meters, &onset, sample_rate)
            }
            _ => (None, None),
        };
        self.set_sample_rate(Some(sample_rate));
        self.complete(rhythm.0, rhythm.1, loudness, bass_peaks, key);
    }

    /// Analizi tamamlar: VU referansı ve koreografi hesaplanır, sonuçlar yayımlanır.
    fn complete(
        &self,
        grid: Option<BeatGrid>,
        map: Option<SongMap>,
        loudness: Option<Loudness>,
        bass_peaks: Option<BassPeaks>,
        key: Option<KeyAnalysis>,
    ) {
        if let Ok(mut stored) = self.bass_peaks.write() {
            *stored = bass_peaks;
        }
        if let Ok(mut stored) = self.key.write() {
            *stored = key.map(Arc::new);
        }
        self.set_measured_loudness(loudness);
        let reference = self
            .meters
            .read()
            .ok()
            .and_then(|m| levels::vu_reference_db(&m, FRAMES_PER_SECOND));
        if let Ok(mut stored) = self.vu_reference.write() {
            *stored = reference;
        }
        let choreography = match (&grid, &map) {
            (Some(grid), Some(map)) => self.build_choreography(grid, map),
            _ => None,
        };
        if let Ok(mut stored) = self.beats.write() {
            *stored = grid.map(Arc::new);
        }
        if let Ok(mut stored) = self.choreography.write() {
            *stored = choreography.map(Arc::new);
        }
        if let Ok(mut stored) = self.song_map.write() {
            *stored = map.map(Arc::new);
        }
        self.done.store(true, Ordering::Release);
        // Analiz sürerken içe aktarılan haritanın koreografisi şimdi kurulur ([`Self::set_imported`]
        // aynı kilidi tutar: biri ötekini görür).
        if let Ok(mut imported) = self.imported.write() {
            if let Some(i) = imported.as_mut().filter(|i| i.choreography.is_none()) {
                i.choreography = self.build_choreography(&i.beats, &i.map).map(Arc::new);
            }
        }
    }
}

/// İçe aktarılan şarkı haritasının programın türlerindeki hâli.
struct Imported {
    beats: Arc<BeatGrid>,
    map: Arc<SongMap>,
    key: Option<MusicalKey>,
    /// Bütün kareler hazır olunca kurulur.
    choreography: Option<Arc<Choreography>>,
}

/// Bir şarkının saklanabilir analiz sonucu (önbellek için): ham kareler ve
/// onlardan çıkarılan vuruş ızgarası ile şarkı haritası.
#[derive(Debug, Clone, PartialEq)]
pub struct SavedAnalysis {
    /// Kare başına `BANDS` bant seviyesi (0..255).
    pub levels: Vec<u8>,
    /// Kare başına kanal seviyeleri ([`levels`] modülünün saklama biçimi).
    pub meters: Vec<u8>,
    /// Kare başına başlangıç gücü.
    pub onset: Vec<f32>,
    pub beats: Option<BeatGrid>,
    pub song_map: Option<SongMap>,
    /// Ses yüksekliği ve gerçek tepe (sessiz şarkıda `None`).
    pub loudness: Option<Loudness>,
    /// Bas tepeleri (sessiz şarkıda `None`).
    pub bass_peaks: Option<BassPeaks>,
    /// Ton analizi (önbellekte bu parça eskimişse `None`).
    pub key: Option<KeyAnalysis>,
    /// Şarkının örnekleme hızı; eski önbellek kayıtlarında bilinmeyebilir.
    pub sample_rate: Option<u32>,
}

impl SavedAnalysis {
    /// Kare sayısı.
    pub fn frames(&self) -> usize {
        self.levels.len() / BANDS
    }

    /// Veri kendi içinde tutarlı mı (bozuk önbellek kaydına karşı)?
    pub fn is_consistent(&self) -> bool {
        let frames = self.frames();
        self.levels.len() == frames * BANDS
            && self.meters.len() == frames * VALUES_PER_FRAME
            && self.onset.len() == frames
    }
}

/// Yalnızca ses yüksekliğini ölçen hızlı geçiş: şarkı açılınca, tam analiz bitmeden
/// eşitleme kazancı bilinsin diye (çözme + süzgeç; FFT yok). Analiz iptal edilir ya da
/// biterse durur; sonucu [`Spectrogram::set_measured_loudness`] ile yayımlar.
pub fn measure_loudness(mut decoder: Decoder, target: &Spectrogram) {
    let info = decoder.info().clone();
    let channels = info.channels.max(1);
    let mut meter = LoudnessMeter::new(info.sample_rate, channels);
    // Bütünleşik ölçüm bütün şarkıyı ister (4 dk'lık MP3 1–3 sn); ilk saniyelerden bir
    // tahmin yayımlanır ki ilk ses −10 LUFS varsayımıyla değil, şarkının kendi girişiyle
    // başlasın. Kesin ölçüm gelince kazanç yumuşakça düzelir.
    let early_frames = info.sample_rate as usize * EARLY_LOUDNESS_SECONDS;
    let mut frames = 0usize;
    let mut early_sent = false;
    loop {
        if target.is_cancelled() || target.measured_loudness().is_some() {
            return;
        }
        match decoder.next_chunk() {
            Ok(Some(chunk)) => {
                for frame in chunk.chunks_exact(channels) {
                    meter.add(frame);
                }
                frames += chunk.len() / channels;
                if !early_sent && frames >= early_frames {
                    early_sent = true;
                    if let Some(early) = meter.finish() {
                        target.set_early_loudness(early);
                    }
                }
            }
            Ok(None) => break,
            // Çözülemeyen yerde durulur; tam analiz de aynı yerde durur, sonuç aynıdır.
            Err(_) => break,
        }
    }
    if target.measured_loudness().is_none() {
        target.set_measured_loudness(meter.finish());
    }
}

/// Erken ses yüksekliği tahmini için ölçülen ilk süre (saniye).
const EARLY_LOUDNESS_SECONDS: usize = 5;

/// Şarkıyı baştan sona çözerek spektrogramı doldurur. Ayrı iş parçacığında çalışır.
pub fn analyze(decoder: Decoder, target: &Spectrogram) {
    analyze_paced(decoder, target, &mut || {});
}

/// Analizin okuduğu ses kaynağı. Gerçek kaynak [`Decoder`]'dır; testler yarıda kesilen bir
/// kaynağı taklit eder.
pub trait ChunkSource {
    fn info(&self) -> &TrackInfo;
    fn next_chunk(&mut self) -> Result<Option<&[Sample]>, AudioError>;
}

impl ChunkSource for Decoder {
    fn info(&self) -> &TrackInfo {
        Decoder::info(self)
    }

    fn next_chunk(&mut self) -> Result<Option<&[Sample]>, AudioError> {
        Decoder::next_chunk(self)
    }
}

/// [`analyze`] gibi; ama her çözülen parçadan sonra `pace` çağrılır (arka plan
/// analizi burada bekleyerek işlemciyi çalan şarkıya bırakır).
pub fn analyze_paced(mut decoder: Decoder, target: &Spectrogram, pace: &mut dyn FnMut()) {
    analyze_source(&mut decoder, target, pace);
}

/// [`analyze_paced`]'in kaynağı soyutlanmış hâli. Çözme dosya sonuna gelmeden hata verirse
/// (ağ kopması, okunamayan disk) eldeki kareler yayımlanır ama analiz saklanmaz
/// ([`Spectrogram::is_truncated`]): geçici bir hata o şarkının görsellerini kalıcı kısaltmasın.
pub fn analyze_source(decoder: &mut dyn ChunkSource, target: &Spectrogram, pace: &mut dyn FnMut()) {
    let info = decoder.info().clone();
    let channels = info.channels.max(1);
    // Hız baştan bilinir: `frame_at` kareyi pencere ortasına göre seçerken kullanır.
    target.set_sample_rate(Some(info.sample_rate));
    let fft_size = fft_size(info.sample_rate);
    let mut analyzer = BandAnalyzer::new(info.sample_rate);

    // Dairesel pencere: son `fft_size` mono örnek (`head` en eski örneğin yeri).
    // Her 1/60 saniyede bir kare üretilir ([`frame_end`]).
    let mut window = vec![0.0; fft_size];
    let mut head = 0usize;
    let mut filled = 0usize;
    // İşlenen örnek sayısı ve sıradaki karenin bittiği örnek.
    let mut position = 0u64;
    let mut frame_index = 0u64;
    let mut next_end = frame_end(0, info.sample_rate);
    let mut batch: Vec<u8> = Vec::with_capacity(BANDS * 64);
    let mut meters = LevelAccumulator::default();
    let mut meter_batch: Vec<u8> = Vec::with_capacity(VALUES_PER_FRAME * 64);
    let mut onset_batch: Vec<f32> = Vec::with_capacity(64);
    // Ses yüksekliği şarkının kendi hızında, bütün kanallarıyla ölçülür (EBU R128).
    let mut loudness = LoudnessMeter::new(info.sample_rate, channels);
    // Bas düğmesinin şarkının tepesini ne kadar yükselttiği (taşma koruması buna göre).
    let mut bass_peaks = BassPeakMeter::new(info.sample_rate, channels);
    // Ton: uzun pencereli kroma, aynı geçişte.
    let mut chroma = ChromaAnalyzer::new(info.sample_rate);

    loop {
        if target.cancelled.load(Ordering::Acquire) {
            return;
        }
        pace();
        let chunk = match decoder.next_chunk() {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                target.mark_truncated(&error);
                break;
            }
        };
        for frame in chunk.chunks_exact(channels) {
            meters.add(frame);
            loudness.add(frame);
            bass_peaks.add(frame);
            let mono = frame.iter().sum::<Sample>() / channels as Sample;
            chroma.add(mono);
            window[head] = mono;
            head = (head + 1) % fft_size;
            filled = (filled + 1).min(fft_size);
            position += 1;
            if position == next_end {
                frame_index += 1;
                next_end = frame_end(frame_index, info.sample_rate);
                // k. karenin penceresi (k+1)/60 saniyede biter; 44,1 kHz'te ortası k/60
                // saniyenin yaklaşık 6 ms gerisindedir: görüntü sesle hizalı kalır.
                // Pencerenin yarısı dolana kadar kare sessiz sayılır.
                let (levels, onset) = if filled < fft_size / 2 {
                    ([0u8; BANDS], analyzer.onset.silent())
                } else {
                    analyzer.process(&window, head)
                };
                batch.extend_from_slice(&levels);
                meter_batch.extend_from_slice(&meters.finish());
                onset_batch.push(onset);
                if batch.len() >= BANDS * 64 {
                    target.push(&batch, &meter_batch, &onset_batch);
                    batch.clear();
                    meter_batch.clear();
                    onset_batch.clear();
                }
            }
        }
    }
    target.push(&batch, &meter_batch, &onset_batch);
    target.finish(
        info.sample_rate,
        loudness.finish(),
        bass_peaks.finish(),
        Some(chroma.finish()),
    );
}

/// Saklanan karelerden ritim: vuruş ızgarası (başlangıç gücünün örnekleme hızına bağlı
/// gecikmesi düşülerek, [`beats::onset_latency`]) ve şarkı haritası. Şarkı çözülmez.
pub fn rhythm_from_frames(
    levels: &[u8],
    meters: &[u8],
    onset: &[f32],
    sample_rate: u32,
) -> (Option<BeatGrid>, Option<SongMap>) {
    let latency = beats::onset_latency(sample_rate, fft_size(sample_rate));
    // Tempo oktavı (yarısı / iki katı) ızgaranın kendi kanıtıyla seçilir; aksak ölçü düzeltilmiş
    // tempoya göre aranır.
    let tracked = beats::track(onset, FRAMES_PER_SECOND, latency)
        .map(|g| tempo::resolve_octave(g, onset, levels, BANDS, FRAMES_PER_SECOND, latency));
    // Aksak ölçü (9/8, 7/8, 5/8): vuruşlar grup başları olur, ölçü başları sekizlik ızgarasından.
    let aksak = tracked
        .as_ref()
        .and_then(|g| meter::detect(onset, levels, BANDS, g, FRAMES_PER_SECOND, latency));
    let grid = match &aksak {
        Some(aksak) => Some(aksak.beat_grid()),
        None => tracked,
    };
    let map = grid
        .as_ref()
        .and_then(|grid| structure_for_beats(levels, meters, grid, aksak.as_ref()));
    (grid, map)
}

/// Verilen vuruşlara göre şarkı yapısı (ölçü başları, bölümler, droplar, enerji): analizin
/// kendi vuruşlarıyla ya da kullanıcının işaretlediği vuruşlarla ([`super::map_file`]).
pub fn structure_for_beats(
    levels: &[u8],
    meters: &[u8],
    grid: &BeatGrid,
    aksak: Option<&meter::Aksak>,
) -> Option<SongMap> {
    // Kare başına ses yüksekliği: iki kanalın etkin seviyesinin ortalaması.
    let loudness: Vec<f32> = meters
        .chunks_exact(VALUES_PER_FRAME)
        .filter_map(levels::decode_frame)
        .map(|m| 0.5 * (m.rms_db[0] + m.rms_db[1]))
        .collect();
    structure::map_song(levels, BANDS, &loudness, grid, FRAMES_PER_SECOND, aksak)
}

/// Önbellekteki kaydın eskimiş parçalarını yeniden hesaplayıp `target`'ı tamamlar.
///
/// Kareler hemen okunabilir (görseller beklemez); geçerli ses yüksekliği hemen yayımlanır.
/// - Ritim eskiyse saklanan karelerden hesaplanır: şarkı **çözülmez**.
/// - Ses yüksekliği, bas tepeleri ya da ton eskiyse şarkı bir kez çözülür ve yalnızca eskimiş
///   olan ölçülür (bant kareleri yeniden hesaplanmaz).
///
/// `open` şarkıyı açar; yalnızca gerektiğinde çağrılır (çözme ya da örnekleme hızı
/// bilinmeyen eski kayıtta başlığı okumak için). Açılamaz ya da iptal edilirse analiz bitmiş
/// sayılmaz ve `false` döner. `pace` her çözülen parçadan sonra çağrılır ([`analyze_paced`]).
/// Önbellekteki kareleri ve (eskimemişse) ses yüksekliğini hemen yayımlar. Yenileme ayrı iş
/// parçacığında ve belki bekleyerek (önce çalan şarkı) başlar; görseller onu beklemesin diye
/// çağıran bunu iş parçacığını açmadan önce çağırır.
pub fn publish_cached(target: &Spectrogram, cached: &CachedAnalysis) {
    target.push(
        &cached.saved.levels,
        &cached.saved.meters,
        &cached.saved.onset,
    );
    if !cached.stale.loudness {
        target.set_measured_loudness(cached.saved.loudness);
    }
}

pub fn refresh_paced(
    cached: CachedAnalysis,
    open: &mut dyn FnMut() -> Option<Decoder>,
    target: &Spectrogram,
    pace: &mut dyn FnMut(),
) -> bool {
    // Kareler çağıran tarafından önceden yayımlanmış olabilir ([`publish_cached`]); iki kez
    // eklenmesin.
    if target.ready_frames() == 0 {
        publish_cached(target, &cached);
    }
    let CachedAnalysis { saved, stale } = cached;
    let mut sample_rate = saved.sample_rate;
    let mut loudness = saved.loudness;
    let mut bass_peaks = saved.bass_peaks;
    let mut key = saved.key;

    if stale.needs_decoding() {
        let Some(mut decoder) = open() else {
            return false;
        };
        let info = decoder.info().clone();
        let channels = info.channels.max(1);
        sample_rate = Some(info.sample_rate);
        let mut loudness_meter = stale
            .loudness
            .then(|| LoudnessMeter::new(info.sample_rate, channels));
        let mut bass_meter = stale
            .bass
            .then(|| BassPeakMeter::new(info.sample_rate, channels));
        let mut chroma = stale.key.then(|| ChromaAnalyzer::new(info.sample_rate));
        loop {
            if target.is_cancelled() {
                return false;
            }
            pace();
            let chunk = match decoder.next_chunk() {
                Ok(Some(chunk)) => chunk,
                Ok(None) => break,
                // Tam analizdeki gibi: yarıda kesilen ölçüm saklanmaz.
                Err(error) => {
                    target.mark_truncated(&error);
                    break;
                }
            };
            for frame in chunk.chunks_exact(channels) {
                if let Some(meter) = loudness_meter.as_mut() {
                    meter.add(frame);
                }
                if let Some(meter) = bass_meter.as_mut() {
                    meter.add(frame);
                }
                if let Some(chroma) = chroma.as_mut() {
                    chroma.add(frame.iter().sum::<Sample>() / channels as Sample);
                }
            }
        }
        if let Some(meter) = loudness_meter {
            loudness = meter.finish();
        }
        if let Some(meter) = bass_meter {
            bass_peaks = meter.finish();
        }
        if let Some(chroma) = chroma {
            key = Some(chroma.finish());
        }
    }

    let (grid, map) = if stale.rhythm {
        let rate = match sample_rate {
            Some(rate) => rate,
            None => match open() {
                Some(decoder) => decoder.info().sample_rate,
                None => return false,
            },
        };
        sample_rate = Some(rate);
        rhythm_from_frames(&saved.levels, &saved.meters, &saved.onset, rate)
    } else {
        (saved.beats, saved.song_map)
    };
    target.set_sample_rate(sample_rate);
    target.complete(grid, map, loudness, bass_peaks, key);
    true
}

/// `k`. karenin bittiği örnek (hariç): (k + 1) / 60 saniyeye en yakın örnek.
/// Kare aralığı tam sayı olmayan hızlarda da (ör. 22 050 / 60 = 367,5 örnek) kareler
/// zamanda kaymaz; aralıklar 367 ile 368 arasında değişir.
fn frame_end(k: u64, sample_rate: u32) -> u64 {
    let fps = FRAMES_PER_SECOND as u64;
    ((k + 1) * u64::from(sample_rate) * 2 + fps) / (2 * fps)
}

/// Bir bandın FFT'den nasıl okunduğu.
#[derive(Debug, Clone, Copy, PartialEq)]
enum BandPick {
    /// Bant bir kutudan geniş: [başlangıç, bitiş) kutularının en güçlüsü.
    Range(usize, usize),
    /// Bant bir kutudan dar (alt bantlar): bant ortasındaki kesirli kutuda komşu kutular arası
    /// doğrusal ara değer. Komşu bantlar aynı kutuyu paylaşsa da her biri kendi frekansına
    /// göre farklı okunur; eskiden ilk 3–5 bant birbirinin kopyasıydı (ANL-02).
    Interpolate(f64),
}

/// Bir pencereyi frekans bantlarına ayıran FFT çözümleyici.
struct BandAnalyzer {
    fft: Arc<dyn Fft<f64>>,
    hann: Vec<f64>,
    buffer: Vec<Complex<f64>>,
    /// Her bandın FFT'den okunuşu.
    picks: Vec<BandPick>,
    /// Her bandın orta frekansına göre eğim düzeltmesi (dB).
    tilt: Vec<f64>,
    /// Tam ölçekli bir sinüsün 0 dB çıkması için ölçek.
    norm: f64,
    /// Aynı FFT'den beat takibi için başlangıç gücü.
    onset: OnsetDetector,
}

impl BandAnalyzer {
    fn new(sample_rate: u32) -> Self {
        let fft_size = fft_size(sample_rate);
        let fft = FftPlanner::new().plan_fft_forward(fft_size);
        let hann: Vec<f64> = (0..fft_size)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / fft_size as f64).cos())
            .collect();
        let norm = 2.0 / hann.iter().sum::<f64>();
        let edges = band_edges(BANDS, f64::from(sample_rate));
        let bin_hz = f64::from(sample_rate) / fft_size as f64;
        let max_bin = fft_size / 2;
        let picks = edges
            .windows(2)
            .map(|e| {
                if e[1] - e[0] < bin_hz {
                    let center = ((e[0] * e[1]).sqrt() / bin_hz).clamp(1.0, (max_bin - 1) as f64);
                    return BandPick::Interpolate(center);
                }
                let start = ((e[0] / bin_hz).round() as usize).clamp(1, max_bin - 1);
                let end = ((e[1] / bin_hz).round() as usize).clamp(start + 1, max_bin);
                BandPick::Range(start, end)
            })
            .collect();
        let tilt = edges
            .windows(2)
            .map(|e| TILT_DB_PER_OCTAVE * ((e[0] * e[1]).sqrt() / 1000.0).log2())
            .collect();
        Self {
            fft,
            hann,
            buffer: vec![Complex::default(); fft_size],
            picks,
            tilt,
            norm,
            onset: OnsetDetector::new(sample_rate, fft_size),
        }
    }

    /// `window` dairesel tampondur; en eski örnek `head` konumundadır.
    /// Bant seviyelerini ve başlangıç gücünü döndürür.
    fn process(&mut self, window: &[Sample], head: usize) -> ([u8; BANDS], f32) {
        let ordered = window[head..].iter().chain(&window[..head]);
        for ((dst, &x), &w) in self.buffer.iter_mut().zip(ordered).zip(&self.hann) {
            *dst = Complex::new(x * w, 0.0);
        }
        self.fft.process(&mut self.buffer);

        let mut out = [0u8; BANDS];
        for (band, &pick) in self.picks.iter().enumerate() {
            let peak = match pick {
                // Banttaki en güçlü bileşen: dar bantlarda tek bir notayı da yakalar.
                BandPick::Range(start, end) => self.buffer[start..end]
                    .iter()
                    .map(|c| c.norm())
                    .fold(0.0, f64::max),
                BandPick::Interpolate(center) => {
                    let low = center.floor() as usize;
                    let t = center - low as f64;
                    let a = self.buffer[low].norm();
                    let b = self.buffer[(low + 1).min(self.buffer.len() - 1)].norm();
                    a + (b - a) * t
                }
            } * self.norm;
            let db = 20.0 * peak.max(1e-12).log10() + self.tilt[band];
            out[band] = to_level(db);
        }
        (out, self.onset.process(&self.buffer, self.norm))
    }
}

/// Desibeli 0..255 seviyeye çevirir.
fn to_level(db: f64) -> u8 {
    let x = ((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)).clamp(0.0, 1.0);
    (x * 255.0).round() as u8
}

/// Her bandın orta frekansı (Hz, geometrik orta).
pub fn band_centers(sample_rate: f64) -> [f64; BANDS] {
    let edges = band_edges(BANDS, sample_rate);
    std::array::from_fn(|i| (edges[i] * edges[i + 1]).sqrt())
}

/// Seviyeyi (0..1) verilen desibel kadar kaydırır: ekolayzer gibi sonradan
/// uygulanan kazançlar görsellerde de görünsün. Sessiz (0) bantlar sessiz kalır.
pub fn shift_level(level: f32, db: f64) -> f32 {
    if level <= 0.0 {
        return 0.0;
    }
    (f64::from(level) + db / (CEIL_DB - FLOOR_DB)).clamp(0.0, 1.0) as f32
}

/// Logaritmik aralıklı bant sınırları (Hz). `bands + 1` değer döner.
/// Üst sınır Nyquist frekansını aşmaz.
pub fn band_edges(bands: usize, sample_rate: f64) -> Vec<f64> {
    let max = MAX_FREQ.min(sample_rate / 2.0 * 0.95);
    let ratio = (max / MIN_FREQ).ln();
    (0..=bands)
        .map(|i| MIN_FREQ * (ratio * i as f64 / bands as f64).exp())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::cache::StaleParts;
    use crate::audio::test_util::{sine, temp_path, write_wav};
    use std::path::Path;

    #[test]
    fn seviye_kaydirma_desibel_olcegine_uyar() {
        // 60 dB'lik ölçekte +6 dB = 0,1 seviye.
        assert!((shift_level(0.5, 6.0) - 0.6).abs() < 1e-6);
        assert!((shift_level(0.5, -12.0) - 0.3).abs() < 1e-6);
        assert_eq!(shift_level(0.95, 12.0), 1.0);
        assert_eq!(shift_level(0.0, 12.0), 0.0, "sessizlik yükseltilmez");
        let centers = band_centers(44100.0);
        assert!(centers[0] > 30.0 && centers[BANDS - 1] < 16_000.0);
        assert!(centers.windows(2).all(|w| w[0] < w[1]));
    }

    fn analyze_file(path: &Path) -> Arc<Spectrogram> {
        let spectrogram = Spectrogram::new();
        analyze(Decoder::open(path).unwrap(), &spectrogram);
        spectrogram
    }

    /// Çözme ortasında hata veren kaynak (ağ kopması, okunamayan disk).
    struct Kopan {
        decoder: Decoder,
        remaining: usize,
    }

    impl ChunkSource for Kopan {
        fn info(&self) -> &TrackInfo {
            self.decoder.info()
        }

        fn next_chunk(&mut self) -> Result<Option<&[Sample]>, AudioError> {
            if self.remaining == 0 {
                return Err(AudioError::Decode("ağ paylaşımı koptu".to_owned()));
            }
            self.remaining -= 1;
            self.decoder.next_chunk()
        }
    }

    #[test]
    fn yarida_kesilen_cozme_bitmis_sayilir_ama_saklanmaz() {
        let path = drum_song("kopan");
        let mut source = Kopan {
            decoder: Decoder::open(&path).unwrap(),
            remaining: 20,
        };
        let spectrogram = Spectrogram::new();
        analyze_source(&mut source, &spectrogram, &mut || {});
        assert!(
            spectrogram.is_done(),
            "bekleyenler (sıradaki şarkı) serbest kalır"
        );
        assert!(spectrogram.is_truncated());
        assert!(
            spectrogram.ready_frames() > 0,
            "eldeki kareler görseller için kullanılır"
        );
        assert!(
            spectrogram.saved().is_none(),
            "kısa analiz dosya damgasıyla önbelleğe yazılmaz"
        );
        // Dosya sonuna kadar çözülen analiz saklanır (kesilme bayrağı yanlışlıkla kalkmaz).
        let full = analyze_file(&path);
        assert!(!full.is_truncated());
        assert!(full.saved().is_some());
    }

    /// Davullu 22,05 kHz test şarkısı (vuruş, ölçü ve bölüm bulunacak kadar uzun).
    fn drum_song(name: &str) -> std::path::PathBuf {
        let rate = 22_050;
        let (samples, _) = crate::analysis::beats::tests::drum_track(124.0, 0.6, 40.0, rate, 7);
        let path = temp_path(name);
        write_wav(&path, rate, 2, samples.len(), |f, c| {
            (samples[f] * if c == 0 { 1.0 } else { 0.8 }).clamp(-1.0, 1.0)
        });
        path
    }

    /// Tam analizin önbellekte bir parçası eskimiş hâli.
    fn aged(full: &SavedAnalysis, stale: StaleParts) -> CachedAnalysis {
        let mut saved = full.clone();
        if stale.rhythm {
            saved.beats = None;
            saved.song_map = None;
        }
        if stale.loudness {
            saved.loudness = None;
        }
        if stale.bass {
            saved.bass_peaks = None;
        }
        if stale.key {
            saved.key = None;
        }
        CachedAnalysis { saved, stale }
    }

    #[test]
    fn eskiyen_ritim_sarki_cozulmeden_karelerden_ayni_hesaplanir() {
        let path = drum_song("ritim-yenile.wav");
        let full = analyze_file(&path).saved().unwrap();
        assert!(full.beats.is_some() && full.song_map.is_some());
        let stale = StaleParts {
            rhythm: true,
            ..StaleParts::default()
        };
        let target = Spectrogram::new();
        let mut opened = 0;
        let mut open = || {
            opened += 1;
            Decoder::open(&path).ok()
        };
        assert!(refresh_paced(
            aged(&full, stale),
            &mut open,
            &target,
            &mut || {}
        ));
        assert_eq!(opened, 0, "örnekleme hızı biliniyor: şarkı hiç açılmadı");
        assert_eq!(target.saved().unwrap(), full, "tam analizle birebir aynı");
        assert!(target.choreography().is_some(), "Yönetmen de kuruldu");

        // Örnekleme hızı bilinmeyen eski kayıt: yalnızca başlık okunur (çözülmez).
        let mut old = aged(&full, stale);
        old.saved.sample_rate = None;
        let target = Spectrogram::new();
        let mut opened = 0;
        let mut open = || {
            opened += 1;
            Decoder::open(&path).ok()
        };
        assert!(refresh_paced(old, &mut open, &target, &mut || {}));
        assert_eq!(opened, 1);
        assert_eq!(target.saved().unwrap(), full);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn eskiyen_ses_yuksekligi_bas_tepeleri_ve_ton_tek_cozmeyle_ayni_olculur() {
        let path = drum_song("olcum-yenile.wav");
        let full = analyze_file(&path).saved().unwrap();
        assert!(full.loudness.is_some() && full.bass_peaks.is_some());
        for stale in [
            StaleParts {
                loudness: true,
                ..StaleParts::default()
            },
            StaleParts {
                bass: true,
                ..StaleParts::default()
            },
            StaleParts {
                key: true,
                ..StaleParts::default()
            },
            StaleParts {
                rhythm: true,
                loudness: true,
                bass: true,
                key: true,
            },
        ] {
            let target = Spectrogram::new();
            let mut opened = 0;
            let mut open = || {
                opened += 1;
                Decoder::open(&path).ok()
            };
            let mut chunks = 0;
            assert!(refresh_paced(
                aged(&full, stale),
                &mut open,
                &target,
                &mut || chunks += 1
            ));
            assert_eq!(opened, 1, "{stale:?}: bir kez çözülür");
            assert!(chunks > 0, "arka planda işlemciyi paylaşır (pace)");
            assert_eq!(target.saved().unwrap(), full, "{stale:?}");
        }
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn yenileme_acilamaz_ya_da_iptal_edilirse_bitmis_sayilmaz() {
        let path = drum_song("yenile-iptal.wav");
        let full = analyze_file(&path).saved().unwrap();
        let stale = StaleParts {
            loudness: true,
            ..StaleParts::default()
        };
        // Dosya açılamadı: eksik ölçüm "sessiz şarkı" diye saklanmasın.
        let target = Spectrogram::new();
        assert!(!refresh_paced(
            aged(&full, stale),
            &mut || None,
            &target,
            &mut || {}
        ));
        assert!(target.saved().is_none());
        // Görseller yine de kareleri hemen kullanabilir.
        assert_eq!(target.ready_frames(), full.frames());

        let target = Spectrogram::new();
        target.cancel();
        let mut open = || Decoder::open(&path).ok();
        assert!(!refresh_paced(
            aged(&full, stale),
            &mut open,
            &target,
            &mut || {}
        ));
        assert!(target.saved().is_none());
        std::fs::remove_file(path).ok();
    }

    fn band_of(freq: f64, rate: f64) -> usize {
        let edges = band_edges(BANDS, rate);
        edges
            .windows(2)
            .position(|e| freq >= e[0] && freq < e[1])
            .unwrap()
    }

    #[test]
    fn her_ornekleme_hizinda_saniyede_tam_60_kare() {
        // 22 050 / 60 = 367,5 gibi tam bölünmeyen hızlarda kare aralığı yuvarlanınca
        // kareler zamanda kayıyordu (4. dakikada ~0,3 sn): görüntü ve vuruşlar sesten
        // önce ya da sonra gelirdi.
        for rate in [8_000, 22_050, 32_000, 44_100] {
            let path = temp_path(&format!("kare-{rate}.wav"));
            let frames = rate as usize * 60;
            write_wav(&path, rate, 1, frames, |i, _| 0.1 * sine(440.0, rate, i));
            let spectrogram = analyze_file(&path);
            assert_eq!(spectrogram.ready_frames(), 3_600, "{rate} Hz");
            std::fs::remove_file(path).ok();
        }
    }

    #[test]
    fn bant_sinirlari_logaritmik_ve_artan() {
        let edges = band_edges(BANDS, 44_100.0);
        assert_eq!(edges.len(), BANDS + 1);
        assert!((edges[0] - MIN_FREQ).abs() < 1e-9);
        assert!((edges[BANDS] - MAX_FREQ).abs() < 1e-6);
        let ratios: Vec<f64> = edges.windows(2).map(|e| e[1] / e[0]).collect();
        assert!(
            ratios.iter().all(|r| (r - ratios[0]).abs() < 1e-9),
            "eşit oranlı olmalı"
        );
        // Düşük örnekleme hızında Nyquist aşılmaz.
        assert!(band_edges(BANDS, 16_000.0)[BANDS] < 8_000.0);
    }

    #[test]
    fn sinus_dogru_bantta_en_yuksek_cikar() {
        let path = temp_path("spektrum-1k.wav");
        let rate = 44_100;
        write_wav(&path, rate, 2, rate as usize, |f, _| {
            0.5 * sine(1000.0, rate, f)
        });
        let spectrogram = analyze_file(&path);
        assert!(spectrogram.is_done());

        let frame = spectrogram.frame_at(0.5).unwrap();
        let loudest = frame
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .unwrap()
            .0;
        assert_eq!(loudest, band_of(1000.0, f64::from(rate)));
        assert!(
            frame[loudest] > 0.8,
            "1 kHz bandı güçlü olmalı: {}",
            frame[loudest]
        );
        // Uzak bantlar sessiz kalır.
        assert!(frame[0] < 0.2 && frame[BANDS - 1] < 0.2, "{frame:?}");
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn kanal_seviyeleri_ve_vu_referansi_hesaplanir() {
        let path = temp_path("seviye-stereo.wav");
        let rate = 44_100;
        // Sol kanal -6 dB tepeli sinüs, sağ kanal sessiz; 2 saniye.
        write_wav(&path, rate, 2, 2 * rate as usize, |f, ch| {
            if ch == 0 {
                0.5 * sine(440.0, rate, f)
            } else {
                0.0
            }
        });
        let spectrogram = analyze_file(&path);
        let levels = spectrogram.meters_at(1.0).unwrap();
        assert!((levels.peak_db[0] + 6.0).abs() < 0.3, "{levels:?}");
        assert!((levels.rms_db[0] + 9.0).abs() < 0.3, "{levels:?}");
        assert_eq!(levels.rms_db[1], levels::FLOOR_DB);
        // Sabit seviyeli şarkıda 0 VU, o seviyedir.
        let reference = spectrogram.vu_reference_db().unwrap();
        assert!((reference + 9.0).abs() < 0.3, "{reference}");
        assert!(spectrogram.meters_at(2.5).is_none());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn saklanan_analizden_ayni_spektrogram_kurulur() {
        // 120 BPM tıklamalar üstünde 200 Hz ton: vuruşlar ve seviyeler olsun.
        let path = temp_path("spektrum-sakla.wav");
        let rate = 22_050;
        write_wav(&path, rate, 2, rate as usize * 8, |frame, _| {
            let t = frame as f64 / f64::from(rate);
            let click = if (t * 2.0).fract() < 0.01 { 0.8 } else { 0.0 };
            click + 0.2 * (2.0 * std::f64::consts::PI * 200.0 * t).sin()
        });
        let original = Spectrogram::new();
        analyze(Decoder::open(&path).unwrap(), &original);
        let saved = original.saved().expect("analiz bitti");
        assert!(saved.is_consistent());
        assert!(saved.bass_peaks.is_some(), "bas tepeleri ölçüldü");
        assert!(saved.beats.is_some(), "tıklamalarda tempo bulunur");

        let restored = Spectrogram::from_saved(saved.clone());
        assert!(restored.is_done());
        assert_eq!(restored.ready_frames(), original.ready_frames());
        assert_eq!(restored.saved(), Some(saved));
        for seconds in [0.5, 3.0, 7.5] {
            assert_eq!(restored.frame_at(seconds), original.frame_at(seconds));
            assert_eq!(restored.meters_at(seconds), original.meters_at(seconds));
        }
        assert_eq!(restored.vu_reference_db(), original.vu_reference_db());
        assert_eq!(restored.beat_grid(), original.beat_grid());
        assert_eq!(restored.song_map(), original.song_map());
        assert_eq!(
            restored.choreography().is_some(),
            original.choreography().is_some()
        );
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn bitmeyen_analiz_saklanmaz() {
        assert_eq!(Spectrogram::new().saved(), None);
    }

    #[test]
    fn sessizlik_sifir_seviye_verir_ve_kare_sayisi_dogru() {
        let path = temp_path("spektrum-sessiz.wav");
        write_wav(&path, 48_000, 1, 96_000, |_, _| 0.0); // 2 saniye
        let spectrogram = analyze_file(&path);
        assert_eq!(spectrogram.ready_frames(), 120, "saniyede 60 kare");
        assert!(spectrogram.frame_at(1.0).unwrap().iter().all(|&l| l == 0.0));
        assert!(
            spectrogram.frame_at(2.5).is_none(),
            "şarkı sonrası kare yok"
        );
        assert!(spectrogram.frame_at(-1.0).is_none());
        assert_eq!(
            spectrogram.meters_at(1.0).unwrap().peak_db,
            [levels::FLOOR_DB; 2]
        );
        assert_eq!(spectrogram.vu_reference_db(), None);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn kare_zamani_sesle_hizali() {
        // İlk yarı sessiz, ikinci yarı 200 Hz: geçiş 1,0 saniyede görünmeli.
        let path = temp_path("spektrum-gecis.wav");
        let rate = 44_100;
        write_wav(&path, rate, 1, rate as usize * 2, |f, _| {
            if f < rate as usize {
                0.0
            } else {
                0.5 * sine(200.0, rate, f)
            }
        });
        let spectrogram = analyze_file(&path);
        let band = band_of(200.0, f64::from(rate));
        assert!(spectrogram.frame_at(0.9).unwrap()[band] < 0.1);
        assert!(spectrogram.frame_at(1.1).unwrap()[band] > 0.7);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn kare_icerigi_her_hizda_sesle_ayni_anda() {
        // Sessizlikten 1 kHz'e keskin geçiş tam 1,000 saniyede. Karenin içeriği pencere ortasına
        // göre okunduğundan geçiş her hızda ±9 ms içinde görünür (kare adımı 16,7 ms). Eskiden
        // 44,1 kHz'te ~15 ms, 8 kHz'te ~120 ms geç görünürdü (ANL-03).
        for rate in [8_000u32, 22_050, 44_100, 48_000, 96_000, 192_000] {
            let path = temp_path("spektrum-hiza.wav");
            write_wav(&path, rate, 1, rate as usize * 2, |f, _| {
                if f < rate as usize {
                    0.0
                } else {
                    0.5 * sine(1000.0, rate, f)
                }
            });
            let spectrogram = analyze_file(&path);
            let band = band_of(1000.0, f64::from(rate));
            let steady = spectrogram.frame_at(1.5).unwrap()[band];
            // Hann penceresinin yarısı sesteyken kutu genliği yarıya (−6 dB = 0,1 seviye) iner.
            let threshold = steady - 0.1;
            let crossing = (900..1100)
                .map(|ms| ms as f64 / 1000.0)
                .find(|&s| spectrogram.frame_at(s).unwrap()[band] >= threshold)
                .expect("geçiş görünmeli");
            let error_ms = (crossing - 1.0) * 1000.0;
            eprintln!("{rate} Hz: geçiş {error_ms:+.1} ms");
            assert!(
                error_ms.abs() <= 9.0,
                "{rate} Hz: geçiş {error_ms:+.1} ms kaydı"
            );
            std::fs::remove_file(path).ok();
        }
    }

    #[test]
    fn alt_bantlar_birbirinin_kopyasi_degil() {
        // 44,1 kHz'te FFT kutusu 21,5 Hz; ilk bantlar bundan dar. Eskiden bant 0 ile 2 aynı
        // kutudan okunur, aynı hareketi yapardı. 33 Hz tonunda bant 0, 48 Hz tonunda bant 2
        // öne çıkmalı (ANL-02).
        let rate = 44_100;
        let mut levels = Vec::new();
        for freq in [33.0, 48.0] {
            let path = temp_path("spektrum-bas.wav");
            write_wav(&path, rate, 1, rate as usize * 2, |f, _| {
                0.5 * sine(freq, rate, f)
            });
            levels.push(analyze_file(&path).frame_at(1.0).unwrap());
            std::fs::remove_file(path).ok();
        }
        let (b0, b2) = (
            band_of(33.0, f64::from(rate)),
            band_of(48.0, f64::from(rate)),
        );
        assert_ne!(b0, b2);
        assert!(
            levels[0][b0] > levels[0][b2],
            "33 Hz: {:?}",
            &levels[0][..4]
        );
        assert!(
            levels[1][b2] > levels[1][b0],
            "48 Hz: {:?}",
            &levels[1][..4]
        );
        assert_ne!(levels[0][b0 + 1], levels[0][b0], "komşu bant kopya değil");
    }

    #[test]
    fn fft_penceresi_yuksek_hizda_katlanir_suresi_sabit() {
        assert_eq!(fft_size(44_100), 2048);
        assert_eq!(fft_size(48_000), 2048);
        assert_eq!(fft_size(88_200), 4096);
        assert_eq!(fft_size(96_000), 4096);
        assert_eq!(fft_size(176_400), 8192);
        assert_eq!(fft_size(192_000), 8192);
        // Pencere kare adımından (1/60 sn) hiçbir hızda kısa değil.
        for rate in [44_100u32, 96_000, 192_000] {
            assert!(
                fft_size(rate) as f64 >= f64::from(rate) / FRAMES_PER_SECOND,
                "{rate}"
            );
        }
    }

    #[test]
    fn iptal_edilen_analiz_durur() {
        let path = temp_path("spektrum-iptal.wav");
        write_wav(&path, 8_000, 1, 80_000, |f, _| sine(440.0, 8_000, f));
        let spectrogram = Spectrogram::new();
        spectrogram.cancel();
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        assert!(!spectrogram.is_done());
        assert_eq!(spectrogram.ready_frames(), 0);
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn hizli_olcum_ilk_saniyelerden_erken_tahmin_yayimlar() {
        // 8 sn: ilk 5 sn yarım genlik (−6 LUFS), sonrası −8 dB daha sessiz (göreli kapının
        // üstünde). Erken tahmin yalnızca ilk 5 sn'yi görür; kesin ölçüm bütünü (daha sessiz).
        // Kesin ölçüm gelince tahmin dışarıya verilmez (SES-04).
        let path = temp_path("spektrum-erken.wav");
        let rate = 8_000;
        write_wav(&path, rate, 1, rate as usize * 8, |f, _| {
            let gain = if f < rate as usize * 5 { 0.5 } else { 0.2 };
            gain * sine(1000.0, rate, f)
        });
        let quick = Spectrogram::new();
        assert_eq!(quick.early_loudness(), None);
        measure_loudness(Decoder::open(&path).unwrap(), &quick);
        let early = quick.early_loudness.read().unwrap().unwrap();
        let measured = quick.measured_loudness().flatten().unwrap();
        assert!(
            (early.integrated_lufs + 6.0).abs() < 0.5,
            "erken tahmin yüksek bölümü ölçer: {early:?}"
        );
        assert!(
            measured.integrated_lufs < early.integrated_lufs - 1.0,
            "kesin ölçüm bütünü: {measured:?}"
        );
        assert_eq!(
            quick.early_loudness(),
            None,
            "kesin ölçüm varken tahmin verilmez"
        );
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn hizli_olcum_tam_analizle_ayni_ses_yuksekligini_verir() {
        let path = temp_path("spektrum-olcum.wav");
        let rate = 44_100;
        write_wav(&path, rate, 2, rate as usize * 3, |f, ch| {
            let gain = if ch == 0 { 0.5 } else { 0.25 };
            gain * sine(1000.0, rate, f)
        });
        let quick = Spectrogram::new();
        assert_eq!(
            quick.measured_loudness(),
            None,
            "ölçülmeden önce bilinmiyor"
        );
        measure_loudness(Decoder::open(&path).unwrap(), &quick);
        let full = analyze_file(&path);
        let measured = quick.measured_loudness().flatten().unwrap();
        assert_eq!(Some(measured), full.loudness());
        assert!(!quick.is_done(), "yalnızca ses yüksekliği ölçüldü");

        // Tam analiz önce bitmişse hızlı ölçüm hiç çözmeden çıkar, sonucu değiştirmez.
        measure_loudness(Decoder::open(&path).unwrap(), &full);
        assert_eq!(full.loudness(), Some(measured));

        // Sessiz şarkı: ölçüm bitti ama ses yüksekliği yok (kazanç uygulanmaz).
        let silent_path = temp_path("spektrum-olcum-sessiz.wav");
        write_wav(&silent_path, 8_000, 1, 8_000, |_, _| 0.0);
        let silent = Spectrogram::new();
        measure_loudness(Decoder::open(&silent_path).unwrap(), &silent);
        assert_eq!(silent.measured_loudness(), Some(None));
        std::fs::remove_file(path).ok();
        std::fs::remove_file(silent_path).ok();
    }

    /// İçe aktarılan harita görsellerin, bilgi kartının ve tonun kullandığı ritmin önüne geçer;
    /// önbelleğe programın kendi analizi yazılır; kaldırılınca analiz geri gelir.
    #[test]
    fn ice_aktarilan_harita_analizin_onune_gecer_onbellege_yazilmaz() {
        use crate::analysis::fingerprint::tests::{analyze_samples, song};
        let rate = 44_100;
        let spectrogram = analyze_samples(&song(1, 120.0, 30.0, rate), rate, "ice-aktar.wav");
        let analysis_grid = spectrogram.beat_grid().unwrap();
        let analysis_map = spectrogram.song_map().unwrap();
        // Düzeltilmiş harita: vuruşlar çeyrek vuruş kaydırılmış, tek bölüm, ton La minör.
        let grid = BeatGrid {
            bpm: 120.0,
            beats: analysis_grid.beats.iter().map(|t| t + 0.125).collect(),
            variable_tempo: false,
        };
        let map = SongMap {
            sections: vec![structure::Section {
                start: 0.0,
                end: 30.0,
                energy: 0.5,
                label: 0,
            }],
            ..(*analysis_map).clone()
        };
        let key = MusicalKey::new(9, true, 0.9);
        spectrogram.set_imported(grid.clone(), map.clone(), Some(key));
        assert!(spectrogram.has_imported());
        assert_eq!(*spectrogram.beat_grid().unwrap(), grid);
        assert_eq!(*spectrogram.song_map().unwrap(), map);
        assert_eq!(spectrogram.imported_key(), Some(key));
        let director = spectrogram.choreography().unwrap();
        assert!(!Arc::ptr_eq(
            &director,
            &spectrogram.choreography.read().unwrap().clone().unwrap()
        ));
        // Önbelleğe yazılacak olan programın analizi.
        let saved = spectrogram.saved().unwrap();
        assert_eq!(saved.beats.as_ref(), Some(&*analysis_grid));
        assert_eq!(saved.song_map.as_ref(), Some(&*analysis_map));
        spectrogram.clear_imported();
        assert!(!spectrogram.has_imported());
        assert_eq!(spectrogram.beat_grid(), Some(analysis_grid));
        assert_eq!(spectrogram.imported_key(), None);
    }

    /// Analiz sürerken uygulanan haritanın koreografisi analiz bitince kurulur.
    #[test]
    fn analiz_bitmeden_uygulanan_haritanin_koreografisi_sonra_kurulur() {
        use crate::analysis::fingerprint::tests::song;
        let rate = 44_100;
        let samples = song(2, 100.0, 20.0, rate);
        let path = temp_path("ice-aktar-erken.wav");
        write_wav(&path, rate, 1, samples.len(), |f, _| samples[f]);
        let spectrogram = Spectrogram::new();
        let grid = BeatGrid {
            bpm: 100.0,
            beats: (0..33).map(|i| 0.6 * f64::from(i)).collect(),
            variable_tempo: false,
        };
        let map = SongMap {
            meter: 4,
            downbeat_phase: 0,
            grouping: Vec::new(),
            meter_confidence: 1.0,
            downbeats: (0..9).map(|i| 2.4 * f64::from(i)).collect(),
            sections: Vec::new(),
            drops: Vec::new(),
            drop_confidence: Vec::new(),
            energy: vec![0.5; 20],
        };
        spectrogram.set_imported(grid.clone(), map, None);
        assert!(spectrogram.choreography().is_none(), "kareler daha yok");
        analyze(Decoder::open(&path).unwrap(), &spectrogram);
        assert!(spectrogram.choreography().is_some());
        assert_eq!(*spectrogram.beat_grid().unwrap(), grid);
        assert_ne!(
            spectrogram.saved().unwrap().beats.as_ref(),
            Some(&grid),
            "önbelleğe analiz yazılır"
        );
        std::fs::remove_file(path).ok();
    }
}
